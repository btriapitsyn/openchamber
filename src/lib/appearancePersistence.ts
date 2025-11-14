import { isDesktopRuntime } from '@/lib/desktop';
import { useUIStore } from '@/stores/useUIStore';
import type { MarkdownDisplayMode } from '@/lib/markdownDisplayModes';

export interface AppearancePreferences {
  markdownDisplayMode?: MarkdownDisplayMode;
  showReasoningTraces?: boolean;
}

type RawAppearancePayload = {
  markdownDisplayMode?: unknown;
  showReasoningTraces?: unknown;
};

const isMarkdownMode = (value: unknown): value is MarkdownDisplayMode =>
  value === 'compact' || value === 'comfort';

const sanitizePreferences = (payload?: RawAppearancePayload | null): AppearancePreferences | null => {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const result: AppearancePreferences = {};

  if (isMarkdownMode(payload.markdownDisplayMode)) {
    result.markdownDisplayMode = payload.markdownDisplayMode;
  }

  if (typeof payload.showReasoningTraces === 'boolean') {
    result.showReasoningTraces = payload.showReasoningTraces;
  }

  return Object.keys(result).length > 0 ? result : null;
};

const extractRawAppearance = (data: unknown): RawAppearancePayload | null => {
  if (!data || typeof data !== 'object') {
    return null;
  }

  const candidate = data as Record<string, unknown>;
  const payload: RawAppearancePayload = {
    markdownDisplayMode: candidate.markdownDisplayMode,
    showReasoningTraces: candidate.showReasoningTraces,
  };

  return payload;
};

export const saveAppearancePreferences = (preferences: AppearancePreferences): boolean => {
  if (typeof window === 'undefined' || !isDesktopRuntime()) {
    return false;
  }

  const api = window.opencodeAppearance;
  if (!api || typeof api.save !== 'function') {
    return false;
  }

  try {
    void api.save(preferences);
    return true;
  } catch (error) {
    console.warn('Failed to save appearance preferences to desktop storage:', error);
    return false;
  }
};

export const applyAppearancePreferences = (preferences: AppearancePreferences): void => {
  const store = useUIStore.getState();

  if (preferences.markdownDisplayMode) {
    store.setMarkdownDisplayMode(preferences.markdownDisplayMode);
  }

  if (typeof preferences.showReasoningTraces === 'boolean') {
    store.setShowReasoningTraces(preferences.showReasoningTraces);
  }
};

export const loadAppearancePreferences = async (): Promise<AppearancePreferences | null> => {
  if (typeof window === 'undefined') {
    return null;
  }

  if (isDesktopRuntime()) {
    const api = window.opencodeAppearance;
    if (!api || typeof api.load !== 'function') {
      return null;
    }

    try {
      const raw = await api.load();
      const payload = typeof raw === 'object' && raw !== null ? (raw as RawAppearancePayload) : null;
      return sanitizePreferences(payload);
    } catch (error) {
      console.warn('Failed to load appearance preferences from desktop storage:', error);
      return null;
    }
  }

  const stored = localStorage.getItem('appearance-preferences');
  if (!stored) {
    return null;
  }

  try {
    const data = JSON.parse(stored) as unknown;
    const payload = extractRawAppearance(data);
    return sanitizePreferences(payload);
  } catch (error) {
    console.warn('Failed to parse stored appearance preferences:', error);
    return null;
  }
};
