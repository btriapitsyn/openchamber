# Session-Scoped Assistant Working Indicator Plan

## 1. Background & Pain Points
- The current `WorkingPlaceholder` renders whatever status text the shared queue last emitted, regardless of which session is focused. When you switch sessions while another run is finishing, you briefly see stale states ("Working", "Done", or "Aborted") from the previous session.
- `useAssistantStatus` calculates a single `working` summary derived from whichever assistant message was last active across the entire data set. During session switches (before the new session streams anything), the hook still exposes the old session's status.
- `WorkingPlaceholder` keeps internal timers/queues across session switches because the component instance stays mounted; it drains the old session's queue even if the user is now viewing a different session.

## 2. Goals & Success Criteria
1. The status row always reflects the *currently selected session*; switching sessions instantly swaps to that session's state (or hides the row if nothing is active).
2. Abort indicators, permission waits, and "Done" transitions only appear for the session that generated them.
3. Background sessions can continue streaming, but their status never bleeds into the foreground session until the user switches back.
4. Implementation keeps the existing smooth transitions (minimum display timers, fade-in/out) and desktop notifications.

## 3. High-Level Approach
1. **Session-Scoped Working Snapshots**: Track assistant working metadata per session in `useMessageStore` (or a dedicated derived store). Each streaming/tooling event updates the map entry for its `sessionId`.
2. **Selector per Session**: Update `useAssistantStatus` so it simply reads the snapshot for the currently selected session. When the map lacks an entry (no activity), the hook returns `DEFAULT_WORKING` immediately instead of reusing stale data.
3. **Placeholder Isolation**: Key `<WorkingPlaceholder>` by `currentSessionId` (and maybe `streamingMessageId`) so its internal queue/timers reset on session switch, preventing the previous session's transition from draining in the new one.
4. **Abort Flag Pairing**: Ensure `sessionAbortFlags` are cleared/acknowledged per session when the user switches away, so the new session does not inherit an "Aborted" banner.

## 4. Detailed Implementation Steps

### 4.1 Data Layer
- Extend `MessageState` with `sessionWorkingState: Map<string, WorkingSummary>` (lightweight structure that mirrors `useAssistantStatus`'s `WorkingSummary`).
- Whenever we process streaming parts, lifecycle updates, permissions, or aborts (in `messageStore.ts`), update only the specific session's entry:
  - On new assistant message or streaming tick → compute `activity`, `statusText`, `activePartType`, etc., store under that session ID.
  - On message completion or stop finish → mark the session entry as `DEFAULT_WORKING`.
  - On abort → set `wasAborted: true`, `abortActive: true` for that session only.
- When trimming/evicting sessions, delete their `sessionWorkingState` entry to avoid retaining stale records.

### 4.2 Hook Refactor (`useAssistantStatus.ts`)
- Replace the existing "scan every message" logic with a selector that reads `sessionWorkingState.get(currentSessionId)` plus `forming` info for that session.
- When no entry exists yet (e.g., session freshly loaded, no assistant activity), fall back to `DEFAULT_WORKING` immediately.
- Keep the forming overlay logic, but ensure it operates only on the focused session's messages and updates the map accordingly.
- Continue exposing `wasAborted`, `abortActive`, and `statusText` exactly as before so `ChatInput` remains compatible.

### 4.3 UI Wiring
- In `ChatInput.tsx`, change `<WorkingPlaceholder ... />` to `<WorkingPlaceholder key={currentSessionId ?? 'no-session'} ... />` so switching sessions remounts the component and clears its queue/timers.
- Optionally include `streamingMessageId` in the key if we want resets between simultaneous runs within the same session.
- Ensure the abort banner logic (`showAbortStatus`) references only the current session's `working.wasAborted`. When `currentSessionId` changes, reset `showAbortStatus` state to avoid flashing leftover banners.

### 4.4 Edge Handling
- When a session is loading and has zero assistant messages, the plan should hide the placeholder completely (hook returns `DEFAULT_WORKING`).
- Desktop notifications must still fire per session; we can store notification metadata as part of the per-session snapshot so switching sessions mid-run does not drop the future notification.
- Confirm that multi-window scenarios (two tabs open on different sessions) still work, since snapshots are keyed by session ID and updated globally.

## 5. Validation Checklist
- Switch between two sessions while one is streaming: the visible status always matches the focused session and never shows "Done" for the background run.
- Start a run, switch away before completion, then return: the placeholder resumes with the correct state (still working or done).
- Abort a run, switch sessions, verify the abort banner does not appear in the new session.
- Permission prompts and compaction phases remain session-specific.
- Desktop notification still fires when the background session finishes and the window is unfocused.

## 6. Rollout Considerations
- Backfill existing sessions by seeding `sessionWorkingState` using the current scanning logic once on store hydration, so we do not show a blank state until the first new message arrives.
- Consider feature flagging the new behavior if we anticipate regressions; expose a store toggle to revert to global mode if needed.

## 7. Unresolved Questions
1. Should we persist `sessionWorkingState` across reloads, or is it acceptable to recompute from messages on load?
2. Do we need to surface background session statuses anywhere else in the UI (e.g., sidebar badges), which might influence the data structure we choose?
3. Should the placeholder key also include `streamingMessageId` to reset during consecutive runs within the same session?
