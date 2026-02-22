/**
 * Tests for PERF-002: No direct state mutation in Zustand set() callbacks
 *
 * Verifies the pattern: never assign to state.xxx inside set(), always
 * return changes via the updates object.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('State mutation pattern (PERF-002)', () => {
  const messageStorePath = resolve(__dirname, '../stores/messageStore.ts');
  let sourceCode: string;

  try {
    sourceCode = readFileSync(messageStorePath, 'utf-8');
  } catch {
    sourceCode = '';
  }

  it('messageStore.ts should exist and be readable', () => {
    expect(sourceCode.length).toBeGreaterThan(0);
  });

  it('should NOT directly mutate state.sessionMemoryState inside set() callbacks', () => {
    // Find all set() callback bodies and check for direct state mutation
    // Pattern to flag: state.sessionMemoryState = <something>
    // (but NOT updates.sessionMemoryState = <something>)

    // Split the file into lines and check for the bad pattern
    const lines = sourceCode.split('\n');
    const violations: Array<{ line: number; content: string }> = [];

    // Track if we're inside a set() callback
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Check for direct state mutation (but not 'updates.' prefix)
      if (
        line.match(/\bstate\.sessionMemoryState\s*=/) &&
        !line.match(/\bupdates\.sessionMemoryState\s*=/) &&
        !line.startsWith('//') &&
        !line.startsWith('*')
      ) {
        violations.push({ line: i + 1, content: line });
      }
    }

    expect(violations).toEqual([]);
  });

  it('should use updates accumulator for sessionMemoryState changes', () => {
    // Verify that updates.sessionMemoryState = pattern exists
    const hasUpdatesPattern = sourceCode.includes('updates.sessionMemoryState');
    expect(hasUpdatesPattern).toBe(true);
  });

  it('should NOT directly mutate state.messages inside set() callbacks', () => {
    const lines = sourceCode.split('\n');
    const violations: Array<{ line: number; content: string }> = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // state.messages = is bad (should be via return or updates)
      // But allow: state.messages.get() which is just reading
      if (
        line.match(/\bstate\.messages\s*=/) &&
        !line.startsWith('//') &&
        !line.startsWith('*')
      ) {
        violations.push({ line: i + 1, content: line });
      }
    }

    expect(violations).toEqual([]);
  });
});

/**
 * Test the Zustand set() pattern correctness.
 * Demonstrates that returning changes (not mutating state) works properly.
 */
describe('Zustand set() callback pattern', () => {
  it('returning new object propagates changes', () => {
    // Simulate Zustand set() behavior
    const state = {
      sessionMemoryState: new Map([['s1', { streaming: false }]]),
      messages: new Map<string, string[]>(),
    };

    // CORRECT pattern: return new values
    const updates: Record<string, unknown> = {};
    const newMemory = new Map(state.sessionMemoryState);
    newMemory.set('s1', { streaming: true });
    updates.sessionMemoryState = newMemory;

    // Merge (like Zustand does)
    const nextState = { ...state, ...updates };

    expect(nextState.sessionMemoryState.get('s1')).toEqual({ streaming: true });
    expect(state.sessionMemoryState.get('s1')).toEqual({ streaming: false }); // original unchanged
  });

  it('accumulating multiple changes in updates object works', () => {
    const state = {
      sessionMemoryState: new Map([['s1', { streaming: false, count: 0 }]]),
      streamingMessageIds: new Map<string, string>(),
    };

    const updates: Record<string, unknown> = {};

    // First change
    const mem1 = new Map(state.sessionMemoryState);
    mem1.set('s1', { streaming: true, count: 1 });
    updates.sessionMemoryState = mem1;

    // Second change builds on first
    const mem2 = new Map((updates.sessionMemoryState ?? state.sessionMemoryState) as Map<string, unknown>);
    mem2.set('s1', { ...mem2.get('s1') as Record<string, unknown>, count: 2 });
    updates.sessionMemoryState = mem2;

    const nextState = { ...state, ...updates };

    expect((nextState.sessionMemoryState as Map<string, Record<string, unknown>>).get('s1')).toEqual({
      streaming: true,
      count: 2,
    });
  });
});
