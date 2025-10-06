import type { Theme } from '@/types/theme';

/**
 * Material Dark Theme
 * Google's Material Design dark theme with blue accents
 */
export const materialDarkTheme: Theme = {
  metadata: {
    id: 'material-dark',
    name: 'Material Dark',
    description: 'Dark variant of Google Material Design theme',
    author: 'OpenCode Team',
    version: '1.0.0',
    variant: 'dark',
    tags: ['dark', 'material', 'google', 'blue']
  },

  colors: {
    // Core semantic colors
    primary: {
      base: '#64b5f6',
      hover: '#74c5f6',
      active: '#84d5f6',
      foreground: '#000000',
      muted: '#64b5f680',
      emphasis: '#54a5e6'
    },

    surface: {
      background: '#263238',
      foreground: '#eeffff',
      muted: '#37474f',
      mutedForeground: '#b0bec5',
      elevated: '#37474f',
      elevatedForeground: '#eeffff',
      overlay: '#00000080',
      subtle: '#455a64'
    },

    interactive: {
      border: '#455a64',
      borderHover: '#556b74',
      borderFocus: '#64b5f6',
      selection: '#64b5f630',
      selectionForeground: '#eeffff',
      focus: '#64b5f6',
      focusRing: '#64b5f650',
      cursor: '#64b5f6',
      hover: '#37474f',
      active: '#455a64'
    },

    status: {
      error: '#ef5350',
      errorForeground: '#000000',
      errorBackground: '#ef535020',
      errorBorder: '#ef535050',

      warning: '#ffb74d',
      warningForeground: '#000000',
      warningBackground: '#ffb74d20',
      warningBorder: '#ffb74d50',

      success: '#81c784',
      successForeground: '#000000',
      successBackground: '#81c78420',
      successBorder: '#81c78450',

      info: '#64b5f6',
      infoForeground: '#000000',
      infoBackground: '#64b5f620',
      infoBorder: '#64b5f650'
    },

    // Syntax highlighting
    syntax: {
      base: {
        background: '#37474f',
        foreground: '#eeffff',
        comment: '#546e7a',
        keyword: '#ba68c8',
        string: '#81c784',
        number: '#ffb74d',
        function: '#64b5f6',
        variable: '#ff8a65',
        type: '#90a4ae',
        operator: '#ba68c8'
      },

      tokens: {
        commentDoc: '#647e8a',
        stringEscape: '#91d794',
        keywordImport: '#ca78d8',
        functionCall: '#74c5f6',
        variableProperty: '#ff9a75',
        className: '#a0b4be',
        punctuation: '#eeffff',
        tag: '#ba68c8',
        tagAttribute: '#64b5f6',
        tagAttributeValue: '#81c784'
      },

      highlights: {
        diffAdded: '#81c784',
        diffAddedBackground: '#81c78415',
        diffRemoved: '#ef5350',
        diffRemovedBackground: '#ef535015',
        diffModified: '#64b5f6',
        diffModifiedBackground: '#64b5f615',
        lineNumber: '#556b74',
        lineNumberActive: '#b0bec5'
      }
    },

    // Component-specific colors
    markdown: {
      heading1: '#64b5f6',
      heading2: '#64b5f6dd',
      heading3: '#64b5f6bb',
      heading4: '#eeffff',
      link: '#64b5f6',
      linkHover: '#74c5f6',
      inlineCode: '#81c784',
      inlineCodeBackground: '#455a6420',
      blockquote: '#b0bec5',
      blockquoteBorder: '#455a64',
      listMarker: '#64b5f699'
    },

    chat: {
      userMessage: '#eeffff',
      userMessageBackground: '#37474f',
      assistantMessage: '#eeffff',
      assistantMessageBackground: '#455a64',
      timestamp: '#b0bec5',
      divider: '#455a64'
    },

    tools: {
      background: '#37474f30',
      border: '#455a6450',
      headerHover: '#455a6450',
      icon: '#b0bec5',
      title: '#eeffff',
      description: '#c0ce d5',

      edit: {
        added: '#81c784',
        addedBackground: '#81c78415',
        removed: '#ef5350',
        removedBackground: '#ef535015',
        lineNumber: '#556b74'
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
