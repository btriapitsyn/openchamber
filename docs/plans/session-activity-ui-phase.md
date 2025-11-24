# Session Activity UI Phase – Plan

## Background

The goal is to have a single, robust “assistant working state” per session that:

- Drives **all** UI indicators (sidebar shine, footer WorkingPlaceholder, future badges).
- Has **continuity** across streaming chunks and tools.
- Is **backed by the server’s own signals** (`session.status`, message completion), not re‑implemented heuristics in each UI component.

We already have most of this for the **desktop (Tauri)** path:

- Rust SSE bridge at `packages/desktop/src-tauri/src/opencode/sse.rs`.
- Desktop event bridge at `packages/desktop/src/lib/eventsBridge.ts`.
- Web UI SSE consumer at `packages/ui/src/hooks/useEventStream.ts`.
- Session store at `packages/ui/src/stores/useSessionStore.ts` and types in `packages/ui/src/stores/types/sessionTypes.ts`.
- Sidebar sessions UI at `packages/ui/src/components/session/SessionSidebar.tsx`.
- Working placeholder logic at:
  - `packages/ui/src/hooks/useAssistantStatus.ts`
  - `packages/ui/src/components/chat/message/parts/WorkingPlaceholder.tsx`

This document describes how to:

1. Generalize the **backend‑driven** session activity model (`UiPhase`) to both desktop and web.
2. Make `UiPhase` the **single source of truth** for “assistant working/idle” across the app.
3. Gradually refactor existing UI logic (WorkingPlaceholder, sidebar, etc.) to consume this shared signal.

---

## Current State (Desktop / Tauri)

### 1. Rust SSE bridge (`sse.rs`)

Location: `packages/desktop/src-tauri/src/opencode/sse.rs`

Key pieces:

- SSE loop reads `/global/event` and parses OpenCode events.
- Completion detection for assistant messages:
  - On `message.updated`:
    - Looks at `properties.status == "completed"` OR any `parts[].type == "step-finish"` with `reason == "stop"`.
    - Emits `opencode:message-complete` with `{ messageId }`.
    - Shows desktop notification (“Assistant Ready”).
  - On `message.part.updated`:
    - Same step-finish + reason `"stop"` detection and `opencode:message-complete`.

- **Session status model** comes from generated Rust client:
  - `packages/opencode-client/src/models/session_status.rs`
  - `SessionStatus { type: "idle" | "retry" | "busy", ... }`
  - `EventSessionStatusProperties` wraps `{ session_id, status }`.

#### Existing UI-focused state (already implemented this session)

Inside `stream_events`:

- We introduced:

  ```rust
  #[derive(Clone, Copy, Debug, PartialEq, Eq)]
  enum UiPhase {
      Idle,
      Busy,
      Cooldown,
  }

  let mut session_activity: HashMap<String, UiPhase> = HashMap::new();
  let mut session_cooldowns: HashMap<String, std::time::Instant> = HashMap::new();
  ```

- On OpenCode `session.status` events (type `"session.status"`):
  - Extract `sessionID` and `status.type`.
  - Map:
    - `"busy"` or `"retry"` → `UiPhase::Busy`
    - `"idle"` (or others) → `UiPhase::Idle`
  - If the phase changed:
    - Update `session_activity[sessionId]`.
    - Remove any cooldown entry for that session.
    - Emit a small Tauri event:

      ```rust
      app_handle.emit(
        "opencode:session-activity",
        json!({ "sessionId": session_id, "phase": "busy" | "idle" | "cooldown" }),
      );
      ```

- On assistant completion (where we already emit `opencode:message-complete`):
  - For `message.updated` and `message.part.updated` completions:
    - Resolve `sessionID` from:
      - `properties.info.sessionID`
      - or `properties.sessionID`
      - or for part updates, `part.sessionID`.
    - If `session_activity[session] == UiPhase::Busy`:
      - Set `UiPhase::Cooldown` for that session.
      - Set `session_cooldowns[session] = now + 2000ms`.
      - Emit `opencode:session-activity` with `phase: "cooldown"`.

- On heartbeat (~20s):
  - Emit `opencode:status` “connected” heartbeat (existing).
  - Additionally:
    - Iterate `session_cooldowns` and find expired `Instant`s.
    - For each:
      - Remove entry from `session_cooldowns`.
      - If `session_activity[session] == UiPhase::Cooldown`, set it to `UiPhase::Idle`.
      - Emit `opencode:session-activity` with `phase: "idle"`.

