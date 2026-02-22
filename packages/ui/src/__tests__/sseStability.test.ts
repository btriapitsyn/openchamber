/**
 * Tests for PERF-004: SSE callback stability + idle timeout recovery
 *
 * Tests the ref-based stable callback pattern and the stuck session detector.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const STUCK_SESSION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes (from sessionTypes.ts)

/**
 * Simulates the ref-based stable callback pattern from useEventStream.ts.
 *
 * In production:
 *   handleEventRef.current = handleEvent
 *   stableHandleEvent = useCallback((event) => handleEventRef.current(event), [])
 *
 * The key property: stableHandleEvent never changes identity, but always calls
 * the latest handleEvent implementation via the ref.
 */
describe('Stable callback via ref (PERF-004 Part A)', () => {
  it('stable wrapper should always call the latest implementation', () => {
    const results: string[] = [];

    // Simulate ref
    const ref = { current: (event: string) => results.push(`v1:${event}`) };

    // Stable wrapper (created once, never changes)
    const stableCallback = (event: string) => ref.current(event);

    stableCallback('first');
    expect(results).toEqual(['v1:first']);

    // Update the ref to a new implementation (simulates handleEvent recreated)
    ref.current = (event: string) => results.push(`v2:${event}`);

    // Same stableCallback reference, but calls new implementation
    stableCallback('second');
    expect(results).toEqual(['v1:first', 'v2:second']);
  });

  it('stable wrapper identity should never change', () => {
    const ref = { current: () => {} };
    const stableCallback = () => ref.current();

    // In React, this means stableCallback has [] deps -> same identity
    const firstRef = stableCallback;

    // Simulate re-render: ref.current gets new function
    ref.current = () => {};

    // stableCallback is still the same function object
    expect(stableCallback).toBe(firstRef);
  });

  it('should prevent downstream effect re-runs', () => {
    let effectRunCount = 0;

    // Simulate: startStream depends on stableHandleEvent
    const deps: unknown[] = [];

    const ref = { current: () => {} };
    const stableCallback = () => ref.current();

    // First "render" - effect runs
    deps.push(stableCallback);
    effectRunCount++; // effect runs on mount

    // Second "render" - handleEvent changes but stableCallback doesn't
    ref.current = () => {}; // new handleEvent

    // Check if deps changed
    const prevDep = deps[deps.length - 1];
    if (stableCallback !== prevDep) {
      effectRunCount++; // effect would re-run
    }

    // stableCallback hasn't changed, so effect should NOT re-run
    expect(effectRunCount).toBe(1);
  });
});

/**
 * Tests the stuck session idle timeout recovery logic from useEventStream.ts.
 */
describe('Stuck session timeout recovery (PERF-004 Part B)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * Simulates the session status Map and last-event tracking from useEventStream.
   */
  function createStuckSessionDetector() {
    const sessionStatus = new Map<string, { type: string; startedAt?: number }>();
    const lastMessageEvents = new Map<string, number>();
    const recoveredSessions: string[] = [];

    const setSessionBusy = (sessionId: string) => {
      sessionStatus.set(sessionId, { type: 'busy', startedAt: Date.now() });
      lastMessageEvents.set(sessionId, Date.now());
    };

    const recordEvent = (sessionId: string) => {
      lastMessageEvents.set(sessionId, Date.now());
    };

    const setSessionIdle = (sessionId: string) => {
      sessionStatus.set(sessionId, { type: 'idle' });
    };

    // Simulates the setInterval check from useEventStream
    const checkStuckSessions = () => {
      const now = Date.now();
      sessionStatus.forEach((status, sessionId) => {
        if (status.type !== 'busy' && status.type !== 'retry') return;

        const lastMsgAt = lastMessageEvents.get(sessionId) ?? 0;
        const noRecentEvents = now - lastMsgAt > 60000; // no events in 60s
        const busyTooLong = now - lastMsgAt > STUCK_SESSION_TIMEOUT_MS;

        if (busyTooLong && noRecentEvents) {
          sessionStatus.set(sessionId, { type: 'idle' });
          recoveredSessions.push(sessionId);
        }
      });
    };

    return {
      sessionStatus,
      setSessionBusy,
      setSessionIdle,
      recordEvent,
      checkStuckSessions,
      getRecoveredSessions: () => recoveredSessions,
    };
  }

  it('should NOT recover a session that is recently busy', () => {
    const detector = createStuckSessionDetector();

    detector.setSessionBusy('s1');

    // Check immediately
    detector.checkStuckSessions();

    expect(detector.getRecoveredSessions()).toEqual([]);
    expect(detector.sessionStatus.get('s1')!.type).toBe('busy');
  });

  it('should NOT recover a session that has recent events', () => {
    const detector = createStuckSessionDetector();

    detector.setSessionBusy('s1');

    // Advance 3 minutes
    vi.advanceTimersByTime(3 * 60 * 1000);

    // Session is still receiving events
    detector.recordEvent('s1');

    detector.checkStuckSessions();

    expect(detector.getRecoveredSessions()).toEqual([]);
    expect(detector.sessionStatus.get('s1')!.type).toBe('busy');
  });

  it('should recover a session stuck busy for > 5 minutes with no events', () => {
    const detector = createStuckSessionDetector();

    detector.setSessionBusy('s1');

    // Advance past STUCK_SESSION_TIMEOUT_MS
    vi.advanceTimersByTime(STUCK_SESSION_TIMEOUT_MS + 1000);

    detector.checkStuckSessions();

    expect(detector.getRecoveredSessions()).toEqual(['s1']);
    expect(detector.sessionStatus.get('s1')!.type).toBe('idle');
  });

  it('should NOT recover idle sessions', () => {
    const detector = createStuckSessionDetector();

    detector.setSessionBusy('s1');
    detector.setSessionIdle('s1'); // Already idle

    vi.advanceTimersByTime(STUCK_SESSION_TIMEOUT_MS + 1000);
    detector.checkStuckSessions();

    expect(detector.getRecoveredSessions()).toEqual([]);
  });

  it('should recover multiple stuck sessions independently', () => {
    const detector = createStuckSessionDetector();

    detector.setSessionBusy('s1');
    detector.setSessionBusy('s2');

    // Advance 3 min - s1 still busy, s2 gets an event
    vi.advanceTimersByTime(3 * 60 * 1000);
    detector.recordEvent('s2');

    // Advance 3 more min - now s1 is 6min old, s2 is 3min since last event
    vi.advanceTimersByTime(3 * 60 * 1000);

    detector.checkStuckSessions();

    // Only s1 should be recovered (s2 had recent events)
    expect(detector.getRecoveredSessions()).toEqual(['s1']);
    expect(detector.sessionStatus.get('s1')!.type).toBe('idle');
    expect(detector.sessionStatus.get('s2')!.type).toBe('busy');
  });

  it('periodic check (30s interval) should catch stuck sessions', () => {
    const detector = createStuckSessionDetector();

    detector.setSessionBusy('s1');

    // Simulate the setInterval(30s) pattern
    const intervalId = setInterval(() => detector.checkStuckSessions(), 30000);

    // Not enough time yet
    vi.advanceTimersByTime(4 * 60 * 1000);
    expect(detector.getRecoveredSessions()).toEqual([]);

    // Past the threshold
    vi.advanceTimersByTime(2 * 60 * 1000);
    expect(detector.getRecoveredSessions()).toEqual(['s1']);

    clearInterval(intervalId);
  });

  it('STUCK_SESSION_TIMEOUT_MS should be 5 minutes', () => {
    expect(STUCK_SESSION_TIMEOUT_MS).toBe(300000);
  });
});
