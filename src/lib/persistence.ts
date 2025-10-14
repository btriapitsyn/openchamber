
import { getDesktopSettings, updateDesktopSettings as updateDesktopSettingsApi } from '@/lib/desktop';
import type { DesktopSettings } from '@/lib/desktop';

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

export const syncDesktopSettings = async (): Promise<void> => {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    const settings = await getDesktopSettings();
    if (settings) {
      persistToLocalStorage(settings);
    }
  } catch (error) {
    console.warn('Failed to synchronise desktop settings:', error);
  }
};

export const updateDesktopSettings = async (changes: Partial<DesktopSettings>): Promise<void> => {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    const updated = await updateDesktopSettingsApi(changes);
    if (updated) {
      persistToLocalStorage(updated);
    }
  } catch (error) {
    console.warn('Failed to update desktop settings:', error);
  }
};
