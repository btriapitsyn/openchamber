import { getDesktopSettings, updateDesktopSettings as updateDesktopSettingsApi, isDesktopRuntime } from '@/lib/desktop';
import type { DesktopSettings } from '@/lib/desktop';
import { useUIStore } from '@/stores/useUIStore';
import type { TypographySizes } from '@/stores/useUIStore';
import { loadAppearancePreferences, applyAppearancePreferences } from '@/lib/appearancePersistence';
import { UI_FONT_OPTION_MAP, CODE_FONT_OPTION_MAP } from '@/lib/fontOptions';

const persistToLocalStorage = (settings: DesktopSettings) => {
  if (typeof window === 'undefined') {
    return;
  }

  if (settings.themeId) {
    localStorage.setItem('selectedThemeId', settings.themeId);
  }
  if (settings.themeVariant) {
    localStorage.setItem('selectedThemeVariant', settings.themeVariant);
  }
  if (settings.lightThemeId) {
    localStorage.setItem('lightThemeId', settings.lightThemeId);
  }
  if (settings.darkThemeId) {
    localStorage.setItem('darkThemeId', settings.darkThemeId);
  }
  if (typeof settings.useSystemTheme === 'boolean') {
    localStorage.setItem('useSystemTheme', String(settings.useSystemTheme));
  }
  if (settings.lastDirectory) {
    localStorage.setItem('lastDirectory', settings.lastDirectory);
  }
  if (settings.homeDirectory) {
    localStorage.setItem('homeDirectory', settings.homeDirectory);
    window.__OPENCHAMBER_HOME__ = settings.homeDirectory;
  }
  if (Array.isArray(settings.pinnedDirectories) && settings.pinnedDirectories.length > 0) {
    localStorage.setItem('pinnedDirectories', JSON.stringify(settings.pinnedDirectories));
  } else {
    localStorage.removeItem('pinnedDirectories');
  }
};

type PersistApi = {
  hasHydrated?: () => boolean;
  onFinishHydration?: (callback: () => void) => (() => void) | void;
};

const getPersistApi = (): PersistApi | undefined => {
  const candidate = (useUIStore as unknown as { persist?: PersistApi }).persist;
  if (candidate && typeof candidate === 'object') {
    return candidate;
  }
  return undefined;
};

const typographyKeys: Array<keyof TypographySizes> = ['markdown', 'code', 'uiHeader', 'uiLabel', 'meta', 'micro'];

const typographySizesEqual = (a: TypographySizes, b: TypographySizes): boolean =>
  typographyKeys.every((key) => a[key] === b[key]);

const isUiFontOption = (value: unknown): value is DesktopSettings['uiFont'] =>
  typeof value === 'string' && Object.prototype.hasOwnProperty.call(UI_FONT_OPTION_MAP, value);

const isMonoFontOption = (value: unknown): value is DesktopSettings['monoFont'] =>
  typeof value === 'string' && Object.prototype.hasOwnProperty.call(CODE_FONT_OPTION_MAP, value);

const isMarkdownDisplayModeValue = (value: unknown): value is DesktopSettings['markdownDisplayMode'] =>
  value === 'compact' || value === 'comfort';

const applyDesktopUiPreferences = (settings: DesktopSettings) => {
  const store = useUIStore.getState();

  if (settings.uiFont && settings.uiFont !== store.uiFont) {
    store.setUiFont(settings.uiFont);
  }

  if (settings.monoFont && settings.monoFont !== store.monoFont) {
    store.setMonoFont(settings.monoFont);
  }

  if (settings.markdownDisplayMode && settings.markdownDisplayMode !== store.markdownDisplayMode) {
    store.setMarkdownDisplayMode(settings.markdownDisplayMode);
  }

  if (settings.typographySizes && !typographySizesEqual(settings.typographySizes, store.typographySizes)) {
    store.setTypographySizes(settings.typographySizes);
  }

  if (typeof settings.showReasoningTraces === 'boolean' && settings.showReasoningTraces !== store.showReasoningTraces) {
    store.setShowReasoningTraces(settings.showReasoningTraces);
  }
};

const sanitizeTypographyFromPayload = (payload?: Record<string, unknown> | null): TypographySizes | undefined => {
  if (!payload || typeof payload !== 'object') {
    return undefined;
  }
  const defaults = useUIStore.getState().typographySizes;
  const sizes: TypographySizes = {
    markdown: typeof payload.markdown === 'string' ? payload.markdown : defaults.markdown,
    code: typeof payload.code === 'string' ? payload.code : defaults.code,
    uiHeader: typeof payload.uiHeader === 'string' ? payload.uiHeader : defaults.uiHeader,
    uiLabel: typeof payload.uiLabel === 'string' ? payload.uiLabel : defaults.uiLabel,
    meta: typeof payload.meta === 'string' ? payload.meta : defaults.meta,
    micro: typeof payload.micro === 'string' ? payload.micro : defaults.micro,
  };
  return sizes;
};

