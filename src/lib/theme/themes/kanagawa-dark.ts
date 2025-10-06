import type { Theme } from '@/types/theme';

/**
 * Kanagawa Dark Theme
 * A Japanese-inspired theme with blue and red accents (same as light variant)
 */
export const kanagawaDarkTheme: Theme = {
  metadata: {
    id: 'kanagawa-dark',
    name: 'Kanagawa Dark',
    description: 'Dark variant of the Kanagawa theme with Japanese-inspired colors',
    author: 'OpenCode Team',
    version: '1.0.0',
    variant: 'dark',
    tags: ['dark', 'japanese', 'blue', 'red']
  },

  colors: {
    // Core semantic colors
    primary: {
      base: '#7e9cd8',
      hover: '#8eace8',
      active: '#9ebcf8',
      foreground: '#000000',
      muted: '#7e9cd880',
      emphasis: '#6e8cc8'
    },

    surface: {
      background: '#1f1f28',
      foreground: '#dcd7ba',
      muted: '#272734',
      mutedForeground: '#a09f94',
      elevated: '#272734',
      elevatedForeground: '#dcd7ba',
      overlay: '#00000080',
      subtle: '#272734'
    },

    interactive: {
      border: '#3a3a45',
      borderHover: '#4a4a55',
      borderFocus: '#7e9cd8',
      selection: '#7e9cd830',
      selectionForeground: '#dcd7ba',
      focus: '#7e9cd8',
      focusRing: '#7e9cd850',
      cursor: '#7e9cd8',
      hover: '#2f2f3a',
      active: '#3f3f4a'
    },

    status: {
      error: '#c34043',
      errorForeground: '#ffffff',
      errorBackground: '#c3404320',
      errorBorder: '#c3404350',

      warning: '#e6c384',
      warningForeground: '#000000',
      warningBackground: '#e6c38420',
      warningBorder: '#e6c38450',

      success: '#98bb6c',
      successForeground: '#000000',
      successBackground: '#98bb6c20',
      successBorder: '#98bb6c50',

      info: '#7e9cd8',
      infoForeground: '#000000',
      infoBackground: '#7e9cd820',
      infoBorder: '#7e9cd850'
    },

    // Syntax highlighting
    syntax: {
      base: {
        background: '#272734',
        foreground: '#dcd7ba',
        comment: '#727169',
        keyword: '#c34043',
        string: '#98bb6c',
        number: '#d27e99',
        function: '#7e9cd8',
        variable: '#e6c384',
        type: '#957fb8',
        operator: '#c34043'
      },

      tokens: {
        commentDoc: '#828179',
        stringEscape: '#88ab5c',
        keywordImport: '#d35053',
        functionCall: '#8eace8',
        variableProperty: '#f6d394',
        className: '#a58fc8',
        punctuation: '#dcd7ba',
        tag: '#c34043',
        tagAttribute: '#7e9cd8',
        tagAttributeValue: '#98bb6c'
      },

      highlights: {
        diffAdded: '#98bb6c',
        diffAddedBackground: '#98bb6c15',
        diffRemoved: '#c34043',
        diffRemovedBackground: '#c3404315',
        diffModified: '#7e9cd8',
        diffModifiedBackground: '#7e9cd815',
        lineNumber: '#3a3a45',
        lineNumberActive: '#a09f94'
      }
    },

    // Component-specific colors
    markdown: {
      heading1: '#7e9cd8',
      heading2: '#7e9cd8dd',
      heading3: '#7e9cd8bb',
      heading4: '#dcd7ba',
      link: '#c34043',
      linkHover: '#d35053',
      inlineCode: '#98bb6c',
      inlineCodeBackground: '#27273420',
      blockquote: '#a09f94',
      blockquoteBorder: '#3a3a45',
      listMarker: '#7e9cd899'
    },

    chat: {
      userMessage: '#dcd7ba',
      userMessageBackground: '#272734',
      assistantMessage: '#dcd7ba',
      assistantMessageBackground: '#2f2f3a',
      timestamp: '#a09f94',
      divider: '#3a3a45'
    },

    tools: {
      background: '#27273430',
      border: '#3a3a4550',
      headerHover: '#2f2f3a50',
      icon: '#a09f94',
      title: '#dcd7ba',
      description: '#b0afa4',

      edit: {
        added: '#98bb6c',
        addedBackground: '#98bb6c15',
        removed: '#c34043',
        removedBackground: '#c3404315',
        lineNumber: '#3a3a45'
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