**Important:**  
`SessionStatus` (server model) is **never modified**. We only listen to `session.status` + completion events and derive our own `UiPhase`, which we publish as `opencode:session-activity`.

### 2. Desktop events bridge

Location: `packages/desktop/src/lib/eventsBridge.ts`

Key points:

- Defines `DesktopEventsBridge.subscribe(...)` which currently wires:
  - `opencode:event` → `onMessage`
  - `opencode:status` → `onOpen` / `onError`
  - `opencode:message-complete` → `onMessageComplete`
- We extended it to also:
  - Accept `onSessionActivity?: (payload: Record<string, unknown> | null) => void`.
  - Subscribe to `opencode:session-activity` and pass the payload to `onSessionActivity`.

This is the only place where desktop-specific events are bridged into the browser runtime.

### 3. UI SSE hook (`useEventStream`)

Location: `packages/ui/src/hooks/useEventStream.ts`

Key parts:

- For desktop runtime (`window.opencodeDesktopEvents` is present):
  - `desktopEvents.subscribe(handleEvent, onError, onOpen, onMessageComplete, onSessionActivity)`.
- `onSessionActivity` (added this session) does:

  ```ts
  const onSessionActivity = (payload: Record<string, unknown> | null) => {
    if (!payload) return;
    const sessionId = typeof payload.sessionId === 'string' ? payload.sessionId : null;
    const phase = typeof payload.phase === 'string'
      ? (payload.phase as 'idle' | 'busy' | 'cooldown')
      : null;
    if (!sessionId || !phase) return;

    useSessionStore.setState((state) => {
      const current =
        state.sessionActivityPhase ?? new Map<string, 'idle' | 'busy' | 'cooldown'>();
      const next = new Map(current);
      next.set(sessionId, phase);
      return { sessionActivityPhase: next };
    });
  };
  ```

- For non-desktop, `opencodeClient.subscribeToEvents` is still used with the previous logic (no UiPhase yet).

### 4. Session store

Location: `packages/ui/src/stores/types/sessionTypes.ts`, `packages/ui/src/stores/useSessionStore.ts`

- `SessionStore` type now includes:

  ```ts
  sessionActivityPhase?: Map<string, 'idle' | 'busy' | 'cooldown'>;
  ```

- Initial state in `useSessionStore`:

  ```ts
  sessionActivityPhase: new Map(),
  ```

### 5. Sidebar session shine

Location: `packages/ui/src/components/session/SessionSidebar.tsx`

- Fetching backend activity phase:

  ```ts
  const sessionActivityPhase = useSessionStore((state) => state.sessionActivityPhase);
  ```

- In `renderSessionNode`:

  ```ts
  const phase = sessionActivityPhase?.get(session.id) ?? 'idle';
  const isStreaming = phase === 'busy' || phase === 'cooldown';
  ```

- Title rendering:

  ```tsx
  {isStreaming ? (
    <Text
      variant="shine"
      className="truncate typography-ui-label font-normal"
    >
      {sessionTitle}
    </Text>
  ) : (
    <span className="truncate typography-ui-label font-normal text-foreground">
      {sessionTitle}
    </span>
  )}
  ```

So the sidebar shine is now driven **only** by backend `UiPhase` (`busy|cooldown`) and no longer by local timers and `sessionMemoryState.isStreaming`.

---

## Phase 1 – Extend UiPhase to Web SSE

Goal: web (non-desktop) should derive the same `UiPhase` as desktop and update `sessionActivityPhase` in the same way.

### 1. Where to hook web SSE

Location: `packages/ui/src/hooks/useEventStream.ts`

Currently:

- For desktop:
  - Uses `window.opencodeDesktopEvents.subscribe`, which now gives us `session-activity` events from Tauri.
- For web:
  - Uses `opencodeClient.subscribeToEvents(handleEvent, onError, onOpen, effectiveDirectory);`
  - `handleEvent` receives the raw SSE payload:

    ```ts
    interface EventData {
      type: string;
      properties?: Record<string, unknown>;
    }
    ```

Plan for web:

