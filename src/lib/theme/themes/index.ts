import type { Theme } from '@/types/theme';
import { defaultDarkTheme } from './default-dark';
import { defaultLightTheme } from './default-light';
import { auraLightTheme } from './aura-light';
import { auraDarkTheme } from './aura-dark';
import { catppuccinLightTheme } from './catppuccin-light';
import { catppuccinDarkTheme } from './catppuccin-dark';
import { ayuLightTheme } from './ayu-light';
import { ayuDarkTheme } from './ayu-dark';
import { cobalt2LightTheme } from './cobalt2-light';
import { cobalt2DarkTheme } from './cobalt2-dark';
import { draculaLightTheme } from './dracula-light';
import { draculaDarkTheme } from './dracula-dark';
import { everforestLightTheme } from './everforest-light';
import { everforestDarkTheme } from './everforest-dark';
import { gruvboxLightTheme } from './gruvbox-light';
import { gruvboxDarkTheme } from './gruvbox-dark';
import { kanagawaLightTheme } from './kanagawa-light';
import { kanagawaDarkTheme } from './kanagawa-dark';
import { matrixLightTheme } from './matrix-light';
import { matrixDarkTheme } from './matrix-dark';
import { monokaiLightTheme } from './monokai-light';
import { monokaiDarkTheme } from './monokai-dark';
import { nordLightTheme } from './nord-light';
import { nordDarkTheme } from './nord-dark';
import { oneDarkLightTheme } from './one-dark-light';
import { oneDarkDarkTheme } from './one-dark-dark';
import { opencodeLightTheme } from './opencode-light';
import { opencodeDarkTheme } from './opencode-dark';
import { palenightLightTheme } from './palenight-light';
import { palenightDarkTheme } from './palenight-dark';
import { rosepineLightTheme } from './rosepine-light';
import { rosepineDarkTheme } from './rosepine-dark';
import { solarizedLightTheme } from './solarized-light';
import { solarizedDarkTheme } from './solarized-dark';
import { synthwave84LightTheme } from './synthwave84-light';
import { synthwave84DarkTheme } from './synthwave84-dark';

// Export all built-in themes
export const themes: Theme[] = [
  defaultDarkTheme,
  defaultLightTheme,
  auraLightTheme,
  auraDarkTheme,
  catppuccinLightTheme,
  catppuccinDarkTheme,
  ayuLightTheme,
  ayuDarkTheme,
  cobalt2LightTheme,
  cobalt2DarkTheme,
  draculaLightTheme,
  draculaDarkTheme,
  everforestLightTheme,
  everforestDarkTheme,
  gruvboxLightTheme,
  gruvboxDarkTheme,
  kanagawaLightTheme,
  kanagawaDarkTheme,
  matrixLightTheme,
  matrixDarkTheme,
  monokaiLightTheme,
  monokaiDarkTheme,
  nordLightTheme,
  nordDarkTheme,
  oneDarkLightTheme,
  oneDarkDarkTheme,
  opencodeLightTheme,
  opencodeDarkTheme,
  palenightLightTheme,
  palenightDarkTheme,
  rosepineLightTheme,
  rosepineDarkTheme,
  solarizedLightTheme,
  solarizedDarkTheme,
  synthwave84LightTheme,
  synthwave84DarkTheme,
];

// Export individual themes with better names
export { defaultDarkTheme, defaultLightTheme, auraLightTheme, auraDarkTheme, catppuccinLightTheme, catppuccinDarkTheme, ayuLightTheme, ayuDarkTheme, cobalt2LightTheme, cobalt2DarkTheme, draculaLightTheme, draculaDarkTheme, everforestLightTheme, everforestDarkTheme, gruvboxLightTheme, gruvboxDarkTheme, kanagawaLightTheme, kanagawaDarkTheme, matrixLightTheme, matrixDarkTheme, monokaiLightTheme, monokaiDarkTheme, nordLightTheme, nordDarkTheme, oneDarkLightTheme, oneDarkDarkTheme, opencodeLightTheme, opencodeDarkTheme, palenightLightTheme, palenightDarkTheme, rosepineLightTheme, rosepineDarkTheme, solarizedLightTheme, solarizedDarkTheme, synthwave84LightTheme, synthwave84DarkTheme };
// Keep old names for backward compatibility during migration


// Get theme by ID
export function getThemeById(id: string): Theme | undefined {
  return themes.find(theme => theme.metadata.id === id);
}

// Get default theme based on system preference
export function getDefaultTheme(prefersDark: boolean): Theme {
  return prefersDark ? defaultDarkTheme : defaultLightTheme;
}