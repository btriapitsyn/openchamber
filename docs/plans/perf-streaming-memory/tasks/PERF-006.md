# Task: PERF-006 - Fix infinite-duration toasts

## Metadata
- Status: completed
- Estimate: 15m
- Depends on: none (can run in parallel)
- Phase: 4 (Memory & Cleanup)

## Files to Modify
- `packages/ui/src/hooks/useEventStream.ts` (MODIFY)

## Description

Two toast calls use `duration: Infinity`, causing toast DOM elements to accumulate
indefinitely throughout a session.

## Requirements

### 1. Fix permission toast (line ~1469):

Change `duration: Infinity` to `duration: 30000` (30 seconds).

The toast already has an "Open" action button. If the user doesn't click within 30s,
the permission request is still available in the session's permission queue -
the user just needs to switch to that session.

### 2. Fix question toast (line ~1540):

Same change: `duration: Infinity` to `duration: 30000`.

Same reasoning - question requests persist in the store, the toast is just a notification.

### 3. Consider using `id` parameter for deduplication:

Both toast calls already have a `toastKey` check via `permissionToastShownRef` / `questionToastShownRef`.
Additionally, pass `id: toastKey` to the `toast()` call so sonner can deduplicate on its own
and prevent the same toast from appearing twice even if the ref check misses.

## Verification
```bash
bun run type-check && bun run lint && bun run build
```

Manual: Trigger multiple permission requests (e.g., via subagents).
- Before: Toast DOM elements pile up, never dismiss
- After: Toasts auto-dismiss after 30s

## Notes
- Smallest fix in the plan but prevents DOM accumulation
- 30s duration is generous - most users will either click "Open" or ignore within a few seconds

---
**WARNING: DO NOT WRITE CODE HERE** - Code will be implemented by Executor agent

## Execution Result

### Status: ✅ COMPLETED
- Executed at: 2026-02-23 01:15:00
- Duration: ~5m

### Files Modified
| File | Action | Changes |
|------|--------|---------|
| `packages/ui/src/hooks/useEventStream.ts` | modified | Fixed 2 toast calls: `duration: Infinity → 30000`, added `id: toastKey` |

### Changes Summary

**permission.asked toast (line ~1481):**
```ts
toast.warning('Permission required', {
  id: toastKey,       // ← added for sonner deduplication
  description: sessionTitle,
  duration: 30000,    // ← was Infinity
  ...
});
```

**question.asked toast (line ~1552):**
```ts
toast.info('Input needed', {
  id: toastKey,       // ← added for sonner deduplication
  description: sessionTitle,
  duration: 30000,    // ← was Infinity
  ...
});
```

### Test Result
```
bun run type-check  → exit 0 (no errors)
bun run lint        → exit 0 (0 errors, 3 pre-existing warnings)
bun run build       → exit 0 (all packages built successfully)
```

### Implementation Notes
- 30s duration is generous — if a user misses it, the request still persists in the permission/question store
- `id: toastKey` uses the existing `${sessionID}:${requestID}` key pattern, ensuring sonner deduplicates identical toasts natively even if the `permissionToastShownRef`/`questionToastShownRef` guard misses (e.g. after hot reload)
