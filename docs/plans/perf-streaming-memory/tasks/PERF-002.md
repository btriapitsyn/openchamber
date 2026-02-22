# Task: PERF-002 - Fix direct state mutation in _addStreamingPartImmediate

## Metadata
- Status: completed
- Estimate: 30m
- Depends on: PERF-001
- Phase: 1 (Streaming Hot Path)

## Files to Modify
- `packages/ui/src/stores/messageStore.ts` (MODIFY)

## Description

Inside `_addStreamingPartImmediate`, the `set()` callback mutates `state.sessionMemoryState`
directly in two places instead of returning it in the result object. This can cause Zustand
to miss change detection and lead to inconsistent state between subscribers.

## Requirements

### Fix mutation at line ~1121-1127 (background session streaming):

The code currently does:
```
state.sessionMemoryState = newMemoryState;  // DIRECT MUTATION
```

Instead, accumulate the sessionMemoryState change in the `updates` object and
return it in the final return value of the `set()` callback.

### Fix mutation at line ~1130-1142 (assistant streaming mark):

Same pattern - currently mutates `state.sessionMemoryState` directly.
Move this into the accumulated `updates` object.

### Ensure both mutations merge correctly:

If both code paths execute in the same `set()` call (background session + assistant role),
the second mutation must build on top of the first, not overwrite it.
Use the `updates` accumulator pattern already used for `streamingMessageIds`.

## Edge Cases

- Both paths triggering in same call: background session receiving assistant part
- Neither path triggering: user part for current session
- Only one path: most common case

## Verification
```bash
bun run type-check && bun run lint && bun run build
```

## Notes
- This is a correctness fix, not just performance
- May fix subtle race conditions where streaming state gets lost
- Small change but important for Phase 2 (cascading store) to work correctly

---
**WARNING: DO NOT WRITE CODE HERE** - Code will be implemented by Executor agent

## Execution Result

### Status: ✅ COMPLETED
- Executed at: 2026-02-23
- Duration: ~15m

### Files Modified
| File | Action | Lines changed |
|------|--------|--------------|
| `packages/ui/src/stores/messageStore.ts` | modified | ~6 lines |

### Changes Made

**Fix 1 – Background session mutation (line ~1125):**
```diff
- state.sessionMemoryState = newMemoryState;
+ updates.sessionMemoryState = newMemoryState;
```

**Fix 2 – Assistant streaming mark mutation (line ~1140):**
```diff
- const currentMemoryState = state.sessionMemoryState.get(sessionId);
+ const baseMemoryMap = updates.sessionMemoryState ?? state.sessionMemoryState;
+ const currentMemoryState = baseMemoryMap.get(sessionId);
  if (currentMemoryState) {
      const now = Date.now();
-     const nextMemoryState = new Map(state.sessionMemoryState);
+     const nextMemoryState = new Map(baseMemoryMap);
      nextMemoryState.set(sessionId, { ... });
-     state.sessionMemoryState = nextMemoryState;
+     updates.sessionMemoryState = nextMemoryState;
  }
```

**Fix 3 & 4 – User role return paths that missed `...updates`:**
- Line ~1209: `return finalizeAbortState({ messages: newMessages, ...updates });`
- Line ~1317: `return finalizeAbortState({ messages: newMessages, ...updates });`

These user-role early returns could lose `updates.sessionMemoryState` (set by the background session block) since background session check fires regardless of role.

### Implementation Notes
- Both mutations now accumulate into `updates` object and returned via `set()` — consistent with how `streamingMessageIds` is handled
- If both paths fire in same call (background session + assistant role), second block reads from `updates.sessionMemoryState` first to build on top of first block's changes — no overwrite
- Also fixed 2 user-role early return paths that were missing `...updates` spread, which could silently drop `sessionMemoryState` changes

### Test Result
```
bun run type-check && bun run lint && bun run build
✅ type-check: all packages passed (exit code 0)
✅ lint: 0 errors, 2 pre-existing warnings (unrelated to this change)
✅ build: all packages built successfully
```
