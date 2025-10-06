import type { Theme } from '@/types/theme';

/**
 * Dracula Light Theme
 * A dark theme with purple and pink accents
 */
export const draculaLightTheme: Theme = {
  metadata: {
    id: 'dracula-light',
    name: 'Dracula Light',
    description: 'Light variant of the Dracula theme with vibrant colors',
    author: 'OpenCode Team',
    version: '1.0.0',
    variant: 'light',
    tags: ['light', 'vibrant', 'purple', 'pink']
  },

  colors: {
    // Core semantic colors
    primary: {
      base: '#bd93f9',
      hover: '#caa1ff',
      active: '#d7adff',
      foreground: '#271a41',
      muted: '#bd93f980',
      emphasis: '#a97ff0'
    },

    surface: {
      background: '#f8f8fe',
      foreground: '#282a36',
      muted: '#eceffd',
      mutedForeground: '#606680',
      elevated: '#ffffff',
      elevatedForeground: '#282a36',
      overlay: '#00000020',
      subtle: '#e4e6f7'
    },

    interactive: {
      border: '#d5d7f0',
      borderHover: '#c8cae8',
      borderFocus: '#bd93f9',
      selection: '#bd93f930',
      selectionForeground: '#282a36',
      focus: '#bd93f9',
      focusRing: '#bd93f940',
      cursor: '#bd93f9',
      hover: '#f0f1fb',
      active: '#e4e6f7'
    },

    status: {
      error: '#ff5555',
      errorForeground: '#ffffff',
      errorBackground: '#ffe8ea',
      errorBorder: '#f5b4b8',

      warning: '#ffb86c',
      warningForeground: '#442a00',
      warningBackground: '#fff3e4',
      warningBorder: '#fbd2a8',

      success: '#50fa7b',
      successForeground: '#003a0e',
      successBackground: '#e4fce9',
      successBorder: '#b3f9c7',

      info: '#8be9fd',
      infoForeground: '#03303b',
      infoBackground: '#e5f9ff',
      infoBorder: '#bfeef8'
    },

    // Syntax highlighting
    syntax: {
      base: {
        background: '#f8f8fe',
        foreground: '#282a36',
        comment: '#7b82a9',
        keyword: '#ff79c6',
        string: '#50fa7b',
        number: '#bd93f9',
        function: '#ffb86c',
        variable: '#ffb86c',
        type: '#8be9fd',
        operator: '#ff79c6'
      },

      tokens: {
        commentDoc: '#8b90b3',
        stringEscape: '#6fea95',
        keywordImport: '#ff8fd2',
        functionCall: '#ffd1a0',
        variableProperty: '#ffc382',
        className: '#9be9fd',
        punctuation: '#4b4f66',
        tag: '#ff79c6',
        tagAttribute: '#bd93f9',
        tagAttributeValue: '#50fa7b'
      },

      highlights: {
        diffAdded: '#50fa7b',
        diffAddedBackground: '#50fa7b1a',
        diffRemoved: '#ff5555',
        diffRemovedBackground: '#ff55551a',
        diffModified: '#bd93f9',
        diffModifiedBackground: '#bd93f91a',
        lineNumber: '#d1d4ef',
        lineNumberActive: '#606680'
      }
    },

    // Component-specific colors
    markdown: {
      heading1: '#bd93f9',
      heading2: '#bd93f9dd',
      heading3: '#bd93f9bb',
      heading4: '#282a36',
      link: '#ff79c6',
      linkHover: '#ff8fd2',
      inlineCode: '#ffb86c',
      inlineCodeBackground: '#eceffd',
      blockquote: '#606680',
      blockquoteBorder: '#d5d7f0',
      listMarker: '#bd93f999'
    },

    chat: {
      userMessage: '#282a36',
      userMessageBackground: '#eceffd',
      assistantMessage: '#282a36',
      assistantMessageBackground: '#f8f8fe',
      timestamp: '#606680',
      divider: '#d5d7f0'
    },

    tools: {
      background: '#eceffd50',
      border: '#d5d7f080',
      headerHover: '#e4e6f7',
      icon: '#606680',
      title: '#282a36',
      description: '#6e748b',

      edit: {
        added: '#50fa7b',
        addedBackground: '#50fa7b15',
        removed: '#ff5555',
        removedBackground: '#ff555515',
        lineNumber: '#ccd0eb'
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
