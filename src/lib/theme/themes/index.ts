import type { Theme } from '@/types/theme';
import { flexokiLightTheme } from './flexoki-light';
import { flexokiDarkTheme } from './flexoki-dark';

// Export all built-in themes
export const themes: Theme[] = [
  flexokiLightTheme,
  flexokiDarkTheme,
];

// Export individual themes
export {
  flexokiLightTheme,
  flexokiDarkTheme,
};

// Get theme by ID
export function getThemeById(id: string): Theme | undefined {
  return themes.find(theme => theme.metadata.id === id);
}

// Get default theme based on system preference
export function getDefaultTheme(prefersDark: boolean): Theme {
  return prefersDark ? flexokiDarkTheme : flexokiLightTheme;
}
