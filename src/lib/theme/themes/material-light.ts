import type { Theme } from '@/types/theme';

/**
 * Material Light Theme
 * Google's Material Design light theme with blue accents
 */
export const materialLightTheme: Theme = {
  metadata: {
    id: 'material-light',
    name: 'Material Light',
    description: 'Light variant of Google Material Design theme',
    author: 'OpenCode Team',
    version: '1.0.0',
    variant: 'light',
    tags: ['light', 'material', 'google', 'blue']
  },

  colors: {
    // Core semantic colors
    primary: {
      base: '#2196f3',
      hover: '#3196f3',
      active: '#4196f3',
      foreground: '#ffffff',
      muted: '#2196f380',
      emphasis: '#1186e3'
    },

    surface: {
      background: '#fafafa',
      foreground: '#212121',
      muted: '#f5f5f5',
      mutedForeground: '#616161',
      elevated: '#f5f5f5',
      elevatedForeground: '#212121',
      overlay: '#00000020',
      subtle: '#f0f0f0'
    },

    interactive: {
      border: '#e0e0e0',
      borderHover: '#d0d0d0',
      borderFocus: '#2196f3',
      selection: '#2196f330',
      selectionForeground: '#212121',
      focus: '#2196f3',
      focusRing: '#2196f350',
      cursor: '#2196f3',
      hover: '#f8f8f8',
      active: '#f0f0f0'
    },

    status: {
      error: '#f44336',
      errorForeground: '#ffffff',
      errorBackground: '#f4433620',
      errorBorder: '#f4433650',

      warning: '#ff9800',
      warningForeground: '#000000',
      warningBackground: '#ff980020',
      warningBorder: '#ff980050',

      success: '#4caf50',
      successForeground: '#ffffff',
      successBackground: '#4caf5020',
      successBorder: '#4caf5050',

      info: '#2196f3',
      infoForeground: '#ffffff',
      infoBackground: '#2196f320',
      infoBorder: '#2196f350'
    },

    // Syntax highlighting
    syntax: {
      base: {
        background: '#f8f8f8',
        foreground: '#212121',
        comment: '#546e7a',
        keyword: '#9c27b0',
        string: '#4caf50',
        number: '#ff9800',
        function: '#2196f3',
        variable: '#ff5722',
        type: '#607d8b',
        operator: '#9c27b0'
      },

      tokens: {
        commentDoc: '#647e8a',
        stringEscape: '#5cbf60',
        keywordImport: '#ac37c0',
        functionCall: '#31a6f3',
        variableProperty: '#ff6732',
        className: '#708d9b',
        punctuation: '#212121',
        tag: '#9c27b0',
        tagAttribute: '#2196f3',
        tagAttributeValue: '#4caf50'
      },

      highlights: {
        diffAdded: '#4caf50',
        diffAddedBackground: '#4caf5018',
        diffRemoved: '#f44336',
        diffRemovedBackground: '#f4433618',
        diffModified: '#2196f3',
        diffModifiedBackground: '#2196f318',
        lineNumber: '#d4d4d4',
        lineNumberActive: '#616161'
      }
    },

    // Component-specific colors
    markdown: {
      heading1: '#2196f3',
      heading2: '#2196f3dd',
      heading3: '#2196f3bb',
      heading4: '#212121',
      link: '#2196f3',
      linkHover: '#3196f3',
      inlineCode: '#4caf50',
      inlineCodeBackground: '#f0f0f020',
      blockquote: '#616161',
      blockquoteBorder: '#e0e0e0',
      listMarker: '#2196f399'
    },

    chat: {
      userMessage: '#212121',
      userMessageBackground: '#f5f5f5',
      assistantMessage: '#212121',
      assistantMessageBackground: '#f8f8f8',
      timestamp: '#616161',
      divider: '#e0e0e0'
    },

    tools: {
      background: '#f5f5f530',
      border: '#e0e0e050',
      headerHover: '#f8f8f850',
      icon: '#616161',
      title: '#212121',
      description: '#717171',

      edit: {
        added: '#4caf50',
        addedBackground: '#4caf5015',
        removed: '#f44336',
        removedBackground: '#f4433615',
        lineNumber: '#d0d0d0'
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
