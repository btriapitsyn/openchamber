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
    author: 'Fedaykin Dev',
    version: '1.0.0',
    variant: 'dark',
    tags: ['dark', 'retro', 'warm', 'yellow']
  },

  colors: {
    // Core semantic colors
    primary: {
      base: '#d6b353',
      hover: '#fccd3f',
      active: '#fedd4f',
      foreground: '#000000',
      muted: '#d6b35380',
      emphasis: '#ddaf54'
    },

    surface: {
      background: '#171a1b',
      foreground: '#e7dbbd',
      muted: '#101213',
      mutedForeground: '#bdae93',
      elevated: '#101213',
      elevatedForeground: '#e7dbbd',
      overlay: '#00000080',
      subtle: '#2e3234'
    },

    interactive: {
      border: '#434647',
      borderHover: '#605a56',
      borderFocus: '#d6b353',
      selection: '#d6b35330',
      selectionForeground: '#e7dbbd',
      focus: '#d6b353',
      focusRing: '#d6b35350',
      cursor: '#d6b353',
      hover: '#2e3234',
      active: '#4c4442'
    },

    status: {
      error: '#cc3833',
      errorForeground: '#000000',
      errorBackground: '#cc383320',
      errorBorder: '#cc383350',

      warning: '#d6b353',
      warningForeground: '#000000',
      warningBackground: '#d6b35320',
      warningBorder: '#d6b35350',

      success: '#55a15a',
      successForeground: '#000000',
      successBackground: '#55a15a20',
      successBorder: '#55a15a50',

      info: '#008e96',
      infoForeground: '#000000',
      infoBackground: '#008e9620',
      infoBorder: '#008e9650'
    },

    // Syntax highlighting
    syntax: {
      base: {
        background: '#101213',
        foreground: '#e7dbbd',
        comment: '#928374',
        keyword: '#cc3833',
        string: '#55a15a',
        number: '#8f3f71',
        function: '#d6b353',
        variable: '#008e96',
        type: '#8ec07c',
        operator: '#cc3833'
      },

      tokens: {
        commentDoc: '#a29384',
        stringEscape: '#c58624',
        keywordImport: '#ff5b44',
        functionCall: '#fccd3f',
        variableProperty: '#93b5a8',
        className: '#9ed08c',
        punctuation: '#e7dbbd',
        tag: '#cc3833',
        tagAttribute: '#d6b353',
        tagAttributeValue: '#55a15a'
      },

      highlights: {
        diffAdded: '#55a15a',
        diffAddedBackground: '#55a15a15',
        diffRemoved: '#cc3833',
        diffRemovedBackground: '#cc383315',
        diffModified: '#d6b353',
        diffModifiedBackground: '#d6b35315',
        lineNumber: '#605a56',
        lineNumberActive: '#bdae93'
      }
    },

    // Component-specific colors
    markdown: {
      heading1: '#d6b353',
      heading2: '#d6b353dd',
      heading3: '#d6b353bb',
      heading4: '#e7dbbd',
      link: '#cc3833',
      linkHover: '#ff5b44',
      inlineCode: '#55a15a',
      inlineCodeBackground: '#2e323420',
      blockquote: '#bdae93',
      blockquoteBorder: '#434647',
      listMarker: '#d6b35399'
    },

    chat: {
      userMessage: '#e7dbbd',
      userMessageBackground: '#101213',
      assistantMessage: '#e7dbbd',
      assistantMessageBackground: '#2e3234',
      timestamp: '#bdae93',
      divider: '#434647'
    },

    tools: {
      background: '#10121330',
      border: '#43464750',
      headerHover: '#2e323450',
      icon: '#bdae93',
      title: '#e7dbbd',
      description: '#c5be9f',

      edit: {
        added: '#55a15a',
        addedBackground: '#55a15a15',
        removed: '#cc3833',
        removedBackground: '#cc383315',
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
