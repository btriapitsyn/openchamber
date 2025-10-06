import type { Theme } from '@/types/theme';

/**
 * Solarized Light Theme
 * A light theme with cyan and yellow accents
 */
export const solarizedLightTheme: Theme = {
  metadata: {
    id: 'solarized-light',
    name: 'Solarized Light',
    description: 'Light variant of the Solarized theme with cyan and yellow accents',
    author: 'OpenCode Team',
    version: '1.0.0',
    variant: 'light',
    tags: ['light', 'solarized', 'cyan', 'yellow']
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
      background: '#fdf6e3',
      foreground: '#586e75',
      muted: '#f5f0e0',
      mutedForeground: '#708080',
      elevated: '#f5f0e0',
      elevatedForeground: '#586e75',
      overlay: '#00000020',
      subtle: '#f0ebe0'
    },

    interactive: {
      border: '#e8e0d5',
      borderHover: '#d8d0c5',
      borderFocus: '#2aa198',
      selection: '#2aa19830',
      selectionForeground: '#586e75',
      focus: '#2aa198',
      focusRing: '#2aa19850',
      cursor: '#2aa198',
      hover: '#f8f5f0',
      active: '#f0ebe0'
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
        background: '#f8f5f0',
        foreground: '#586e75',
        comment: '#93a1a1',
        keyword: '#859900',
        string: '#2aa198',
        number: '#d33682',
        function: '#268bd2',
        variable: '#b58900',
        type: '#b58900',
        operator: '#859900'
      },

      tokens: {
        commentDoc: '#a3b1a1',
        stringEscape: '#3ab1a8',
        keywordImport: '#95a910',
        functionCall: '#369bd2',
        variableProperty: '#c59910',
        className: '#c59910',
        punctuation: '#586e75',
        tag: '#859900',
        tagAttribute: '#2aa198',
        tagAttributeValue: '#2aa198'
      },

      highlights: {
        diffAdded: '#859900',
        diffAddedBackground: '#85990018',
        diffRemoved: '#dc322f',
        diffRemovedBackground: '#dc322f18',
        diffModified: '#2aa198',
        diffModifiedBackground: '#2aa19818',
        lineNumber: '#ddd5ca',
        lineNumberActive: '#708080'
      }
    },

    // Component-specific colors
    markdown: {
      heading1: '#2aa198',
      heading2: '#2aa198dd',
      heading3: '#2aa198bb',
      heading4: '#586e75',
      link: '#859900',
      linkHover: '#95a910',
      inlineCode: '#2aa198',
      inlineCodeBackground: '#f0ebe020',
      blockquote: '#708080',
      blockquoteBorder: '#e8e0d5',
      listMarker: '#2aa19899'
    },

    chat: {
      userMessage: '#586e75',
      userMessageBackground: '#f5f0e0',
      assistantMessage: '#586e75',
      assistantMessageBackground: '#f8f5f0',
      timestamp: '#708080',
      divider: '#e8e0d5'
    },

    tools: {
      background: '#f5f0e030',
      border: '#e8e0d550',
      headerHover: '#f8f5f050',
      icon: '#708080',
      title: '#586e75',
      description: '#808090',

      edit: {
        added: '#859900',
        addedBackground: '#85990015',
        removed: '#dc322f',
        removedBackground: '#dc322f15',
        lineNumber: '#d8d0c5'
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
