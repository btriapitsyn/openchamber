import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { Theme } from '@/types/theme';
import { CSSVariableGenerator } from '@/lib/theme/cssGenerator';
import { themes, getThemeById, getDefaultTheme } from '@/lib/theme/themes';
import { themeStorage } from '@/lib/opencode/themeStorage';
import { themeWatcher } from '@/lib/theme/themeWatcher';

interface ThemeContextValue {
  currentTheme: Theme;
  availableThemes: Theme[];
  setTheme: (themeId: string) => void;
  isSystemPreference: boolean;
  setSystemPreference: (use: boolean) => void;
  customThemes: Theme[];
  addCustomTheme: (theme: Theme) => void;
  removeCustomTheme: (themeId: string) => void;
  exportTheme: (themeId: string) => string;
  importTheme: (themeJson: string) => void;
  refreshThemes: () => Promise<void>;
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
  const [customThemes, setCustomThemes] = useState<Theme[]>([]);
  
  const [isSystemPreference, setIsSystemPreference] = useState(savedUseSystem);
  
  const getInitialTheme = () => {
    // First priority: explicit defaultThemeId prop
    if (defaultThemeId) {
      const theme = getThemeById(defaultThemeId);
      if (theme) return theme;
    }
    
    // Second priority: saved theme preference (built-in themes only at init)
    if (!savedUseSystem && savedThemeId) {
      const theme = getThemeById(savedThemeId);
      if (theme) return theme;
      // Note: Custom themes will be handled later in useEffect after loading
    }
    
    // Fallback: system preference
    return getDefaultTheme(getSystemPreference());
  };
  
  const [currentTheme, setCurrentTheme] = useState<Theme>(() => getInitialTheme());
  
  // All available themes
  const availableThemes = [...themes, ...customThemes];
  
  // Apply theme to DOM
  useEffect(() => {
    cssGenerator.apply(currentTheme);
    
    // Also update the old theme system for compatibility
    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(currentTheme.metadata.variant);
  }, [currentTheme]);
  
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
  
  // Load custom themes from storage on mount and start watching
  useEffect(() => {
    const loadThemes = async () => {
      const storedThemes = await themeStorage.loadCustomThemes();
      setCustomThemes(storedThemes);
      
      // Check if we should restore a saved custom theme
      // (built-in themes were already handled in getInitialTheme)
      if (!isSystemPreference && savedThemeId) {
        const savedCustomTheme = storedThemes.find(t => t.metadata.id === savedThemeId);
        if (savedCustomTheme) {
          setCurrentTheme(savedCustomTheme);
        }
      }
    };
    
    loadThemes();
    
    // Start watching for theme changes
    themeWatcher.start(
      (theme) => {
        // New theme detected
        console.log('New theme auto-detected:', theme.metadata.name);
        setCustomThemes(prev => {
          // Check if already exists
          if (prev.find(t => t.metadata.id === theme.metadata.id)) {
            return prev;
          }
          return [...prev, theme];
        });
      },
      (themeId) => {
        // Theme removed
        console.log('Theme removed:', themeId);
        setCustomThemes(prev => prev.filter(t => t.metadata.id !== themeId));
      }
    );
    
    // Cleanup
    return () => {
      themeWatcher.stop();
    };
  }, []);
  
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
  
  const addCustomTheme = useCallback(async (theme: Theme) => {
    // Validate theme has unique ID
    if (availableThemes.find(t => t.metadata.id === theme.metadata.id)) {
      throw new Error(`Theme with ID "${theme.metadata.id}" already exists`);
    }
    
    // Save to storage backend
    await themeStorage.saveCustomTheme(theme);
    
    // Update local state
    setCustomThemes(prev => [...prev, theme]);
  }, [availableThemes]);
  
  const removeCustomTheme = useCallback(async (themeId: string) => {
    // Delete from storage backend
    await themeStorage.deleteCustomTheme(themeId);
    
    // Update local state
    setCustomThemes(prev => prev.filter(t => t.metadata.id !== themeId));
    
    // If removing the current theme, switch to default
    if (currentTheme.metadata.id === themeId) {
      setCurrentTheme(getDefaultTheme(getSystemPreference()));
    }
  }, [currentTheme]);
  
  const exportTheme = useCallback((themeId: string) => {
    const theme = availableThemes.find(t => t.metadata.id === themeId);
    if (!theme) {
      throw new Error(`Theme with ID "${themeId}" not found`);
    }
    return JSON.stringify(theme, null, 2);
  }, [availableThemes]);
  
  const importTheme = useCallback((themeJson: string) => {
    try {
      const theme = JSON.parse(themeJson) as Theme;
      
      // Basic validation
      if (!theme.metadata?.id || !theme.colors) {
        throw new Error('Invalid theme format');
      }
      
      // Check for duplicate ID
      if (availableThemes.find(t => t.metadata.id === theme.metadata.id)) {
        // Generate new ID with timestamp
        theme.metadata.id = `${theme.metadata.id}-${Date.now()}`;
      }
      
      addCustomTheme(theme);
    } catch (error) {
      throw new Error(`Failed to import theme: ${error instanceof Error ? error.message : 'Invalid JSON'}`);
    }
  }, [availableThemes, addCustomTheme]);
  
  const refreshThemes = useCallback(async () => {
    const themes = await themeWatcher.refresh();
    setCustomThemes(themes);
    console.log(`Refreshed: found ${themes.length} custom themes`);
  }, []);

  const value: ThemeContextValue = {
    currentTheme,
    availableThemes,
    setTheme,
    isSystemPreference,
    setSystemPreference: setSystemPreferenceHandler,
    customThemes,
    addCustomTheme,
    removeCustomTheme,
    exportTheme,
    importTheme,
    refreshThemes,
  };
  
  return (
    <ThemeSystemContext.Provider value={value}>
      {children}
    </ThemeSystemContext.Provider>
  );
}