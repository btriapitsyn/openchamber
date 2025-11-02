import type { Theme } from '@/types/theme';

/**
 * Catppuccin Dark Theme
 * A soft pastel theme with blue and pink accents
 */
export const catppuccinDarkTheme: Theme = {
  metadata: {
    id: 'catppuccin-dark',
    name: 'Catppuccin Dark',
    description: 'Dark variant of the Catppuccin theme with soft pastel colors',
    author: 'Fedaykin Dev',
    version: '1.0.0',
    variant: 'dark',
    tags: ['dark', 'pastel', 'soft', 'blue', 'pink']
  },

  colors: {
    // Core semantic colors
    primary: {
      base: '#4fc2f0',
      hover: '#99c4fa',
      active: '#a9d4fa',
      foreground: '#000000',
      muted: '#89b4fa80',
      emphasis: '#79a4ea'
    },

    surface: {
      background: '#1C1C2B',
      foreground: '#cdd6f4',
      muted: '#181825',
      mutedForeground: '#bac2de',
      elevated: '#181825',
      elevatedForeground: '#cdd6f4',
      overlay: '#00000080',
      subtle: '#11111b'
    },

    interactive: {
      border: '#313244',
      borderHover: '#45475a',
      borderFocus: '#89b4fa',
      selection: '#89b4fa30',
      selectionForeground: '#cdd6f4',
      focus: '#89b4fa',
      focusRing: '#89b4fa50',
      cursor: '#89b4fa',
      hover: '#28273e',
      active: '#38384e'
    },

    status: {
      error: '#f38ba8',
      errorForeground: '#000000',
      errorBackground: '#f38ba820',
      errorBorder: '#f38ba850',

      warning: '#f9e2af',
      warningForeground: '#000000',
      warningBackground: '#f9e2af20',
      warningBorder: '#f9e2af50',

      success: '#a6e3a1',
      successForeground: '#000000',
      successBackground: '#a6e3a120',
      successBorder: '#a6e3a150',

      info: '#94e2d5',
      infoForeground: '#000000',
      infoBackground: '#94e2d520',
      infoBorder: '#94e2d550'
    },

    // Syntax highlighting
    syntax: {
      base: {
        background: '#181825',
        foreground: '#cdd6f4',
        comment: '#9399b2',
        keyword: '#cba6f7',
        string: '#a6e3a1',
        number: '#fab387',
        function: '#89b4fa',
        variable: '#f38ba8',
        type: '#f9e2af',
        operator: '#89dceb'
      },

      tokens: {
        commentDoc: '#a3a9c2',
        stringEscape: '#96e391',
        keywordImport: '#dba6f7',
        functionCall: '#99c4fa',
        variableProperty: '#f39ba8',
        className: '#f9f2af',
        punctuation: '#cdd6f4',
        tag: '#cba6f7',
        tagAttribute: '#89b4fa',
        tagAttributeValue: '#a6e3a1'
      },

      highlights: {
        diffAdded: '#a6e3a1',
        diffAddedBackground: '#a6e3a115',
        diffRemoved: '#f38ba8',
        diffRemovedBackground: '#f38ba815',
        diffModified: '#89b4fa',
        diffModifiedBackground: '#89b4fa15',
        lineNumber: '#45475a',
        lineNumberActive: '#bac2de'
      }
    },

    // Component-specific colors
    markdown: {
      heading1: '#ca9ee6',
      heading2: '#ca9ee6dd',
      heading3: '#ca9ee6bb',
      heading4: '#cdd6f4',
      link: '#89b4fa',
      linkHover: '#99c4fa',
      inlineCode: '#a6e3a1',
      inlineCodeBackground: '#11111b20',
      blockquote: '#f9e2af',
      blockquoteBorder: '#313244',
      listMarker: '#89b4fa99'
    },

    chat: {
      userMessage: '#cdd6f4',
      userMessageBackground: '#181825',
      assistantMessage: '#cdd6f4',
      assistantMessageBackground: '#28273e',
      timestamp: '#bac2de',
      divider: '#313244'
    },

    tools: {
      background: '#18182530',
      border: '#31324450',
      headerHover: '#28273e50',
      icon: '#bac2de',
      title: '#cdd6f4',
      description: '#a6adc8',

      edit: {
        added: '#a6e3a1',
        addedBackground: '#a6e3a115',
        removed: '#f38ba8',
        removedBackground: '#f38ba815',
        lineNumber: '#45475a'
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
