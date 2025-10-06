import type { Theme } from '@/types/theme';

/**
 * Catppuccin Light Theme
 * A soft pastel theme with blue and pink accents
 */
export const catppuccinLightTheme: Theme = {
  metadata: {
    id: 'catppuccin-light',
    name: 'Catppuccin Light',
    description: 'Light variant of the Catppuccin theme with soft pastel colors',
    author: 'OpenCode Team',
    version: '1.0.0',
    variant: 'light',
    tags: ['light', 'pastel', 'soft', 'blue', 'pink']
  },

  colors: {
    // Core semantic colors
    primary: {
      base: '#1e66f5',
      hover: '#2e76f5',
      active: '#3e86f5',
      foreground: '#ffffff',
      muted: '#1e66f580',
      emphasis: '#0e56e5'
    },

    surface: {
      background: '#eff1f5',
      foreground: '#4c4f69',
      muted: '#e6e9ef',
      mutedForeground: '#5c5f77',
      elevated: '#e6e9ef',
      elevatedForeground: '#4c4f69',
      overlay: '#00000020',
      subtle: '#dce0e8'
    },

    interactive: {
      border: '#ccd0da',
      borderHover: '#bcc0cc',
      borderFocus: '#1e66f5',
      selection: '#1e66f530',
      selectionForeground: '#4c4f69',
      focus: '#1e66f5',
      focusRing: '#1e66f550',
      cursor: '#1e66f5',
      hover: '#f6f8fa',
      active: '#e6e9ef'
    },

    status: {
      error: '#d20f39',
      errorForeground: '#ffffff',
      errorBackground: '#d20f3920',
      errorBorder: '#d20f3950',

      warning: '#df8e1d',
      warningForeground: '#000000',
      warningBackground: '#df8e1d20',
      warningBorder: '#df8e1d50',

      success: '#40a02b',
      successForeground: '#ffffff',
      successBackground: '#40a02b20',
      successBorder: '#40a02b50',

      info: '#179299',
      infoForeground: '#ffffff',
      infoBackground: '#17929920',
      infoBorder: '#17929950'
    },

    // Syntax highlighting
    syntax: {
      base: {
        background: '#f6f8fa',
        foreground: '#4c4f69',
        comment: '#7c7f93',
        keyword: '#8839ef',
        string: '#40a02b',
        number: '#fe640b',
        function: '#1e66f5',
        variable: '#d20f39',
        type: '#df8e1d',
        operator: '#04a5e5'
      },

      tokens: {
        commentDoc: '#8c8fa3',
        stringEscape: '#30a01b',
        keywordImport: '#9839ff',
        functionCall: '#2e76f5',
        variableProperty: '#e01f49',
        className: '#ef891d',
        punctuation: '#4c4f69',
        tag: '#8839ef',
        tagAttribute: '#1e66f5',
        tagAttributeValue: '#40a02b'
      },

      highlights: {
        diffAdded: '#40a02b',
        diffAddedBackground: '#40a02b18',
        diffRemoved: '#d20f39',
        diffRemovedBackground: '#d20f3918',
        diffModified: '#1e66f5',
        diffModifiedBackground: '#1e66f518',
        lineNumber: '#c6cad4',
        lineNumberActive: '#5c5f77'
      }
    },

    // Component-specific colors
    markdown: {
      heading1: '#8839ef',
      heading2: '#8839efdd',
      heading3: '#8839efbb',
      heading4: '#4c4f69',
      link: '#1e66f5',
      linkHover: '#2e76f5',
      inlineCode: '#40a02b',
      inlineCodeBackground: '#dce0e820',
      blockquote: '#df8e1d',
      blockquoteBorder: '#ccd0da',
      listMarker: '#1e66f599'
    },

    chat: {
      userMessage: '#4c4f69',
      userMessageBackground: '#e6e9ef',
      assistantMessage: '#4c4f69',
      assistantMessageBackground: '#f6f8fa',
      timestamp: '#5c5f77',
      divider: '#ccd0da'
    },

    tools: {
      background: '#e6e9ef30',
      border: '#ccd0da50',
      headerHover: '#f6f8fa50',
      icon: '#5c5f77',
      title: '#4c4f69',
      description: '#6c6f85',

      edit: {
        added: '#40a02b',
        addedBackground: '#40a02b15',
        removed: '#d20f39',
        removedBackground: '#d20f3915',
        lineNumber: '#bcc0cc'
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
