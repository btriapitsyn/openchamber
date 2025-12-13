import type { Theme } from '@/types/theme';
import type { ThemeMode } from '@/types/theme';
import { flexokiDarkTheme, flexokiLightTheme } from '@/lib/theme/themes';

export type VSCodeThemeKind = 'light' | 'dark' | 'high-contrast';

export type VSCodeThemeColorToken =
  | 'editor.background'
  | 'editor.foreground'
  | 'editor.selectionBackground'
  | 'editor.selectionForeground'
  | 'editor.lineHighlightBackground'
  | 'editorCursor.foreground'
  | 'focusBorder'
  | 'sideBar.background'
  | 'sideBar.foreground'
  | 'panel.background'
  | 'panel.foreground'
  | 'panel.border'
  | 'input.background'
  | 'input.foreground'
  | 'input.border'
  | 'button.background'
  | 'button.foreground'
  | 'button.hoverBackground'
  | 'textLink.foreground'
  | 'descriptionForeground'
  | 'terminal.ansiRed'
  | 'terminal.ansiGreen'
  | 'terminal.ansiBlue'
  | 'terminal.ansiYellow'
  | 'terminal.ansiCyan'
  | 'editorError.foreground'
  | 'editorError.background'
  | 'editorWarning.foreground'
  | 'editorWarning.background'
  | 'editorInfo.foreground'
  | 'editorInfo.background'
  | 'testing.iconPassed'
  | 'badge.background'
  | 'badge.foreground'
  | 'statusBar.background'
  | 'statusBar.foreground'
  | 'list.hoverBackground'
  | 'list.activeSelectionBackground'
  | 'textPreformat.foreground'
  | 'textPreformat.background';

export type VSCodeThemePalette = {
  kind: VSCodeThemeKind;
  colors: Partial<Record<VSCodeThemeColorToken, string>>;
  mode?: ThemeMode;
};

export type VSCodeThemePayload = {
  theme: Theme;
  palette: VSCodeThemePalette;
};

const VARIABLE_MAP: Record<VSCodeThemeColorToken, string> = {
  'editor.background': '--vscode-editor-background',
  'editor.foreground': '--vscode-editor-foreground',
  'editor.selectionBackground': '--vscode-editor-selectionBackground',
  'editor.selectionForeground': '--vscode-editor-selectionForeground',
  'editor.lineHighlightBackground': '--vscode-editor-lineHighlightBackground',
  'editorCursor.foreground': '--vscode-editorCursor-foreground',
  focusBorder: '--vscode-focusBorder',
  'sideBar.background': '--vscode-sideBar-background',
  'sideBar.foreground': '--vscode-sideBar-foreground',
  'panel.background': '--vscode-panel-background',
  'panel.foreground': '--vscode-panel-foreground',
  'panel.border': '--vscode-panel-border',
  'input.background': '--vscode-input-background',
  'input.foreground': '--vscode-input-foreground',
  'input.border': '--vscode-input-border',
  'button.background': '--vscode-button-background',
  'button.foreground': '--vscode-button-foreground',
  'button.hoverBackground': '--vscode-button-hoverBackground',
  'textLink.foreground': '--vscode-textLink-foreground',
  descriptionForeground: '--vscode-descriptionForeground',
  'terminal.ansiRed': '--vscode-terminal-ansiRed',
  'terminal.ansiGreen': '--vscode-terminal-ansiGreen',
  'terminal.ansiBlue': '--vscode-terminal-ansiBlue',
  'terminal.ansiYellow': '--vscode-terminal-ansiYellow',
  'terminal.ansiCyan': '--vscode-terminal-ansiCyan',
  'editorError.foreground': '--vscode-editorError-foreground',
  'editorError.background': '--vscode-editorError-background',
  'editorWarning.foreground': '--vscode-editorWarning-foreground',
  'editorWarning.background': '--vscode-editorWarning-background',
  'editorInfo.foreground': '--vscode-editorInfo-foreground',
  'editorInfo.background': '--vscode-editorInfo-background',
  'testing.iconPassed': '--vscode-testing-iconPassed',
  'badge.background': '--vscode-badge-background',
  'badge.foreground': '--vscode-badge-foreground',
  'statusBar.background': '--vscode-statusBar-background',
  'statusBar.foreground': '--vscode-statusBar-foreground',
  'list.hoverBackground': '--vscode-list-hoverBackground',
  'list.activeSelectionBackground': '--vscode-list-activeSelectionBackground',
  'textPreformat.foreground': '--vscode-textPreformat-foreground',
  'textPreformat.background': '--vscode-textPreformat-background',
};

const normalizeColor = (value?: string | null): string | undefined => {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed;
};

const readKind = (preferred?: VSCodeThemeKind): VSCodeThemeKind => {
  if (preferred === 'light' || preferred === 'dark' || preferred === 'high-contrast') {
    return preferred;
  }

  if (typeof window !== 'undefined') {
    const prefersLight = typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-color-scheme: light)').matches;
    return prefersLight ? 'light' : 'dark';
  }

  return 'dark';
};

