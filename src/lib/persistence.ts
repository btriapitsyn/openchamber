import { getDesktopSettings, updateDesktopSettings as updateDesktopSettingsApi, isDesktopRuntime } from '@/lib/desktop';
import type { DesktopSettings } from '@/lib/desktop';
import { useUIStore } from '@/stores/useUIStore';
import type { TypographySizes } from '@/stores/useUIStore';
import { loadAppearancePreferences, applyAppearancePreferences } from '@/lib/appearancePersistence';

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

const applyDesktopUiPreferences = (settings: DesktopSettings) => {
  const store = useUIStore.getState();
  let updated = false;

  if (settings.uiFont && settings.uiFont !== store.uiFont) {
    store.setUiFont(settings.uiFont);
    updated = true;
  }

  if (settings.monoFont && settings.monoFont !== store.monoFont) {
    store.setMonoFont(settings.monoFont);
    updated = true;
  }

  if (settings.markdownDisplayMode && settings.markdownDisplayMode !== store.markdownDisplayMode) {
    store.setMarkdownDisplayMode(settings.markdownDisplayMode);
    updated = true;
  }

  if (settings.typographySizes && !typographySizesEqual(settings.typographySizes, store.typographySizes)) {
    store.setTypographySizes(settings.typographySizes);
    updated = true;
  }
};

export const syncDesktopSettings = async (): Promise<void> => {
  if (typeof window === 'undefined' || !isDesktopRuntime()) {
    return;
  }

  const persistApi = getPersistApi();

  try {
    const settings = await getDesktopSettings();
    if (settings) {
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
    }
  } catch (error) {
    console.warn('Failed to synchronise desktop settings:', error);
  }

  if (isDesktopRuntime()) {
    try {
      const appearance = await loadAppearancePreferences();
      if (appearance) {
        const applyAppearance = () => applyAppearancePreferences(appearance);

        if (persistApi?.hasHydrated?.()) {
          applyAppearance();
        } else {
          applyAppearance();
          if (persistApi?.onFinishHydration) {
            const unsubscribe = persistApi.onFinishHydration(() => {
              unsubscribe?.();
              applyAppearance();
            });
          }
        }
      }
    } catch (error) {
      console.warn('Failed to load appearance preferences:', error);
    }
  }
};

export const updateDesktopSettings = async (changes: Partial<DesktopSettings>): Promise<void> => {
  if (typeof window === 'undefined' || !isDesktopRuntime()) {
    return;
  }

  try {
    const updated = await updateDesktopSettingsApi(changes);
    if (updated) {
      persistToLocalStorage(updated);
      applyDesktopUiPreferences(updated);
    }
  } catch (error) {
    console.warn('Failed to update desktop settings:', error);
  }
};
