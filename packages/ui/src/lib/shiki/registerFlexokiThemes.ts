import { registerCustomTheme } from '@pierre/diffs';

import { flexokiDarkTheme, flexokiLightTheme, vercelDarkTheme, vercelLightTheme, flexokiThemeNames } from './flexokiThemes';

let hasRegistered = false;

export function ensureFlexokiThemesRegistered(): void {
  if (hasRegistered) return;

  registerCustomTheme(flexokiThemeNames.dark, async () => flexokiDarkTheme);
  registerCustomTheme(flexokiThemeNames.light, async () => flexokiLightTheme);
  registerCustomTheme(flexokiThemeNames.vercelDark, async () => vercelDarkTheme);
  registerCustomTheme(flexokiThemeNames.vercelLight, async () => vercelLightTheme);

  hasRegistered = true;
}

