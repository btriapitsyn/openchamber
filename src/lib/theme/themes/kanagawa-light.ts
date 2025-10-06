import type { Theme } from '@/types/theme';

/**
 * Kanagawa Light Theme
 * A Japanese-inspired theme with blue and red accents
 */
export const kanagawaLightTheme: Theme = {
  metadata: {
    id: 'kanagawa-light',
    name: 'Kanagawa Light',
    description: 'Light variant of the Kanagawa theme with Japanese-inspired colors',
    author: 'OpenCode Team',
    version: '1.0.0',
    variant: 'light',
    tags: ['light', 'japanese', 'blue', 'red']
  },

  colors: {
    // Core semantic colors
    primary: {
      base: '#7e9cd8',
      hover: '#8eace8',
      active: '#9ebcf8',
      foreground: '#1b2438',
      muted: '#7e9cd880',
      emphasis: '#6e8cc8'
    },

    surface: {
      background: '#f2e9de',
      foreground: '#403c53',
      muted: '#e7dfd3',
      mutedForeground: '#6a6579',
      elevated: '#ffffff',
      elevatedForeground: '#403c53',
      overlay: '#00000020',
      subtle: '#e1d7ca'
    },

    interactive: {
      border: '#d2c8bb',
      borderHover: '#c6bcaf',
      borderFocus: '#7e9cd8',
      selection: '#7e9cd830',
      selectionForeground: '#403c53',
      focus: '#7e9cd8',
      focusRing: '#7e9cd840',
      cursor: '#5f81c8',
      hover: '#ece3d8',
      active: '#e1d7ca'
    },

    status: {
      error: '#c34043',
      errorForeground: '#ffffff',
      errorBackground: '#f7dede',
      errorBorder: '#e9a7a9',

      warning: '#e6c384',
      warningForeground: '#3a2a00',
      warningBackground: '#fbf0dd',
      warningBorder: '#edd7b0',

      success: '#98bb6c',
      successForeground: '#1f2f10',
      successBackground: '#ecf3e2',
      successBorder: '#cfe1b1',

      info: '#7e9cd8',
      infoForeground: '#1b2438',
      infoBackground: '#e5ecfb',
      infoBorder: '#c5d3f1'
    },

    // Syntax highlighting
    syntax: {
      base: {
        background: '#f2e9de',
        foreground: '#403c53',
        comment: '#939085',
        keyword: '#c34043',
        string: '#98bb6c',
        number: '#d27e99',
        function: '#7e9cd8',
        variable: '#e6c384',
        type: '#957fb8',
        operator: '#c34043'
      },

      tokens: {
        commentDoc: '#9f9b91',
        stringEscape: '#88ab5c',
        keywordImport: '#d35053',
        functionCall: '#8eace8',
        variableProperty: '#dcbf7c',
        className: '#a58fc8',
        punctuation: '#403c53',
        tag: '#c34043',
        tagAttribute: '#7e9cd8',
        tagAttributeValue: '#98bb6c'
      },

      highlights: {
        diffAdded: '#98bb6c',
        diffAddedBackground: '#98bb6c1a',
        diffRemoved: '#c34043',
        diffRemovedBackground: '#c340431a',
        diffModified: '#7e9cd8',
        diffModifiedBackground: '#7e9cd81a',
        lineNumber: '#cbbfb2',
        lineNumberActive: '#6a6579'
      }
    },

    // Component-specific colors
    markdown: {
      heading1: '#7e9cd8',
      heading2: '#7e9cd8dd',
      heading3: '#7e9cd8bb',
      heading4: '#403c53',
      link: '#c34043',
      linkHover: '#d35053',
      inlineCode: '#98bb6c',
      inlineCodeBackground: '#e1d7ca',
      blockquote: '#6a6579',
      blockquoteBorder: '#d2c8bb',
      listMarker: '#7e9cd899'
    },

    chat: {
      userMessage: '#403c53',
      userMessageBackground: '#e7dfd3',
      assistantMessage: '#403c53',
      assistantMessageBackground: '#f2e9de',
      timestamp: '#6a6579',
      divider: '#d2c8bb'
    },

    tools: {
      background: '#e7dfd350',
      border: '#d2c8bb80',
      headerHover: '#e1d7ca',
      icon: '#6a6579',
      title: '#403c53',
      description: '#747086',

      edit: {
        added: '#98bb6c',
        addedBackground: '#98bb6c15',
        removed: '#c34043',
        removedBackground: '#c3404315',
        lineNumber: '#c6bcaf'
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
