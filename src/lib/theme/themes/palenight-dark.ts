import type { Theme } from '@/types/theme';

/**
 * Palenight Dark Theme
 * A dark theme with purple and blue accents (same as light variant)
 */
export const palenightDarkTheme: Theme = {
  metadata: {
    id: 'palenight-dark',
    name: 'Palenight Dark',
    description: 'Dark variant of the Palenight theme with purple and blue accents',
    author: 'OpenCode Team',
    version: '1.0.0',
    variant: 'dark',
    tags: ['dark', 'purple', 'blue', 'dark']
  },

  colors: {
    // Core semantic colors
    primary: {
      base: '#82aaff',
      hover: '#92baff',
      active: '#a2caff',
      foreground: '#000000',
      muted: '#82aaff80',
      emphasis: '#7292ef'
    },

    surface: {
      background: '#292d3e',
      foreground: '#a6accd',
      muted: '#313549',
      mutedForeground: '#8b91b0',
      elevated: '#313549',
      elevatedForeground: '#a6accd',
      overlay: '#00000080',
      subtle: '#313549'
    },

    interactive: {
      border: '#414863',
      borderHover: '#515973',
      borderFocus: '#82aaff',
      selection: '#82aaff30',
      selectionForeground: '#a6accd',
      focus: '#82aaff',
      focusRing: '#82aaff50',
      cursor: '#82aaff',
      hover: '#414863',
      active: '#515973'
    },

    status: {
      error: '#f07178',
      errorForeground: '#000000',
      errorBackground: '#f0717820',
      errorBorder: '#f0717850',

      warning: '#ffcb6b',
      warningForeground: '#000000',
      warningBackground: '#ffcb6b20',
      warningBorder: '#ffcb6b50',

      success: '#c3e88d',
      successForeground: '#000000',
      successBackground: '#c3e88d20',
      successBorder: '#c3e88d50',

      info: '#82aaff',
      infoForeground: '#000000',
      infoBackground: '#82aaff20',
      infoBorder: '#82aaff50'
    },

    // Syntax highlighting
    syntax: {
      base: {
        background: '#313549',
        foreground: '#a6accd',
        comment: '#676e95',
        keyword: '#c792ea',
        string: '#c3e88d',
        number: '#f78c6c',
        function: '#82aaff',
        variable: '#eeffff',
        type: '#ffcb6b',
        operator: '#89ddff'
      },

      tokens: {
        commentDoc: '#777e a5',
        stringEscape: '#d3f89d',
        keywordImport: '#d7a2fa',
        functionCall: '#92baff',
        variableProperty: '#feffff',
        className: '#ffd b7b',
        punctuation: '#a6accd',
        tag: '#c792ea',
        tagAttribute: '#82aaff',
        tagAttributeValue: '#c3e88d'
      },

      highlights: {
        diffAdded: '#c3e88d',
        diffAddedBackground: '#c3e88d15',
        diffRemoved: '#f07178',
        diffRemovedBackground: '#f0717815',
        diffModified: '#82aaff',
        diffModifiedBackground: '#82aaff15',
        lineNumber: '#414863',
        lineNumberActive: '#8b91b0'
      }
    },

    // Component-specific colors
    markdown: {
      heading1: '#82aaff',
      heading2: '#82aaffdd',
      heading3: '#82aaffbb',
      heading4: '#a6accd',
      link: '#c792ea',
      linkHover: '#d7a2fa',
      inlineCode: '#c3e88d',
      inlineCodeBackground: '#31354920',
      blockquote: '#8b91b0',
      blockquoteBorder: '#414863',
      listMarker: '#82aaff99'
    },

    chat: {
      userMessage: '#a6accd',
      userMessageBackground: '#313549',
      assistantMessage: '#a6accd',
      assistantMessageBackground: '#414863',
      timestamp: '#8b91b0',
      divider: '#414863'
    },

    tools: {
      background: '#31354930',
      border: '#41486350',
      headerHover: '#41486350',
      icon: '#8b91b0',
      title: '#a6accd',
      description: '#9ba1c0',

      edit: {
        added: '#c3e88d',
        addedBackground: '#c3e88d15',
        removed: '#f07178',
        removedBackground: '#f0717815',
        lineNumber: '#414863'
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