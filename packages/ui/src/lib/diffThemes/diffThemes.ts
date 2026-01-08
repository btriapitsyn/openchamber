import flexokiDarkRawJson from './themes/flexoki-dark.json';
import flexokiLightRawJson from './themes/flexoki-light.json';
import vercelDarkRawJson from './themes/vercel-dark.json';
import vercelLightRawJson from './themes/vercel-light.json';

export const DIFF_THEME_NAMES = {
  FLEXOKI_DARK: 'flexoki-dark',
  FLEXOKI_LIGHT: 'flexoki-light',
  VERCEL_DARK: 'vercel-dark',
  VERCEL_LIGHT: 'vercel-light',
} as const;

export type DiffThemeName = typeof DIFF_THEME_NAMES[keyof typeof DIFF_THEME_NAMES];

type VSCodeTokenColorRule = {
  name?: string;
  scope?: string | string[];
  settings: Record<string, string | undefined>;
};

type VSCodeTextMateTheme = {
  name: string;
  type: 'dark' | 'light';
  colors?: Record<string, string>;
  tokenColors?: VSCodeTokenColorRule[];
  semanticHighlighting?: boolean;
  semanticTokenColors?: Record<string, string>;
};

export type ShikiThemeRegistrationResolvedLike = VSCodeTextMateTheme & {
  settings: VSCodeTokenColorRule[];
  fg: string;
  bg: string;
};

const flexokiDarkRaw = flexokiDarkRawJson as VSCodeTextMateTheme;
const flexokiLightRaw = flexokiLightRawJson as VSCodeTextMateTheme;
const vercelDarkRaw = vercelDarkRawJson as VSCodeTextMateTheme;
const vercelLightRaw = vercelLightRawJson as VSCodeTextMateTheme;

function withStableStringId<T extends object>(value: T, id: string): T {
  Object.defineProperty(value, 'toString', {
    value: () => id,
    enumerable: false,
    configurable: true,
  });

  Object.defineProperty(value, Symbol.toPrimitive, {
    value: () => id,
    enumerable: false,
    configurable: true,
  });

  return value;
}

function toResolvedTheme(
  raw: VSCodeTextMateTheme,
  name: string,
  type: VSCodeTextMateTheme['type']
): ShikiThemeRegistrationResolvedLike {
  const bg = raw.colors?.['editor.background'];
  const fg = raw.colors?.['editor.foreground'];

  if (!bg || !fg) {
    throw new Error(
      `Shiki theme "${name}" is missing editor.background/editor.foreground`
    );
  }

  const settings = raw.tokenColors ?? [];

  return {
    ...raw,
    name,
    type,
    fg,
    bg,
    settings,
  };
}

export const flexokiDarkDiffTheme = toResolvedTheme(
  flexokiDarkRaw,
  DIFF_THEME_NAMES.FLEXOKI_DARK,
  'dark'
);

export const flexokiLightDiffTheme = toResolvedTheme(
  flexokiLightRaw,
  DIFF_THEME_NAMES.FLEXOKI_LIGHT,
  'light'
);

export const vercelDarkDiffTheme = toResolvedTheme(
  vercelDarkRaw,
  DIFF_THEME_NAMES.VERCEL_DARK,
  'dark'
);

export const vercelLightDiffTheme = toResolvedTheme(
  vercelLightRaw,
  DIFF_THEME_NAMES.VERCEL_LIGHT,
  'light'
);

withStableStringId(flexokiDarkDiffTheme, DIFF_THEME_NAMES.FLEXOKI_DARK);
withStableStringId(flexokiLightDiffTheme, DIFF_THEME_NAMES.FLEXOKI_LIGHT);
withStableStringId(vercelDarkDiffTheme, DIFF_THEME_NAMES.VERCEL_DARK);
withStableStringId(vercelLightDiffTheme, DIFF_THEME_NAMES.VERCEL_LIGHT);

export const diffThemeNames = {
  flexokiDark: DIFF_THEME_NAMES.FLEXOKI_DARK,
  flexokiLight: DIFF_THEME_NAMES.FLEXOKI_LIGHT,
  vercelDark: DIFF_THEME_NAMES.VERCEL_DARK,
  vercelLight: DIFF_THEME_NAMES.VERCEL_LIGHT,
} as const;

export const streamdownThemes = [
  vercelLightDiffTheme,
  vercelDarkDiffTheme,
] as const;

export const allDiffThemes = [
  vercelLightDiffTheme,
  vercelDarkDiffTheme,
  flexokiLightDiffTheme,
  flexokiDarkDiffTheme,
] as const;

export interface DiffThemeOption {
  id: string;
  name: string;
  variant: 'light' | 'dark';
}

export const diffThemeOptions: DiffThemeOption[] = [
  { id: 'vercel-light', name: 'Vercel Light', variant: 'light' },
  { id: 'vercel-dark', name: 'Vercel Dark', variant: 'dark' },
  { id: 'flexoki-light', name: 'Flexoki Light', variant: 'light' },
  { id: 'flexoki-dark', name: 'Flexoki Dark', variant: 'dark' },
];

export function getDiffThemeForUITheme(
  uiThemeId: string | undefined,
  isDark: boolean
): string {
  const isVercelFamily = uiThemeId?.startsWith('vercel-');
  const isFlexokiFamily = uiThemeId?.startsWith('flexoki-');

  if (isFlexokiFamily) {
    return isDark ? diffThemeNames.flexokiDark : diffThemeNames.flexokiLight;
  }

  if (isVercelFamily) {
    return isDark ? diffThemeNames.vercelDark : diffThemeNames.vercelLight;
  }

  return isDark ? diffThemeNames.vercelDark : diffThemeNames.vercelLight;
}

export function getDiffThemeByName(
  themeName: DiffThemeName
): ShikiThemeRegistrationResolvedLike {
  switch (themeName) {
    case DIFF_THEME_NAMES.VERCEL_DARK:
      return vercelDarkDiffTheme;
    case DIFF_THEME_NAMES.VERCEL_LIGHT:
      return vercelLightDiffTheme;
    case DIFF_THEME_NAMES.FLEXOKI_DARK:
      return flexokiDarkDiffTheme;
    case DIFF_THEME_NAMES.FLEXOKI_LIGHT:
      return flexokiLightDiffTheme;
    default:
      return vercelDarkDiffTheme;
  }
}
