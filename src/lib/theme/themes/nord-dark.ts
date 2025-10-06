import type { Theme } from '@/types/theme';

/**
 * Nord Dark Theme
 * A cool arctic theme with blue and green accents (same as light variant)
 */
export const nordDarkTheme: Theme = {
  metadata: {
    id: 'nord-dark',
    name: 'Nord Dark',
    description: 'Dark variant of the Nord theme with arctic colors',
    author: 'OpenCode Team',
    version: '1.0.0',
    variant: 'dark',
    tags: ['dark', 'arctic', 'blue', 'green']
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
      background: '#2e3440',
      foreground: '#d8dee9',
      muted: '#363c48',
      mutedForeground: '#a0a9b8',
      elevated: '#363c48',
      elevatedForeground: '#d8dee9',
      overlay: '#00000080',
      subtle: '#363c48'
    },

    interactive: {
      border: '#4c566a',
      borderHover: '#5c6e7a',
      borderFocus: '#5e81ac',
      selection: '#5e81ac30',
      selectionForeground: '#d8dee9',
      focus: '#5e81ac',
      focusRing: '#5e81ac50',
      cursor: '#5e81ac',
      hover: '#464e5a',
      active: '#56666a'
    },

    status: {
      error: '#bf616a',
      errorForeground: '#ffffff',
      errorBackground: '#bf616a20',
      errorBorder: '#bf616a50',

      warning: '#ebcb8b',
      warningForeground: '#000000',
      warningBackground: '#ebcb8b20',
      warningBorder: '#ebcb8b50',

      success: '#a3be8c',
      successForeground: '#000000',
      successBackground: '#a3be8c20',
      successBorder: '#a3be8c50',

      info: '#5e81ac',
      infoForeground: '#ffffff',
      infoBackground: '#5e81ac20',
      infoBorder: '#5e81ac50'
    },

    // Syntax highlighting
    syntax: {
      base: {
        background: '#363c48',
        foreground: '#d8dee9',
        comment: '#616e88',
        keyword: '#81a1c1',
        string: '#a3be8c',
        number: '#b48ead',
        function: '#88c0d0',
        variable: '#8fbcbb',
        type: '#8fbcbb',
        operator: '#81a1c1'
      },

      tokens: {
        commentDoc: '#717e98',
        stringEscape: '#b3ce9c',
        keywordImport: '#91b1d1',
        functionCall: '#98d0e0',
        variableProperty: '#9fccc b',
        className: '#9fccc b',
        punctuation: '#d8dee9',
        tag: '#81a1c1',
        tagAttribute: '#5e81ac',
        tagAttributeValue: '#a3be8c'
      },

      highlights: {
        diffAdded: '#a3be8c',
        diffAddedBackground: '#a3be8c15',
        diffRemoved: '#bf616a',
        diffRemovedBackground: '#bf616a15',
        diffModified: '#5e81ac',
        diffModifiedBackground: '#5e81ac15',
        lineNumber: '#4c566a',
        lineNumberActive: '#a0a9b8'
      }
    },

    // Component-specific colors
    markdown: {
      heading1: '#5e81ac',
      heading2: '#5e81acdd',
      heading3: '#5e81acbb',
      heading4: '#d8dee9',
      link: '#81a1c1',
      linkHover: '#91b1d1',
      inlineCode: '#a3be8c',
      inlineCodeBackground: '#363c4820',
      blockquote: '#a0a9b8',
      blockquoteBorder: '#4c566a',
      listMarker: '#5e81ac99'
    },

    chat: {
      userMessage: '#d8dee9',
      userMessageBackground: '#363c48',
      assistantMessage: '#d8dee9',
      assistantMessageBackground: '#464e5a',
      timestamp: '#a0a9b8',
      divider: '#4c566a'
    },

    tools: {
      background: '#363c4830',
      border: '#4c566a50',
      headerHover: '#464e5a50',
      icon: '#a0a9b8',
      title: '#d8dee9',
      description: '#b0b9c8',

      edit: {
        added: '#a3be8c',
        addedBackground: '#a3be8c15',
        removed: '#bf616a',
        removedBackground: '#bf616a15',
        lineNumber: '#4c566a'
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