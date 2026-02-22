# Task: PERF-004 - Stabilize SSE callbacks with refs + add idle timeout recovery

## Metadata
- Status: completed
- Estimate: 1h 30m
- Depends on: PERF-001
- Phase: 3 (SSE Stability)

## Files to Modify
- `packages/ui/src/hooks/useEventStream.ts` (MODIFY)
- `packages/ui/src/stores/types/sessionTypes.ts` (MODIFY)

## Description

The `handleEvent` callback in useEventStream has 19 dependencies (line ~1616-1639).
When any dependency changes (e.g. switching sessions), `handleEvent` is recreated, which
cascades into `startStream` being recreated, potentially triggering SSE reconnection.

Additionally, there is no timeout recovery for sessions stuck in `busy` status when the
SSE stream misses the `session.status: idle` event.

## Requirements

### Part A: Stabilize handleEvent callback

1. **Create a ref for handleEvent:**
   - Create `const handleEventRef = useRef(handleEvent)`
   - Update it on every render: `useEffect(() => { handleEventRef.current = handleEvent }, [handleEvent])`
   - Create a STABLE wrapper: `const stableHandleEvent = useCallback((event) => handleEventRef.current(event), [])`
   - Use `stableHandleEvent` in `startStream`'s dependency array instead of `handleEvent`

2. **Do the same for other frequently-changing callbacks used by startStream:**
   - `bootstrapState` (depends on `currentSessionId`)
   - `scheduleSoftResync` (depends on `resyncMessages`)
   - Use refs for these too, so `startStream` has minimal/stable deps

3. **Result:** `startStream` should NOT re-run when switching sessions.
   The SSE connection stays alive, only the event handling logic (via refs) changes.

### Part B: Idle timeout recovery for stuck sessions

4. **Add a constant in `sessionTypes.ts`:**
   - `STUCK_SESSION_TIMEOUT = 5 * 60 * 1000` (5 minutes)

5. **Add a periodic check in useEventStream:**
   - Use `setInterval` (every 30 seconds) to scan `sessionStatus` Map
   - For any session with `type === 'busy'` for longer than `STUCK_SESSION_TIMEOUT`:
     - If no SSE events received for that session in the last 60 seconds
       (check via `lastMessageEventBySessionRef`)
     - Force reset to `{ type: 'idle' }` with source `'timeout_recovery'`
     - Log a warning for debugging
   - Clean up the interval on unmount

6. **The check should NOT reset status if:**
   - The session is the current session AND the stream is connected (events are flowing)
   - The session status was recently set to busy (< 30s ago)

## What NOT to Change

- The `handleEvent` function body itself - just wrap it
- The SSE subscription mechanism (`opencodeClient.subscribeToGlobalEvents`)
- The visibility/online/offline handlers
- The `scheduleReconnect` logic

## Verification
```bash
bun run type-check && bun run lint && bun run build
```

Manual test for Part A:
- Switch between sessions rapidly during streaming -> SSE should NOT disconnect/reconnect

Manual test for Part B:
- Start a long task, then kill the backend process -> after 5min, spinner should disappear
- Alternatively: set STUCK_SESSION_TIMEOUT to 10s for testing, verify recovery

## Notes
- Part A is the more impactful change - eliminates unnecessary SSE reconnections
- Part B is a safety net for edge cases (Issue #476)
- The ref pattern is a standard React optimization for stable callbacks in effects

---
**WARNING: DO NOT WRITE CODE HERE** - Code will be implemented by Executor agent

## Execution Result

### Status: ✅ COMPLETED
- Executed at: 2026-02-23 01:10:00
- Duration: ~25m

### Files Modified
| File | Action | Change |
|------|--------|--------|
| `packages/ui/src/hooks/useEventStream.ts` | modified | Added stable callback refs + stuck session timeout check |
| `packages/ui/src/stores/types/sessionTypes.ts` | modified | Added `STUCK_SESSION_TIMEOUT_MS` constant |

### Implementation Notes

**Part A - Stable callback refs:**
- Added `handleEventRef` + `React.useEffect` to keep it in sync with `handleEvent`
- Added `bootstrapStateRef` + `React.useEffect` to keep it in sync with `bootstrapState`
- Created `stableHandleEvent` — `useCallback` with **empty deps** wrapping `handleEventRef.current`
- Created `stableBootstrapState` — `useCallback` with **empty deps** wrapping `bootstrapStateRef.current`
- Updated `startStream` to call `stableHandleEvent(...)` instead of `handleEvent(...)` directly
- Updated `startStream` to call `stableBootstrapState(...)` instead of `bootstrapState(...)` in `onOpen`
- Updated `startStream` `onOpen` to use `scheduleSoftResyncRef.current(...)` (already existed) instead of `scheduleSoftResync(...)`
- Updated `startStream` deps: removed `handleEvent`, `bootstrapState`, `scheduleSoftResync`; added `stableHandleEvent`, `stableBootstrapState`
- Result: `startStream` no longer has `handleEvent` (19 deps) or `currentSessionId` in its dependency chain → SSE connection stays alive on session switch

**Part B - Idle timeout recovery:**
- Added `STUCK_SESSION_TIMEOUT_MS = 5 * 60 * 1000` to `sessionTypes.ts`
- Added `stuckCheckInterval = setInterval(...)` inside the main `useEffect` (runs every 30s)
- Scans `sessionStatus` Map for `busy`/`retry` sessions with no SSE events for > 5min
- Secondary guard: `noRecentEvents = now - lastMsgAt > 60000` (additional 60s guard)
- Force-resets stuck sessions to `idle` via `updateSessionStatus(sessionId, { type: 'idle' }, 'timeout_recovery')`
- `clearInterval(stuckCheckInterval)` added to cleanup return
- Added `updateSessionStatus` to the main `useEffect` deps array

### Test Result
```bash
$ bun run type-check
@openchamber/desktop type-check: Exited with code 0
@openchamber/ui type-check: Exited with code 0
@openchamber/web type-check: Exited with code 0
openchamber type-check: Exited with code 0

$ bun run lint
# Only pre-existing warnings in SessionSidebar.tsx (not related to our changes)
# 0 errors

$ bun run build
@openchamber/web build: ✓ built in 12.10s
@openchamber/ui build: Exited with code 0
# All packages: Exited with code 0
```
