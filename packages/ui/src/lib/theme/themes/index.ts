import type { Theme } from '@/types/theme';
import { flexokiLightTheme } from './flexoki-light';
import { flexokiDarkTheme } from './flexoki-dark';
import { vercelDarkTheme } from './vercel-dark';
import { vercelLightTheme } from './vercel-light';
import { vercelDarkTheme } from './vercel-dark';
import { vercelLightTheme } from './vercel-light';

export const themes: Theme[] = [
  vercelLightTheme,
  vercelDarkTheme,
  flexokiLightTheme,
  flexokiDarkTheme,
  vercelDarkTheme,
  vercelLightTheme,
];

export {
  flexokiLightTheme,
  flexokiDarkTheme,
  vercelDarkTheme,
  vercelLightTheme,
};

export function getThemeById(id: string): Theme | undefined {
  return themes.find(theme => theme.metadata.id === id);
}

export function getDefaultTheme(prefersDark: boolean): Theme {
  return prefersDark ? vercelDarkTheme : vercelLightTheme;
}
