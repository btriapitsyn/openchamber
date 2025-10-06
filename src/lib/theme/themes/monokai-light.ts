import type { Theme } from '@/types/theme';

/**
 * Monokai Light Theme
 * A vibrant theme with pink and blue accents
 */
export const monokaiLightTheme: Theme = {
  metadata: {
    id: 'monokai-light',
    name: 'Monokai Light',
    description: 'Light variant of the Monokai theme with vibrant colors',
    author: 'OpenCode Team',
    version: '1.0.0',
    variant: 'light',
    tags: ['light', 'vibrant', 'pink', 'blue']
  },

  colors: {
    // Core semantic colors
    primary: {
      base: '#f92672',
      hover: '#fa367c',
      active: '#fb4686',
      foreground: '#ffffff',
      muted: '#f9267280',
      emphasis: '#e91662'
    },

    surface: {
      background: '#fdf9f3',
      foreground: '#2b2a27',
      muted: '#f5ede0',
      mutedForeground: '#7d7564',
      elevated: '#ffffff',
      elevatedForeground: '#2b2a27',
      overlay: '#00000020',
      subtle: '#eee2d3'
    },

    interactive: {
      border: '#e2d8cc',
      borderHover: '#d6ccbf',
      borderFocus: '#f92672',
      selection: '#f9267220',
      selectionForeground: '#2b2a27',
      focus: '#f92672',
      focusRing: '#f9267240',
      cursor: '#f92672',
      hover: '#f7efe5',
      active: '#ecdccf'
    },

    status: {
      error: '#f92672',
      errorForeground: '#ffffff',
      errorBackground: '#ffe5ef',
      errorBorder: '#f7b4cf',

      warning: '#fd971f',
      warningForeground: '#3d1f00',
      warningBackground: '#ffefdd',
      warningBorder: '#fbc491',

      success: '#a6e22e',
      successForeground: '#172400',
      successBackground: '#f3f9dd',
      successBorder: '#cde88f',

      info: '#66d9ef',
      infoForeground: '#043642',
      infoBackground: '#e3f8fc',
      infoBorder: '#b4edf5'
    },

    // Syntax highlighting
    syntax: {
      base: {
        background: '#fdf9f3',
        foreground: '#2b2a27',
        comment: '#9c9586',
        keyword: '#66d9ef',
        string: '#c1b458',
        number: '#ae81ff',
        function: '#8bd22c',
        variable: '#f92672',
        type: '#66d9ef',
        operator: '#f92672'
      },

      tokens: {
        commentDoc: '#aaa391',
        stringEscape: '#d6c46c',
        keywordImport: '#76e9ff',
        functionCall: '#9be23a',
        variableProperty: '#fa508a',
        className: '#7fe0ff',
        punctuation: '#2b2a27',
        tag: '#f92672',
        tagAttribute: '#f92672',
        tagAttributeValue: '#c1b458'
      },

      highlights: {
        diffAdded: '#a6e22e',
        diffAddedBackground: '#a6e22e18',
        diffRemoved: '#f92672',
        diffRemovedBackground: '#f9267218',
        diffModified: '#66d9ef',
        diffModifiedBackground: '#66d9ef18',
        lineNumber: '#dcd1c4',
        lineNumberActive: '#7d7564'
      }
    },

    // Component-specific colors
    markdown: {
      heading1: '#f92672',
      heading2: '#f92672dd',
      heading3: '#f92672bb',
      heading4: '#2b2a27',
      link: '#66d9ef',
      linkHover: '#76e9ff',
      inlineCode: '#c1b458',
      inlineCodeBackground: '#eee2d3',
      blockquote: '#7d7564',
      blockquoteBorder: '#e2d8cc',
      listMarker: '#f9267299'
    },

    chat: {
      userMessage: '#2b2a27',
      userMessageBackground: '#f5ede0',
      assistantMessage: '#2b2a27',
      assistantMessageBackground: '#fdf9f3',
      timestamp: '#7d7564',
      divider: '#e2d8cc'
    },

    tools: {
      background: '#f5ede050',
      border: '#e2d8cc80',
      headerHover: '#ecdccf',
      icon: '#7d7564',
      title: '#2b2a27',
      description: '#8b836f',

      edit: {
        added: '#a6e22e',
        addedBackground: '#a6e22e15',
        removed: '#f92672',
        removedBackground: '#f9267215',
        lineNumber: '#d6ccbf'
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
