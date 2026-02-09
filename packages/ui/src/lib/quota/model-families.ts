import type { QuotaProviderId } from '@/types';

export interface ModelFamily {
  id: string;
  label: string;
  matcher: (modelName: string) => boolean;
  order: number;
}

const GOOGLE_MODEL_FAMILIES: ModelFamily[] = [
  {
    id: 'gemini',
    label: 'Gemini',
    matcher: (modelName) => modelName.toLowerCase().startsWith('gemini-'),
    order: 1,
  },
  {
    id: 'claude',
    label: 'Claude',
    matcher: (modelName) => modelName.toLowerCase().startsWith('claude-'),
    order: 2,
  },
];

export const PROVIDER_MODEL_FAMILIES: Record<string, ModelFamily[]> = {
  google: GOOGLE_MODEL_FAMILIES,
};

export function getModelFamily(modelName: string, providerId: QuotaProviderId): ModelFamily | null {
  const families = PROVIDER_MODEL_FAMILIES[providerId] ?? [];
  for (const family of families) {
    if (family.matcher(modelName)) {
      return family;
    }
  }
  return null;
}

export function getAllModelFamilies(providerId: QuotaProviderId): ModelFamily[] {
  return PROVIDER_MODEL_FAMILIES[providerId] ?? [];
}

export function sortModelFamilies(families: ModelFamily[]): ModelFamily[] {
  return [...families].sort((a, b) => a.order - b.order);
}

/**
 * Group model names by family (for backward compatibility with Header.tsx)
 */
export function groupModelsByFamily(
  models: Record<string, unknown>,
  providerId: QuotaProviderId
): Map<string | null, string[]> {
  const groups = new Map<string | null, string[]>();

  for (const modelName of Object.keys(models)) {
    const family = getModelFamily(modelName, providerId);
    const familyId = family?.id ?? null;

    if (!groups.has(familyId)) {
      groups.set(familyId, []);
    }
    groups.get(familyId)!.push(modelName);
  }

  return groups;
}

/**
 * Group models by family with custom getter function (for UsagePage.tsx)
 */
export function groupModelsByFamilyWithGetter<T>(
  models: T[],
  getModelName: (model: T) => string,
  providerId: QuotaProviderId
): Map<string | null, T[]> {
  const groups = new Map<string | null, T[]>();

  for (const model of models) {
    const modelName = getModelName(model);
    const family = getModelFamily(modelName, providerId);
    const familyId = family?.id ?? null;

    if (!groups.has(familyId)) {
      groups.set(familyId, []);
    }
    groups.get(familyId)!.push(model);
  }

  return groups;
}

/**
 * Get default models for a provider based on simple patterns.
 * - Gemini 3.x models (starting with gemini-3-)
 * - All Claude models
 */
export function getDefaultModels(
  providerId: QuotaProviderId,
  availableModels: string[]
): string[] {
  return availableModels.filter((model) => {
    const lower = model.toLowerCase();
    // Gemini 3.x
    if (lower.startsWith('gemini-3-')) return true;
    // All Claude models
    if (lower.startsWith('claude-')) return true;
    return false;
  });
}
