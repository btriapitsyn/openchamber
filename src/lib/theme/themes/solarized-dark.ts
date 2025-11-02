import type { Theme } from '@/types/theme';

/**
 * Solarized Dark Theme
 * A dark theme with cyan and yellow accents (same as light variant)
 */
export const solarizedDarkTheme: Theme = {
  metadata: {
    id: 'solarized-dark',
    name: 'Solarized Dark',
    description: 'Dark variant of the Solarized theme with cyan and yellow accents',
    author: 'Fedaykin Dev',
    version: '1.0.0',
    variant: 'dark',
    tags: ['dark', 'solarized', 'cyan', 'yellow']
  },

  colors: {
    // Core semantic colors
    primary: {
      base: '#39858d',
      hover: '#4ab1de',
      active: '#4ac1b8',
      foreground: '#ffffff',
      muted: '#498ca980',
      emphasis: '#1a9188'
    },

    surface: {
      background: '#00151A',
      foreground: '#93a1a1',
      muted: '#021015',
      mutedForeground: '#839496',
      elevated: '#021015',
      elevatedForeground: '#93a1a1',
      overlay: '#00000080',
      subtle: '#062f3e'
    },

    interactive: {
      border: '#1B3743',
      borderHover: '#657b83',
      borderFocus: '#498ca9',
      selection: '#498ca930',
      selectionForeground: '#93a1a1',
      focus: '#51a2c4',
      focusRing: '#498ca950',
      cursor: '#55a6c9',
      hover: '#021015',
      active: '#1B3743'
    },

    status: {
      error: '#CC5555',
      errorForeground: '#ffffff',
      errorBackground: '#CC555520',
      errorBorder: '#CC555550',

      warning: '#CCAD31',
      warningForeground: '#000000',
      warningBackground: '#CCAD3120',
      warningBorder: '#CCAD3150',

      success: '#4A9A4A',
      successForeground: '#000000',
      successBackground: '#4A9A4A20',
      successBorder: '#4A9A4A50',

      info: '#498ca9',
      infoForeground: '#ffffff',
      infoBackground: '#498ca920',
      infoBorder: '#498ca950'
    },

    // Syntax highlighting
    syntax: {
      base: {
        background: '#021015',
        foreground: '#93a1a1',
        comment: '#5A7585',
        keyword: '#CB4C16',
        string: '#498ca9',
        number: '#D4A52A',
        function: '#268BD2',
        variable: '#2DA198',
        type: '#A15DA1',
        operator: '#CB4C16'
      },

      tokens: {
        commentDoc: '#657b83',
        stringEscape: '#3ab1a8',
        keywordImport: '#95a910',
        functionCall: '#369bd2',
        variableProperty: '#c59910',
        className: '#c59910',
        punctuation: '#93a1a1',
        tag: '#4A9A4A',
        tagAttribute: '#498ca9',
        tagAttributeValue: '#498ca9'
      },

      highlights: {
        diffAdded: '#4A9A4A',
        diffAddedBackground: '#4A9A4A15',
        diffRemoved: '#CC5555',
        diffRemovedBackground: '#CC555515',
        diffModified: '#498ca9',
        diffModifiedBackground: '#498ca915',
        lineNumber: '#1B3743',
        lineNumberActive: '#839496'
      }
    },

    // Component-specific colors
    markdown: {
      heading1: '#68eeda',
      heading2: '#68eedadd',
      heading3: '#68eedabb',
      heading4: '#93a1a1',
      link: '#4A9A4A',
      linkHover: '#95a910',
      inlineCode: '#5fc296',
      inlineCodeBackground: '#02101520',
      blockquote: '#839496',
      blockquoteBorder: '#1B3743',
      listMarker: '#68eeda99'
    },

    chat: {
      userMessage: '#93a1a1',
      userMessageBackground: '#021015',
      assistantMessage: '#93a1a1',
      assistantMessageBackground: '#021015',
      timestamp: '#839496',
      divider: '#1B3743'
    },

    tools: {
      background: '#02101530',
      border: '#1B374350',
      headerHover: '#02101550',
      icon: '#839496',
      title: '#93a1a1',
      description: '#909a9c',

      edit: {
        added: '#4A9A4A',
        addedBackground: '#4A9A4A15',
        removed: '#CC5555',
        removedBackground: '#CC555515',
        lineNumber: '#1B3743'
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