export const readVSCodeThemePalette = (
  preferredKind?: VSCodeThemeKind,
  preferredMode?: ThemeMode,
): VSCodeThemePalette | null => {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return null;
  }

  const styles = getComputedStyle(document.documentElement);
  const colors: Partial<Record<VSCodeThemeColorToken, string>> = {};

  (Object.keys(VARIABLE_MAP) as VSCodeThemeColorToken[]).forEach((token) => {
    const cssVar = VARIABLE_MAP[token];
    const value = normalizeColor(styles.getPropertyValue(cssVar));
    if (value) {
      colors[token] = value;
    }
  });

  return {
    kind: readKind(preferredKind),
    colors,
    mode: preferredMode,
  };
};

export const buildVSCodeThemeFromPalette = (palette: VSCodeThemePalette): Theme => {
  const base = palette.kind === 'light' ? flexokiLightTheme : flexokiDarkTheme;
  const read = (token: VSCodeThemeColorToken, fallback: string): string =>
    palette.colors[token] ?? fallback;

  const sidebarBg = read('sideBar.background', base.colors.surface.background);
  const sidebarFg = read('sideBar.foreground', read('descriptionForeground', base.colors.surface.mutedForeground));
  const panelBg = read('panel.background', read('editor.background', base.colors.surface.elevated));
  const panelFg = read('panel.foreground', read('editor.foreground', base.colors.surface.foreground));
  const background = sidebarBg;
  const foreground = read('editor.foreground', base.colors.surface.foreground);
  const accent = read('textLink.foreground', read('button.background', base.colors.primary.base));
  const accentFg = read('button.foreground', base.colors.primary.foreground || base.colors.surface.background);
  const hoverBg = read('list.hoverBackground', read('editor.selectionBackground', base.colors.interactive.hover));
  const activeBg = read('list.activeSelectionBackground', hoverBg);
  const selection = read('editor.selectionBackground', activeBg);
  const selectionFg = read('editor.selectionForeground', foreground);
  const focus = read('focusBorder', selection);
  const border = read('input.border', read('panel.border', base.colors.interactive.border));
  const cursor = read('editorCursor.foreground', base.colors.interactive.cursor);
  const badgeBg = read('badge.background', accent);
  const badgeFg = read('badge.foreground', foreground);

  const inlineCode = read('textPreformat.foreground', read('terminal.ansiGreen', base.colors.syntax.base.string));
  // Tailwind's `--accent` drives hovered/selected menu items in Radix/shadcn; prefer VS Code list hover/selection.
  const subtle = hoverBg;

  return {
    ...base,
    metadata: {
      ...base.metadata,
      id: 'vscode-auto',
      name: 'VS Code Theme',
      description: 'Mirrors your current VS Code color theme',
      author: 'VS Code',
      version: '1.0.0',
      variant: palette.kind === 'light' ? 'light' : 'dark',
      tags: ['vscode', 'auto'],
    },
    colors: {
      ...base.colors,
      primary: {
        base: accent,
        hover: read('button.hoverBackground', accent),
        active: read('button.hoverBackground', accent),
        foreground: accentFg,
        muted: read('textLink.foreground', accent),
        emphasis: accent,
      },
      surface: {
        ...base.colors.surface,
        background,
        foreground,
        muted: panelBg,
        mutedForeground: sidebarFg,
        elevated: panelBg,
        elevatedForeground: panelFg,
        overlay: read('statusBar.background', base.colors.surface.overlay),
        subtle,
      },
      interactive: {
        ...base.colors.interactive,
        border,
        borderHover: border,
        borderFocus: focus,
        selection,
        selectionForeground: selectionFg,
        focus,
        focusRing: focus,
        cursor,
        hover: hoverBg,
        active: activeBg,
      },
      status: {
        ...base.colors.status,
        error: read('editorError.foreground', base.colors.status.error),
        errorForeground: read('editorError.foreground', base.colors.status.errorForeground),
        errorBackground: read('editorError.background', base.colors.status.errorBackground),
        errorBorder: read('editorError.foreground', base.colors.status.errorBorder),
        warning: read('editorWarning.foreground', base.colors.status.warning),
        warningForeground: read('editorWarning.foreground', base.colors.status.warningForeground),
        warningBackground: read('editorWarning.background', base.colors.status.warningBackground),
        warningBorder: read('editorWarning.foreground', base.colors.status.warningBorder),
        success: read('testing.iconPassed', base.colors.status.success),
        successForeground: read('testing.iconPassed', base.colors.status.successForeground),
        successBackground: read('testing.iconPassed', base.colors.status.successBackground),
        successBorder: read('testing.iconPassed', base.colors.status.successBorder),
        info: read('editorInfo.foreground', base.colors.status.info),
        infoForeground: read('editorInfo.foreground', base.colors.status.infoForeground),
        infoBackground: read('editorInfo.background', base.colors.status.infoBackground),
        infoBorder: read('editorInfo.foreground', base.colors.status.infoBorder),
      },
      syntax: {
        ...base.colors.syntax,
        base: {
          ...base.colors.syntax.base,
          background,
          foreground,
          comment: read('editor.lineHighlightBackground', base.colors.syntax.base.comment),
          keyword: accent,
          string: inlineCode,
          number: read('terminal.ansiYellow', base.colors.syntax.base.number),
          function: read('terminal.ansiBlue', base.colors.syntax.base.function),
          variable: read('terminal.ansiCyan', base.colors.syntax.base.variable),
          type: read('terminal.ansiCyan', base.colors.syntax.base.type),
          operator: accent,
        },
      },
      badges: {
        ...(base.colors.badges || {}),
        default: {
          bg: badgeBg,
          fg: badgeFg,
          border: border,
        },
      },
    },
  };
};
