import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { Theme } from '@/types/theme';
import { CSSVariableGenerator } from '@/lib/theme/cssGenerator';
import { themes, getThemeById, getDefaultTheme } from '@/lib/theme/themes';

interface ThemeContextValue {
  currentTheme: Theme;
  availableThemes: Theme[];
  setTheme: (themeId: string) => void;
  isSystemPreference: boolean;
  setSystemPreference: (use: boolean) => void;
}

const ThemeSystemContext = createContext<ThemeContextValue | undefined>(undefined);

export function useThemeSystem() {
  const context = useContext(ThemeSystemContext);
  if (!context) {
    throw new Error('useThemeSystem must be used within a ThemeSystemProvider');
  }
  return context;
}

interface ThemeSystemProviderProps {
  children: React.ReactNode;
  defaultThemeId?: string;
}

export function ThemeSystemProvider({ children, defaultThemeId }: ThemeSystemProviderProps) {
  const cssGenerator = new CSSVariableGenerator();
  
  // Check system preference
  const getSystemPreference = () => {
    if (typeof window !== 'undefined') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return true; // Default to dark
  };
  
  // Load saved preferences
  const loadSavedPreferences = () => {
    if (typeof window === 'undefined') return { themeId: null, useSystem: true };
    
    const savedThemeId = localStorage.getItem('selectedThemeId');
    const useSystemStr = localStorage.getItem('useSystemTheme');
    const useSystem = useSystemStr === null ? true : useSystemStr === 'true';
    
    return { themeId: savedThemeId, useSystem };
  };
  
  const { themeId: savedThemeId, useSystem: savedUseSystem } = loadSavedPreferences();

  // Initialize state
  const [isSystemPreference, setIsSystemPreference] = useState(savedUseSystem);

  const getInitialTheme = () => {
    // First priority: explicit defaultThemeId prop
    if (defaultThemeId) {
      const theme = getThemeById(defaultThemeId);
      if (theme) return theme;
    }

    // Second priority: saved theme preference (built-in themes only)
    if (!savedUseSystem && savedThemeId) {
      const theme = getThemeById(savedThemeId);
      if (theme) return theme;
    }

    // Fallback: system preference
    return getDefaultTheme(getSystemPreference());
  };

  const [currentTheme, setCurrentTheme] = useState<Theme>(() => getInitialTheme());

  // All available themes (built-in only)
  const availableThemes = themes;
  
  // Update browser chrome colors for Safari iOS 26+
  const updateBrowserChrome = useCallback((theme: Theme) => {
    const chromeColor = theme.colors.surface.background;

    // For Safari iOS 26+ - set body background (primary detection method)
    document.body.style.backgroundColor = chromeColor;

    // Update meta theme-color for other browsers as fallback
    let metaThemeColor = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement;
    if (!metaThemeColor) {
      metaThemeColor = document.createElement('meta');
      metaThemeColor.setAttribute('name', 'theme-color');
      document.head.appendChild(metaThemeColor);
    }
    metaThemeColor.setAttribute('content', chromeColor);

    // Update media-specific theme-color for consistency
    const mediaQuery = theme.metadata.variant === 'dark' ? '(prefers-color-scheme: dark)' : '(prefers-color-scheme: light)';
    let metaThemeColorMedia = document.querySelector(`meta[name="theme-color"][media="${mediaQuery}"]`) as HTMLMetaElement;
    if (!metaThemeColorMedia) {
      metaThemeColorMedia = document.createElement('meta');
      metaThemeColorMedia.setAttribute('name', 'theme-color');
      metaThemeColorMedia.setAttribute('media', mediaQuery);
      document.head.appendChild(metaThemeColorMedia);
    }
    metaThemeColorMedia.setAttribute('content', chromeColor);
  }, []);

  // Apply theme to DOM
  useEffect(() => {
    cssGenerator.apply(currentTheme);
    updateBrowserChrome(currentTheme);

    // Also update the old theme system for compatibility
    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(currentTheme.metadata.variant);
  }, [currentTheme, updateBrowserChrome]);
  
  // Handle system preference changes
  useEffect(() => {
    if (!isSystemPreference) return;
    
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      setCurrentTheme(getDefaultTheme(e.matches));
    };
    
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [isSystemPreference]);
  
  // Save preferences
  useEffect(() => {
    if (typeof window === 'undefined') return;

    localStorage.setItem('useSystemTheme', String(isSystemPreference));
    if (!isSystemPreference) {
      localStorage.setItem('selectedThemeId', currentTheme.metadata.id);
    }
  }, [isSystemPreference, currentTheme]);
  
  const setTheme = useCallback((themeId: string) => {
    const theme = availableThemes.find(t => t.metadata.id === themeId);
    if (theme) {
      setCurrentTheme(theme);
      setIsSystemPreference(false);
    }
  }, [availableThemes]);
  
  const setSystemPreferenceHandler = useCallback((use: boolean) => {
    setIsSystemPreference(use);
    if (use) {
      setCurrentTheme(getDefaultTheme(getSystemPreference()));
    }
  }, []);

  const value: ThemeContextValue = {
    currentTheme,
    availableThemes,
    setTheme,
    isSystemPreference,
    setSystemPreference: setSystemPreferenceHandler,
  };
  
  return (
    <ThemeSystemContext.Provider value={value}>
      {children}
    </ThemeSystemContext.Provider>
  );
}