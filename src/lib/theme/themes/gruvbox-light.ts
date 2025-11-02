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
    author: 'Fedaykin Dev',
    version: '1.0.0',
    variant: 'light',
    tags: ['light', 'retro', 'warm', 'yellow']
  },

  colors: {
    // Core semantic colors
    primary: {
      base: '#f19603',
      hover: '#fccd3f',
      active: '#fedd4f',
      foreground: '#000000',
      muted: '#f1960380',
      emphasis: '#eaad1f'
    },

    surface: {
      background: '#faf5e0',
      foreground: '#3c3836',
      muted: '#f6f0dd',
      mutedForeground: '#665c54',
      elevated: '#f6f0dd',
      elevatedForeground: '#3c3836',
      overlay: '#00000020',
      subtle: '#eee0b7'
    },

    interactive: {
      border: '#e0d2a9',
      borderHover: '#d0c299',
      borderFocus: '#f19603',
      selection: '#f1960330',
      selectionForeground: '#3c3836',
      focus: '#f19603',
      focusRing: '#f1960350',
      cursor: '#f19603',
      hover: '#f8f0d8',
      active: '#f6f0dd'
    },

    status: {
      error: '#fb4934',
      errorForeground: '#ffffff',
      errorBackground: '#fb493420',
      errorBorder: '#fb493450',

      warning: '#f19603',
      warningForeground: '#000000',
      warningBackground: '#f1960320',
      warningBorder: '#f1960350',

      success: '#55a15a',
      successForeground: '#ffffff',
      successBackground: '#55a15a20',
      successBorder: '#55a15a50',

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
        string: '#55a15a',
        number: '#8f3f71',
        function: '#f19603',
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
        tagAttribute: '#f19603',
        tagAttributeValue: '#55a15a'
      },

      highlights: {
        diffAdded: '#55a15a',
        diffAddedBackground: '#55a15a18',
        diffRemoved: '#fb4934',
        diffRemovedBackground: '#fb493418',
        diffModified: '#f19603',
        diffModifiedBackground: '#f1960318',
        lineNumber: '#d5c9a7',
        lineNumberActive: '#665c54'
      }
    },

    // Component-specific colors
    markdown: {
      heading1: '#db8904',
      heading2: '#db8904dd',
      heading3: '#db8904bb',
      heading4: '#3c3836',
      link: '#fb4934',
      linkHover: '#ff5b44',
      inlineCode: '#55a15a',
      inlineCodeBackground: '#eee0b720',
      blockquote: '#665c54',
      blockquoteBorder: '#e0d2a9',
      listMarker: '#db890499'
    },

    chat: {
      userMessage: '#3c3836',
      userMessageBackground: '#f6f0dd',
      assistantMessage: '#3c3836',
      assistantMessageBackground: '#f8f0d8',
      timestamp: '#665c54',
      divider: '#e0d2a9'
    },

    tools: {
      background: '#f6f0dd30',
      border: '#e0d2a950',
      headerHover: '#f8f0d850',
      icon: '#665c54',
      title: '#3c3836',
      description: '#766e64',

      edit: {
        added: '#55a15a',
        addedBackground: '#55a15a15',
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
