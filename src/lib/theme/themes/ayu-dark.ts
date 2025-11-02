import type { Theme } from '@/types/theme';

/**
 * Ayu Dark Theme
 * A clean theme with blue and orange accents (same as light variant)
 */
export const ayuDarkTheme: Theme = {
  metadata: {
    id: 'ayu-dark',
    name: 'Ayu Dark',
    description: 'Dark variant of the Ayu theme with clean colors',
    author: 'Fedaykin Dev',
    version: '1.0.0',
    variant: 'dark',
    tags: ['dark', 'clean', 'blue', 'orange']
  },

  colors: {
    // Core semantic colors
    primary: {
      base: '#59C2FF',
      hover: '#69D2FF',
      active: '#79E2FF',
      foreground: '#000000',
      muted: '#59C2FF80',
      emphasis: '#49B2EF'
    },

    surface: {
      background: '#0B0E14',
      foreground: '#BFBDB6',
      muted: '#11141A',
      mutedForeground: '#8B8D92',
      elevated: '#11141A',
      elevatedForeground: '#BFBDB6',
      overlay: '#00000080',
      subtle: '#11141A'
    },

    interactive: {
      border: '#2D2F35',
      borderHover: '#3D3F45',
      borderFocus: '#59C2FF',
      selection: '#59C2FF30',
      selectionForeground: '#BFBDB6',
      focus: '#59C2FF',
      focusRing: '#59C2FF50',
      cursor: '#59C2FF',
      hover: '#1D1F25',
      active: '#2D2F35'
    },

    status: {
      error: '#F07178',
      errorForeground: '#000000',
      errorBackground: '#F0717820',
      errorBorder: '#F0717850',

      warning: '#FFA759',
      warningForeground: '#000000',
      warningBackground: '#FFA75920',
      warningBorder: '#FFA75950',

      success: '#AAD94C',
      successForeground: '#000000',
      successBackground: '#AAD94C20',
      successBorder: '#AAD94C50',

      info: '#39BAE6',
      infoForeground: '#000000',
      infoBackground: '#39BAE620',
      infoBorder: '#39BAE650'
    },

    // Syntax highlighting
    syntax: {
      base: {
        background: '#11141A',
        foreground: '#BFBDB6',
        comment: '#ABB0B6',
        keyword: '#FFA759',
        string: '#AAD94C',
        number: '#D2A6FF',
        function: '#59C2FF',
        variable: '#D2A6FF',
        type: '#39BAE6',
        operator: '#F07178'
      },

      tokens: {
        commentDoc: '#BBBCC2',
        stringEscape: '#9AC93C',
        keywordImport: '#FFB769',
        functionCall: '#69D2FF',
        variableProperty: '#E2B6FF',
        className: '#49CAEF',
        punctuation: '#BFBDB6',
        tag: '#FFA759',
        tagAttribute: '#59C2FF',
        tagAttributeValue: '#AAD94C'
      },

      highlights: {
        diffAdded: '#AAD94C',
        diffAddedBackground: '#AAD94C15',
        diffRemoved: '#F07178',
        diffRemovedBackground: '#F0717815',
        diffModified: '#59C2FF',
        diffModifiedBackground: '#59C2FF15',
        lineNumber: '#2D2F35',
        lineNumberActive: '#8B8D92'
      }
    },

    // Component-specific colors
    markdown: {
      heading1: '#59C2FF',
      heading2: '#59C2FFdd',
      heading3: '#59C2FFbb',
      heading4: '#BFBDB6',
      link: '#FFA759',
      linkHover: '#FFB769',
      inlineCode: '#AAD94C',
      inlineCodeBackground: '#11141A20',
      blockquote: '#8B8D92',
      blockquoteBorder: '#2D2F35',
      listMarker: '#59C2FF99'
    },

    chat: {
      userMessage: '#BFBDB6',
      userMessageBackground: '#11141A',
      assistantMessage: '#BFBDB6',
      assistantMessageBackground: '#1D1F25',
      timestamp: '#8B8D92',
      divider: '#2D2F35'
    },

    tools: {
      background: '#11141A30',
      border: '#2D2F3550',
      headerHover: '#1D1F2550',
      icon: '#8B8D92',
      title: '#BFBDB6',
      description: '#9B9DA2',

      edit: {
        added: '#AAD94C',
        addedBackground: '#AAD94C15',
        removed: '#F07178',
        removedBackground: '#F0717815',
        lineNumber: '#2D2F35'
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
