/**
 * Tests for PERF-001: Batch streaming via requestAnimationFrame
 *
 * Tests the batch queue mechanism that collects streaming parts
 * and flushes them in a single rAF frame instead of individual set() calls.
 *
 * Since the actual messageStore has heavy dependencies (SDK client, etc.),
 * we test the batch queue logic in isolation by simulating the pattern.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

interface QueuedPart {
  sessionId: string;
  messageId: string;
  part: { id: string; type: string; text?: string };
  role?: string;
}

/**
 * Simulates the batch queue pattern from messageStore.ts addStreamingPart.
 * This is an extracted version of the logic for testability.
 */
function createBatchQueue() {
  let queue: QueuedPart[] = [];
  let rafId: number | null = null;
  let flushCount = 0;
  let lastFlushItems: QueuedPart[] = [];
  const setCallLog: Array<{ sessionIds: Set<string>; messageIds: Set<string>; itemCount: number }> = [];

  const flush = () => {
    const items = [...queue];
    queue = [];
    rafId = null;
    flushCount++;
    lastFlushItems = items;

    // Simulate grouping by sessionId:messageId
    const grouped = new Map<string, QueuedPart[]>();
    for (const item of items) {
      const key = `${item.sessionId}:${item.messageId}`;
      const group = grouped.get(key) || [];
      group.push(item);
      grouped.set(key, group);
    }

    // Simulate single set() call
    const sessionIds = new Set<string>();
    const messageIds = new Set<string>();
    for (const item of items) {
      sessionIds.add(item.sessionId);
      messageIds.add(item.messageId);
    }
    setCallLog.push({ sessionIds, messageIds, itemCount: items.length });
  };

  return {
    enqueue(item: QueuedPart) {
      queue.push(item);
      if (rafId === null) {
        rafId = requestAnimationFrame(() => flush());
      }
    },
    getQueueLength: () => queue.length,
    getFlushCount: () => flushCount,
    getLastFlushItems: () => lastFlushItems,
    getSetCallLog: () => setCallLog,
    getRafId: () => rafId,
    cancelPending: () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      queue = [];
    },
  };
}

// Helper to flush all pending rAF callbacks
const flushRAF = async () => {
  // Our setup.ts rAF implementation executes on next microtask
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
};

