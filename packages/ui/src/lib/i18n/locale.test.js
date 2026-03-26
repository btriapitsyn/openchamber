import { describe, expect, it } from 'bun:test';
import { normalizeLocale, pickNormalizedLocale } from './locale.ts';

describe('normalizeLocale', () => {
  it('normalizes simplified Chinese aliases to zh-CN', () => {
    expect(normalizeLocale('zh')).toBe('zh-CN');
    expect(normalizeLocale('zh-Hans')).toBe('zh-CN');
    expect(normalizeLocale('zh-CN')).toBe('zh-CN');
    expect(normalizeLocale('zh_hans_cn')).toBe('zh-CN');
  });

  it('falls back unsupported locales to en', () => {
    expect(normalizeLocale('fr')).toBe('en');
    expect(normalizeLocale('ja-JP')).toBe('en');
    expect(normalizeLocale('')).toBe('en');
    expect(normalizeLocale(undefined)).toBe('en');
  });
});

describe('pickNormalizedLocale', () => {
  it('prefers zh-CN match from locale candidates', () => {
    expect(pickNormalizedLocale(['fr-FR', 'zh-Hans', 'en-US'])).toBe('zh-CN');
  });

  it('returns en when no supported locale is found', () => {
    expect(pickNormalizedLocale(['fr-FR', 'ja', 'de-DE'])).toBe('en');
  });
});
