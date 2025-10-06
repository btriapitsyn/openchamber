import type { Theme } from '@/types/theme';

/**
 * One Dark Light Theme
 * A dark theme with warm colors and blue accents
 */
export const oneDarkLightTheme: Theme = {
  metadata: {
    id: 'one-dark-light',
    name: 'One Dark Light',
    description: 'Light variant of the One Dark theme with warm colors',
    author: 'OpenCode Team',
    version: '1.0.0',
    variant: 'light',
    tags: ['light', 'warm', 'blue', 'purple']
  },

  colors: {
    // Core semantic colors
    primary: {
      base: '#e06c75',
      hover: '#f07c85',
      active: '#f08c95',
      foreground: '#ffffff',
      muted: '#e06c7580',
      emphasis: '#d05c65'
    },

    surface: {
      background: '#fafafa',
      foreground: '#383a42',
      muted: '#f0f1f3',
      mutedForeground: '#6c6f78',
      elevated: '#ffffff',
      elevatedForeground: '#383a42',
      overlay: '#00000020',
      subtle: '#e7e8ec'
    },

    interactive: {
      border: '#e0e1e6',
      borderHover: '#d2d4da',
      borderFocus: '#e06c75',
      selection: '#e06c7520',
      selectionForeground: '#383a42',
      focus: '#e06c75',
      focusRing: '#e06c7540',
      cursor: '#e06c75',
      hover: '#f5f6f8',
      active: '#e7e8ec'
    },

    status: {
      error: '#e06c75',
      errorForeground: '#ffffff',
      errorBackground: '#fce7e9',
      errorBorder: '#f2b5bc',

      warning: '#e5c07b',
      warningForeground: '#3b2a00',
      warningBackground: '#fef4e2',
      warningBorder: '#efd7aa',

      success: '#98c379',
      successForeground: '#1d2e12',
      successBackground: '#ecf5e7',
      successBorder: '#cde4b8',

      info: '#61afef',
      infoForeground: '#0f2f47',
      infoBackground: '#e3f2fd',
      infoBorder: '#b9daf6'
    },

    // Syntax highlighting
    syntax: {
      base: {
        background: '#fafafa',
        foreground: '#383a42',
        comment: '#a0a1a7',
        keyword: '#a626a4',
        string: '#50a14f',
        number: '#986801',
        function: '#4078f2',
        variable: '#e45649',
        type: '#c18401',
        operator: '#0184bc'
      },

      tokens: {
        commentDoc: '#b0b1b7',
        stringEscape: '#3ca354',
        keywordImport: '#b04dd6',
        functionCall: '#5584f5',
        variableProperty: '#d66a60',
        className: '#9a6f01',
        punctuation: '#383a42',
        tag: '#a626a4',
        tagAttribute: '#0184bc',
        tagAttributeValue: '#50a14f'
      },

      highlights: {
        diffAdded: '#98c379',
        diffAddedBackground: '#98c37918',
        diffRemoved: '#e06c75',
        diffRemovedBackground: '#e06c7518',
        diffModified: '#61afef',
        diffModifiedBackground: '#61afef18',
        lineNumber: '#d5d7dc',
        lineNumberActive: '#6c6f78'
      }
    },

    // Component-specific colors
    markdown: {
      heading1: '#e06c75',
      heading2: '#e06c75dd',
      heading3: '#e06c75bb',
      heading4: '#383a42',
      link: '#4078f2',
      linkHover: '#5584f5',
      inlineCode: '#50a14f',
      inlineCodeBackground: '#e7e8ec',
      blockquote: '#6c6f78',
      blockquoteBorder: '#e0e1e6',
      listMarker: '#e06c7599'
    },

    chat: {
      userMessage: '#383a42',
      userMessageBackground: '#f0f1f3',
      assistantMessage: '#383a42',
      assistantMessageBackground: '#fafafa',
      timestamp: '#6c6f78',
      divider: '#e0e1e6'
    },

    tools: {
      background: '#f0f1f350',
      border: '#e0e1e680',
      headerHover: '#e7e8ec',
      icon: '#6c6f78',
      title: '#383a42',
      description: '#737681',

      edit: {
        added: '#98c379',
        addedBackground: '#98c37915',
        removed: '#e06c75',
        removedBackground: '#e06c7515',
        lineNumber: '#d2d4da'
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
