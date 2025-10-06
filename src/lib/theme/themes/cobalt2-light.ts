import type { Theme } from '@/types/theme';

/**
 * Cobalt2 Light Theme
 * A vibrant theme with yellow and blue accents
 */
export const cobalt2LightTheme: Theme = {
  metadata: {
    id: 'cobalt2-light',
    name: 'Cobalt2 Light',
    description: 'Light variant of the Cobalt2 theme with vibrant colors',
    author: 'OpenCode Team',
    version: '1.0.0',
    variant: 'light',
    tags: ['light', 'vibrant', 'yellow', 'blue']
  },

  colors: {
    // Core semantic colors
    primary: {
      base: '#ffc600',
      hover: '#ffd120',
      active: '#ffe040',
      foreground: '#1f1400',
      muted: '#ffc60080',
      emphasis: '#efb600'
    },

    surface: {
      background: '#f6f8ff',
      foreground: '#10263b',
      muted: '#e9f0ff',
      mutedForeground: '#4c6078',
      elevated: '#ffffff',
      elevatedForeground: '#10263b',
      overlay: '#00000020',
      subtle: '#dfe8ff'
    },

    interactive: {
      border: '#cbd7f0',
      borderHover: '#c0cce9',
      borderFocus: '#ffc600',
      selection: '#ffc60030',
      selectionForeground: '#10263b',
      focus: '#ffc600',
      focusRing: '#ffc60040',
      cursor: '#ff9d00',
      hover: '#ecf1ff',
      active: '#dfe6ff'
    },

    status: {
      error: '#ff628c',
      errorForeground: '#2a0010',
      errorBackground: '#ffe6ef',
      errorBorder: '#f7b5c8',

      warning: '#ff9d00',
      warningForeground: '#3d2a00',
      warningBackground: '#fff2de',
      warningBorder: '#ffdc96',

      success: '#3ad900',
      successForeground: '#013200',
      successBackground: '#e6fadf',
      successBorder: '#a4ed8f',

      info: '#0088ff',
      infoForeground: '#002545',
      infoBackground: '#e3f1ff',
      infoBorder: '#a9d5ff'
    },

    // Syntax highlighting
    syntax: {
      base: {
        background: '#f6f8ff',
        foreground: '#10263b',
        comment: '#5a7ca0',
        keyword: '#ff9d00',
        string: '#3ad900',
        number: '#ff628c',
        function: '#ffc600',
        variable: '#1f7ae0',
        type: '#0088ff',
        operator: '#ff9d00'
      },

      tokens: {
        commentDoc: '#6f90b2',
        stringEscape: '#2ac900',
        keywordImport: '#ffad10',
        functionCall: '#ffd120',
        variableProperty: '#2f7ce5',
        className: '#40a0ff',
        punctuation: '#10263b',
        tag: '#ff9d00',
        tagAttribute: '#ffc600',
        tagAttributeValue: '#3ad900'
      },

      highlights: {
        diffAdded: '#3ad900',
        diffAddedBackground: '#3ad90018',
        diffRemoved: '#ff628c',
        diffRemovedBackground: '#ff628c18',
        diffModified: '#ffc600',
        diffModifiedBackground: '#ffc6001a',
        lineNumber: '#c0cce9',
        lineNumberActive: '#4c6078'
      }
    },

    // Component-specific colors
    markdown: {
      heading1: '#ffc600',
      heading2: '#ffc600dd',
      heading3: '#ffc600bb',
      heading4: '#10263b',
      link: '#ff9d00',
      linkHover: '#ffad10',
      inlineCode: '#3ad900',
      inlineCodeBackground: '#e9f0ff',
      blockquote: '#4c6078',
      blockquoteBorder: '#cbd7f0',
      listMarker: '#ffc60099'
    },

    chat: {
      userMessage: '#10263b',
      userMessageBackground: '#e9f0ff',
      assistantMessage: '#10263b',
      assistantMessageBackground: '#f6f8ff',
      timestamp: '#4c6078',
      divider: '#cbd7f0'
    },

    tools: {
      background: '#e9f0ff50',
      border: '#cbd7f080',
      headerHover: '#dfe6ff',
      icon: '#4c6078',
      title: '#10263b',
      description: '#53657c',

      edit: {
        added: '#3ad900',
        addedBackground: '#3ad90018',
        removed: '#ff628c',
        removedBackground: '#ff628c18',
        lineNumber: '#c0cce9'
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
