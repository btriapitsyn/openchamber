import type { Theme } from '@/types/theme';

/**
 * Dracula Dark Theme
 * A dark theme with purple and pink accents (same as light variant)
 */
export const draculaDarkTheme: Theme = {
  metadata: {
    id: 'dracula-dark',
    name: 'Dracula Dark',
    description: 'Dark variant of the Dracula theme with vibrant colors',
    author: 'OpenCode Team',
    version: '1.0.0',
    variant: 'dark',
    tags: ['dark', 'vibrant', 'purple', 'pink']
  },

  colors: {
    // Core semantic colors
    primary: {
      base: '#bd93f9',
      hover: '#cd93f9',
      active: '#dd93f9',
      foreground: '#000000',
      muted: '#bd93f980',
      emphasis: '#ad83e9'
    },

    surface: {
      background: '#282a36',
      foreground: '#f8f8f2',
      muted: '#30323e',
      mutedForeground: '#b0b2c4',
      elevated: '#30323e',
      elevatedForeground: '#f8f8f2',
      overlay: '#00000080',
      subtle: '#30323e'
    },

    interactive: {
      border: '#44475a',
      borderHover: '#545766',
      borderFocus: '#bd93f9',
      selection: '#bd93f930',
      selectionForeground: '#f8f8f2',
      focus: '#bd93f9',
      focusRing: '#bd93f950',
      cursor: '#bd93f9',
      hover: '#40424e',
      active: '#50525e'
    },

    status: {
      error: '#ff5555',
      errorForeground: '#000000',
      errorBackground: '#ff555520',
      errorBorder: '#ff555550',

      warning: '#ffb86c',
      warningForeground: '#000000',
      warningBackground: '#ffb86c20',
      warningBorder: '#ffb86c50',

      success: '#50fa7b',
      successForeground: '#000000',
      successBackground: '#50fa7b20',
      successBorder: '#50fa7b50',

      info: '#8be9fd',
      infoForeground: '#000000',
      infoBackground: '#8be9fd20',
      infoBorder: '#8be9fd50'
    },

    // Syntax highlighting
    syntax: {
      base: {
        background: '#30323e',
        foreground: '#f8f8f2',
        comment: '#6272a4',
        keyword: '#ff79c6',
        string: '#f1fa8c',
        number: '#bd93f9',
        function: '#50fa7b',
        variable: '#ffb86c',
        type: '#8be9fd',
        operator: '#ff79c6'
      },

      tokens: {
        commentDoc: '#727aa4',
        stringEscape: '#e1ea7c',
        keywordImport: '#ff89d6',
        functionCall: '#60fa8b',
        variableProperty: '#ffc87c',
        className: '#9be9fd',
        punctuation: '#f8f8f2',
        tag: '#ff79c6',
        tagAttribute: '#bd93f9',
        tagAttributeValue: '#f1fa8c'
      },

      highlights: {
        diffAdded: '#50fa7b',
        diffAddedBackground: '#50fa7b15',
        diffRemoved: '#ff5555',
        diffRemovedBackground: '#ff555515',
        diffModified: '#bd93f9',
        diffModifiedBackground: '#bd93f915',
        lineNumber: '#44475a',
        lineNumberActive: '#b0b2c4'
      }
    },

    // Component-specific colors
    markdown: {
      heading1: '#bd93f9',
      heading2: '#bd93f9dd',
      heading3: '#bd93f9bb',
      heading4: '#f8f8f2',
      link: '#ff79c6',
      linkHover: '#ff89d6',
      inlineCode: '#f1fa8c',
      inlineCodeBackground: '#30323e20',
      blockquote: '#b0b2c4',
      blockquoteBorder: '#44475a',
      listMarker: '#bd93f999'
    },

    chat: {
      userMessage: '#f8f8f2',
      userMessageBackground: '#30323e',
      assistantMessage: '#f8f8f2',
      assistantMessageBackground: '#40424e',
      timestamp: '#b0b2c4',
      divider: '#44475a'
    },

    tools: {
      background: '#30323e30',
      border: '#44475a50',
      headerHover: '#40424e50',
      icon: '#b0b2c4',
      title: '#f8f8f2',
      description: '#c0c2d4',

      edit: {
        added: '#50fa7b',
        addedBackground: '#50fa7b15',
        removed: '#ff5555',
        removedBackground: '#ff555515',
        lineNumber: '#44475a'
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