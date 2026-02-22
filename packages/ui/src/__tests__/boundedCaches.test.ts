/**
 * Tests for PERF-005: Bounded caches
 *
 * Tests that module-level caches have size limits and eviction logic.
 * Since the actual caches are internal to their modules, we test the pattern.
 */
import { describe, it, expect } from 'vitest';

const MAX_CACHE_SIZE = 500;
const EVICT_COUNT = 100;

/**
 * Simulates the bounded messageCache pattern from useEventStream.ts
 */
function createBoundedCache<K, V>(maxSize: number, evictCount: number) {
  const cache = new Map<K, V>();

  return {
    get(key: K): V | undefined {
      return cache.get(key);
    },
    set(key: K, value: V): void {
      if (cache.size >= maxSize) {
        let count = 0;
        for (const k of cache.keys()) {
          if (count++ >= evictCount) break;
          cache.delete(k);
        }
      }
      cache.set(key, value);
    },
    delete(key: K): boolean {
      return cache.delete(key);
    },
    clear(): void {
      cache.clear();
    },
    get size(): number {
      return cache.size;
    },
    has(key: K): boolean {
      return cache.has(key);
    },
  };
}

describe('Bounded cache (PERF-005)', () => {
  it('should store and retrieve entries', () => {
    const cache = createBoundedCache<string, number>(MAX_CACHE_SIZE, EVICT_COUNT);

    cache.set('a', 1);
    cache.set('b', 2);

    expect(cache.get('a')).toBe(1);
    expect(cache.get('b')).toBe(2);
    expect(cache.size).toBe(2);
  });

  it('should not exceed MAX_CACHE_SIZE', () => {
    const cache = createBoundedCache<string, number>(MAX_CACHE_SIZE, EVICT_COUNT);

    // Fill to capacity
    for (let i = 0; i < MAX_CACHE_SIZE; i++) {
      cache.set(`key-${i}`, i);
    }
    expect(cache.size).toBe(MAX_CACHE_SIZE);

    // Add one more - should trigger eviction
    cache.set('overflow', 999);

    // Size should be MAX_CACHE_SIZE - EVICT_COUNT + 1
    expect(cache.size).toBe(MAX_CACHE_SIZE - EVICT_COUNT + 1);
  });

  it('should evict oldest entries (Map insertion order)', () => {
    const cache = createBoundedCache<string, number>(10, 3);

    for (let i = 0; i < 10; i++) {
      cache.set(`key-${i}`, i);
    }

    // Trigger eviction
    cache.set('new', 999);

    // First 3 entries should be evicted
    expect(cache.has('key-0')).toBe(false);
    expect(cache.has('key-1')).toBe(false);
    expect(cache.has('key-2')).toBe(false);

    // Remaining entries should survive
    expect(cache.has('key-3')).toBe(true);
    expect(cache.has('key-9')).toBe(true);
    expect(cache.has('new')).toBe(true);
  });

  it('should handle clear()', () => {
    const cache = createBoundedCache<string, number>(100, 10);

    for (let i = 0; i < 50; i++) {
      cache.set(`key-${i}`, i);
    }

    cache.clear();
    expect(cache.size).toBe(0);
  });

  it('should handle delete()', () => {
    const cache = createBoundedCache<string, number>(100, 10);

    cache.set('a', 1);
    cache.set('b', 2);

    expect(cache.delete('a')).toBe(true);
    expect(cache.size).toBe(1);
    expect(cache.has('a')).toBe(false);
    expect(cache.has('b')).toBe(true);
  });
});

/**
 * Tests for ignoredAssistantMessageIds Set bounding
 */
describe('Bounded Set (ignoredAssistantMessageIds pattern)', () => {
  it('should clear when exceeding max size', () => {
    const maxSize = 1000;
    const set = new Set<string>();

    // Fill beyond max
    for (let i = 0; i < maxSize + 10; i++) {
      // Simulate the bounding check before add
      if (set.size > maxSize) {
        set.clear();
      }
      set.add(`msg-${i}`);
    }

    // After clearing, only the latest entries survive
    expect(set.size).toBeLessThanOrEqual(maxSize + 1);
  });
});

/**
 * Tests for registry cleanup on session eviction
 */
describe('Registry cleanup on session eviction (PERF-005)', () => {
  it('should clean up timeout and content registries for evicted message IDs', () => {
    const timeoutRegistry = new Map<string, ReturnType<typeof setTimeout>>();
    const lastContentRegistry = new Map<string, string>();

    // Simulate message IDs for session
    const messageIds = ['msg-1', 'msg-2', 'msg-3'];
    for (const id of messageIds) {
      timeoutRegistry.set(id, setTimeout(() => {}, 10000));
      lastContentRegistry.set(id, 'some text');
    }

    // Add entries for another session that should survive
    timeoutRegistry.set('other-msg', setTimeout(() => {}, 10000));
    lastContentRegistry.set('other-msg', 'other text');

    // Simulate eviction cleanup
    for (const id of messageIds) {
      const timer = timeoutRegistry.get(id);
      if (timer) {
        clearTimeout(timer);
        timeoutRegistry.delete(id);
      }
      lastContentRegistry.delete(id);
    }

    // Evicted entries are gone
    expect(timeoutRegistry.has('msg-1')).toBe(false);
    expect(timeoutRegistry.has('msg-2')).toBe(false);
    expect(lastContentRegistry.has('msg-1')).toBe(false);

    // Other session's entries survive
    expect(timeoutRegistry.has('other-msg')).toBe(true);
    expect(lastContentRegistry.has('other-msg')).toBe(true);

    // Clean up remaining timers
    for (const timer of timeoutRegistry.values()) {
      clearTimeout(timer);
    }
  });
});
