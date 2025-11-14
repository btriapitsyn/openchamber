import type { Theme } from '@/types/theme';
import { defaultDarkTheme } from './default-dark';
import { defaultLightTheme } from './default-light';
import { auraDarkTheme } from './aura-dark';
import { catppuccinLightTheme } from './catppuccin-light';
import { catppuccinDarkTheme } from './catppuccin-dark';
import { ayuDarkTheme } from './ayu-dark';
import { flexokiLightTheme } from './flexoki-light';
import { flexokiDarkTheme } from './flexoki-dark';
import { gruvboxLightTheme } from './gruvbox-light';
import { gruvboxDarkTheme } from './gruvbox-dark';
import { kanagawaDarkTheme } from './kanagawa-dark';
import { oneLightTheme } from './one-light';
import { oneDarkTheme } from './one-dark';
import { rosepineLightTheme } from './rosepine-light';
import { rosepineDarkTheme } from './rosepine-dark';
import { solarizedDarkTheme } from './solarized-dark';

// Export all built-in themes
export const themes: Theme[] = [
  defaultDarkTheme,
  defaultLightTheme,
  auraDarkTheme,
  catppuccinLightTheme,
  catppuccinDarkTheme,
  ayuDarkTheme,
  flexokiLightTheme,
  flexokiDarkTheme,
  gruvboxLightTheme,
  gruvboxDarkTheme,
  kanagawaDarkTheme,
  oneLightTheme,
  oneDarkTheme,
  rosepineLightTheme,
  rosepineDarkTheme,
  solarizedDarkTheme,
];

// Export individual themes with better names
export { defaultDarkTheme,
  defaultLightTheme,
  auraDarkTheme,
  catppuccinLightTheme,
  catppuccinDarkTheme,
  ayuDarkTheme,
  flexokiLightTheme,
  flexokiDarkTheme,
  gruvboxLightTheme,
  gruvboxDarkTheme,
  kanagawaDarkTheme,
  oneLightTheme,
  oneDarkTheme,
  rosepineLightTheme,
  rosepineDarkTheme,
  solarizedDarkTheme
};

// Keep old names for backward compatibility during migration


// Get theme by ID
export function getThemeById(id: string): Theme | undefined {
  return themes.find(theme => theme.metadata.id === id);
}

// Get default theme based on system preference
export function getDefaultTheme(prefersDark: boolean): Theme {
  return prefersDark ? defaultDarkTheme : defaultLightTheme;
}
