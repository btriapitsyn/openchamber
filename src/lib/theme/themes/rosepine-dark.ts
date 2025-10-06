import type { Theme } from '@/types/theme';

/**
 * Rosepine Dark Theme
 * A soft theme with warm colors and purple accents (same as light variant)
 */
export const rosepineDarkTheme: Theme = {
  metadata: {
    id: 'rosepine-dark',
    name: 'Rosepine Dark',
    description: 'Dark variant of the Rosepine theme with soft colors',
    author: 'OpenCode Team',
    version: '1.0.0',
    variant: 'dark',
    tags: ['dark', 'soft', 'warm', 'purple']
  },

  colors: {
    // Core semantic colors
    primary: {
      base: '#f6c177',
      hover: '#f7d187',
      active: '#f8e197',
      foreground: '#000000',
      muted: '#f6c17780',
      emphasis: '#e6b167'
    },

    surface: {
      background: '#191724',
      foreground: '#e0def4',
      muted: '#21202e',
      mutedForeground: '#a5a3b5',
      elevated: '#21202e',
      elevatedForeground: '#e0def4',
      overlay: '#00000080',
      subtle: '#21202e'
    },

    interactive: {
      border: '#312f3c',
      borderHover: '#413f4c',
      borderFocus: '#f6c177',
      selection: '#f6c17730',
      selectionForeground: '#e0def4',
      focus: '#f6c177',
      focusRing: '#f6c17750',
      cursor: '#f6c177',
      hover: '#312f3c',
      active: '#413f4c'
    },

    status: {
      error: '#eb6f92',
      errorForeground: '#000000',
      errorBackground: '#eb6f9220',
      errorBorder: '#eb6f9250',

      warning: '#f6c177',
      warningForeground: '#000000',
      warningBackground: '#f6c17720',
      warningBorder: '#f6c17750',

      success: '#9ccfd8',
      successForeground: '#000000',
      successBackground: '#9ccfd820',
      successBorder: '#9ccfd850',

      info: '#31748f',
      infoForeground: '#ffffff',
      infoBackground: '#31748f20',
      infoBorder: '#31748f50'
    },

    // Syntax highlighting
    syntax: {
      base: {
        background: '#21202e',
        foreground: '#e0def4',
        comment: '#6e6a86',
        keyword: '#31748f',
        string: '#f6c177',
        number: '#f6c177',
        function: '#9ccfd8',
        variable: '#c4a7e7',
        type: '#ebbcba',
        operator: '#908caa'
      },

      tokens: {
        commentDoc: '#7e7a96',
        stringEscape: '#f6d187',
        keywordImport: '#41849f',
        functionCall: '#acdf e8',
        variableProperty: '#d4b7f7',
        className: '#fbccca',
        punctuation: '#e0def4',
        tag: '#31748f',
        tagAttribute: '#f6c177',
        tagAttributeValue: '#f6c177'
      },

      highlights: {
        diffAdded: '#9ccfd8',
        diffAddedBackground: '#9ccfd815',
        diffRemoved: '#eb6f92',
        diffRemovedBackground: '#eb6f9215',
        diffModified: '#f6c177',
        diffModifiedBackground: '#f6c17715',
        lineNumber: '#312f3c',
        lineNumberActive: '#a5a3b5'
      }
    },

    // Component-specific colors
    markdown: {
      heading1: '#f6c177',
      heading2: '#f6c177dd',
      heading3: '#f6c177bb',
      heading4: '#e0def4',
      link: '#31748f',
      linkHover: '#41849f',
      inlineCode: '#f6c177',
      inlineCodeBackground: '#21202e20',
      blockquote: '#a5a3b5',
      blockquoteBorder: '#312f3c',
      listMarker: '#f6c17799'
    },

    chat: {
      userMessage: '#e0def4',
      userMessageBackground: '#21202e',
      assistantMessage: '#e0def4',
      assistantMessageBackground: '#312f3c',
      timestamp: '#a5a3b5',
      divider: '#312f3c'
    },

    tools: {
      background: '#21202e30',
      border: '#312f3c50',
      headerHover: '#312f3c50',
      icon: '#a5a3b5',
      title: '#e0def4',
      description: '#b5b3c5',

      edit: {
        added: '#9ccfd8',
        addedBackground: '#9ccfd815',
        removed: '#eb6f92',
        removedBackground: '#eb6f9215',
        lineNumber: '#312f3c'
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