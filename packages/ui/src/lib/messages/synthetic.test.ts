import { describe, it, expect } from 'vitest';
import { isSyntheticPart, isFullySyntheticMessage, filterSyntheticParts } from './synthetic';
import type { Part } from '@opencode-ai/sdk/v2';

describe('isSyntheticPart', () => {
  it('should return false for undefined', () => {
    expect(isSyntheticPart(undefined)).toBe(false);
  });

  it('should return false for null', () => {
    expect(isSyntheticPart(null as unknown as Part)).toBe(false);
  });

  it('should return false for non-object', () => {
    expect(isSyntheticPart('string' as unknown as Part)).toBe(false);
  });

  it('should return false for part without synthetic flag', () => {
    expect(isSyntheticPart({ type: 'text', text: 'hello' } as Part)).toBe(false);
  });

  it('should return false when synthetic is false', () => {
    expect(isSyntheticPart({ type: 'text', synthetic: false } as Part)).toBe(false);
  });

  it('should return true when synthetic is true', () => {
    expect(isSyntheticPart({ type: 'text', synthetic: true } as Part)).toBe(true);
  });
});

describe('isFullySyntheticMessage', () => {
  it('should return false for undefined', () => {
    expect(isFullySyntheticMessage(undefined)).toBe(false);
  });

  it('should return false for empty array', () => {
    expect(isFullySyntheticMessage([])).toBe(false);
  });

  it('should return false when any part is not synthetic', () => {
    const parts: Part[] = [
      { type: 'text', synthetic: true } as Part,
      { type: 'text', text: 'real' } as Part,
    ];
    expect(isFullySyntheticMessage(parts)).toBe(false);
  });

  it('should return true when all parts are synthetic', () => {
    const parts: Part[] = [
      { type: 'text', synthetic: true } as Part,
      { type: 'text', synthetic: true } as Part,
    ];
    expect(isFullySyntheticMessage(parts)).toBe(true);
  });

  it('should return false for single non-synthetic part', () => {
    const parts: Part[] = [{ type: 'text', text: 'hello' } as Part];
    expect(isFullySyntheticMessage(parts)).toBe(false);
  });

  it('should return true for single synthetic part', () => {
    const parts: Part[] = [{ type: 'text', synthetic: true } as Part];
    expect(isFullySyntheticMessage(parts)).toBe(true);
  });
});

describe('filterSyntheticParts', () => {
  it('should return empty array for undefined', () => {
    expect(filterSyntheticParts(undefined)).toEqual([]);
  });

  it('should return empty array for empty array', () => {
    expect(filterSyntheticParts([])).toEqual([]);
  });

  it('should filter out synthetic parts when non-synthetic exist', () => {
    const parts: Part[] = [
      { type: 'text', text: 'real1' } as Part,
      { type: 'text', synthetic: true } as Part,
      { type: 'text', text: 'real2' } as Part,
    ];
    const filtered = filterSyntheticParts(parts);
    expect(filtered).toHaveLength(2);
    expect(filtered[0]).toEqual({ type: 'text', text: 'real1' });
    expect(filtered[1]).toEqual({ type: 'text', text: 'real2' });
  });

  it('should return all parts when all are synthetic (for display)', () => {
    const parts: Part[] = [
      { type: 'text', synthetic: true, text: 'status1' } as Part,
      { type: 'text', synthetic: true, text: 'status2' } as Part,
    ];
    const filtered = filterSyntheticParts(parts);
    expect(filtered).toHaveLength(2);
    expect(filtered).toEqual(parts);
  });

  it('should return all parts when none are synthetic', () => {
    const parts: Part[] = [
      { type: 'text', text: 'hello' } as Part,
      { type: 'text', text: 'world' } as Part,
    ];
    const filtered = filterSyntheticParts(parts);
    expect(filtered).toHaveLength(2);
  });

  it('should handle mixed synthetic states correctly', () => {
    const parts: Part[] = [
      { type: 'text', text: 'keep' } as Part,
      { type: 'text', synthetic: true } as Part,
      { type: 'text', synthetic: false } as Part,
    ];
    const filtered = filterSyntheticParts(parts);
    expect(filtered).toHaveLength(2);
  });
});
