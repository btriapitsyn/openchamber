import { isDesktopRuntime } from '@/lib/desktop';
import { useUIStore, type TypographySizes } from '@/stores/useUIStore';
import type { MarkdownDisplayMode } from '@/lib/markdownDisplayModes';

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

const sanitizePreferences = (payload?: RawAppearancePayload | null): AppearancePreferences | null => {
  if (!payload) {
    return null;
  }

  const result: AppearancePreferences = {};

  if (typeof payload.uiFont === 'string' && payload.uiFont.length > 0) {
    result.uiFont = payload.uiFont;
  }

  if (typeof payload.monoFont === 'string' && payload.monoFont.length > 0) {
    result.monoFont = payload.monoFont;
  }

  if (typeof payload.markdownDisplayMode === 'string') {
    result.markdownDisplayMode = payload.markdownDisplayMode as MarkdownDisplayMode;
  }

  const typography = sanitizeTypographySizes(payload.typographySizes ?? undefined);
  if (typography) {
    result.typographySizes = typography;
  }

  return Object.keys(result).length > 0 ? result : null;
};

export const applyAppearancePreferences = (preferences: AppearancePreferences): void => {
  const store = useUIStore.getState();

  if (preferences.uiFont) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    store.setUiFont(preferences.uiFont as any);
  }

  if (preferences.monoFont) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    store.setMonoFont(preferences.monoFont as any);
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
  if (typeof window === 'undefined' || !isDesktopRuntime()) {
    return null;
  }

  const api = window.opencodeAppearance;
  if (!api || typeof api.load !== 'function') {
    return null;
  }

  try {
    const raw = await api.load();
    return sanitizePreferences(raw as RawAppearancePayload | null);
  } catch (error) {
    console.warn('Failed to load appearance preferences from desktop storage:', error);
    return null;
  }
};

export const saveAppearancePreferences = async (preferences: AppearancePreferences): Promise<boolean> => {
  if (typeof window === 'undefined' || !isDesktopRuntime()) {
    return false;
  }

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
  }

  return false;
};
