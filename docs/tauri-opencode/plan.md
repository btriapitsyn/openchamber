---
title: Tauri Desktop OpenCode Integration Plan
status: draft
---

# Tauri OpenCode Integration Plan

Goal: Move SSE and critical REST calls for OpenCode into the Rust side of the Tauri app so WebView sleep does not break streaming or long-running operations. Use the published OpenAPI 3.1 spec as the contract.

## Phases

### Phase 0 — Baseline & Constraints
- Treat OpenCode API as local HTTP without tokens (served by `opencode serve`). Directory is passed as `?directory=` everywhere.
- Existing UI:
  - SSE via `opencodeClient.subscribeToEvents` (browser-side).
  - REST via SDK in WebView.
  - `useEventStream` already supports `desktopEvents.subscribe` but desktop API lacks events implementation.
- Keep current limits and behavior; do not regress UI flows.

### Phase 1 — Rust OpenCode Client (REST via OpenAPI)
- Status: done (generated client lives in `packages/opencode-client` with rustls by default).
- Generate Rust models and basic client from OpenAPI 3.1 (`http://127.0.0.1:4101/doc`).
- Wrap with a thin facade:
  - Inject `directory` query param automatically (stored on Rust side).
  - Provide typed methods for session lifecycle (list/get/create/delete/update/fork/init/prompt/command/shell/abort/summarize/diff/revert/unrevert/message list), config get/update, project/path, experimental tool endpoints.
  - Add timeouts and retry policy (reqwest + backoff).
- Commit generated code (so build does not depend on generator), add a small script to re-gen when API changes.

### Phase 2 — Rust SSE Runner (global.event)
- Status: in progress (runner added with backoff, Last-Event-ID, bounded buffer, status emits; needs buffer replay semantics & heartbeat polish if desired).
- Implement a Tokio task that:
  - Opens `/global/event` (text/event-stream) with backoff (0.5s → 8s, 2–3 attempts then jitter).
  - Tracks `last_event_id` if provided, propagates directory.
  - Parses events to `GlobalEvent` from the schema.
  - Emits events to WebView via `app.emit_all("opencode:event", payload)`.
  - Buffers a bounded queue (e.g., 200–500) when no subscribers; flushes on re-subscribe.
- Lifecycle: keep an abort handle; start at app setup; restart on errors with backoff.

### Phase 3 — Desktop Events API (IPC)
- Extend `createDesktopAPIs` to expose:
  - `events.subscribe(onEvent, onError?, onOpen?)` that listens to `opencode:event` emission and returns an unsubscribe.
  - `events.unsubscribe` (cleanup).
- Ensure only one active stream: when desktop events available, UI must not open browser SSE.
- Add status events (`opencode:status` with connected/reconnecting/offline, last error).

### Phase 4 — Power/Wake Management (macOS)
- Add IOKit power assertion (`IOPMAssertionCreateWithName`) while SSE is active or long REST tasks run; release on idle.
- Keep existing App Nap prevention; optionally heartbeat to renew assertion during long streams.

### Phase 5 — Tauri Commands for Critical REST
- Add commands wrapping the Rust client for:
  - Session: list/get/create/delete/update/fork/init/prompt/command/shell/abort/summarize/diff/revert/unrevert/message list.
  - Config get/update, project/path, experimental tool queries.
- WebView calls `invoke`; Rust adds `directory`, handles timeouts/backoff, returns typed results/errors.
- Keep browser SDK as fallback for web; desktop path uses Tauri commands by default.

### Phase 6 — UI Integration
- Update `useEventStream` to prefer `desktopEvents.subscribe` (stop calling browser SSE when desktop events available).
- Wire message fetching to Tauri commands where appropriate (or remain HTTP if simpler initially).
- Preserve existing UX (status badges, reconnect, visibility/focus behavior), but rely on Rust stream for stability.
- Ensure no double streams: guard with runtime detection.

### Phase 7 — Telemetry/Errors & Testing
- Log SSE and REST failures on Rust side with concise context (path, status, retry).
- Add smoke tests/manual checklist:
  - SSE survives WebView background/sleep.
  - Reconnect/backoff works (kill OpenCode, restart).
  - Directory parameter is respected.
  - No duplicate events, no missing events after sleep.
  - Load more/history unaffected.

## Implementation Notes
- Use `reqwest` + `tokio-stream` for SSE; parse JSON payloads.
- Use `serde` for models (from generator); facade can normalize directory and timeouts.
- Buffering: simple ring buffer for events when no subscribers; drop oldest if overflow.
- IPC payloads: keep JSON shapes aligned with UI expectations (reuse SDK types where possible).
- Regeneration (manual, internal only, no publish): from repo root  
  `env PATH="/opt/homebrew/opt/openjdk@17/bin:$PATH" pnpm dlx @openapitools/openapi-generator-cli generate -g rust -i http://127.0.0.1:4101/doc -o packages/opencode-client --additional-properties=packageName=opencode_client,packageVersion=0.1.0,library=reqwest --global-property=apiDocs=false,modelDocs=false,apiTests=false,modelTests=false`

## Deliverables per Phase
- Phase 1: Generated client + facade module, committed; doc on how to regen.
- Phase 2: SSE runner task with backoff, buffer, and event emissions.
- Phase 3: Desktop events API, wired to useEventStream (desktop only).
- Phase 4: Power assertion helper integrated with SSE lifecycle.
- Phase 5: Tauri commands for REST; basic wiring from UI to use commands on desktop.
- Phase 6: UI toggle to prefer desktop events/commands; ensure no double-stream.
- Phase 7: Checklist/tests and logging.
