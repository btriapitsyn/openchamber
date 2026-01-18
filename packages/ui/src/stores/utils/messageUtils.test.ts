import { describe, it, expect } from 'vitest';
import { extractTextFromPart, normalizeStreamingPart } from './messageUtils';

describe('extractTextFromPart', () => {
  it('should return empty string for null/undefined', () => {
    expect(extractTextFromPart(null)).toBe('');
    expect(extractTextFromPart(undefined)).toBe('');
  });

  it('should extract text from direct text property', () => {
    expect(extractTextFromPart({ text: 'hello world' })).toBe('hello world');
  });

  it('should extract text from array text property', () => {
    expect(extractTextFromPart({ text: ['hello', ' ', 'world'] })).toBe('hello world');
  });

  it('should extract text from nested objects in text array', () => {
    expect(extractTextFromPart({ text: [{ text: 'nested' }] })).toBe('nested');
  });

  it('should extract text from delta object with text property', () => {
    expect(extractTextFromPart({ delta: { text: 'delta text' } })).toBe('delta text');
  });

  it('should extract text from delta string', () => {
    expect(extractTextFromPart({ delta: 'direct delta' })).toBe('direct delta');
  });

  it('should extract text from delta array', () => {
    expect(extractTextFromPart({ delta: ['a', 'b', 'c'] })).toBe('abc');
  });

  it('should extract text from delta with content array', () => {
    expect(extractTextFromPart({ delta: { content: ['x', 'y'] } })).toBe('xy');
  });

  it('should extract text from content string property', () => {
    expect(extractTextFromPart({ content: 'content text' })).toBe('content text');
  });

  it('should extract text from content array', () => {
    expect(extractTextFromPart({ content: ['part1', 'part2'] })).toBe('part1part2');
  });

  it('should extract text from content array with objects', () => {
    expect(extractTextFromPart({ 
      content: [
        { text: 'first' },
        'second',
        { delta: 'third' }
      ] 
    })).toBe('firstsecondthird');
  });

  it('should prefer text over delta over content', () => {
    expect(extractTextFromPart({ 
      text: 'primary', 
      delta: 'secondary', 
      content: 'tertiary' 
    })).toBe('primary');
  });
});

describe('normalizeStreamingPart', () => {
  type IncomingPart = Parameters<typeof normalizeStreamingPart>[0];
  type ExistingPart = Parameters<typeof normalizeStreamingPart>[1];
  const asIncoming = (obj: Record<string, unknown>): IncomingPart => obj as unknown as IncomingPart;
  const asExisting = (obj: Record<string, unknown>): ExistingPart => obj as unknown as ExistingPart;

  it('should set default type to text', () => {
    const result = normalizeStreamingPart(asIncoming({ text: 'hello' }));
    expect(result.type).toBe('text');
  });

  it('should preserve existing type', () => {
    const result = normalizeStreamingPart(asIncoming({ type: 'tool-call', name: 'test' }));
    expect(result.type).toBe('tool-call');
  });

  it('should normalize text from direct text property', () => {
    const result = normalizeStreamingPart(asIncoming({ type: 'text', text: 'hello' }));
    expect((result as { text?: string }).text).toBe('hello');
  });

  it('should normalize text from delta and remove delta property', () => {
    const result = normalizeStreamingPart(asIncoming({ type: 'text', delta: { text: 'streamed' } }));
    expect((result as { text?: string }).text).toBe('streamed');
    expect((result as { delta?: unknown }).delta).toBeUndefined();
  });

  it('should append delta text to existing text', () => {
    const existing = asExisting({ type: 'text', text: 'existing ' });
    const incoming = asIncoming({ type: 'text', delta: { text: 'appended' } });
    const result = normalizeStreamingPart(incoming, existing);
    expect((result as { text?: string }).text).toBe('existing appended');
  });

  it('should preserve existing text when no new text or delta', () => {
    const existing = asExisting({ type: 'text', text: 'keep me' });
    const incoming = asIncoming({ type: 'text' });
    const result = normalizeStreamingPart(incoming, existing);
    expect((result as { text?: string }).text).toBe('keep me');
  });

  it('should set empty text when no source available', () => {
    const result = normalizeStreamingPart(asIncoming({ type: 'text' }));
    expect((result as { text?: string }).text).toBe('');
  });

  it('should not modify non-text type parts', () => {
    const result = normalizeStreamingPart(asIncoming({ 
      type: 'tool-call', 
      name: 'test',
      delta: { something: 'value' }
    }));
    expect(result.type).toBe('tool-call');
    expect((result as { delta?: unknown }).delta).toEqual({ something: 'value' });
  });
});