describe('Batch streaming queue (PERF-001)', () => {
  let bq: ReturnType<typeof createBatchQueue>;

  beforeEach(() => {
    bq = createBatchQueue();
  });

  afterEach(() => {
    bq.cancelPending();
  });

  it('should queue items without immediate flush', () => {
    bq.enqueue({ sessionId: 's1', messageId: 'm1', part: { id: 'p1', type: 'text', text: 'hello' }, role: 'assistant' });

    expect(bq.getQueueLength()).toBe(1);
    expect(bq.getFlushCount()).toBe(0); // not yet flushed
  });

  it('should batch multiple items into a single flush', async () => {
    for (let i = 0; i < 10; i++) {
      bq.enqueue({
        sessionId: 's1',
        messageId: 'm1',
        part: { id: `p${i}`, type: 'text', text: `token-${i}` },
        role: 'assistant',
      });
    }

    expect(bq.getQueueLength()).toBe(10);
    expect(bq.getFlushCount()).toBe(0);

    await flushRAF();

    expect(bq.getFlushCount()).toBe(1); // ONE flush for 10 items
    expect(bq.getLastFlushItems().length).toBe(10);
    expect(bq.getQueueLength()).toBe(0); // queue cleared
  });

  it('should produce ONE set() call per flush regardless of item count', async () => {
    for (let i = 0; i < 50; i++) {
      bq.enqueue({
        sessionId: 's1',
        messageId: 'm1',
        part: { id: `p${i}`, type: 'text', text: `tok-${i}` },
        role: 'assistant',
      });
    }

    await flushRAF();

    const log = bq.getSetCallLog();
    expect(log.length).toBe(1); // single set() call
    expect(log[0].itemCount).toBe(50);
  });

  it('should group items by sessionId:messageId', async () => {
    bq.enqueue({ sessionId: 's1', messageId: 'm1', part: { id: 'p1', type: 'text' }, role: 'assistant' });
    bq.enqueue({ sessionId: 's1', messageId: 'm2', part: { id: 'p2', type: 'text' }, role: 'assistant' });
    bq.enqueue({ sessionId: 's2', messageId: 'm3', part: { id: 'p3', type: 'text' }, role: 'assistant' });

    await flushRAF();

    const log = bq.getSetCallLog();
    expect(log[0].sessionIds.size).toBe(2); // s1, s2
    expect(log[0].messageIds.size).toBe(3); // m1, m2, m3
  });

  it('should batch BOTH user and assistant parts', async () => {
    bq.enqueue({ sessionId: 's1', messageId: 'm1', part: { id: 'p1', type: 'text' }, role: 'user' });
    bq.enqueue({ sessionId: 's1', messageId: 'm2', part: { id: 'p2', type: 'text' }, role: 'assistant' });

    await flushRAF();

    expect(bq.getFlushCount()).toBe(1);
    const items = bq.getLastFlushItems();
    expect(items.length).toBe(2);
    expect(items[0].role).toBe('user');
    expect(items[1].role).toBe('assistant');
  });

  it('should only schedule ONE rAF per batch window', () => {
    const firstRaf = bq.getRafId();
    expect(firstRaf).toBeNull(); // nothing queued yet

    bq.enqueue({ sessionId: 's1', messageId: 'm1', part: { id: 'p1', type: 'text' }, role: 'assistant' });
    const rafAfterFirst = bq.getRafId();
    expect(rafAfterFirst).not.toBeNull();

    bq.enqueue({ sessionId: 's1', messageId: 'm1', part: { id: 'p2', type: 'text' }, role: 'assistant' });
    const rafAfterSecond = bq.getRafId();

    // Same rAF ID - no new rAF scheduled
    expect(rafAfterSecond).toBe(rafAfterFirst);
  });

  it('should allow new batches after flush completes', async () => {
    bq.enqueue({ sessionId: 's1', messageId: 'm1', part: { id: 'p1', type: 'text' }, role: 'assistant' });
    await flushRAF();
    expect(bq.getFlushCount()).toBe(1);

    // Enqueue more after first flush
    bq.enqueue({ sessionId: 's1', messageId: 'm2', part: { id: 'p2', type: 'text' }, role: 'assistant' });
    await flushRAF();
    expect(bq.getFlushCount()).toBe(2);
  });

  it('cancelPending should prevent flush', async () => {
    bq.enqueue({ sessionId: 's1', messageId: 'm1', part: { id: 'p1', type: 'text' }, role: 'assistant' });
    bq.cancelPending();

    await flushRAF();

    expect(bq.getFlushCount()).toBe(0);
    expect(bq.getQueueLength()).toBe(0);
  });

  describe('performance characteristics', () => {
    it('100 tokens should result in 1 flush and 1 set() call', async () => {
      for (let i = 0; i < 100; i++) {
        bq.enqueue({
          sessionId: 's1',
          messageId: 'm1',
          part: { id: `p${i}`, type: 'text', text: `token-${i}` },
          role: 'assistant',
        });
      }

      await flushRAF();

      expect(bq.getFlushCount()).toBe(1);
      expect(bq.getSetCallLog().length).toBe(1);
      expect(bq.getSetCallLog()[0].itemCount).toBe(100);
    });

    it('items across 5 sessions should batch into 1 flush', async () => {
      for (let s = 0; s < 5; s++) {
        for (let m = 0; m < 3; m++) {
          bq.enqueue({
            sessionId: `session-${s}`,
            messageId: `msg-${s}-${m}`,
            part: { id: `p-${s}-${m}`, type: 'text', text: 'x' },
            role: 'assistant',
          });
        }
      }

      await flushRAF();

      expect(bq.getFlushCount()).toBe(1);
      expect(bq.getSetCallLog()[0].sessionIds.size).toBe(5);
      expect(bq.getSetCallLog()[0].messageIds.size).toBe(15);
    });
  });
});
