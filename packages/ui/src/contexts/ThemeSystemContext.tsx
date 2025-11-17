import React, {
  useEffect,
  useMemo,
  useCallback,
  useState,
} from 'react';
import type { Theme, ThemeMode } from '@/types/theme';
import type { DesktopSettings } from '@/lib/desktop';
import { isDesktopRuntime } from '@/lib/desktop';
import { CSSVariableGenerator } from '@/lib/theme/cssGenerator';
import { updateDesktopSettings } from '@/lib/persistence';
import {
  themes,
  getThemeById,
  flexokiLightTheme,
  flexokiDarkTheme,
} from '@/lib/theme/themes';
import { ThemeSystemContext, type ThemeContextValue } from './theme-system-context';

type ThemePreferences = {
  themeMode: ThemeMode;
  lightThemeId: string;
  darkThemeId: string;
};

const DEFAULT_LIGHT_ID = flexokiLightTheme.metadata.id;
const DEFAULT_DARK_ID = flexokiDarkTheme.metadata.id;

const getSystemPreference = (): boolean => {
  if (typeof window === 'undefined') {
    return true;
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
};

const fallbackThemeForVariant = (variant: 'light' | 'dark'): Theme =>
  variant === 'dark' ? flexokiDarkTheme : flexokiLightTheme;

const findFallbackThemeId = (variant: 'light' | 'dark'): string => {
  const fallback = themes.find((candidate) => candidate.metadata.variant === variant);
  return (fallback ?? fallbackThemeForVariant(variant)).metadata.id;
};

const ensureThemeById = (themeId: string, variant: 'light' | 'dark'): Theme => {
  const theme = getThemeById(themeId);
  if (theme && theme.metadata.variant === variant) {
    return theme;
  }
  const fallback = themes.find((candidate) => candidate.metadata.variant === variant);
  return fallback ?? fallbackThemeForVariant(variant);
};

const validateThemeId = (themeId: string | null, variant: 'light' | 'dark'): string => {
  if (!themeId) {
    return variant === 'light' ? DEFAULT_LIGHT_ID : DEFAULT_DARK_ID;
  }
  const theme = getThemeById(themeId);
  if (theme && theme.metadata.variant === variant) {
    return theme.metadata.id;
  }
  return findFallbackThemeId(variant);
};

const buildInitialPreferences = (defaultThemeId?: string): ThemePreferences => {
  let lightThemeId = DEFAULT_LIGHT_ID;
  let darkThemeId = DEFAULT_DARK_ID;
  let themeMode: ThemeMode = 'system';

  if (typeof window !== 'undefined') {
    const storedMode = localStorage.getItem('themeMode');
    const storedLightId = localStorage.getItem('lightThemeId');
    const storedDarkId = localStorage.getItem('darkThemeId');
    const legacyUseSystem = localStorage.getItem('useSystemTheme');
    const legacyThemeId = localStorage.getItem('selectedThemeId');
    const legacyVariant = localStorage.getItem('selectedThemeVariant');

    if (storedMode === 'light' || storedMode === 'dark' || storedMode === 'system') {
      themeMode = storedMode;
    } else if (legacyUseSystem !== null) {
      const useSystem = legacyUseSystem === 'true';
      if (useSystem) {
        themeMode = 'system';
      } else if (legacyThemeId) {
        const legacyTheme = getThemeById(legacyThemeId);
        if (legacyTheme) {
          themeMode = legacyTheme.metadata.variant === 'dark' ? 'dark' : 'light';
          if (legacyTheme.metadata.variant === 'dark') {
            darkThemeId = legacyTheme.metadata.id;
          } else {
            lightThemeId = legacyTheme.metadata.id;
          }
        }
      }
    } else if (legacyVariant === 'light' || legacyVariant === 'dark') {
      themeMode = legacyVariant;
    }

    lightThemeId = validateThemeId(storedLightId, 'light');
    darkThemeId = validateThemeId(storedDarkId, 'dark');
  }

  if (defaultThemeId) {
    const defaultTheme = getThemeById(defaultThemeId);
    if (defaultTheme) {
      if (defaultTheme.metadata.variant === 'light') {
        lightThemeId = defaultTheme.metadata.id;
      } else {
        darkThemeId = defaultTheme.metadata.id;
      }
    }
  }

  return {
    themeMode,
    lightThemeId,
    darkThemeId,
  };
};

interface ThemeSystemProviderProps {
  children: React.ReactNode;
  defaultThemeId?: string;
}

export function ThemeSystemProvider({ children, defaultThemeId }: ThemeSystemProviderProps) {
  const cssGenerator = useMemo(() => new CSSVariableGenerator(), []);
  const [preferences, setPreferences] = useState<ThemePreferences>(() => buildInitialPreferences(defaultThemeId));
  const [systemPrefersDark, setSystemPrefersDark] = useState<boolean>(() => getSystemPreference());

  const currentTheme = useMemo(() => {
    if (preferences.themeMode === 'light') {
      return ensureThemeById(preferences.lightThemeId, 'light');
    }
    if (preferences.themeMode === 'dark') {
      return ensureThemeById(preferences.darkThemeId, 'dark');
    }
    return systemPrefersDark
      ? ensureThemeById(preferences.darkThemeId, 'dark')
      : ensureThemeById(preferences.lightThemeId, 'light');
  }, [preferences, systemPrefersDark]);

  const availableThemes = themes;

  const updateBrowserChrome = useCallback((theme: Theme) => {
    if (typeof document === 'undefined') {
      return;
    }
    const chromeColor = theme.colors.surface.background;

    if (isDesktopRuntime()) {
      document.body.style.backgroundColor = 'transparent';
    } else {
      document.body.style.backgroundColor = chromeColor;
    }

    let metaThemeColor = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement;
    if (!metaThemeColor) {
      metaThemeColor = document.createElement('meta');
      metaThemeColor.setAttribute('name', 'theme-color');
      document.head.appendChild(metaThemeColor);
    }
    metaThemeColor.setAttribute('content', chromeColor);

    const mediaQuery =
      theme.metadata.variant === 'dark'
        ? '(prefers-color-scheme: dark)'
        : '(prefers-color-scheme: light)';
    let metaThemeColorMedia = document.querySelector(
      `meta[name="theme-color"][media="${mediaQuery}"]`,
    ) as HTMLMetaElement;
    if (!metaThemeColorMedia) {
      metaThemeColorMedia = document.createElement('meta');
      metaThemeColorMedia.setAttribute('name', 'theme-color');
      metaThemeColorMedia.setAttribute('media', mediaQuery);
      document.head.appendChild(metaThemeColorMedia);
    }
    metaThemeColorMedia.setAttribute('content', chromeColor);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    cssGenerator.apply(currentTheme);
    updateBrowserChrome(currentTheme);

    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(currentTheme.metadata.variant);
  }, [cssGenerator, currentTheme, updateBrowserChrome]);

  useEffect(() => {
    if (preferences.themeMode !== 'system' || typeof window === 'undefined') {
      return;
    }

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (event: MediaQueryListEvent) => {
      setSystemPrefersDark(event.matches);
    };

    setSystemPrefersDark(mediaQuery.matches);
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [preferences.themeMode]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    localStorage.setItem('themeMode', preferences.themeMode);
    localStorage.setItem('lightThemeId', preferences.lightThemeId);
    localStorage.setItem('darkThemeId', preferences.darkThemeId);
    localStorage.setItem('useSystemTheme', String(preferences.themeMode === 'system'));
    localStorage.setItem('selectedThemeId', currentTheme.metadata.id);
    localStorage.setItem(
      'selectedThemeVariant',
      currentTheme.metadata.variant === 'light' ? 'light' : 'dark',
    );
  }, [preferences, currentTheme]);

  useEffect(() => {
    void updateDesktopSettings({
      themeId: currentTheme.metadata.id,
      themeVariant: currentTheme.metadata.variant === 'light' ? 'light' : 'dark',
      useSystemTheme: preferences.themeMode === 'system',
      lightThemeId: preferences.lightThemeId,
      darkThemeId: preferences.darkThemeId,
    });
  }, [currentTheme.metadata.id, currentTheme.metadata.variant, preferences.themeMode, preferences.lightThemeId, preferences.darkThemeId]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const handleSettingsSynced = (event: Event) => {
      const detail = (event as CustomEvent<DesktopSettings>).detail;
      if (!detail) {
        return;
      }

      setPreferences((prev) => {
        let nextMode = prev.themeMode;
        if (detail.useSystemTheme === true) {
          nextMode = 'system';
        } else if (detail.useSystemTheme === false) {
          if (detail.themeVariant === 'dark' || detail.themeVariant === 'light') {
            nextMode = detail.themeVariant;
          }
        }

        let nextLight = prev.lightThemeId;
        if (typeof detail.lightThemeId === 'string' && detail.lightThemeId.length > 0) {
          nextLight = validateThemeId(detail.lightThemeId, 'light');
        }

        let nextDark = prev.darkThemeId;
        if (typeof detail.darkThemeId === 'string' && detail.darkThemeId.length > 0) {
          nextDark = validateThemeId(detail.darkThemeId, 'dark');
        }

        const same =
          nextMode === prev.themeMode &&
          nextLight === prev.lightThemeId &&
          nextDark === prev.darkThemeId;

        if (same) {
          return prev;
        }

        return {
          themeMode: nextMode,
          lightThemeId: nextLight,
          darkThemeId: nextDark,
        };
      });
    };

    window.addEventListener('openchamber:settings-synced', handleSettingsSynced);
    return () => window.removeEventListener('openchamber:settings-synced', handleSettingsSynced);
  }, []);

  const setTheme = useCallback(
    (themeId: string) => {
      const theme = availableThemes.find((candidate) => candidate.metadata.id === themeId);
      if (!theme) {
        return;
      }

      setPreferences((prev) => {
        if (theme.metadata.variant === 'dark') {
          if (prev.darkThemeId === theme.metadata.id && prev.themeMode === 'dark') {
            return prev;
          }
          return {
            ...prev,
            darkThemeId: theme.metadata.id,
            themeMode: 'dark',
          };
        }

        if (prev.lightThemeId === theme.metadata.id && prev.themeMode === 'light') {
          return prev;
        }

        return {
          ...prev,
          lightThemeId: theme.metadata.id,
          themeMode: 'light',
        };
      });
    },
    [availableThemes],
  );

  const setThemeModeHandler = useCallback((mode: ThemeMode) => {
    setPreferences((prev) => {
      if (prev.themeMode === mode) {
        return prev;
      }
      return {
        ...prev,
        themeMode: mode,
      };
    });
  }, []);

  const setSystemPreferenceHandler = useCallback(
    (use: boolean) => {
      if (use) {
        setPreferences((prev) => {
          if (prev.themeMode === 'system') {
            return prev;
          }
          return {
            ...prev,
            themeMode: 'system',
          };
        });
        return;
      }

      const fallbackMode: ThemeMode =
        currentTheme.metadata.variant === 'dark' ? 'dark' : 'light';
      setPreferences((prev) => {
        if (prev.themeMode === fallbackMode) {
          return prev;
        }
        return {
          ...prev,
          themeMode: fallbackMode,
        };
      });
    },
    [currentTheme.metadata.variant],
  );

  const setLightThemePreference = useCallback(
    (themeId: string) => {
      const theme = availableThemes.find(
        (candidate) =>
          candidate.metadata.id === themeId && candidate.metadata.variant === 'light',
      );
      if (!theme) {
        return;
      }

      setPreferences((prev) => {
        if (prev.lightThemeId === theme.metadata.id) {
          return prev;
        }
        return {
          ...prev,
          lightThemeId: theme.metadata.id,
        };
      });
    },
    [availableThemes],
  );

  const setDarkThemePreference = useCallback(
    (themeId: string) => {
      const theme = availableThemes.find(
        (candidate) =>
          candidate.metadata.id === themeId && candidate.metadata.variant === 'dark',
      );
      if (!theme) {
        return;
      }

      setPreferences((prev) => {
        if (prev.darkThemeId === theme.metadata.id) {
          return prev;
        }
        return {
          ...prev,
          darkThemeId: theme.metadata.id,
        };
      });
    },
    [availableThemes],
  );

  const value: ThemeContextValue = {
    currentTheme,
    availableThemes,
    setTheme,
    isSystemPreference: preferences.themeMode === 'system',
    setSystemPreference: setSystemPreferenceHandler,
    themeMode: preferences.themeMode,
    setThemeMode: setThemeModeHandler,
    lightThemeId: preferences.lightThemeId,
    darkThemeId: preferences.darkThemeId,
    setLightThemePreference,
    setDarkThemePreference,
  };

  return (
    <ThemeSystemContext.Provider value={value}>
      {children}
    </ThemeSystemContext.Provider>
  );
}
