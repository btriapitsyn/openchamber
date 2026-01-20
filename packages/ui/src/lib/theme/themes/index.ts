import type { Theme } from '@/types/theme';
import { flexokiLightTheme } from './flexoki-light';
import { flexokiDarkTheme } from './flexoki-dark';
import { kanagawaLightTheme } from './kanagawa-light';
import { kanagawaDarkTheme } from './kanagawa-dark';

export const themes: Theme[] = [
  flexokiLightTheme,
  flexokiDarkTheme,
  kanagawaLightTheme,
  kanagawaDarkTheme,
];

export {
  flexokiLightTheme,
  flexokiDarkTheme,
  kanagawaLightTheme,
  kanagawaDarkTheme,
};

export function getThemeById(id: string): Theme | undefined {
  return themes.find(theme => theme.metadata.id === id);
}

export function getDefaultTheme(prefersDark: boolean): Theme {
  return prefersDark ? flexokiDarkTheme : flexokiLightTheme;
}
