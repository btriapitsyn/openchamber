import type { Theme } from '@/types/theme';

/**
 * Gruvbox Light Theme
 * A retro theme with warm colors
 */
export const gruvboxLightTheme: Theme = {
  metadata: {
    id: 'gruvbox-light',
    name: 'Gruvbox Light',
    description: 'Light variant of the Gruvbox theme with warm colors',
    author: 'OpenCode Team',
    version: '1.0.0',
    variant: 'light',
    tags: ['light', 'retro', 'warm', 'yellow']
  },

  colors: {
    // Core semantic colors
    primary: {
      base: '#fabd2f',
      hover: '#fccd3f',
      active: '#fedd4f',
      foreground: '#000000',
      muted: '#fabd2f80',
      emphasis: '#eaad1f'
    },

    surface: {
      background: '#fbf1c7',
      foreground: '#3c3836',
      muted: '#f2e5bc',
      mutedForeground: '#665c54',
      elevated: '#f2e5bc',
      elevatedForeground: '#3c3836',
      overlay: '#00000020',
      subtle: '#eee0b7'
    },

    interactive: {
      border: '#e0d2a9',
      borderHover: '#d0c299',
      borderFocus: '#fabd2f',
      selection: '#fabd2f30',
      selectionForeground: '#3c3836',
      focus: '#fabd2f',
      focusRing: '#fabd2f50',
      cursor: '#fabd2f',
      hover: '#f8f0d8',
      active: '#f2e5bc'
    },

    status: {
      error: '#fb4934',
      errorForeground: '#ffffff',
      errorBackground: '#fb493420',
      errorBorder: '#fb493450',

      warning: '#fabd2f',
      warningForeground: '#000000',
      warningBackground: '#fabd2f20',
      warningBorder: '#fabd2f50',

      success: '#b57614',
      successForeground: '#ffffff',
      successBackground: '#b5761420',
      successBorder: '#b5761450',

      info: '#076678',
      infoForeground: '#ffffff',
      infoBackground: '#07667820',
      infoBorder: '#07667850'
    },

    // Syntax highlighting
    syntax: {
      base: {
        background: '#f8f0d8',
        foreground: '#3c3836',
        comment: '#928374',
        keyword: '#fb4934',
        string: '#b57614',
        number: '#8f3f71',
        function: '#fabd2f',
        variable: '#076678',
        type: '#9d0006',
        operator: '#fb4934'
      },

      tokens: {
        commentDoc: '#a29384',
        stringEscape: '#c58624',
        keywordImport: '#ff5b44',
        functionCall: '#fccd3f',
        variableProperty: '#177688',
        className: '#ad1016',
        punctuation: '#3c3836',
        tag: '#fb4934',
        tagAttribute: '#fabd2f',
        tagAttributeValue: '#b57614'
      },

      highlights: {
        diffAdded: '#b57614',
        diffAddedBackground: '#b5761418',
        diffRemoved: '#fb4934',
        diffRemovedBackground: '#fb493418',
        diffModified: '#fabd2f',
        diffModifiedBackground: '#fabd2f18',
        lineNumber: '#d5c9a7',
        lineNumberActive: '#665c54'
      }
    },

    // Component-specific colors
    markdown: {
      heading1: '#fabd2f',
      heading2: '#fabd2fdd',
      heading3: '#fabd2fbb',
      heading4: '#3c3836',
      link: '#fb4934',
      linkHover: '#ff5b44',
      inlineCode: '#b57614',
      inlineCodeBackground: '#eee0b720',
      blockquote: '#665c54',
      blockquoteBorder: '#e0d2a9',
      listMarker: '#fabd2f99'
    },

    chat: {
      userMessage: '#3c3836',
      userMessageBackground: '#f2e5bc',
      assistantMessage: '#3c3836',
      assistantMessageBackground: '#f8f0d8',
      timestamp: '#665c54',
      divider: '#e0d2a9'
    },

    tools: {
      background: '#f2e5bc30',
      border: '#e0d2a950',
      headerHover: '#f8f0d850',
      icon: '#665c54',
      title: '#3c3836',
      description: '#766e64',

      edit: {
        added: '#b57614',
        addedBackground: '#b5761415',
        removed: '#fb4934',
        removedBackground: '#fb493415',
        lineNumber: '#d0c299'
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
