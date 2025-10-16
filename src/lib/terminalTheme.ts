import type { ITheme } from '@xterm/xterm';
import type { Theme } from '@/types/theme';

/**
 * Converts OpenChamber theme to xterm.js theme format
 * Maps syntax highlighting colors to ANSI terminal colors
 */
export function convertThemeToXterm(theme: Theme): ITheme {
  const { colors } = theme;
  const syntax = colors.syntax.base;

  return {
    // Core terminal colors
    background: syntax.background,
    foreground: syntax.foreground,
    cursor: colors.interactive.cursor,
    cursorAccent: syntax.background,

    // Selection colors
    selectionBackground: colors.interactive.selection,
    selectionForeground: colors.interactive.selectionForeground,
    selectionInactiveBackground: colors.interactive.selection + '50', // 50% opacity

    // Normal ANSI colors (0-7)
    black: colors.surface.muted,
    red: colors.status.error,
    green: colors.status.success,
    yellow: colors.status.warning,
    blue: syntax.function,
    magenta: syntax.keyword,
    cyan: syntax.type,
    white: syntax.foreground,

    // Bright ANSI colors (8-15)
    brightBlack: syntax.comment,
    brightRed: colors.status.error,
    brightGreen: colors.status.success,
    brightYellow: colors.status.warning,
    brightBlue: syntax.function,
    brightMagenta: syntax.keyword,
    brightCyan: syntax.type,
    brightWhite: colors.surface.elevatedForeground,
  };
}

/**
 * Gets xterm.js terminal options based on user preferences
 * Adds Powerline-compatible fallback fonts for better symbol support
 */
export function getTerminalOptions(
  fontFamily: string,
  fontSize: number,
  theme: ITheme
) {
  // Extend font family with Powerline-compatible fallbacks
  // SF Mono and Menlo on macOS have good Powerline symbol support
  const extendedFontFamily = `${fontFamily}, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace`;

  return {
    fontFamily: extendedFontFamily,
    fontSize,
    lineHeight: 1.2,
    cursorBlink: true,
    cursorStyle: 'block' as const,
    theme,
    allowTransparency: false,
    scrollback: 10000,
    minimumContrastRatio: 1,
    fastScrollModifier: 'shift' as const,
    fastScrollSensitivity: 5,
    scrollSensitivity: 3,
    macOptionIsMeta: true,
    macOptionClickForcesSelection: false,
    rightClickSelectsWord: true,
  };
}
