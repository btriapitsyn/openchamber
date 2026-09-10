export const FREEINFERENCE_PROVIDER_ID = 'freeinference';
export const FREEINFERENCE_NAME = 'FreeInference';
export const FREEINFERENCE_BASE_URL = 'https://freeinference.org/v1';

const FREEINFERENCE_VARIANTS = new Set([
  'freeinference',
  'free-inference',
  'free_inference',
]);

export function isFreeInferenceProvider(providerId: string | null | undefined): boolean {
  if (!providerId) return false;
  return FREEINFERENCE_VARIANTS.has(providerId.trim().toLowerCase());
}

/**
 * Extra discoverability keywords for the Add Provider search, owned by the
 * FreeInference preset so ProvidersPage needs no provider-specific branches.
 * Includes the plain factual maintainer attribution (Harvard MadSys Group)
 * without implying endorsement.
 */
export const FREEINFERENCE_SEARCH_KEYWORDS = [
  'freeinference',
  'free inference',
  'free-inference',
  'harvard',
  'madsys',
  'harvard madsys',
  'harvard madsys group',
];

export interface ProviderPreset {
  id: string;
  name: string;
  searchKeywords: readonly string[];
  isMatch: (id: string | null | undefined) => boolean;
}

export const PROVIDER_PRESETS: readonly ProviderPreset[] = [
  {
    id: FREEINFERENCE_PROVIDER_ID,
    name: FREEINFERENCE_NAME,
    searchKeywords: FREEINFERENCE_SEARCH_KEYWORDS,
    isMatch: isFreeInferenceProvider,
  },
] as const;

export function getPresetSearchKeywords(providerId: string | null | undefined): string[] {
  if (!providerId) return [];
  for (const preset of PROVIDER_PRESETS) {
    if (preset.isMatch(providerId)) {
      return [...preset.searchKeywords];
    }
  }
  return [];
}

export function getFreeInferenceSearchKeywords(providerId: string | null | undefined): string[] {
  return getPresetSearchKeywords(providerId);
}

