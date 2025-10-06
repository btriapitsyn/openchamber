import type { Theme } from '@/types/theme';

/**
 * OpenCode Dark Theme
 * The official OpenCode theme with golden accents (same as light variant)
 */
export const opencodeDarkTheme: Theme = {
  metadata: {
    id: 'opencode-dark',
    name: 'OpenCode Dark',
    description: 'Dark variant of the official OpenCode theme',
    author: 'OpenCode Team',
    version: '1.0.0',
    variant: 'dark',
    tags: ['dark', 'official', 'golden', 'warm']
  },

  colors: {
    // Core semantic colors
    primary: {
      base: '#edb449',
      hover: '#f0c459',
      active: '#f3d569',
      foreground: '#151313',
      muted: '#edb44980',
      emphasis: '#dd a439'
    },

    surface: {
      background: '#151313',
      foreground: '#cdccc3',
      muted: '#1d1b19',
      mutedForeground: '#9d9c93',
      elevated: '#1d1b19',
      elevatedForeground: '#cdccc3',
      overlay: '#00000080',
      subtle: '#1d1b19'
    },

    interactive: {
      border: '#2d2b29',
      borderHover: '#3d3b39',
      borderFocus: '#edb449',
      selection: '#edb44930',
      selectionForeground: '#cdccc3',
      focus: '#edb449',
      focusRing: '#edb44950',
      cursor: '#edb449',
      hover: '#2d2b29',
      active: '#3d3b39'
    },

    status: {
      error: '#e06c75',
      errorForeground: '#ffffff',
      errorBackground: '#e06c7520',
      errorBorder: '#e06c7550',

      warning: '#e5c07b',
      warningForeground: '#000000',
      warningBackground: '#e5c07b20',
      warningBorder: '#e5c07b50',

      success: '#98c379',
      successForeground: '#000000',
      successBackground: '#98c37920',
      successBorder: '#98c37950',

      info: '#61afef',
      infoForeground: '#ffffff',
      infoBackground: '#61afef20',
      infoBorder: '#61afef50'
    },

    // Syntax highlighting
    syntax: {
      base: {
        background: '#1d1b19',
        foreground: '#cdccc3',
        comment: '#7d7c75',
        keyword: '#c678dd',
        string: '#98c379',
        number: '#d19a66',
        function: '#61afef',
        variable: '#e06c75',
        type: '#56b6c2',
        operator: '#abb2bf'
      },

      tokens: {
        commentDoc: '#8d8c85',
        stringEscape: '#a8d389',
        keywordImport: '#d688ed',
        functionCall: '#71bfef',
        variableProperty: '#f07c85',
        className: '#66c6d2',
        punctuation: '#cdccc3',
        tag: '#c678dd',
        tagAttribute: '#edb449',
        tagAttributeValue: '#98c379'
      },

      highlights: {
        diffAdded: '#98c379',
        diffAddedBackground: '#98c37915',
        diffRemoved: '#e06c75',
        diffRemovedBackground: '#e06c7515',
        diffModified: '#edb449',
        diffModifiedBackground: '#edb44915',
        lineNumber: '#2d2b29',
        lineNumberActive: '#9d9c93'
      }
    },

    // Component-specific colors
    markdown: {
      heading1: '#edb449',
      heading2: '#edb449dd',
      heading3: '#edb449bb',
      heading4: '#cdccc3',
      link: '#61afef',
      linkHover: '#71bfef',
      inlineCode: '#98c379',
      inlineCodeBackground: '#1d1b1920',
      blockquote: '#9d9c93',
      blockquoteBorder: '#2d2b29',
      listMarker: '#edb44999'
    },

    chat: {
      userMessage: '#cdccc3',
      userMessageBackground: '#1d1b19',
      assistantMessage: '#cdccc3',
      assistantMessageBackground: '#2d2b29',
      timestamp: '#9d9c93',
      divider: '#2d2b29'
    },

    tools: {
      background: '#1d1b1930',
      border: '#2d2b2950',
      headerHover: '#2d2b2950',
      icon: '#9d9c93',
      title: '#cdccc3',
      description: '#adaca3',

      edit: {
        added: '#98c379',
        addedBackground: '#98c37915',
        removed: '#e06c75',
        removedBackground: '#e06c7515',
        lineNumber: '#2d2b29'
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