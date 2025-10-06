import type { Theme } from '@/types/theme';

/**
 * Gruvbox Dark Theme
 * A retro theme with warm colors
 */
export const gruvboxDarkTheme: Theme = {
  metadata: {
    id: 'gruvbox-dark',
    name: 'Gruvbox Dark',
    description: 'Dark variant of the Gruvbox theme with warm colors',
    author: 'OpenCode Team',
    version: '1.0.0',
    variant: 'dark',
    tags: ['dark', 'retro', 'warm', 'yellow']
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
      background: '#282828',
      foreground: '#ebdbb2',
      muted: '#32302f',
      mutedForeground: '#bdae93',
      elevated: '#32302f',
      elevatedForeground: '#ebdbb2',
      overlay: '#00000080',
      subtle: '#3c3836'
    },

    interactive: {
      border: '#504945',
      borderHover: '#605a56',
      borderFocus: '#fabd2f',
      selection: '#fabd2f30',
      selectionForeground: '#ebdbb2',
      focus: '#fabd2f',
      focusRing: '#fabd2f50',
      cursor: '#fabd2f',
      hover: '#3c3836',
      active: '#4c4442'
    },

    status: {
      error: '#fb4934',
      errorForeground: '#000000',
      errorBackground: '#fb493420',
      errorBorder: '#fb493450',

      warning: '#fabd2f',
      warningForeground: '#000000',
      warningBackground: '#fabd2f20',
      warningBorder: '#fabd2f50',

      success: '#b57614',
      successForeground: '#000000',
      successBackground: '#b5761420',
      successBorder: '#b5761450',

      info: '#83a598',
      infoForeground: '#000000',
      infoBackground: '#83a59820',
      infoBorder: '#83a59850'
    },

    // Syntax highlighting
    syntax: {
      base: {
        background: '#32302f',
        foreground: '#ebdbb2',
        comment: '#928374',
        keyword: '#fb4934',
        string: '#b57614',
        number: '#8f3f71',
        function: '#fabd2f',
        variable: '#83a598',
        type: '#8ec07c',
        operator: '#fb4934'
      },

      tokens: {
        commentDoc: '#a29384',
        stringEscape: '#c58624',
        keywordImport: '#ff5b44',
        functionCall: '#fccd3f',
        variableProperty: '#93b5a8',
        className: '#9ed08c',
        punctuation: '#ebdbb2',
        tag: '#fb4934',
        tagAttribute: '#fabd2f',
        tagAttributeValue: '#b57614'
      },

      highlights: {
        diffAdded: '#b57614',
        diffAddedBackground: '#b5761415',
        diffRemoved: '#fb4934',
        diffRemovedBackground: '#fb493415',
        diffModified: '#fabd2f',
        diffModifiedBackground: '#fabd2f15',
        lineNumber: '#605a56',
        lineNumberActive: '#bdae93'
      }
    },

    // Component-specific colors
    markdown: {
      heading1: '#fabd2f',
      heading2: '#fabd2fdd',
      heading3: '#fabd2fbb',
      heading4: '#ebdbb2',
      link: '#fb4934',
      linkHover: '#ff5b44',
      inlineCode: '#b57614',
      inlineCodeBackground: '#3c383620',
      blockquote: '#bdae93',
      blockquoteBorder: '#504945',
      listMarker: '#fabd2f99'
    },

    chat: {
      userMessage: '#ebdbb2',
      userMessageBackground: '#32302f',
      assistantMessage: '#ebdbb2',
      assistantMessageBackground: '#3c3836',
      timestamp: '#bdae93',
      divider: '#504945'
    },

    tools: {
      background: '#32302f30',
      border: '#50494550',
      headerHover: '#3c383650',
      icon: '#bdae93',
      title: '#ebdbb2',
      description: '#c5be9f',

      edit: {
        added: '#b57614',
        addedBackground: '#b5761415',
        removed: '#fb4934',
        removedBackground: '#fb493415',
        lineNumber: '#605a56'
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