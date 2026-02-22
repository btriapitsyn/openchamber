/**
 * Tests for PERF-003: Debounce store subscription
 *
 * Verifies that the rAF debounce pattern collapses multiple updates
 * into a single downstream setState call.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Simulates the debounced subscription pattern from useSessionStore.ts.
 * In production, this wraps useMessageStore.subscribe -> useSessionStore.setState.
 */
function createDebouncedSync() {
  let rafId: number | null = null;
  let syncCount = 0;
  let lastSyncedState: Record<string, unknown> | null = null;

  const sync = (getLatestState: () => Record<string, unknown>) => {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
    }
    rafId = requestAnimationFrame(() => {
      rafId = null;
      syncCount++;
      lastSyncedState = getLatestState();
    });
  };

  return {
    sync,
    getSyncCount: () => syncCount,
    getLastSyncedState: () => lastSyncedState,
    getRafId: () => rafId,
    cancelPending: () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    },
  };
}

/**
 * Simulates the separate userSummaryTitles debounce (500ms timer).
 */
function createTitleDebounce(delayMs = 500) {
  let timerId: ReturnType<typeof setTimeout> | null = null;
  let computeCount = 0;
  let lastResult: Map<string, string> | null = null;

  const schedule = (compute: () => Map<string, string>) => {
    if (timerId !== null) {
      clearTimeout(timerId);
    }
    timerId = setTimeout(() => {
      timerId = null;
      computeCount++;
      lastResult = compute();
    }, delayMs);
  };

  return {
    schedule,
    getComputeCount: () => computeCount,
    getLastResult: () => lastResult,
    cancelPending: () => {
      if (timerId !== null) {
        clearTimeout(timerId);
        timerId = null;
      }
    },
  };
}

const flushRAF = async () => {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
};

describe('Debounced subscription sync (PERF-003)', () => {
  let sync: ReturnType<typeof createDebouncedSync>;

  beforeEach(() => {
    sync = createDebouncedSync();
  });

  it('should not sync immediately', () => {
    let counter = 0;
    sync.sync(() => ({ counter: ++counter }));

    expect(sync.getSyncCount()).toBe(0);
  });

  it('should collapse multiple syncs into ONE rAF flush', async () => {
    let counter = 0;

    // Simulate 10 rapid messageStore updates
    for (let i = 0; i < 10; i++) {
      counter++;
      sync.sync(() => ({ counter }));
    }

    await flushRAF();

    expect(sync.getSyncCount()).toBe(1); // ONE sync, not 10
    expect(sync.getLastSyncedState()).toEqual({ counter: 10 }); // latest state
  });

  it('should use the LAST scheduled getter at flush time', async () => {
    // Each sync() cancels previous rAF and schedules new one with new getter.
    // The getter captures state via closure at schedule time.
    // In production, the getter calls useMessageStore.getState() for freshness.
    // Here we verify the cancel+re-schedule works: the LAST scheduled getter wins.

    sync.sync(() => ({ value: 'first' }));
    sync.sync(() => ({ value: 'second' }));
    sync.sync(() => ({ value: 'third' }));

    await flushRAF();

    // Last sync()'s getter should be the one that executes
    expect(sync.getLastSyncedState()!.value).toBe('third');
    expect(sync.getSyncCount()).toBe(1); // still only 1 flush
  });

  it('should allow subsequent flushes after first one', async () => {
    sync.sync(() => ({ batch: 1 }));
    await flushRAF();
    expect(sync.getSyncCount()).toBe(1);

    sync.sync(() => ({ batch: 2 }));
    await flushRAF();
    expect(sync.getSyncCount()).toBe(2);
    expect(sync.getLastSyncedState()).toEqual({ batch: 2 });
  });
});

describe('userSummaryTitles debounce (PERF-003)', () => {
  let titleDebounce: ReturnType<typeof createTitleDebounce>;

  beforeEach(() => {
    vi.useFakeTimers();
    titleDebounce = createTitleDebounce(500);
  });

  it('should NOT compute titles immediately', () => {
    titleDebounce.schedule(() => new Map([['s1', 'Title 1']]));
    expect(titleDebounce.getComputeCount()).toBe(0);
  });

  it('should collapse rapid updates within 500ms window', () => {
    for (let i = 0; i < 20; i++) {
      titleDebounce.schedule(() => new Map([['s1', `Title ${i}`]]));
    }

    // Advance 499ms - not yet
    vi.advanceTimersByTime(499);
    expect(titleDebounce.getComputeCount()).toBe(0);

    // Advance past 500ms
    vi.advanceTimersByTime(2);
    expect(titleDebounce.getComputeCount()).toBe(1); // ONE compute

    vi.useRealTimers();
  });

  it('should compute with latest data after debounce', () => {
    let counter = 0;

    for (let i = 0; i < 5; i++) {
      counter++;
      titleDebounce.schedule(() => new Map([['s1', `Title ${counter}`]]));
    }

    vi.advanceTimersByTime(500);

    expect(titleDebounce.getComputeCount()).toBe(1);
    expect(titleDebounce.getLastResult()!.get('s1')).toBe('Title 5');

    vi.useRealTimers();
  });

  it('should allow new debounce cycle after completion', () => {
    titleDebounce.schedule(() => new Map([['s1', 'First']]));
    vi.advanceTimersByTime(500);
    expect(titleDebounce.getComputeCount()).toBe(1);

    titleDebounce.schedule(() => new Map([['s1', 'Second']]));
    vi.advanceTimersByTime(500);
    expect(titleDebounce.getComputeCount()).toBe(2);

    vi.useRealTimers();
  });

  it('cancelPending should prevent computation', () => {
    titleDebounce.schedule(() => new Map([['s1', 'Nope']]));
    titleDebounce.cancelPending();

    vi.advanceTimersByTime(1000);
    expect(titleDebounce.getComputeCount()).toBe(0);

    vi.useRealTimers();
  });
});
