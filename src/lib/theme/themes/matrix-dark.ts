import type { Theme } from '@/types/theme';

/**
 * Matrix Dark Theme
 * A green-on-black theme inspired by the Matrix movie (same as light variant)
 */
export const matrixDarkTheme: Theme = {
  metadata: {
    id: 'matrix-dark',
    name: 'Matrix Dark',
    description: 'Dark variant of the Matrix theme with green on black',
    author: 'OpenCode Team',
    version: '1.0.0',
    variant: 'dark',
    tags: ['dark', 'matrix', 'green', 'black']
  },

  colors: {
    // Core semantic colors
    primary: {
      base: '#00ff00',
      hover: '#10ff10',
      active: '#20ff20',
      foreground: '#000000',
      muted: '#00ff0080',
      emphasis: '#00ee00'
    },

    surface: {
      background: '#000000',
      foreground: '#00ff00',
      muted: '#001100',
      mutedForeground: '#00aa00',
      elevated: '#001100',
      elevatedForeground: '#00ff00',
      overlay: '#00000080',
      subtle: '#001100'
    },

    interactive: {
      border: '#002200',
      borderHover: '#003300',
      borderFocus: '#00ff00',
      selection: '#00ff0030',
      selectionForeground: '#00ff00',
      focus: '#00ff00',
      focusRing: '#00ff0050',
      cursor: '#00ff00',
      hover: '#001100',
      active: '#002200'
    },

    status: {
      error: '#ff0000',
      errorForeground: '#ffffff',
      errorBackground: '#ff000020',
      errorBorder: '#ff000050',

      warning: '#ffff00',
      warningForeground: '#000000',
      warningBackground: '#ffff0020',
      warningBorder: '#ffff0050',

      success: '#00ff00',
      successForeground: '#000000',
      successBackground: '#00ff0020',
      successBorder: '#00ff0050',

      info: '#00ff00',
      infoForeground: '#000000',
      infoBackground: '#00ff0020',
      infoBorder: '#00ff0050'
    },

    // Syntax highlighting
    syntax: {
      base: {
        background: '#001100',
        foreground: '#00ff00',
        comment: '#008000',
        keyword: '#00ff00',
        string: '#00ff00',
        number: '#00ff00',
        function: '#00ff00',
        variable: '#00ff00',
        type: '#00ff00',
        operator: '#00ff00'
      },

      tokens: {
        commentDoc: '#00a000',
        stringEscape: '#00ee00',
        keywordImport: '#10ff10',
        functionCall: '#10ff10',
        variableProperty: '#10ff10',
        className: '#10ff10',
        punctuation: '#00ff00',
        tag: '#00ff00',
        tagAttribute: '#00ff00',
        tagAttributeValue: '#00ff00'
      },

      highlights: {
        diffAdded: '#00ff00',
        diffAddedBackground: '#00ff0015',
        diffRemoved: '#ff0000',
        diffRemovedBackground: '#ff000015',
        diffModified: '#00ff00',
        diffModifiedBackground: '#00ff0015',
        lineNumber: '#002200',
        lineNumberActive: '#00aa00'
      }
    },

    // Component-specific colors
    markdown: {
      heading1: '#00ff00',
      heading2: '#00ff00dd',
      heading3: '#00ff00bb',
      heading4: '#00ff00',
      link: '#00ff00',
      linkHover: '#10ff10',
      inlineCode: '#00ff00',
      inlineCodeBackground: '#00110020',
      blockquote: '#00aa00',
      blockquoteBorder: '#002200',
      listMarker: '#00ff0099'
    },

    chat: {
      userMessage: '#00ff00',
      userMessageBackground: '#001100',
      assistantMessage: '#00ff00',
      assistantMessageBackground: '#001100',
      timestamp: '#00aa00',
      divider: '#002200'
    },

    tools: {
      background: '#00110030',
      border: '#00220050',
      headerHover: '#00110050',
      icon: '#00aa00',
      title: '#00ff00',
      description: '#00bb00',

      edit: {
        added: '#00ff00',
        addedBackground: '#00ff0015',
        removed: '#ff0000',
        removedBackground: '#ff000015',
        lineNumber: '#002200'
      }
    }
  },

  config: {
    fonts: {
      sans: '"IBM Plex Mono", monospace',
      mono: '"IBM Plex Mono", monospace',
      heading: '"IBM Plex Mono", monospace'
    },

    radius: {
      none: '0',
      sm: '0.125rem',
      md: '0.375rem',
      lg: '0.5rem',
      xl: '0.75rem',
      full: '9999px'
    },

    transitions: {
      fast: '150ms ease',
      normal: '250ms ease',
      slow: '350ms ease'
    }
  }
};