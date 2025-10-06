import type { Theme } from '@/types/theme';

/**
 * Solarized Dark Theme
 * A dark theme with cyan and yellow accents (same as light variant)
 */
export const solarizedDarkTheme: Theme = {
  metadata: {
    id: 'solarized-dark',
    name: 'Solarized Dark',
    description: 'Dark variant of the Solarized theme with cyan and yellow accents',
    author: 'OpenCode Team',
    version: '1.0.0',
    variant: 'dark',
    tags: ['dark', 'solarized', 'cyan', 'yellow']
  },

  colors: {
    // Core semantic colors
    primary: {
      base: '#2aa198',
      hover: '#3ab1a8',
      active: '#4ac1b8',
      foreground: '#ffffff',
      muted: '#2aa19880',
      emphasis: '#1a9188'
    },

    surface: {
      background: '#002b36',
      foreground: '#93a1a1',
      muted: '#073642',
      mutedForeground: '#839496',
      elevated: '#073642',
      elevatedForeground: '#93a1a1',
      overlay: '#00000080',
      subtle: '#073642'
    },

    interactive: {
      border: '#586e75',
      borderHover: '#657b83',
      borderFocus: '#2aa198',
      selection: '#2aa19830',
      selectionForeground: '#93a1a1',
      focus: '#2aa198',
      focusRing: '#2aa19850',
      cursor: '#2aa198',
      hover: '#073642',
      active: '#586e75'
    },

    status: {
      error: '#dc322f',
      errorForeground: '#ffffff',
      errorBackground: '#dc322f20',
      errorBorder: '#dc322f50',

      warning: '#b58900',
      warningForeground: '#000000',
      warningBackground: '#b5890020',
      warningBorder: '#b5890050',

      success: '#859900',
      successForeground: '#000000',
      successBackground: '#85990020',
      successBorder: '#85990050',

      info: '#2aa198',
      infoForeground: '#ffffff',
      infoBackground: '#2aa19820',
      infoBorder: '#2aa19850'
    },

    // Syntax highlighting
    syntax: {
      base: {
        background: '#073642',
        foreground: '#93a1a1',
        comment: '#586e75',
        keyword: '#859900',
        string: '#2aa198',
        number: '#d33682',
        function: '#268bd2',
        variable: '#b58900',
        type: '#b58900',
        operator: '#859900'
      },

      tokens: {
        commentDoc: '#657b83',
        stringEscape: '#3ab1a8',
        keywordImport: '#95a910',
        functionCall: '#369bd2',
        variableProperty: '#c59910',
        className: '#c59910',
        punctuation: '#93a1a1',
        tag: '#859900',
        tagAttribute: '#2aa198',
        tagAttributeValue: '#2aa198'
      },

      highlights: {
        diffAdded: '#859900',
        diffAddedBackground: '#85990015',
        diffRemoved: '#dc322f',
        diffRemovedBackground: '#dc322f15',
        diffModified: '#2aa198',
        diffModifiedBackground: '#2aa19815',
        lineNumber: '#586e75',
        lineNumberActive: '#839496'
      }
    },

    // Component-specific colors
    markdown: {
      heading1: '#2aa198',
      heading2: '#2aa198dd',
      heading3: '#2aa198bb',
      heading4: '#93a1a1',
      link: '#859900',
      linkHover: '#95a910',
      inlineCode: '#2aa198',
      inlineCodeBackground: '#07364220',
      blockquote: '#839496',
      blockquoteBorder: '#586e75',
      listMarker: '#2aa19899'
    },

    chat: {
      userMessage: '#93a1a1',
      userMessageBackground: '#073642',
      assistantMessage: '#93a1a1',
      assistantMessageBackground: '#073642',
      timestamp: '#839496',
      divider: '#586e75'
    },

    tools: {
      background: '#07364230',
      border: '#586e7550',
      headerHover: '#07364250',
      icon: '#839496',
      title: '#93a1a1',
      description: '#909a9c',

      edit: {
        added: '#859900',
        addedBackground: '#85990015',
        removed: '#dc322f',
        removedBackground: '#dc322f15',
        lineNumber: '#586e75'
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