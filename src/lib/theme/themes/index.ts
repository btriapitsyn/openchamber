import type { Theme } from '@/types/theme';
import { flexokiLightTheme } from './flexoki-light';
import { flexokiDarkTheme } from './flexoki-dark';

// Share all built-in themes
export const themes: Theme[] = [
  flexokiLightTheme,
  flexokiDarkTheme,
];

// Share individual themes
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
