import type { Theme } from '@/types/theme';

/**
 * Matrix Light Theme
 * A green-on-black theme inspired by the Matrix movie
 */
export const matrixLightTheme: Theme = {
  metadata: {
    id: 'matrix-light',
    name: 'Matrix Light',
    description: 'Light variant of the Matrix theme with green on black',
    author: 'OpenCode Team',
    version: '1.0.0',
    variant: 'light',
    tags: ['light', 'matrix', 'green', 'black']
  },

  colors: {
    // Core semantic colors
    primary: {
      base: '#00c853',
      hover: '#00d95f',
      active: '#00ea69',
      foreground: '#012a0d',
      muted: '#00c85380',
      emphasis: '#00b44a'
    },

    surface: {
      background: '#f5fff7',
      foreground: '#042a04',
      muted: '#ebf9ed',
      mutedForeground: '#3a7f3a',
      elevated: '#ffffff',
      elevatedForeground: '#042a04',
      overlay: '#00000020',
      subtle: '#dff2e1'
    },

    interactive: {
      border: '#c5e7cc',
      borderHover: '#b6dbbe',
      borderFocus: '#00c853',
      selection: '#00c85330',
      selectionForeground: '#042a04',
      focus: '#00c853',
      focusRing: '#00c85340',
      cursor: '#00963d',
      hover: '#edf8f0',
      active: '#dff2e1'
    },

    status: {
      error: '#d23c3c',
      errorForeground: '#ffffff',
      errorBackground: '#ffe5e5',
      errorBorder: '#f4b3b3',

      warning: '#d7b000',
      warningForeground: '#1f1500',
      warningBackground: '#fff6d9',
      warningBorder: '#f0d681',

      success: '#00c853',
      successForeground: '#012a0d',
      successBackground: '#e0f8e8',
      successBorder: '#a7e6bb',

      info: '#00b4b4',
      infoForeground: '#012024',
      infoBackground: '#e0f8f8',
      infoBorder: '#a5e1e1'
    },

    // Syntax highlighting
    syntax: {
      base: {
        background: '#f5fff7',
        foreground: '#042a04',
        comment: '#4c8c4c',
        keyword: '#00963d',
        string: '#007a2f',
        number: '#00aa4f',
        function: '#00c853',
        variable: '#00963d',
        type: '#00b4b4',
        operator: '#00963d'
      },

      tokens: {
        commentDoc: '#5c9b5c',
        stringEscape: '#009c45',
        keywordImport: '#00aa56',
        functionCall: '#00d95f',
        variableProperty: '#00c853',
        className: '#00b4b4',
        punctuation: '#042a04',
        tag: '#00963d',
        tagAttribute: '#00c853',
        tagAttributeValue: '#007a2f'
      },

      highlights: {
        diffAdded: '#00c853',
        diffAddedBackground: '#00c85318',
        diffRemoved: '#d23c3c',
        diffRemovedBackground: '#d23c3c18',
        diffModified: '#00b4b4',
        diffModifiedBackground: '#00b4b418',
        lineNumber: '#c6e6ce',
        lineNumberActive: '#3a7f3a'
      }
    },

    // Component-specific colors
    markdown: {
      heading1: '#00c853',
      heading2: '#00c853dd',
      heading3: '#00c853bb',
      heading4: '#042a04',
      link: '#00963d',
      linkHover: '#00aa4f',
      inlineCode: '#007a2f',
      inlineCodeBackground: '#dff2e1',
      blockquote: '#3a7f3a',
      blockquoteBorder: '#c5e7cc',
      listMarker: '#00c85399'
    },

    chat: {
      userMessage: '#042a04',
      userMessageBackground: '#ebf9ed',
      assistantMessage: '#042a04',
      assistantMessageBackground: '#f5fff7',
      timestamp: '#3a7f3a',
      divider: '#c5e7cc'
    },

    tools: {
      background: '#ebf9ed50',
      border: '#c5e7cc80',
      headerHover: '#dff2e1',
      icon: '#3a7f3a',
      title: '#042a04',
      description: '#447c44',

      edit: {
        added: '#00c853',
        addedBackground: '#00c85315',
        removed: '#d23c3c',
        removedBackground: '#d23c3c15',
        lineNumber: '#c0dfc5'
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
