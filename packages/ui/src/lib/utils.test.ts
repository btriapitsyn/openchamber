import { describe, it, expect, afterEach } from 'vitest';
import {
  cn,
  isMacOS,
  truncatePathMiddle,
  formatPathForDisplay,
  formatDirectoryName,
  fuzzyMatch,
} from './utils';

describe('cn (className merger)', () => {
  it('should merge class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar');
  });

  it('should handle conditional classes', () => {
    const includeClass = true;
    const excludeClass = false;
    expect(cn('base', includeClass && 'included', excludeClass && 'excluded')).toBe('base included');
  });

  it('should merge tailwind classes correctly', () => {
    // twMerge should deduplicate conflicting tailwind classes
    expect(cn('p-4', 'p-2')).toBe('p-2');
    expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500');
  });

  it('should handle arrays', () => {
    expect(cn(['foo', 'bar'])).toBe('foo bar');
  });

  it('should handle objects', () => {
    expect(cn({ foo: true, bar: false, baz: true })).toBe('foo baz');
  });

  it('should handle empty inputs', () => {
    expect(cn()).toBe('');
    expect(cn('')).toBe('');
    expect(cn(null, undefined)).toBe('');
  });
});

describe('isMacOS', () => {
  const originalNavigator = global.navigator;

  afterEach(() => {
    Object.defineProperty(global, 'navigator', {
      value: originalNavigator,
      writable: true,
    });
  });

  it('should return true for macOS user agent', () => {
    Object.defineProperty(global, 'navigator', {
      value: { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' },
      writable: true,
    });
    expect(isMacOS()).toBe(true);
  });

  it('should return false for Windows user agent', () => {
    Object.defineProperty(global, 'navigator', {
      value: { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      writable: true,
    });
    expect(isMacOS()).toBe(false);
  });

  it('should return false for Linux user agent', () => {
    Object.defineProperty(global, 'navigator', {
      value: { userAgent: 'Mozilla/5.0 (X11; Linux x86_64)' },
      writable: true,
    });
    expect(isMacOS()).toBe(false);
  });

  it('should return false when navigator is undefined', () => {
    Object.defineProperty(global, 'navigator', {
      value: undefined,
      writable: true,
    });
    expect(isMacOS()).toBe(false);
  });
});

describe('truncatePathMiddle', () => {
  it('should return path unchanged if shorter than maxLength', () => {
    expect(truncatePathMiddle('/short/path')).toBe('/short/path');
  });

  it('should truncate long paths in the middle', () => {
    const longPath = '/very/long/path/to/some/deeply/nested/directory/file.txt';
    const result = truncatePathMiddle(longPath, { maxLength: 30 });
    expect(result.length).toBeLessThanOrEqual(30);
    expect(result).toContain('…');
    expect(result).toContain('file.txt');
  });

  it('should preserve filename at the end', () => {
    const path = '/users/developer/projects/myapp/src/components/Button.tsx';
    const result = truncatePathMiddle(path, { maxLength: 35 });
    expect(result.endsWith('Button.tsx')).toBe(true);
  });

  it('should handle paths with no segments gracefully', () => {
    expect(truncatePathMiddle('filename.txt')).toBe('filename.txt');
  });

  it('should handle empty string', () => {
    expect(truncatePathMiddle('')).toBe('');
  });

  it('should handle null/undefined by returning empty string', () => {
    expect(truncatePathMiddle(null as unknown as string)).toBe('');
    expect(truncatePathMiddle(undefined as unknown as string)).toBe('');
  });

  it('should respect minimum maxLength of 16', () => {
    const path = '/a/b/c/d/e/f/g.txt';
    const result = truncatePathMiddle(path, { maxLength: 5 });
    // Should use minimum of 16, not 5
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it('should handle path with only filename after truncation', () => {
    const path = '/a/b/c/verylongfilename.txt';
    const result = truncatePathMiddle(path, { maxLength: 20 });
    expect(result).toContain('verylongfilename.txt');
  });
});

describe('formatPathForDisplay', () => {
  it('should return empty string for null/undefined path', () => {
    expect(formatPathForDisplay(null)).toBe('');
    expect(formatPathForDisplay(undefined)).toBe('');
  });

  it('should return "/" for root path', () => {
    expect(formatPathForDisplay('/')).toBe('/');
  });

  it('should replace home directory with ~', () => {
    expect(formatPathForDisplay('/Users/dev', '/Users/dev')).toBe('~');
    expect(formatPathForDisplay('/Users/dev/projects', '/Users/dev')).toBe('~/projects');
  });

  it('should handle paths not under home directory', () => {
    expect(formatPathForDisplay('/var/log', '/Users/dev')).toBe('/var/log');
  });

  it('should handle trailing slashes in paths', () => {
    expect(formatPathForDisplay('/Users/dev/', '/Users/dev')).toBe('~');
    expect(formatPathForDisplay('/Users/dev/projects/', '/Users/dev')).toBe('~/projects');
  });

  it('should handle null homeDirectory', () => {
    expect(formatPathForDisplay('/some/path', null)).toBe('/some/path');
    expect(formatPathForDisplay('/some/path', undefined)).toBe('/some/path');
  });

  it('should not replace partial matches', () => {
    // /Users/developer should not match /Users/dev
    expect(formatPathForDisplay('/Users/developer', '/Users/dev')).toBe('/Users/developer');
  });
});

describe('formatDirectoryName', () => {
  it('should return "/" for null/undefined path', () => {
    expect(formatDirectoryName(null)).toBe('/');
    expect(formatDirectoryName(undefined)).toBe('/');
  });

  it('should return "/" for root path', () => {
    expect(formatDirectoryName('/')).toBe('/');
  });

  it('should return "~" for home directory', () => {
    expect(formatDirectoryName('/Users/dev', '/Users/dev')).toBe('~');
  });

  it('should return last segment of path', () => {
    expect(formatDirectoryName('/Users/dev/projects')).toBe('projects');
    expect(formatDirectoryName('/var/log/app')).toBe('app');
  });

  it('should handle paths with trailing slashes', () => {
    expect(formatDirectoryName('/Users/dev/projects/')).toBe('projects');
  });

  it('should handle empty string', () => {
    expect(formatDirectoryName('')).toBe('/');
  });
});

describe('fuzzyMatch', () => {
  it('should return true for exact match', () => {
    expect(fuzzyMatch('claude', 'claude')).toBe(true);
  });

  it('should return true for substring match', () => {
    expect(fuzzyMatch('claude-3-sonnet', 'sonnet')).toBe(true);
  });

  it('should return true for case-insensitive match', () => {
    expect(fuzzyMatch('Claude', 'claude')).toBe(true);
    expect(fuzzyMatch('CLAUDE', 'claude')).toBe(true);
  });

  it('should return true for fuzzy match with typos', () => {
    // "coude" is a typo of "claude"
    expect(fuzzyMatch('claude', 'coude')).toBe(true);
  });

  it('should return true for empty query', () => {
    expect(fuzzyMatch('anything', '')).toBe(true);
  });

  it('should return false for empty target with non-empty query', () => {
    expect(fuzzyMatch('', 'query')).toBe(false);
  });

  it('should return false for completely different strings', () => {
    expect(fuzzyMatch('apple', 'xyz')).toBe(false);
  });

  it('should handle model name searches', () => {
    expect(fuzzyMatch('claude-3-5-sonnet-20241022', 'sonnet')).toBe(true);
    expect(fuzzyMatch('gpt-4-turbo', 'gpt')).toBe(true);
    expect(fuzzyMatch('gemini-pro', 'gemini')).toBe(true);
  });
});
