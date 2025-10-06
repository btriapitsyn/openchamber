import type { Theme } from '@/types/theme';

/**
 * Ayu Light Theme
 * A clean theme with blue and orange accents
 */
export const ayuLightTheme: Theme = {
  metadata: {
    id: 'ayu-light',
    name: 'Ayu Light',
    description: 'Light variant of the Ayu theme with clean colors',
    author: 'OpenCode Team',
    version: '1.0.0',
    variant: 'light',
    tags: ['light', 'clean', 'blue', 'orange']
  },

  colors: {
    // Core semantic colors
    primary: {
      base: '#55c1ff',
      hover: '#65cbff',
      active: '#75d5ff',
      foreground: '#042f47',
      muted: '#55c1ff80',
      emphasis: '#3daef0'
    },

    surface: {
      background: '#fdfdfd',
      foreground: '#0f1419',
      muted: '#f1f4f7',
      mutedForeground: '#636c76',
      elevated: '#ffffff',
      elevatedForeground: '#0f1419',
      overlay: '#00000020',
      subtle: '#e4e8ed'
    },

    interactive: {
      border: '#d4d9df',
      borderHover: '#c7ccd2',
      borderFocus: '#55c1ff',
      selection: '#55c1ff30',
      selectionForeground: '#0f1419',
      focus: '#55c1ff',
      focusRing: '#55c1ff40',
      cursor: '#3ca2ff',
      hover: '#eef1f4',
      active: '#e2e7ec'
    },

    status: {
      error: '#f07178',
      errorForeground: '#ffffff',
      errorBackground: '#ffe9eb',
      errorBorder: '#f4b9be',

      warning: '#ffa759',
      warningForeground: '#3d2500',
      warningBackground: '#fff2e1',
      warningBorder: '#f5c793',

      success: '#86b300',
      successForeground: '#102100',
      successBackground: '#eef8dd',
      successBorder: '#cde896',

      info: '#55c1ff',
      infoForeground: '#042f47',
      infoBackground: '#e4f2ff',
      infoBorder: '#b8ddff'
    },

    // Syntax highlighting
    syntax: {
      base: {
        background: '#fdfdfd',
        foreground: '#0f1419',
        comment: '#abb0b6',
        keyword: '#fa8d3e',
        string: '#86b300',
        number: '#d95757',
        function: '#55c1ff',
        variable: '#f07178',
        type: '#3ba5d5',
        operator: '#fa8d3e'
      },

      tokens: {
        commentDoc: '#bbc0c6',
        stringEscape: '#75a500',
        keywordImport: '#fb9b50',
        functionCall: '#65cbff',
        variableProperty: '#ffb478',
        className: '#3ba5d5',
        punctuation: '#5c6773',
        tag: '#fa8d3e',
        tagAttribute: '#55c1ff',
        tagAttributeValue: '#86b300'
      },

      highlights: {
        diffAdded: '#86b300',
        diffAddedBackground: '#86b30018',
        diffRemoved: '#f07178',
        diffRemovedBackground: '#f0717818',
        diffModified: '#55c1ff',
        diffModifiedBackground: '#55c1ff18',
        lineNumber: '#c7ccd2',
        lineNumberActive: '#636c76'
      }
    },

    // Component-specific colors
    markdown: {
      heading1: '#55c1ff',
      heading2: '#55c1ffdd',
      heading3: '#55c1ffbb',
      heading4: '#0f1419',
      link: '#fa8d3e',
      linkHover: '#fb9b50',
      inlineCode: '#86b300',
      inlineCodeBackground: '#f1f4f7',
      blockquote: '#5c6773',
      blockquoteBorder: '#d4d9df',
      listMarker: '#55c1ff99'
    },

    chat: {
      userMessage: '#0f1419',
      userMessageBackground: '#f1f4f7',
      assistantMessage: '#0f1419',
      assistantMessageBackground: '#fdfdfd',
      timestamp: '#5c6773',
      divider: '#d4d9df'
    },

    tools: {
      background: '#f1f4f750',
      border: '#d4d9df80',
      headerHover: '#e2e7ec',
      icon: '#5c6773',
      title: '#0f1419',
      description: '#6b7580',

      edit: {
        added: '#86b300',
        addedBackground: '#86b30018',
        removed: '#f07178',
        removedBackground: '#f0717818',
        lineNumber: '#c7ccd2'
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
