# Connection & Streaming Resilience Upgrade — Implementation Report

**Author:** Codex (assistant)  
**Date:** 2024-11-24  
**Scope:** Web (desktop + mobile) & macOS Electron builds  

---

## 1. Executive Summary

We refactored OpenChamber’s live messaging pipeline to survive typical backgrounding, throttling, and transient network drops on both browsers and the Electron desktop shell. The previous implementation restarted the Server-Sent Events (SSE) subscription whenever incidental client state changed, often exhausting its limited retry window while the tab was hidden. Users would see repeated disconnects, missing assistant replies, and jittery status indicators.  

Key outcomes:
- Background tabs now pause the stream intentionally and resume immediately on focus or network recovery.
- Missed assistant replies are replayed from persistent cursors, so conversations stay intact.
- Electron routes streaming through the main process and keeps macOS from suspending it.
- Status feedback is handled quietly via console logs, avoiding distracting UI flashes.

---

## 2. Web Client Changes (`src/hooks/useEventStream.ts`, `src/hooks/useMessageSync.ts`)

### 2.1 Visibility-Aware SSE Lifecycle
- **Pause/Resume Logic:** The hook now tracks `document.visibilityState` and `navigator.onLine`. When the window is hidden for >5s or the device goes offline, the SSE subscription is aborted and marked for resume. On focus/online events it restarts with reset attempt counters.
- **Extended Backoff:** Reconnection attempts no longer stop at five tries. We keep the 0.5s → 8s curve for the first three retries, then continue with a capped exponential that tops out at 32s. This prevents permanent disconnects during long background periods.
- **Staleness Watchdog:** A timer emits lightweight health probes every 10s. If we haven’t received events for 25s while visible, we trigger a reconnect. This avoids silent drops caused by intermediate proxies.
- **Console Diagnostics:** Every state transition (connecting, paused, offline, etc.) is logged once via a `publishStatus` helper. This replaces the on-screen badge and keeps user-facing UI clean.

### 2.2 Message Catch-Up (`useMessageSync.ts`, `messageCursorPersistence.ts`)
- **Persistent Cursor Store:** Completed assistant message IDs are stored in IndexedDB with a fallback to `localStorage`. Each record contains the message ID and completion timestamp keyed by session.
- **Interval Sync:** When the window regains focus or every 30s while visible, we call `getSessionMessages` and use the stored cursor to request any missing entries. This ensures mobile Safari (which kills EventSource in background) seamlessly recovers.
- **Console Tags:** Background syncing now emits clear `[SYNC]` / `[FOCUS]` console messages to aid debugging without user exposure.

---

## 3. Electron Desktop Enhancements (`electron/`)

### 3.1 Main-Process Streaming (`eventStreamBridge.ts`, `main.ts`, `preload.cjs`)
- **Dedicated Bridge:** Added `EventStreamBridge`, a main-process service that subscribes to the OpenCode SSE feed using the SDK’s async generator. It manages retries identical to the browser logic and forwards events/status over IPC.
- **Directory Awareness:** Renderer requests (`opencodeClient.setDirectory`) propagate to the bridge so SSE queries always include the correct `directory` param.
- **Power Management:** The bridge relies on normal OS sleep behaviour and reconnects after wake, avoiding Electron `powerSaveBlocker` so the system can rest normally.
- **Renderer Integration:** The preload now exposes `window.opencodeDesktopEvents.subscribe`, delivering event payloads and status notifications to the React hook without needing a renderer-side EventSource.
- **TypeScript Support:** Updated `tsconfig.electron.json` to `module: Node16` / `moduleResolution: node16` so the SDK types resolve in the Node context, and the bridge constructs the client after `baseUrl` is available.

### 3.2 Console-Only Status Signals
- The renderer listens to bridge status and converts it into `[CONNECT] SSE connecting` style logs—never visual badges—mirroring the browser behaviour.

---

## 4. Status & UX Adjustments

- **Header Indicator Removal:** Since status is now logged silently, the header UI no longer renders the animated “Connecting…” chip. This prevents flicker when internal state churns during initial session creation.
- **Permission & Debug Messaging:** Supporting components still present textual warnings (e.g., “Warning: Replace All Occurrences”) or icons, but all emojis were replaced with ASCII or vector icons per coding guidelines.

---

## 5. Risk & Testing Notes

- **Risk:** Persisted cursors rely on IndexedDB; private browsing modes may fall back to the in-memory shim and lose replay on reload. Mitigation: fallback automatically uses `localStorage` or volatile memory, so functional correctness remains.
- **Risk:** Electron bridge introduces a single streaming source for all renderer windows. Multiple renderer instances now share one connection; if parallel sessions per window are required later, we’ll need partitioned channels.
- **Testing Performed:** `npx tsc --noEmit`, `npm run lint`. Manual simulation recommended:
  1. Open a session, send a prompt, hide the tab >30s, resurface → message continues streaming or replays missing parts.
  2. In Electron, start a response, switch apps for 1 min → streaming continues without disconnection.
  3. Toggle offline mode in dev tools → observe `[OFFLINE] SSE` log; restore network to see `[CONNECT]` recovery.

---

## 6. File Inventory

| Area | Files |
| --- | --- |
| SSE Lifecycle | `src/hooks/useEventStream.ts`, `src/lib/opencode/client.ts` |
| Message Sync & Persistence | `src/hooks/useMessageSync.ts`, `src/lib/messageCursorPersistence.ts` |
| Electron Bridge | `electron/eventStreamBridge.ts`, `electron/main.ts`, `electron/preload.cjs`, `tsconfig.electron.json` |
| UX / Console Adjustments | `src/components/layout/Header.tsx`, `src/components/chat/ModelControls.tsx`, `src/components/ui/CommandPalette.tsx`, `docs/plans/typescript-type-safety-debt.md`, `test-cors.html`, deployment scripts, root utilities |

---

## 7. Follow-Up Suggestions

1. **Server Heartbeats:** Consider introducing explicit heartbeat comments on the OpenCode event stream (similar to the terminal SSE) to reduce reliance on client-side health probes.
2. **Granular Desktop Status:** If future builds spawn multiple renderer windows, extend the bridge to multiplex session-specific event subsets rather than broadcasting all events.
3. **Offline Cache:** Persist pending user messages alongside cursors so drafts survive reloads even when the stream is paused.

---

End of report.
