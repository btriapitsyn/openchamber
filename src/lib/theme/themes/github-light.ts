import type { Theme } from '@/types/theme';

/**
 * GitHub Light Theme
 * GitHub's official light theme with blue accents
 */
export const githubLightTheme: Theme = {
  metadata: {
    id: 'github-light',
    name: 'GitHub Light',
    description: 'Light variant of GitHub official theme',
    author: 'OpenCode Team',
    version: '1.0.0',
    variant: 'light',
    tags: ['light', 'github', 'official', 'blue']
  },

  colors: {
    // Core semantic colors
    primary: {
      base: '#0969da',
      hover: '#1976da',
      active: '#2976da',
      foreground: '#ffffff',
      muted: '#0969da80',
      emphasis: '#0860ca'
    },

    surface: {
      background: '#ffffff',
      foreground: '#24292f',
      muted: '#f6f8fa',
      mutedForeground: '#656d76',
      elevated: '#f6f8fa',
      elevatedForeground: '#24292f',
      overlay: '#00000020',
      subtle: '#f0f2f5'
    },

    interactive: {
      border: '#d0d7de',
      borderHover: '#c0c7ce',
      borderFocus: '#0969da',
      selection: '#0969da30',
      selectionForeground: '#24292f',
      focus: '#0969da',
      focusRing: '#0969da50',
      cursor: '#0969da',
      hover: '#f8f9fa',
      active: '#f0f2f5'
    },

    status: {
      error: '#cf222e',
      errorForeground: '#ffffff',
      errorBackground: '#cf222e20',
      errorBorder: '#cf222e50',

      warning: '#bf8700',
      warningForeground: '#000000',
      warningBackground: '#bf870020',
      warningBorder: '#bf870050',

      success: '#1a7f37',
      successForeground: '#ffffff',
      successBackground: '#1a7f3720',
      successBorder: '#1a7f3750',

      info: '#0969da',
      infoForeground: '#ffffff',
      infoBackground: '#0969da20',
      infoBorder: '#0969da50'
    },

    // Syntax highlighting
    syntax: {
      base: {
        background: '#f8f9fa',
        foreground: '#24292f',
        comment: '#6e7781',
        keyword: '#cf222e',
        string: '#0a3069',
        number: '#0550ae',
        function: '#8250df',
        variable: '#953800',
        type: '#953800',
        operator: '#cf222e'
      },

      tokens: {
        commentDoc: '#7e8791',
        stringEscape: '#1a4069',
        keywordImport: '#df323e',
        functionCall: '#9260ef',
        variableProperty: '#a54810',
        className: '#a54810',
        punctuation: '#24292f',
        tag: '#cf222e',
        tagAttribute: '#0969da',
        tagAttributeValue: '#0a3069'
      },

      highlights: {
        diffAdded: '#1a7f37',
        diffAddedBackground: '#1a7f371a',
        diffRemoved: '#cf222e',
        diffRemovedBackground: '#cf222e1a',
        diffModified: '#0969da',
        diffModifiedBackground: '#0969da1a',
        lineNumber: '#c3cad2',
        lineNumberActive: '#656d76'
      }
    },

    // Component-specific colors
    markdown: {
      heading1: '#0969da',
      heading2: '#0969dadd',
      heading3: '#0969dabb',
      heading4: '#24292f',
      link: '#0969da',
      linkHover: '#1976da',
      inlineCode: '#0a3069',
      inlineCodeBackground: '#f0f2f520',
      blockquote: '#656d76',
      blockquoteBorder: '#d0d7de',
      listMarker: '#0969da99'
    },

    chat: {
      userMessage: '#24292f',
      userMessageBackground: '#f6f8fa',
      assistantMessage: '#24292f',
      assistantMessageBackground: '#f8f9fa',
      timestamp: '#656d76',
      divider: '#d0d7de'
    },

    tools: {
      background: '#f6f8fa30',
      border: '#d0d7de50',
      headerHover: '#f8f9fa50',
      icon: '#656d76',
      title: '#24292f',
      description: '#768086',

      edit: {
        added: '#1a7f37',
        addedBackground: '#1a7f3715',
        removed: '#cf222e',
        removedBackground: '#cf222e15',
        lineNumber: '#c0c7ce'
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
