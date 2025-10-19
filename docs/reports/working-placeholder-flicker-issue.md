# Working Placeholder Flicker Issue

**Status:** OPEN
**Date:** 2025-10-19
**Priority:** Medium
**Component:** WorkingPlaceholder component

## Problem Description

The "Working…" placeholder that shows during tool/reasoning execution is flickering - appearing and disappearing too frequently during chains of tool and reasoning parts, instead of showing continuously with 2-second persistence between operations.

## Expected Behavior

When assistant executes a chain like:
```
tool → reasoning → tool → reasoning → tool → tool → reasoning → tool → text
```

The "Working…" placeholder should:
1. Show continuously while any tool/reasoning is running
2. Persist for 2 seconds after each operation finishes
3. Only hide when:
   - Text part arrives (switches to "Forming the response")
   - 2 seconds pass with no new operations
4. Never flicker during the operation chain

## Actual Behavior

The placeholder appears and disappears rapidly during tool/reasoning chains, creating visual flicker instead of smooth continuous display.

## Context

This issue emerged after removing the tool grouping system and implementing a unified WorkingPlaceholder component to provide feedback during tool/reasoning execution.

**Related Files:**
- `src/components/chat/message/parts/WorkingPlaceholder.tsx`
- `src/components/chat/message/MessageBody.tsx`

## Attempted Fixes

### Attempt 1: Prevent component unmount/remount
- **Change:** Always render WorkingPlaceholder during streaming, handle visibility internally
- **Result:** Still flickering

### Attempt 2: Stabilize timeout with ref
- **Change:** Track finish time in ref, only set timeout once per finish time
- **Result:** Still flickering

### Attempt 3: Separate cleanup effect
- **Change:** Move timeout cleanup to separate effect that only runs on unmount
- **Result:** Still flickering

### Attempt 4: Process finish times only once
- **Change:** Track `lastProcessedFinishTime`, only handle new finish times
- **Result:** Still flickering

### Attempt 5: Stabilize individual finish times
- **Change:** Use refs to stabilize `lastToolFinishTime` and `lastReasoningFinishTime`
- **Result:** Still flickering

### Attempt 6: Stabilize combined finish time
- **Change:** Also stabilize the `Math.max()` calculation result in a ref
- **Result:** Still flickering

## Current Implementation

**WorkingPlaceholder.tsx:**
- Uses `lastProcessedFinishTime` ref to track which finish time has been handled
- Only processes new finish times (avoids recalculating elapsed time)
- Timeout set once per finish time and runs undisturbed

**MessageBody.tsx:**
- Stabilizes individual finish times in refs (only update when value changes)
- Stabilizes combined finish time calculation in ref
- Passes stabilized values to WorkingPlaceholder

## Debugging Constraints

- User is on tablet via SSH, cannot access browser console logs
- Visual inspection only - must rely on rendered output behavior

## Hypothesis

The issue may be related to:
1. **State transitions during streaming** - Some combination of `hasRunningTools`, `hasActiveReasoning`, `hasWorkingParts`, or `hasTextPart` is toggling in unexpected ways
2. **Streaming update frequency** - Updates coming faster than expected, causing rapid prop changes
3. **React re-render batching** - Multiple state updates not being batched, causing intermediate states to render
4. **Finish time calculation** - The logic for determining "most recent finish time" may be unstable during the reasoning ↔ tool transition

## Next Steps

1. Add visual indicators to understand state transitions (since console unavailable)
2. Consider alternative approach: single timeout at message level instead of component level
3. Review streaming event flow to understand exact sequence of state changes
4. Potentially simplify by removing reasoning from working placeholder logic initially

## Branch

All work is on branch: `perf/streaming-fixes`
