import { isDesktopRuntime } from '@/lib/desktop';
import { useUIStore, type TypographySizes } from '@/stores/useUIStore';
import type { MarkdownDisplayMode } from '@/lib/markdownDisplayModes';
import { UI_FONT_OPTION_MAP, CODE_FONT_OPTION_MAP } from '@/lib/fontOptions';
import type { UiFontOption, MonoFontOption } from '@/lib/fontOptions';

export interface AppearancePreferences {
  uiFont?: string;
  monoFont?: string;
  markdownDisplayMode?: MarkdownDisplayMode;
  typographySizes?: TypographySizes;
}

type RawAppearancePayload = {
  uiFont?: unknown;
  monoFont?: unknown;
  markdownDisplayMode?: unknown;
  typographySizes?: Record<string, unknown> | null;
};

const sanitizeTypographySizes = (input?: Record<string, unknown> | null): TypographySizes | undefined => {
  if (!input || typeof input !== 'object') {
    return undefined;
  }

  const defaults = useUIStore.getState().typographySizes;
  const sizes: TypographySizes = {
    markdown: typeof input.markdown === 'string' ? input.markdown : defaults.markdown,
    code: typeof input.code === 'string' ? input.code : defaults.code,
    uiHeader: typeof input.uiHeader === 'string' ? input.uiHeader : defaults.uiHeader,
    uiLabel: typeof input.uiLabel === 'string' ? input.uiLabel : defaults.uiLabel,
    meta: typeof input.meta === 'string' ? input.meta : defaults.meta,
    micro: typeof input.micro === 'string' ? input.micro : defaults.micro,
  };

  return sizes;
};

const isUiFont = (value: unknown): value is UiFontOption =>
  typeof value === 'string' && value in UI_FONT_OPTION_MAP;

const isMonoFont = (value: unknown): value is MonoFontOption =>
  typeof value === 'string' && value in CODE_FONT_OPTION_MAP;

const isMarkdownMode = (value: unknown): value is MarkdownDisplayMode =>
  value === 'compact' || value === 'comfort';

const sanitizePreferences = (payload?: RawAppearancePayload | null): AppearancePreferences | null => {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const result: AppearancePreferences = {};

  if (isUiFont(payload.uiFont)) {
    result.uiFont = payload.uiFont;
  }

  if (isMonoFont(payload.monoFont)) {
    result.monoFont = payload.monoFont;
  }

  if (isMarkdownMode(payload.markdownDisplayMode)) {
    result.markdownDisplayMode = payload.markdownDisplayMode;
  }

  const typography = sanitizeTypographySizes(payload.typographySizes ?? undefined);
  if (typography) {
    result.typographySizes = typography;
  }

  return Object.keys(result).length > 0 ? result : null;
};

const extractRawAppearance = (data: unknown): RawAppearancePayload | null => {
  if (!data || typeof data !== 'object') {
    return null;
  }

  const candidate = data as Record<string, unknown>;
  const payload: RawAppearancePayload = {
    uiFont: candidate.uiFont,
    monoFont: candidate.monoFont,
    markdownDisplayMode: candidate.markdownDisplayMode,
    typographySizes:
      candidate.typographySizes && typeof candidate.typographySizes === 'object'
        ? (candidate.typographySizes as Record<string, unknown>)
        : null,
  };

  return payload;
};

const loadAppearanceFromWeb = async (): Promise<AppearancePreferences | null> => {
  if (typeof fetch !== 'function') {
    return null;
  }

  try {
    const response = await fetch('/api/config/settings', {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      return null;
    }

    const raw = await response.json().catch(() => null);
    return sanitizePreferences(extractRawAppearance(raw));
  } catch (error) {
    console.warn('Failed to load appearance preferences from web storage:', error);
    return null;
  }
};

const persistAppearanceEndpoint = async (payload: AppearancePreferences): Promise<boolean> => {
  if (typeof fetch !== 'function') {
    return false;
  }

  try {
    const response = await fetch('/api/config/settings', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      return false;
    }

    const saved = await response.json().catch(() => null);
    const sanitized = sanitizePreferences(extractRawAppearance(saved));
    applyAppearancePreferences(sanitized ?? payload);
    return true;
  } catch (error) {
    console.warn('Failed to save appearance preferences to web storage:', error);
    return false;
  }
};

export const applyAppearancePreferences = (preferences: AppearancePreferences): void => {
  const store = useUIStore.getState();

  if (preferences.uiFont && isUiFont(preferences.uiFont)) {
    store.setUiFont(preferences.uiFont);
  }

  if (preferences.monoFont && isMonoFont(preferences.monoFont)) {
    store.setMonoFont(preferences.monoFont);
  }

  if (preferences.markdownDisplayMode) {
    store.setMarkdownDisplayMode(preferences.markdownDisplayMode);
  }

  if (preferences.typographySizes) {
    store.setTypographySizes({
      ...store.typographySizes,
      ...preferences.typographySizes,
    });
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

  return loadAppearanceFromWeb();
};

export const saveAppearancePreferences = async (preferences: AppearancePreferences): Promise<boolean> => {
  if (typeof window === 'undefined') {
    return false;
  }

  if (isDesktopRuntime()) {
    const api = window.opencodeAppearance;
    if (!api || typeof api.save !== 'function') {
      return false;
    }

    const payload: AppearancePreferences = {
      uiFont: preferences.uiFont,
      monoFont: preferences.monoFont,
      markdownDisplayMode: preferences.markdownDisplayMode,
      typographySizes: preferences.typographySizes ? { ...preferences.typographySizes } : undefined,
    };

    try {
      const result = await api.save(payload);
      if (result?.success) {
        applyAppearancePreferences(preferences);
        return true;
      }
    } catch (error) {
      console.warn('Failed to save appearance preferences to desktop storage:', error);
      return false;
    }

    return false;
  }

  return persistAppearanceEndpoint({
    uiFont: preferences.uiFont,
    monoFont: preferences.monoFont,
    markdownDisplayMode: preferences.markdownDisplayMode,
    typographySizes: preferences.typographySizes ? { ...preferences.typographySizes } : undefined,
  });
};
