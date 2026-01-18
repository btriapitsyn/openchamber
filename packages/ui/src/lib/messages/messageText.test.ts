import { describe, it, expect } from 'vitest';
import { flattenAssistantTextParts } from './messageText';
import type { Part } from '@opencode-ai/sdk/v2';

const asPart = (obj: Record<string, unknown>): Part => obj as unknown as Part;

describe('flattenAssistantTextParts', () => {
  it('should return empty string for empty array', () => {
    expect(flattenAssistantTextParts([])).toBe('');
  });

  it('should extract text from single text part', () => {
    const parts: Part[] = [asPart({ type: 'text', text: 'Hello world' })];
    expect(flattenAssistantTextParts(parts)).toBe('Hello world');
  });

  it('should join multiple text parts with newline', () => {
    const parts: Part[] = [
      asPart({ type: 'text', text: 'First paragraph' }),
      asPart({ type: 'text', text: 'Second paragraph' }),
    ];
    expect(flattenAssistantTextParts(parts)).toBe('First paragraph\nSecond paragraph');
  });

  it('should filter out non-text parts', () => {
    const parts: Part[] = [
      asPart({ type: 'text', text: 'Keep this' }),
      asPart({ type: 'tool-call', name: 'test' }),
      asPart({ type: 'text', text: 'And this' }),
    ];
    expect(flattenAssistantTextParts(parts)).toBe('Keep this\nAnd this');
  });

  it('should use content property as fallback', () => {
    const parts: Part[] = [asPart({ type: 'text', content: 'Content text' })];
    expect(flattenAssistantTextParts(parts)).toBe('Content text');
  });

  it('should trim whitespace from parts', () => {
    const parts: Part[] = [
      asPart({ type: 'text', text: '  Trimmed  ' }),
      asPart({ type: 'text', text: '  Also trimmed  ' }),
    ];
    expect(flattenAssistantTextParts(parts)).toBe('Trimmed\nAlso trimmed');
  });

  it('should filter out empty text parts', () => {
    const parts: Part[] = [
      asPart({ type: 'text', text: 'Keep' }),
      asPart({ type: 'text', text: '' }),
      asPart({ type: 'text', text: '   ' }),
      asPart({ type: 'text', text: 'This' }),
    ];
    expect(flattenAssistantTextParts(parts)).toBe('Keep\nThis');
  });

  it('should collapse multiple newlines into single newline', () => {
    const parts: Part[] = [
      asPart({ type: 'text', text: 'First\n\n\nWith extra newlines' }),
    ];
    expect(flattenAssistantTextParts(parts)).toBe('First\nWith extra newlines');
  });

  it('should handle parts without text or content', () => {
    const parts: Part[] = [
      asPart({ type: 'text' }),
      asPart({ type: 'text', text: 'Valid' }),
    ];
    expect(flattenAssistantTextParts(parts)).toBe('Valid');
  });

  it('should prefer text over content', () => {
    const parts: Part[] = [
      asPart({ type: 'text', text: 'Primary', content: 'Secondary' }),
    ];
    expect(flattenAssistantTextParts(parts)).toBe('Primary');
  });
});
