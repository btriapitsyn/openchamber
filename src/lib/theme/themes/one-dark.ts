import type { Theme } from '@/types/theme';

/**
 * One Dark Dark Theme
 * A dark theme with warm colors and blue accents (same as light variant)
 */
export const oneDarkTheme: Theme = {
  metadata: {
    id: 'one-dark',
    name: 'One Dark',
    description: 'Dark variant of the One Dark theme with warm colors',
    author: 'Fedaykin Dev',
    version: '1.0.0',
    variant: 'dark',
    tags: ['dark', 'warm', 'blue', 'purple']
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
      background: '#1a1d22',
      foreground: '#b7beca',
      muted: '#1e2228',
      mutedForeground: '#9da5b4',
      elevated: '#1e2228',
      elevatedForeground: '#b7beca',
      overlay: '#00000080',
      subtle: '#383d46'
    },

    interactive: {
      border: '#353a46',
      borderHover: '#4e5461',
      borderFocus: '#e06c75',
      selection: '#e06c7530',
      selectionForeground: '#b7beca',
      focus: '#e06c75',
      focusRing: '#e06c7550',
      cursor: '#e06c75',
      hover: '#40444c',
      active: '#50545c'
    },

    status: {
      error: '#e06c75',
      errorForeground: '#ffffff',
      errorBackground: '#e06c7520',
      errorBorder: '#e06c7550',

      warning: '#e5c07b',
      warningForeground: '#000000',
      warningBackground: '#e5c07b20',
      warningBorder: '#e5c07b50',

      success: '#98c379',
      successForeground: '#000000',
      successBackground: '#98c37920',
      successBorder: '#98c37950',

      info: '#61afef',
      infoForeground: '#ffffff',
      infoBackground: '#61afef20',
      infoBorder: '#61afef50'
    },

    // Syntax highlighting
    syntax: {
      base: {
        background: '#1e2228',
        foreground: '#b7beca',
        comment: '#5c6370',
        keyword: '#c678dd',
        string: '#98c379',
        number: '#d19a66',
        function: '#61afef',
        variable: '#e06c75',
        type: '#e5c07b',
        operator: '#56b6c2'
      },

      tokens: {
        commentDoc: '#6c7380',
        stringEscape: '#a8d389',
        keywordImport: '#d688ed',
        functionCall: '#71bfef',
        variableProperty: '#f07c85',
        className: '#f5d08b',
        punctuation: '#b7beca',
        tag: '#c678dd',
        tagAttribute: '#e06c75',
        tagAttributeValue: '#98c379'
      },

      highlights: {
        diffAdded: '#98c379',
        diffAddedBackground: '#98c37915',
        diffRemoved: '#e06c75',
        diffRemovedBackground: '#e06c7515',
        diffModified: '#e06c75',
        diffModifiedBackground: '#e06c7515',
        lineNumber: '#3e4451',
        lineNumberActive: '#9da5b4'
      }
    },

    // Component-specific colors
    markdown: {
      heading1: '#e06c75',
      heading2: '#e06c75dd',
      heading3: '#e06c75bb',
      heading4: '#b7beca',
      link: '#61afef',
      linkHover: '#71bfef',
      inlineCode: '#98c379',
      inlineCodeBackground: '#1e222820',
      blockquote: '#9da5b4',
      blockquoteBorder: '#3e4451',
      listMarker: '#e06c7599'
    },

    chat: {
      userMessage: '#b7beca',
      userMessageBackground: '#1e2228',
      assistantMessage: '#b7beca',
      assistantMessageBackground: '#40444c',
      timestamp: '#9da5b4',
      divider: '#3e4451'
    },

    tools: {
      background: '#1e222830',
      border: '#3e445150',
      headerHover: '#40444c50',
      icon: '#9da5b4',
      title: '#b7beca',
      description: '#adb5c4',

      edit: {
        added: '#98c379',
        addedBackground: '#98c37915',
        removed: '#e06c75',
        removedBackground: '#e06c7515',
        lineNumber: '#3e4451'
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
