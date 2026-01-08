import { registerCustomTheme } from '@pierre/diffs';

import {
  flexokiDarkDiffTheme,
  flexokiLightDiffTheme,
  vercelDarkDiffTheme,
  vercelLightDiffTheme,
  diffThemeNames,
} from './diffThemes';

let hasRegistered = false;

export function ensureDiffThemesRegistered(): void {
  if (hasRegistered) return;

  registerCustomTheme(diffThemeNames.flexokiDark, async () => flexokiDarkDiffTheme);
  registerCustomTheme(diffThemeNames.flexokiLight, async () => flexokiLightDiffTheme);
  registerCustomTheme(diffThemeNames.vercelDark, async () => vercelDarkDiffTheme);
  registerCustomTheme(diffThemeNames.vercelLight, async () => vercelLightDiffTheme);

  hasRegistered = true;
}
