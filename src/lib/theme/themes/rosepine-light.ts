import type { Theme } from '@/types/theme';

/**
 * Rosepine Light Theme
 * A dawn-inspired palette with warm neutrals and soft accents
 */
export const rosepineLightTheme: Theme = {
  metadata: {
    id: 'rosepine-light',
    name: 'Rosepine Light',
    description: 'Light variant of the Rosepine theme with warm dawn colors',
    author: 'Fedaykin Dev',
    version: '1.0.0',
    variant: 'light',
    tags: ['light', 'soft', 'warm', 'purple']
  },

  colors: {
    // Core semantic colors
    primary: {
      base: '#b4637a',
      hover: '#c27388',
      active: '#d08296',
      foreground: '#ffffff',
      muted: '#b4637a80',
      emphasis: '#9f5269'
    },

    surface: {
      background: '#fffaf3',
      foreground: '#575279',
      muted: '#f5ede4',
      mutedForeground: '#7d6f8f',
      elevated: '#ffffff',
      elevatedForeground: '#575279',
      overlay: '#00000020',
      subtle: '#f1e3da'
    },

    interactive: {
      border: '#e6d9cf',
      borderHover: '#d8cbc1',
      borderFocus: '#b4637a',
      selection: '#b4637a20',
      selectionForeground: '#575279',
      focus: '#b4637a',
      focusRing: '#b4637a40',
      cursor: '#b4637a',
      hover: '#f5ede4',
      active: '#e9ddd2'
    },

    status: {
      error: '#d7827e',
      errorForeground: '#ffffff',
      errorBackground: '#fde7e6',
      errorBorder: '#ebb8b5',

      warning: '#ea9d34',
      warningForeground: '#2d2000',
      warningBackground: '#fff2da',
      warningBorder: '#f1c58a',

      success: '#56949f',
      successForeground: '#0f2f33',
      successBackground: '#e1f2f4',
      successBorder: '#a7d1d6',

      info: '#907aa9',
      infoForeground: '#3c2f4e',
      infoBackground: '#f4ecfa',
      infoBorder: '#d3c2e6'
    },

    // Syntax highlighting
    syntax: {
      base: {
        background: '#fffaf3',
        foreground: '#575279',
        comment: '#9892b0',
        keyword: '#907aa9',
        string: '#56949f',
        number: '#ea9d34',
        function: '#b4637a',
        variable: '#d7827e',
        type: '#286983',
        operator: '#9892b0'
      },

      tokens: {
        commentDoc: '#a29dbc',
        stringEscape: '#6baab2',
        keywordImport: '#a88fb9',
        functionCall: '#c0768a',
        variableProperty: '#df8e8f',
        className: '#907aa9',
        punctuation: '#575279',
        tag: '#907aa9',
        tagAttribute: '#b4637a',
        tagAttributeValue: '#56949f'
      },

      highlights: {
        diffAdded: '#56949f',
        diffAddedBackground: '#56949f18',
        diffRemoved: '#d7827e',
        diffRemovedBackground: '#d7827e18',
        diffModified: '#b4637a',
        diffModifiedBackground: '#b4637a18',
        lineNumber: '#ddcec4',
        lineNumberActive: '#7d6f8f'
      }
    },

    // Component-specific colors
    markdown: {
      heading1: '#b4637a',
      heading2: '#b4637add',
      heading3: '#b4637abb',
      heading4: '#575279',
      link: '#907aa9',
      linkHover: '#a88fb9',
      inlineCode: '#ea9d34',
      inlineCodeBackground: '#f1e3da',
      blockquote: '#7d6f8f',
      blockquoteBorder: '#e6d9cf',
      listMarker: '#b4637a99'
    },

    chat: {
      userMessage: '#575279',
      userMessageBackground: '#f5ede4',
      assistantMessage: '#575279',
      assistantMessageBackground: '#fffaf3',
      timestamp: '#7d6f8f',
      divider: '#e6d9cf'
    },

    tools: {
      background: '#f5ede450',
      border: '#e6d9cf80',
      headerHover: '#e9ddd2',
      icon: '#7d6f8f',
      title: '#575279',
      description: '#857897',

      edit: {
        added: '#56949f',
        addedBackground: '#56949f15',
        removed: '#d7827e',
        removedBackground: '#d7827e15',
        lineNumber: '#d8cbc1'
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
