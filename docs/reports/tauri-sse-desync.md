---
title: Desktop SSE message streaming issues
status: open
---

# Context
- Goal: move OpenCode SSE/REST into the Tauri (Rust) runtime so the WebView sleep on macOS can’t break streaming, and UI stays in sync without relying on browser EventSource.
- Current state: Rust SSE runner exists (backoff, Last-Event-ID, buffer, status), UI is wired to `opencodeDesktopEvents` bridge, REST commands are exposed via Tauri and UI prefers them on desktop.
- Issue: incoming assistant messages are not streaming into the UI reliably. SSE reconnects with `error decoding response body`; messages only appear after page refresh. Sending messages sometimes fails and/or responses are missing until manual reload.

# Symptoms Observed
- Console logs:
  - `Event stream error: {hint: "SSE read failed: error decoding response body", status: "error"}`
  - Frequent reconnects: `[RECONNECT] SSE reconnecting: Connection lost`.
  - Local messages sync skipped: `Local messages not found on server - skipping sync`.
- UI behaviour:
  - Sent message not visible until assistant reply arrives.
  - After a reply and another send, assistant response may not render until page refresh.
  - Sometimes send fails with reqwest error to `/session/{id}/message` during streaming disruptions.
- Network tab (Tauri IPC):
  - Repeated `opencode_events_subscribe/unsubscribe`, `plugin:event|listen`, `opencode_events_snapshot`, `opencode_session_messages`, `health` calls. No raw `/global/event` stream visible in DevTools (Tauri hides it).

# Current Implementation (relevant files)
- Rust SSE runner: `packages/desktop/src-tauri/src/opencode/sse.rs`
  - Opens `/global/event` with directory, backoff, Last-Event-ID, bounded buffer.
  - Emits `opencode:event` and `opencode:status` to WebView.
  - Now disables gzip/brotli/deflate and uses lossy UTF-8 parsing; skips malformed JSON without breaking the stream.
- IPC bridge for events: `packages/desktop/src/lib/eventsBridge.ts`, registered in `packages/desktop/src/main.tsx`.
- UI consumer: `useEventStream.ts` uses `window.opencodeDesktopEvents.subscribe` when present.
- REST commands: `packages/desktop/src-tauri/src/commands/opencode.rs`; JS API wrapper at `packages/desktop/src/api/opencode.ts`.

# Likely Causes
- Real SSE payloads differ from OpenAPI schema; our tolerant parser still drops/flags “error decoding response body”. Without raw payload we can’t see the offending bytes/fields.
- Potential gzip/compression on the `/global/event` response even after disabling (needs verification).
- IPC subscribe/unsubscribe churn may be losing events if replay/snapshot isn’t sufficient or buffer flushed at wrong time.
- Message rendering path relies on full event payload; partial/streaming updates may be missing required fields after our aggressive Option/raw changes.

# Next Steps (for next session)
1. Capture raw SSE lines that trigger “error decoding response body”.
   - Option A: add temporary logging in Rust (trim to 500 chars, redact if needed) on parse failure and reconnect.
   - Option B: use a proxy/CLI to hit `/global/event` with directory and save a failing chunk.
2. Verify `/global/event` response headers (Content-Encoding, Transfer-Encoding) to confirm compression is truly off.
3. Add replay-on-subscribe guarantee:
   - On `opencode_events_subscribe`, immediately emit buffered events (or `opencode_events_replay` automatically).
4. Ensure message send path is stable:
   - Confirm `messageId` handling and directory passed correctly; log request/response status for `/session/{id}/message`.
5. If schema drift keeps breaking parsing, consider treating SSE payload as raw JSON passthrough (no struct parsing) and letting UI handle shape, matching the JS SDK behaviour.

# Why This Matters
- Desktop users can’t rely on browser EventSource; without a stable Rust-side stream, assistant replies silently disappear unless the page is refreshed.
- Ensuring SSE stability and message delivery is critical for parity with the web runtime and to justify the Tauri migration (avoid WebView sleep and keep the chat usable offline/desktop).

# 2025-11-21: Desktop UI truncation of long replies (post-migration)
- Confirmed: Rust bridge receives full text (e.g., `message.part.updated` with `text_len ~2168` and stop marker). Web unaffected.
- Problem: Immediately after stop, multiple `message.updated` events arrive with `status=pending` and **zero parts/text**; these overwrite the streamed assistant message in UI, causing truncation and flicker. UI-only; backend data is intact.
- Current mitigations in code: ignore empty updates; skip shrinking updates (50-char tolerance) unless stop marker; desktop completion is delayed unless stop; drift resync removed to reduce flicker.
- Remaining gap: still seeing truncation/flicker, so empty/shrinking updates are still applied or completion happens without stop.
- Next action plan:
  1) Require explicit `step-finish reason=stop` for completion on desktop; ignore any assistant `message.updated` that reduces text length (no tolerance) unless it includes stop + non-empty text.
  2) Optionally drop empty `message.updated` at the Rust bridge to reduce noisy overwrites (desktop only).
  3) Use debug toggles to capture failing sequences:
     - Rust: `OPENCHAMBER_SSE_DEBUG=1` (logs part/update text lengths/previews)
     - UI: `localStorage.openchamber_stream_debug="1"` (logs `[STREAM-TRACE]` for parts/updates)
