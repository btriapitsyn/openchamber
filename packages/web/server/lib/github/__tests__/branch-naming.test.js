import { describe, it, expect } from 'vitest';
import { resolveBranchPrefix, slugify, buildBranchName } from '../branch-naming.js';

describe('resolveBranchPrefix', () => {
  it('returns "fix" for bug labels', () => {
    expect(resolveBranchPrefix(['Bug', 'documentation'])).toBe('fix');
    expect(resolveBranchPrefix(['bug'])).toBe('fix');
  });

  it('returns "feat" for enhancement/feature labels', () => {
    expect(resolveBranchPrefix(['enhancement'])).toBe('feat');
    expect(resolveBranchPrefix(['feature'])).toBe('feat');
    expect(resolveBranchPrefix(['Feature', 'good first issue'])).toBe('feat');
  });

  it('returns "work" for unknown labels', () => {
    expect(resolveBranchPrefix(['documentation'])).toBe('work');
    expect(resolveBranchPrefix([])).toBe('work');
  });
});

describe('slugify', () => {
  it('lower-cases and replaces non-alphanum with dashes', () => {
    expect(slugify('Hello World!!!')).toBe('hello-world');
  });

  it('collapses repeated dashes', () => {
    expect(slugify('Hello   World')).toBe('hello-world');
  });

  it('trims dashes from edges', () => {
    expect(slugify('!!!Hello World!!!')).toBe('hello-world');
  });

  it('truncates to 40 chars', () => {
    const long = 'a'.repeat(100);
    expect(slugify(long)).toHaveLength(40);
  });

  it('handles empty string', () => {
    expect(slugify('')).toBe('issue');
  });

  it('strips non-ASCII', () => {
    expect(slugify('Café au lait')).toBe('cafe-au-lait');
  });
});

describe('buildBranchName', () => {
  it('formats correctly', () => {
    expect(buildBranchName({ number: 42, title: 'Fix auth bug', labels: ['bug'] })).toBe(
      'fix/42-fix-auth-bug'
    );
  });

  it('defaults to work prefix', () => {
    expect(buildBranchName({ number: 7, title: 'Refactor helpers', labels: [] })).toBe(
      'work/7-refactor-helpers'
    );
  });
});
