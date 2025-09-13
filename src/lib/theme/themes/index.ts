import type { Theme } from '@/types/theme';
import { defaultDarkTheme } from './default-dark';
import { defaultLightTheme } from './default-light';

// Export all built-in themes
export const themes: Theme[] = [
  defaultDarkTheme,
  defaultLightTheme,
];

// Export individual themes with better names
export { defaultDarkTheme, defaultLightTheme };
// Keep old names for backward compatibility during migration


// Get theme by ID
export function getThemeById(id: string): Theme | undefined {
  return themes.find(theme => theme.metadata.id === id);
}

// Get default theme based on system preference
export function getDefaultTheme(prefersDark: boolean): Theme {
  return prefersDark ? defaultDarkTheme : defaultLightTheme;
}