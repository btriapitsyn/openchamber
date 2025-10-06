import type { Theme } from '@/types/theme';

/**
 * Monokai Dark Theme
 * A vibrant theme with pink and blue accents (same as light variant)
 */
export const monokaiDarkTheme: Theme = {
  metadata: {
    id: 'monokai-dark',
    name: 'Monokai Dark',
    description: 'Dark variant of the Monokai theme with vibrant colors',
    author: 'OpenCode Team',
    version: '1.0.0',
    variant: 'dark',
    tags: ['dark', 'vibrant', 'pink', 'blue']
  },

  colors: {
    // Core semantic colors
    primary: {
      base: '#f92672',
      hover: '#fa3672',
      active: '#fb4672',
      foreground: '#ffffff',
      muted: '#f9267280',
      emphasis: '#e91662'
    },

    surface: {
      background: '#272822',
      foreground: '#f8f8f2',
      muted: '#2f2f2a',
      mutedForeground: '#b0b0a0',
      elevated: '#2f2f2a',
      elevatedForeground: '#f8f8f2',
      overlay: '#00000080',
      subtle: '#2f2f2a'
    },

    interactive: {
      border: '#49483e',
      borderHover: '#59584e',
      borderFocus: '#f92672',
      selection: '#f9267230',
      selectionForeground: '#f8f8f2',
      focus: '#f92672',
      focusRing: '#f9267250',
      cursor: '#f92672',
      hover: '#3f3f3a',
      active: '#4f4f4a'
    },

    status: {
      error: '#f92672',
      errorForeground: '#ffffff',
      errorBackground: '#f9267220',
      errorBorder: '#f9267250',

      warning: '#fd971f',
      warningForeground: '#000000',
      warningBackground: '#fd971f20',
      warningBorder: '#fd971f50',

      success: '#a6e22e',
      successForeground: '#000000',
      successBackground: '#a6e22e20',
      successBorder: '#a6e22e50',

      info: '#66d9ef',
      infoForeground: '#000000',
      infoBackground: '#66d9ef20',
      infoBorder: '#66d9ef50'
    },

    // Syntax highlighting
    syntax: {
      base: {
        background: '#2f2f2a',
        foreground: '#f8f8f2',
        comment: '#75715e',
        keyword: '#66d9ef',
        string: '#e6db74',
        number: '#ae81ff',
        function: '#a6e22e',
        variable: '#f92672',
        type: '#66d9ef',
        operator: '#f92672'
      },

      tokens: {
        commentDoc: '#85816e',
        stringEscape: '#f6eb84',
        keywordImport: '#76e9ff',
        functionCall: '#b6f23e',
        variableProperty: '#fa3672',
        className: '#76e9ff',
        punctuation: '#f8f8f2',
        tag: '#f92672',
        tagAttribute: '#f92672',
        tagAttributeValue: '#e6db74'
      },

      highlights: {
        diffAdded: '#a6e22e',
        diffAddedBackground: '#a6e22e15',
        diffRemoved: '#f92672',
        diffRemovedBackground: '#f9267215',
        diffModified: '#f92672',
        diffModifiedBackground: '#f9267215',
        lineNumber: '#49483e',
        lineNumberActive: '#b0b0a0'
      }
    },

    // Component-specific colors
    markdown: {
      heading1: '#f92672',
      heading2: '#f92672dd',
      heading3: '#f92672bb',
      heading4: '#f8f8f2',
      link: '#66d9ef',
      linkHover: '#76e9ff',
      inlineCode: '#e6db74',
      inlineCodeBackground: '#2f2f2a20',
      blockquote: '#b0b0a0',
      blockquoteBorder: '#49483e',
      listMarker: '#f9267299'
    },

    chat: {
      userMessage: '#f8f8f2',
      userMessageBackground: '#2f2f2a',
      assistantMessage: '#f8f8f2',
      assistantMessageBackground: '#3f3f3a',
      timestamp: '#b0b0a0',
      divider: '#49483e'
    },

    tools: {
      background: '#2f2f2a30',
      border: '#49483e50',
      headerHover: '#3f3f3a50',
      icon: '#b0b0a0',
      title: '#f8f8f2',
      description: '#c0c0b0',

      edit: {
        added: '#a6e22e',
        addedBackground: '#a6e22e15',
        removed: '#f92672',
        removedBackground: '#f9267215',
        lineNumber: '#49483e'
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