- In `handleEvent`, add a small interpreter analogous to what we have in Rust:

  1. **Listen to `session.status` events**:
     - `event.type === 'session.status'`
     - `properties` should match `EventSessionStatusProperties` shape:
       - `properties.sessionID`
       - `properties.status.type` (`"idle" | "busy" | "retry"`)
     - Map to `phase: 'busy' | 'idle'`:
       - `"busy"`/`"retry"` → `'busy'`
       - `"idle"` → `'idle'`
     - Update `sessionActivityPhase` in `useSessionStore` (same setter pattern as in `onSessionActivity`).

  2. **Listen to completion events**:
     - `event.type === 'message.updated'` / `'message.part.updated'`.
     - Reuse **existing completion logic** that already exists in `useEventStream.ts` (near the end of the big `message.updated` handler) to detect when a message is definitively completed:
       - `status === 'completed'` OR
       - `step-finish` part with `reason === 'stop'`.
     - When such a completion is detected, we already call:

       ```ts
       completeStreamingMessage(currentSessionId, message.id as string);
       ```

       and do other work.

     - Extend that block to:
       - Resolve `sessionID` for that message (from `messageExt.sessionID` or `props.info.sessionID`).
       - Read current `sessionActivityPhase` for that `sessionID`.
       - If `phase === 'busy'`, set it to `'cooldown'` and store a **local JS cooldownUntil** timestamp if desired.
         - Alternatively, keep cooldown logic only in Rust for desktop, and for web simply treat `'busy'` as long as `session.status` doesn’t switch to `'idle'`.

3. **On visibility/focus restore, reset stale activity state (web as well)**

   Desktop already does a “soft refresh” in `useEventStream` when:
   - `document.visibilityState` switches back to `'visible'`, or
   - the `window` gains focus **and** the SSE stream was paused/interrupted.

   For web, we should follow the same pattern:

   - On visibility/focus restore (same handlers in `useEventStream`):
     - Reset `sessionActivityPhase` to a fresh `new Map()` **before** restarting the SSE stream.
     - Let new `session.status` / `session-activity` events repopulate the map with the current truth from the backend.

   This avoids “stuck” `busy/cooldown` phases that were computed before the tab slept and ensures that shine/working indicators always reflect the latest backend state after wake.

**Important design choice for web:**

- If the OpenCode server also emits `session.status` over HTTP SSE, we can mirror Tauri’s logic:
  - `session.status` drives `'busy'`/`'idle'`.
  - Message completion optionally drives `'cooldown'`.
- If `session.status` is not available / not stable in web SSE, we can:
  - fall back to “assist: streaming” flags (current `messageStreamStates` / `streamingMessageId`) as the base for `'busy'`,
  - and still use completion to enter `'cooldown'`.

This phase should **not** change the sidebar yet; it only ensures `sessionActivityPhase` is correct for both desktop AND web.

---

## Phase 2 – Make UiPhase the canonical “working” signal

Goal: use `sessionActivityPhase` as the primary signal for “assistant is working” across the UI, and minimize reliance on local timers and repeated heuristics.

### 1. Define a helper selector

Location: `packages/ui/src/stores/useSessionStore.ts` (or a small hook helper)

- Introduce a selector/helper:

  ```ts
  export const useSessionActivityFor = (sessionId: string | null | undefined) => {
    return useSessionStore((state) => {
      if (!sessionId || !state.sessionActivityPhase) return { phase: 'idle' as const };
      const phase = state.sessionActivityPhase.get(sessionId) ?? 'idle';
      const isWorking = phase === 'busy' || phase === 'cooldown';
      return { phase, isWorking };
    });
  };
  ```

Consumers (sidebar, footer, etc.) can then rely on `isWorking` instead of directly reading `sessionMemoryState.isStreaming` or recomputing this.

### 2. Decide how to handle cooldown on web

Options:

- **Full parity with desktop:**
  - Mirror the Cooldown logic in `useEventStream` for web SSE, including a 2s tail per session.
- **Simplified:**
  - Use only `session.status.type === 'busy'` as `phase: 'busy'`, and treat `'cooldown'` as desktop-only for now.

This is a product decision; current behavior (exact stop on `step-finish/stop`) suggests a **short or non-existent tail** is desired visually. We already confirmed that the 2s tail is not critical for the user experience, so `'busy'` alone may be enough.

---

## Phase 3 – Refactor WorkingPlaceholder to consume UiPhase

Goal: reduce complexity of `useAssistantStatus` / `WorkingPlaceholder` by using `sessionActivityPhase` as the “working vs idle” backbone.

### Current logic

Locations:

