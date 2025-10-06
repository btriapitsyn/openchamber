import type { Theme } from '@/types/theme';

/**
 * Everforest Light Theme
 * A nature-inspired theme with green and brown accents
 */
export const everforestLightTheme: Theme = {
  metadata: {
    id: 'everforest-light',
    name: 'Everforest Light',
    description: 'Light variant of the Everforest theme with nature-inspired colors',
    author: 'OpenCode Team',
    version: '1.0.0',
    variant: 'light',
    tags: ['light', 'nature', 'green', 'brown']
  },

  colors: {
    // Core semantic colors
    primary: {
      base: '#a7c080',
      hover: '#b3cc8c',
      active: '#bfd798',
      foreground: '#233118',
      muted: '#a7c08080',
      emphasis: '#97b070'
    },

    surface: {
      background: '#f1efe2',
      foreground: '#3f4a43',
      muted: '#e7e2d1',
      mutedForeground: '#6f7b72',
      elevated: '#ffffff',
      elevatedForeground: '#3f4a43',
      overlay: '#00000020',
      subtle: '#dfd9c9'
    },

    interactive: {
      border: '#d4cdb8',
      borderHover: '#c8c1ad',
      borderFocus: '#a7c080',
      selection: '#a7c08030',
      selectionForeground: '#3f4a43',
      focus: '#a7c080',
      focusRing: '#a7c08040',
      cursor: '#7aa05d',
      hover: '#ebe3ce',
      active: '#e1d9c5'
    },

    status: {
      error: '#e67e80',
      errorForeground: '#411c1d',
      errorBackground: '#fbe7e7',
      errorBorder: '#f3b7b6',

      warning: '#ebc06d',
      warningForeground: '#423000',
      warningBackground: '#fcefde',
      warningBorder: '#efd3a1',

      success: '#a7c080',
      successForeground: '#1f3310',
      successBackground: '#edf4e2',
      successBorder: '#cbdcb4',

      info: '#7fbbb3',
      infoForeground: '#123433',
      infoBackground: '#e2f2f1',
      infoBorder: '#badcd6'
    },

    // Syntax highlighting
    syntax: {
      base: {
        background: '#f1efe2',
        foreground: '#3f4a43',
        comment: '#8b9487',
        keyword: '#d35d5c',
        string: '#8fb573',
        number: '#d29d7d',
        function: '#70a897',
        variable: '#e3a84e',
        type: '#7fbbb3',
        operator: '#d35d5c'
      },

      tokens: {
        commentDoc: '#98a69a',
        stringEscape: '#a7c97a',
        keywordImport: '#dd7a70',
        functionCall: '#7ab6aa',
        variableProperty: '#eab867',
        className: '#679eb7',
        punctuation: '#3f4a43',
        tag: '#d35d5c',
        tagAttribute: '#a7c080',
        tagAttributeValue: '#8fb573'
      },

      highlights: {
        diffAdded: '#a7c080',
        diffAddedBackground: '#a7c08018',
        diffRemoved: '#e67e80',
        diffRemovedBackground: '#e67e8018',
        diffModified: '#7fbbb3',
        diffModifiedBackground: '#7fbbb318',
        lineNumber: '#cac3af',
        lineNumberActive: '#6f7b72'
      }
    },

    // Component-specific colors
    markdown: {
      heading1: '#a7c080',
      heading2: '#a7c080dd',
      heading3: '#a7c080bb',
      heading4: '#3f4a43',
      link: '#f57d26',
      linkHover: '#f68e56',
      inlineCode: '#d29d7d',
      inlineCodeBackground: '#e7e2d1',
      blockquote: '#6f7b72',
      blockquoteBorder: '#d4cdb8',
      listMarker: '#a7c08099'
    },

    chat: {
      userMessage: '#3f4a43',
      userMessageBackground: '#e7e2d1',
      assistantMessage: '#3f4a43',
      assistantMessageBackground: '#f1efe2',
      timestamp: '#6f7b72',
      divider: '#d4cdb8'
    },

    tools: {
      background: '#e7e2d150',
      border: '#d4cdb880',
      headerHover: '#e1d9c5',
      icon: '#6f7b72',
      title: '#3f4a43',
      description: '#778276',

      edit: {
        added: '#a7c080',
        addedBackground: '#a7c08018',
        removed: '#e67e80',
        removedBackground: '#e67e8018',
        lineNumber: '#cac3af'
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
