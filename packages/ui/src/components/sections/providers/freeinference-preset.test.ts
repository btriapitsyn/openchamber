import { describe, expect, test } from 'bun:test';
import {
  FREEINFERENCE_PROVIDER_ID,
  FREEINFERENCE_NAME,
  FREEINFERENCE_BASE_URL,
  FREEINFERENCE_SEARCH_KEYWORDS,
  PROVIDER_PRESETS,
  getFreeInferenceSearchKeywords,
  getPresetSearchKeywords,
  isFreeInferenceProvider,
} from './freeinference-preset';

describe('freeinference-preset', () => {
  test('defines expected provider constants', () => {
    expect(FREEINFERENCE_PROVIDER_ID).toBe('freeinference');
    expect(FREEINFERENCE_NAME).toBe('FreeInference');
    expect(FREEINFERENCE_BASE_URL).toBe('https://freeinference.org/v1');
  });

  test('recognizes freeinference provider variants', () => {
    expect(isFreeInferenceProvider('freeinference')).toBe(true);
    expect(isFreeInferenceProvider('free-inference')).toBe(true);
    expect(isFreeInferenceProvider('free_inference')).toBe(true);
    expect(isFreeInferenceProvider('  FreeInference  ')).toBe(true);
    expect(isFreeInferenceProvider('openai')).toBe(false);
    expect(isFreeInferenceProvider('')).toBe(false);
    expect(isFreeInferenceProvider(null)).toBe(false);
    expect(isFreeInferenceProvider(undefined)).toBe(false);
  });

  test('registers FreeInference in PROVIDER_PRESETS registry', () => {
    const preset = PROVIDER_PRESETS.find((p) => p.id === FREEINFERENCE_PROVIDER_ID);
    expect(preset).toBeTruthy();
    expect(preset?.name).toBe(FREEINFERENCE_NAME);
    expect(preset?.isMatch(FREEINFERENCE_PROVIDER_ID)).toBe(true);
  });

  test('exposes harvard/madsys discoverability keywords', () => {
    expect(FREEINFERENCE_SEARCH_KEYWORDS).toContain('harvard');
    expect(FREEINFERENCE_SEARCH_KEYWORDS).toContain('madsys');
    expect(FREEINFERENCE_SEARCH_KEYWORDS).toContain('harvard madsys');
    expect(FREEINFERENCE_SEARCH_KEYWORDS).toContain('freeinference');
    expect(FREEINFERENCE_SEARCH_KEYWORDS).toContain('free inference');
    for (const variant of ['freeinference', 'free-inference', '  FreeInference  ']) {
      const keywords = getFreeInferenceSearchKeywords(variant);
      expect(keywords).toContain('harvard');
      expect(keywords).toContain('madsys');
      expect(keywords).toContain('harvard madsys');
      expect(keywords).toContain('freeinference');
      expect(keywords).toContain('free inference');
      expect(getPresetSearchKeywords(variant)).toEqual(keywords);
    }
  });

  test('returns no extra keywords for other providers', () => {
    expect(getPresetSearchKeywords('openai')).toEqual([]);
    expect(getPresetSearchKeywords('')).toEqual([]);
    expect(getPresetSearchKeywords(null)).toEqual([]);
    expect(getPresetSearchKeywords(undefined)).toEqual([]);
    expect(getFreeInferenceSearchKeywords('openai')).toEqual([]);
    expect(getFreeInferenceSearchKeywords('')).toEqual([]);
    expect(getFreeInferenceSearchKeywords(null)).toEqual([]);
    expect(getFreeInferenceSearchKeywords(undefined)).toEqual([]);
  });
});
