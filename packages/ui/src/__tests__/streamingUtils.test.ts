/**
 * Tests for PERF-001: streamingUtils - touchStreamingLifecycleBatch
 *
 * Verifies that the batched lifecycle helper creates ONE Map allocation
 * for N messageIds instead of N allocations.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  touchStreamingLifecycle,
  touchStreamingLifecycleBatch,
  removeLifecycleEntries,
  clearLifecycleCompletionTimer,
} from '@/stores/utils/streamingUtils';
import type { MessageStreamLifecycle } from '@/stores/types/sessionTypes';

describe('streamingUtils', () => {
  let source: Map<string, MessageStreamLifecycle>;

  beforeEach(() => {
    source = new Map();
  });

  describe('touchStreamingLifecycle (existing)', () => {
    it('should create a new Map with the messageId touched', () => {
      const result = touchStreamingLifecycle(source, 'msg-1');

      expect(result).not.toBe(source); // new Map
      expect(result.size).toBe(1);
      expect(result.get('msg-1')).toMatchObject({
        phase: 'streaming',
      });
    });

    it('should preserve startedAt on subsequent touches', () => {
      const first = touchStreamingLifecycle(source, 'msg-1');
      const startedAt = first.get('msg-1')!.startedAt;

      const second = touchStreamingLifecycle(first, 'msg-1');
      expect(second.get('msg-1')!.startedAt).toBe(startedAt);
      expect(second.get('msg-1')!.lastUpdateAt).toBeGreaterThanOrEqual(startedAt);
    });

    it('creates a NEW Map per call (N calls = N allocations)', () => {
      const maps: Map<string, MessageStreamLifecycle>[] = [];
      let current = source;
      for (let i = 0; i < 5; i++) {
        current = touchStreamingLifecycle(current, `msg-${i}`);
        maps.push(current);
      }
      // All 5 Maps should be distinct objects
      const unique = new Set(maps);
      expect(unique.size).toBe(5);
    });
  });

  describe('touchStreamingLifecycleBatch (PERF-001)', () => {
    it('should touch multiple messageIds in ONE Map allocation', () => {
      const result = touchStreamingLifecycleBatch(source, ['msg-1', 'msg-2', 'msg-3']);

      expect(result).not.toBe(source);
      expect(result.size).toBe(3);
      expect(result.has('msg-1')).toBe(true);
      expect(result.has('msg-2')).toBe(true);
      expect(result.has('msg-3')).toBe(true);
    });

    it('should return source unchanged if messageIds is empty', () => {
      const result = touchStreamingLifecycleBatch(source, []);
      expect(result).toBe(source); // same reference = no allocation
    });

    it('should preserve existing entries not in the batch', () => {
      source.set('existing', { phase: 'completed', startedAt: 1000, lastUpdateAt: 2000, completedAt: 2000 });

      const result = touchStreamingLifecycleBatch(source, ['msg-1']);

      expect(result.size).toBe(2);
      expect(result.get('existing')).toMatchObject({ phase: 'completed', startedAt: 1000 });
      expect(result.get('msg-1')).toMatchObject({ phase: 'streaming' });
    });

    it('should preserve startedAt for already-tracked messages', () => {
      source.set('msg-1', { phase: 'streaming', startedAt: 5000, lastUpdateAt: 5000 });

      const result = touchStreamingLifecycleBatch(source, ['msg-1', 'msg-2']);

      expect(result.get('msg-1')!.startedAt).toBe(5000);
      expect(result.get('msg-2')!.startedAt).toBeGreaterThan(0);
    });

    it('should set all batched entries to streaming phase', () => {
      const result = touchStreamingLifecycleBatch(source, ['a', 'b', 'c']);
      for (const [, lifecycle] of result) {
        expect(lifecycle.phase).toBe('streaming');
      }
    });

    it('produces same result as N individual touchStreamingLifecycle calls', () => {
      const ids = ['msg-1', 'msg-2', 'msg-3'];

      // Individual calls
      let individual = new Map(source);
      for (const id of ids) {
        individual = touchStreamingLifecycle(individual, id);
      }

      // Batched call
      const batched = touchStreamingLifecycleBatch(source, ids);

      // Same keys and phases
      expect(batched.size).toBe(individual.size);
      for (const [id, lifecycle] of batched) {
        expect(individual.has(id)).toBe(true);
        expect(lifecycle.phase).toBe(individual.get(id)!.phase);
      }
    });

    it('handles duplicate messageIds gracefully', () => {
      const result = touchStreamingLifecycleBatch(source, ['msg-1', 'msg-1', 'msg-1']);
      expect(result.size).toBe(1);
      expect(result.has('msg-1')).toBe(true);
    });
  });

  describe('removeLifecycleEntries', () => {
    it('should remove specified entries', () => {
      source.set('a', { phase: 'streaming', startedAt: 1, lastUpdateAt: 1 });
      source.set('b', { phase: 'streaming', startedAt: 2, lastUpdateAt: 2 });
      source.set('c', { phase: 'streaming', startedAt: 3, lastUpdateAt: 3 });

      const result = removeLifecycleEntries(source, ['a', 'c']);
      expect(result.size).toBe(1);
      expect(result.has('b')).toBe(true);
    });

    it('should return same reference if no entries to remove', () => {
      source.set('a', { phase: 'streaming', startedAt: 1, lastUpdateAt: 1 });
      const result = removeLifecycleEntries(source, ['nonexistent']);
      expect(result).toBe(source);
    });
  });
});
