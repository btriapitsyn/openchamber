/**
 * Tests for PERF-006: Toast duration should NOT be Infinity
 *
 * Verifies that permission and question toasts use finite durations
 * by scanning the actual source code.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('Toast duration (PERF-006)', () => {
  const eventStreamPath = resolve(__dirname, '../hooks/useEventStream.ts');
  let sourceCode: string;

  try {
    sourceCode = readFileSync(eventStreamPath, 'utf-8');
  } catch {
    sourceCode = '';
  }

  it('useEventStream.ts should exist and be readable', () => {
    expect(sourceCode.length).toBeGreaterThan(0);
  });

  it('should NOT have any toast with duration: Infinity', () => {
    // Match patterns like: duration: Infinity
    const infinityMatches = sourceCode.match(/duration:\s*Infinity/g);
    expect(infinityMatches).toBeNull();
  });

  it('permission toast should use finite duration', () => {
    // Find the permission.asked toast block
    const permissionSection = sourceCode.slice(
      sourceCode.indexOf("case 'permission.asked'"),
      sourceCode.indexOf("case 'permission.replied'")
    );

    expect(permissionSection).toBeTruthy();

    // Should have a numeric duration
    const hasDuration = /duration:\s*\d+/.test(permissionSection);
    expect(hasDuration).toBe(true);

    // Should NOT have Infinity
    expect(permissionSection).not.toContain('duration: Infinity');
  });

  it('question toast should use finite duration', () => {
    // Find the question.asked toast block
    const questionSection = sourceCode.slice(
      sourceCode.indexOf("case 'question.asked'"),
      sourceCode.indexOf("case 'question.replied'")
    );

    expect(questionSection).toBeTruthy();

    // Should have a numeric duration
    const hasDuration = /duration:\s*\d+/.test(questionSection);
    expect(hasDuration).toBe(true);

    // Should NOT have Infinity
    expect(questionSection).not.toContain('duration: Infinity');
  });

  it('toasts should have id parameter for deduplication', () => {
    // Permission toast should have id
    const permissionSection = sourceCode.slice(
      sourceCode.indexOf("case 'permission.asked'"),
      sourceCode.indexOf("case 'permission.replied'")
    );
    expect(permissionSection).toMatch(/id:\s*toastKey/);

    // Question toast should have id
    const questionSection = sourceCode.slice(
      sourceCode.indexOf("case 'question.asked'"),
      sourceCode.indexOf("case 'question.replied'")
    );
    expect(questionSection).toMatch(/id:\s*toastKey/);
  });

  it('toast duration should be at least 5 seconds', () => {
    // Extract all numeric durations from toast calls
    const durations = [...sourceCode.matchAll(/duration:\s*(\d+)/g)].map(m => parseInt(m[1]));

    expect(durations.length).toBeGreaterThan(0);
    for (const duration of durations) {
      // Each toast duration should be >= 5000ms (5s) - reasonable minimum
      expect(duration).toBeGreaterThanOrEqual(5000);
    }
  });

  it('no toast should have duration longer than 60 seconds', () => {
    const durations = [...sourceCode.matchAll(/duration:\s*(\d+)/g)].map(m => parseInt(m[1]));

    for (const duration of durations) {
      expect(duration).toBeLessThanOrEqual(60000);
    }
  });
});
