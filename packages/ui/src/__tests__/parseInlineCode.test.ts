import { describe, it, expect } from 'vitest';
import { parseInlineCode } from '@/lib/parseInlineCode';

describe('parseInlineCode', () => {
  describe('basic inline code parsing', () => {
    it('returns plain text with no backticks', () => {
      const result = parseInlineCode('Hello world');
      expect(result).toEqual([{ type: 'text', content: 'Hello world' }]);
    });

    it('parses single inline code', () => {
      const result = parseInlineCode('Use `code` here');
      expect(result).toEqual([
        { type: 'text', content: 'Use ' },
        { type: 'code', content: 'code' },
        { type: 'text', content: ' here' },
      ]);
    });

    it('parses multiple inline code segments', () => {
      const result = parseInlineCode('Run `npm install` then `npm start`');
      expect(result).toEqual([
        { type: 'text', content: 'Run ' },
        { type: 'code', content: 'npm install' },
        { type: 'text', content: ' then ' },
        { type: 'code', content: 'npm start' },
      ]);
    });

    it('parses inline code at start of text', () => {
      const result = parseInlineCode('`code` at start');
      expect(result).toEqual([
        { type: 'code', content: 'code' },
        { type: 'text', content: ' at start' },
      ]);
    });

    it('parses inline code at end of text', () => {
      const result = parseInlineCode('at end `code`');
      expect(result).toEqual([
        { type: 'text', content: 'at end ' },
        { type: 'code', content: 'code' },
      ]);
    });

    it('parses only inline code (no surrounding text)', () => {
      const result = parseInlineCode('`just code`');
      expect(result).toEqual([{ type: 'code', content: 'just code' }]);
    });
  });

  describe('empty and edge cases', () => {
    it('returns empty array for empty string', () => {
      const result = parseInlineCode('');
      expect(result).toEqual([]);
    });

    it('handles empty inline code backticks', () => {
      const result = parseInlineCode('Empty `` here');
      expect(result).toEqual([
        { type: 'text', content: 'Empty ' },
        { type: 'code', content: '' },
        { type: 'text', content: ' here' },
      ]);
    });

    it('handles consecutive inline code', () => {
      const result = parseInlineCode('`a``b`');
      expect(result).toEqual([
        { type: 'code', content: 'a' },
        { type: 'code', content: 'b' },
      ]);
    });
  });

  describe('unmatched backticks', () => {
    it('renders unmatched opening backtick as literal', () => {
      const result = parseInlineCode('Hello `world');
      expect(result).toEqual([
        { type: 'text', content: 'Hello ' },
        { type: 'text', content: '`' },
        { type: 'text', content: 'world' },
      ]);
    });

    it('handles multiple unmatched backticks', () => {
      const result = parseInlineCode('a ` b ` c');
      expect(result).toEqual([
        { type: 'text', content: 'a ' },
        { type: 'code', content: ' b ' },
        { type: 'text', content: ' c' },
      ]);
    });
  });

  describe('triple backticks (code blocks)', () => {
    it('leaves triple backticks as literal text', () => {
      const result = parseInlineCode('```code block```');
      expect(result).toEqual([{ type: 'text', content: '```code block```' }]);
    });

    it('handles triple backticks with surrounding text', () => {
      const result = parseInlineCode('Before ```code``` after');
      expect(result).toEqual([
        { type: 'text', content: 'Before ' },
        { type: 'text', content: '```code```' },
        { type: 'text', content: ' after' },
      ]);
    });

    it('handles unclosed triple backticks', () => {
      const result = parseInlineCode('Start ```no end');
      expect(result).toEqual([
        { type: 'text', content: 'Start ' },
        { type: 'text', content: '```' },
        { type: 'text', content: 'no end' },
      ]);
    });

    it('mixes triple backticks and inline code', () => {
      const result = parseInlineCode('Use `inline` and ```block```');
      expect(result).toEqual([
        { type: 'text', content: 'Use ' },
        { type: 'code', content: 'inline' },
        { type: 'text', content: ' and ' },
        { type: 'text', content: '```block```' },
      ]);
    });

    it('handles multiline triple backtick content', () => {
      const result = parseInlineCode('```\nline1\nline2\n```');
      expect(result).toEqual([{ type: 'text', content: '```\nline1\nline2\n```' }]);
    });
  });

  describe('special characters in code', () => {
    it('preserves spaces in code', () => {
      const result = parseInlineCode('`  spaced  `');
      expect(result).toEqual([{ type: 'code', content: '  spaced  ' }]);
    });

    it('preserves special characters in code', () => {
      const result = parseInlineCode('Use `<div>` element');
      expect(result).toEqual([
        { type: 'text', content: 'Use ' },
        { type: 'code', content: '<div>' },
        { type: 'text', content: ' element' },
      ]);
    });

    it('handles newlines in code', () => {
      const result = parseInlineCode('`line1\nline2`');
      expect(result).toEqual([{ type: 'code', content: 'line1\nline2' }]);
    });
  });
});