- `packages/ui/src/hooks/useAssistantStatus.ts`
- `packages/ui/src/components/chat/message/parts/WorkingPlaceholder.tsx`

Today, `useAssistantStatus`:

- Walks all assistant messages for the current session.
- Inspects parts:
  - `text` (start/finish),
  - `tool` (`state.status`),
  - `reasoning`,
  - `step-finish` parts,
  - etc.
- Combines this with:
  - `messageStreamStates` (`streaming|cooldown|completed`),
  - `sessionAbortFlags`,
  - permissions.
- Produces a `WorkingSummary`:

  ```ts
  {
    activity: 'idle' | 'streaming' | 'tooling' | 'cooldown' | 'permission';
    isWorking: boolean;
    isStreaming: boolean;
    isCooldown: boolean;
    statusText: string | null; // thinking/writing/using <tool>/editing/working
    ...
  }
  ```

Then `WorkingPlaceholder` uses that to:

- Show “Working…”, “Done”, “Aborted”.
- Keep a display queue and timers to avoid flicker, etc.

### Proposed refactor

1. **Base working flag from UiPhase**:

   - In `useAssistantStatus`, replace the “top-level” decision:

     ```ts
     const { phase, isWorkingFromPhase } = useSessionActivityFor(currentSessionId);
     ```

   - `isWorkingFromPhase` becomes the primary `isWorking` / `isStreaming` flag.

2. **Keep detailed status text from parts**:

   - For `statusText` and `activePartType` (`thinking/writing/tool/editing`), we can keep the existing part‑scanning logic, but:
     - Only run it while `isWorkingFromPhase` is true.
     - Or treat `phase` as a “gate” that can override pure part heuristics when the backend says the session is idle.

3. **Cooldown coordination**:

   - If `phase === 'cooldown'`:
     - `WorkingPlaceholder` may want to show a very brief “Done” or “Working…” tail, but we should respect the backend decision that the run just finished.
   - The existing `WorkingPlaceholder` internal timers (min display time, fade out, etc.) can be simplified to:
     - Consider `phase` as “ground truth”:
       - `busy` → allowed to show “working”.
       - `cooldown` → short “Done” state if needed.
       - `idle` → placeholder fades out and does not re‑appear unless phase returns to `busy`.

4. **Remove duplicated lifecycle heuristics**:

   - Once `phase` is trusted, we can consider removing or simplifying:
     - repeated checks of `messageStreamStates`,
     - local detection of streaming vs cooldown vs completed (now covered by backend).

This should be done carefully to avoid regressions; the first step can be **add phase as an additional signal** and gradually replace internal conditions with it.

---

## Phase 4 – Other consumers and future uses

Once UiPhase is fully wired:

- **Sidebar** (already partially done):
  - Uses `phase === 'busy' | 'cooldown'` to drive shine.
  - Could later show a small text hint (e.g. “working”, “cooling down”) if desired.

- **Header / status indicators**:
  - Could show a session‑level “Working” chip based on `sessionActivityPhase`.

- **Session list / notifications**:
  - When a session enters `busy`, we could emphasize it in the list.
  - When it completes (goes into `cooldown` / `idle`), we already show desktop notifications; web notifications could piggyback on the same phase changes.

---

## Summary

- **Backend (Rust SSE / Tauri)**:
  - Already derives a robust `UiPhase` per session from:
    - `session.status` (`idle|busy|retry`) and
    - message completion events (`message.updated` / `message.part.updated`).
  - Emits this as `opencode:session-activity { sessionId, phase }`.

- **Desktop bridge & UI**:
  - Desktop forwards `session-activity` via `eventsBridge.ts`.
  - `useEventStream.ts` stores phase in `sessionActivityPhase` map in `useSessionStore`.
  - Sidebar uses this to drive shine without local timers.

- **Next work (future session)**:
  1. Mirror UiPhase logic for **web SSE** in `useEventStream.ts` so phase is correct without Tauri.
  2. Introduce a small selector `useSessionActivityFor(sessionId)` to centralize reading `phase` and `isWorking`.
  3. Refactor `useAssistantStatus` / `WorkingPlaceholder` to use UiPhase as the backbone for “working vs done” instead of duplicating lifecycle detection.
  4. Remove or simplify local timers and heuristics once UiPhase is trusted everywhere.

This gives us a single, backend‑aligned “assistant working state” that all UI components can share, reducing complexity and eliminating flicker/blinking inconsistencies.