const sanitizeWebSettings = (payload: unknown): DesktopSettings | null => {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const candidate = payload as Record<string, unknown>;
  const result: DesktopSettings = {};

  if (typeof candidate.themeId === 'string' && candidate.themeId.length > 0) {
    result.themeId = candidate.themeId;
  }
  if (candidate.useSystemTheme === true || candidate.useSystemTheme === false) {
    result.useSystemTheme = candidate.useSystemTheme;
  }
  if (typeof candidate.themeVariant === 'string' && (candidate.themeVariant === 'light' || candidate.themeVariant === 'dark')) {
    result.themeVariant = candidate.themeVariant;
  }
  if (typeof candidate.lightThemeId === 'string' && candidate.lightThemeId.length > 0) {
    result.lightThemeId = candidate.lightThemeId;
  }
  if (typeof candidate.darkThemeId === 'string' && candidate.darkThemeId.length > 0) {
    result.darkThemeId = candidate.darkThemeId;
  }
  if (typeof candidate.lastDirectory === 'string' && candidate.lastDirectory.length > 0) {
    result.lastDirectory = candidate.lastDirectory;
  }
  if (typeof candidate.homeDirectory === 'string' && candidate.homeDirectory.length > 0) {
    result.homeDirectory = candidate.homeDirectory;
  }
  if (Array.isArray(candidate.approvedDirectories)) {
    result.approvedDirectories = candidate.approvedDirectories.filter(
      (entry): entry is string => typeof entry === 'string' && entry.length > 0
    );
  }
  if (Array.isArray(candidate.securityScopedBookmarks)) {
    result.securityScopedBookmarks = candidate.securityScopedBookmarks.filter(
      (entry): entry is string => typeof entry === 'string' && entry.length > 0
    );
  }
  if (Array.isArray(candidate.pinnedDirectories)) {
    result.pinnedDirectories = Array.from(
      new Set(
        candidate.pinnedDirectories.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
      )
    );
  }
  if (isUiFontOption(candidate.uiFont)) {
    result.uiFont = candidate.uiFont;
  }
  if (isMonoFontOption(candidate.monoFont)) {
    result.monoFont = candidate.monoFont;
  }
  if (isMarkdownDisplayModeValue(candidate.markdownDisplayMode)) {
    result.markdownDisplayMode = candidate.markdownDisplayMode;
  }
  if (candidate.typographySizes && typeof candidate.typographySizes === 'object') {
    const typography = sanitizeTypographyFromPayload(candidate.typographySizes as Record<string, unknown>);
    if (typography) {
      result.typographySizes = typography;
    }
  }
  if (typeof candidate.showReasoningTraces === 'boolean') {
    result.showReasoningTraces = candidate.showReasoningTraces;
  }

  return result;
};

const fetchWebSettings = async (): Promise<DesktopSettings | null> => {
  try {
    const response = await fetch('/api/config/settings', {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      return null;
    }
    const data = await response.json().catch(() => null);
    return sanitizeWebSettings(data);
  } catch (error) {
    console.warn('Failed to load shared settings from server:', error);
    return null;
  }
};

export const syncDesktopSettings = async (): Promise<void> => {
  if (typeof window === 'undefined') {
    return;
  }

  const persistApi = getPersistApi();

  const applySettings = (settings: DesktopSettings) => {
    persistToLocalStorage(settings);
    const apply = () => applyDesktopUiPreferences(settings);

    if (persistApi?.hasHydrated?.()) {
      apply();
    } else {
      apply();
      if (persistApi?.onFinishHydration) {
        const unsubscribe = persistApi.onFinishHydration(() => {
          unsubscribe?.();
          apply();
        });
      }
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent<DesktopSettings>('openchamber:settings-synced', { detail: settings }));
    }
  };

  try {
    const settings = isDesktopRuntime() ? await getDesktopSettings() : await fetchWebSettings();
    if (settings) {
      applySettings(settings);
    }
  } catch (error) {
    console.warn('Failed to synchronise settings:', error);
  }
};

export const updateDesktopSettings = async (changes: Partial<DesktopSettings>): Promise<void> => {
  if (typeof window === 'undefined') {
    return;
  }

  if (isDesktopRuntime()) {
    try {
      const updated = await updateDesktopSettingsApi(changes);
      if (updated) {
        persistToLocalStorage(updated);
        applyDesktopUiPreferences(updated);
      }
    } catch (error) {
      console.warn('Failed to update desktop settings:', error);
    }
    return;
  }

  try {
    const response = await fetch('/api/config/settings', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(changes),
    });

    if (!response.ok) {
      console.warn('Failed to update shared settings via API:', response.status, response.statusText);
      return;
    }

    const updated = (await response.json().catch(() => null)) as DesktopSettings | null;
    if (updated) {
      persistToLocalStorage(updated);
      applyDesktopUiPreferences(updated);
    }
  } catch (error) {
    console.warn('Failed to update shared settings via API:', error);
  }
};

export const initializeAppearancePreferences = async (): Promise<void> => {
  if (typeof window === 'undefined') {
    return;
  }

  const persistApi = getPersistApi();

  try {
    const appearance = await loadAppearancePreferences();
    if (!appearance) {
      return;
    }

    const applyAppearance = () => applyAppearancePreferences(appearance);

    if (persistApi?.hasHydrated?.()) {
      applyAppearance();
      return;
    }

    applyAppearance();
    if (persistApi?.onFinishHydration) {
      const unsubscribe = persistApi.onFinishHydration(() => {
        unsubscribe?.();
        applyAppearance();
      });
    }
  } catch (error) {
    console.warn('Failed to load appearance preferences:', error);
  }
};
