import type { Theme } from '@/types/theme';

/**
 * Nord Light Theme
 * A cool arctic theme with blue and green accents
 */
export const nordLightTheme: Theme = {
  metadata: {
    id: 'nord-light',
    name: 'Nord Light',
    description: 'Light variant of the Nord theme with arctic colors',
    author: 'OpenCode Team',
    version: '1.0.0',
    variant: 'light',
    tags: ['light', 'arctic', 'blue', 'green']
  },

  colors: {
    // Core semantic colors
    primary: {
      base: '#5e81ac',
      hover: '#6e91bc',
      active: '#7ea1cc',
      foreground: '#ffffff',
      muted: '#5e81ac80',
      emphasis: '#4e71ac'
    },

    surface: {
      background: '#eceff4',
      foreground: '#2e3440',
      muted: '#e5e9f0',
      mutedForeground: '#4c566a',
      elevated: '#ffffff',
      elevatedForeground: '#2e3440',
      overlay: '#00000020',
      subtle: '#dce2ed'
    },

    interactive: {
      border: '#d8dee9',
      borderHover: '#ccd3dd',
      borderFocus: '#5e81ac',
      selection: '#5e81ac30',
      selectionForeground: '#2e3440',
      focus: '#5e81ac',
      focusRing: '#5e81ac40',
      cursor: '#5e81ac',
      hover: '#e5e9f0',
      active: '#dce2ed'
    },

    status: {
      error: '#bf616a',
      errorForeground: '#ffffff',
      errorBackground: '#f7e4e6',
      errorBorder: '#e3b5ba',

      warning: '#ebcb8b',
      warningForeground: '#3a2f00',
      warningBackground: '#fdf4e2',
      warningBorder: '#ead3a5',

      success: '#a3be8c',
      successForeground: '#1f2a17',
      successBackground: '#e8f1e3',
      successBorder: '#cdddc1',

      info: '#5e81ac',
      infoForeground: '#1f2a3a',
      infoBackground: '#e3ecf7',
      infoBorder: '#c7d5e6'
    },

    // Syntax highlighting
    syntax: {
      base: {
        background: '#eceff4',
        foreground: '#2e3440',
        comment: '#4c566a',
        keyword: '#5e81ac',
        string: '#a3be8c',
        number: '#b48ead',
        function: '#88c0d0',
        variable: '#8fbcbb',
        type: '#81a1c1',
        operator: '#5e81ac'
      },

      tokens: {
        commentDoc: '#5a6477',
        stringEscape: '#91ad7c',
        keywordImport: '#6e90b4',
        functionCall: '#74bcd0',
        variableProperty: '#7faeb4',
        className: '#88c0d0',
        punctuation: '#2e3440',
        tag: '#5e81ac',
        tagAttribute: '#81a1c1',
        tagAttributeValue: '#a3be8c'
      },

      highlights: {
        diffAdded: '#a3be8c',
        diffAddedBackground: '#a3be8c18',
        diffRemoved: '#bf616a',
        diffRemovedBackground: '#bf616a18',
        diffModified: '#5e81ac',
        diffModifiedBackground: '#5e81ac18',
        lineNumber: '#d2d8e1',
        lineNumberActive: '#4c566a'
      }
    },

    // Component-specific colors
    markdown: {
      heading1: '#5e81ac',
      heading2: '#5e81acdd',
      heading3: '#5e81acbb',
      heading4: '#2e3440',
      link: '#81a1c1',
      linkHover: '#6e90b4',
      inlineCode: '#a3be8c',
      inlineCodeBackground: '#dce2ed',
      blockquote: '#4c566a',
      blockquoteBorder: '#d8dee9',
      listMarker: '#5e81ac99'
    },

    chat: {
      userMessage: '#2e3440',
      userMessageBackground: '#e5e9f0',
      assistantMessage: '#2e3440',
      assistantMessageBackground: '#eceff4',
      timestamp: '#4c566a',
      divider: '#d8dee9'
    },

    tools: {
      background: '#e5e9f050',
      border: '#d8dee980',
      headerHover: '#dce2ed',
      icon: '#4c566a',
      title: '#2e3440',
      description: '#566170',

      edit: {
        added: '#a3be8c',
        addedBackground: '#a3be8c15',
        removed: '#bf616a',
        removedBackground: '#bf616a15',
        lineNumber: '#ccd3dd'
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
