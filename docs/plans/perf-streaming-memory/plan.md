# Plan: Performance - Streaming Lag, Memory Leaks & Stuck Sessions

## Metadata
- Created: 2026-02-23
- Status: ready
- Branch: `perf/streaming-and-memory-fixes`
- Worktree: `openchamber-perf-fixes`
- Related Issues: #476 (stuck spinner), #358 (34GB memory leak), #190 (insane lag)

## Summary
| Metric | Value |
|--------|-------|
| Total tasks | 6 |
| Estimated time | 6h 30m |
| Files affected | 5 |
| New files | 0 |

## Overview

OpenChamber suffers from three interrelated performance problems:

1. **UI freeze during streaming** - Every SSE token triggers an immediate Zustand `set()` + React re-render (100+/sec)
2. **Memory leak on long sessions** - Module-level caches grow unbounded; thinking tokens held in full
3. **"Stuck" spinner after stream ends** - SSE callback stale closures + no idle timeout recovery

Root cause analysis traced these to 6 specific code locations across 5 files in `packages/ui/src/`.

## Technical Approach

Fix the hot path first (streaming), then cascading stores, then SSE stability, then memory/cleanup.

## Tại sao chọn approach này?

### Alternatives đã xem xét
| Option | Đã xét | Không chọn vì |
|--------|--------|---------------|
| Full store rewrite (e.g. Jotai) | Yes | Too risky, scope creep, existing code works fine outside streaming |
| React virtualized message list | Yes | Orthogonal improvement - good follow-up but doesn't fix the root cause (too many state updates) |
| Server-side batching (batch SSE events) | Yes | Requires backend changes outside this repo; UI should be resilient regardless |
| Web Worker for SSE processing | Yes | Overkill - batching via rAF achieves same result with 10x less code |

### Trade-offs
- **Pros:** Minimal surface area (5 files), no new deps, backward-compatible, individually testable
- **Cons:** `requestAnimationFrame` batching adds up to 16ms latency to streaming text (imperceptible)

### Khi nào nên dùng approach khác?
| Nếu... | Thì dùng... |
|--------|-------------|
| Message list has 1000+ messages visible | React virtualization (react-window) |
| Server sends >500 events/sec | Web Worker + SharedArrayBuffer |
| Complete rewrite opportunity | Migrate to signal-based state (Jotai/Preact signals) |

## Files to Modify

| File | Changes |
|------|---------|
| `packages/ui/src/stores/messageStore.ts` | Batch ALL streaming parts via rAF, fix direct state mutation |
| `packages/ui/src/stores/useSessionStore.ts` | Debounce messageStore subscription, lazy userSummaryTitles |
| `packages/ui/src/hooks/useEventStream.ts` | Stabilize callbacks via refs, bounded messageCache, toast duration |
| `packages/ui/src/stores/utils/streamingUtils.ts` | Add batched lifecycle touch helper |
| `packages/ui/src/stores/types/sessionTypes.ts` | Add idle timeout constant |

## Task Breakdown

### Phase 1: Streaming Hot Path (sequential - core fix)
| ID | Task | Files | Estimate | Depends |
|----|------|-------|----------|---------|
| PERF-001 | Batch ALL streaming parts via requestAnimationFrame | `messageStore.ts`, `streamingUtils.ts` | 2h | - |
| PERF-002 | Fix direct state mutation in _addStreamingPartImmediate | `messageStore.ts` | 30m | PERF-001 |

### Phase 2: Store Cascading (sequential - depends on Phase 1)
| ID | Task | Files | Estimate | Depends |
|----|------|-------|----------|---------|
| PERF-003 | Debounce messageStore->sessionStore subscription | `useSessionStore.ts` | 1h | PERF-001 |

### Phase 3: SSE Stability (can start after Phase 1)
| ID | Task | Files | Estimate | Depends |
|----|------|-------|----------|---------|
| PERF-004 | Stabilize SSE callbacks with refs + add idle timeout recovery | `useEventStream.ts`, `sessionTypes.ts` | 1h 30m | PERF-001 |

### Phase 4: Memory & Cleanup (independent, can parallel)
| ID | Task | Files | Estimate | Depends |
|----|------|-------|----------|---------|
| PERF-005 | Bound module-level caches + cleanup on session switch | `useEventStream.ts`, `messageStore.ts` | 1h | - |
| PERF-006 | Fix infinite-duration toasts | `useEventStream.ts` | 15m | - |

## Execution Order
```
Phase 1: PERF-001 -> PERF-002  (streaming hot path)
Phase 2: PERF-003              (store cascading, after Phase 1)
Phase 3: PERF-004              (SSE stability, after Phase 1)
Phase 4: PERF-005, PERF-006    (memory/cleanup, can parallel with Phase 2-3)
```

## Verification Strategy

After all tasks:
```bash
bun run type-check && bun run lint && bun run build
```

Manual testing:
1. Open a session, send a long message -> UI should NOT freeze during streaming
2. Switch sessions during streaming -> spinner should not get stuck
3. Leave a session running for 10+ min -> memory should stay bounded
4. Permission/question toasts should auto-dismiss after 30s

## Risks & Assumptions
- `requestAnimationFrame` is available in all target runtimes (web, Tauri webview, VS Code webview) - verified: yes
- Batching adds max 16ms latency - imperceptible for streaming text
- No backend/server changes needed
- Assumes current test coverage is minimal (no automated UI tests to break)

## Task Files
- [PERF-001](./tasks/PERF-001.md) - Batch ALL streaming parts via rAF
- [PERF-002](./tasks/PERF-002.md) - Fix direct state mutation
- [PERF-003](./tasks/PERF-003.md) - Debounce cascading store subscription
- [PERF-004](./tasks/PERF-004.md) - Stabilize SSE callbacks + idle timeout
- [PERF-005](./tasks/PERF-005.md) - Bound module-level caches
- [PERF-006](./tasks/PERF-006.md) - Fix infinite-duration toasts
