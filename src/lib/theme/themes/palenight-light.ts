import type { Theme } from '@/types/theme';

/**
 * Palenight Light Theme
 * A light variant with soft purple and blue accents
 */
export const palenightLightTheme: Theme = {
  metadata: {
    id: 'palenight-light',
    name: 'Palenight Light',
    description: 'Light variant of the Palenight theme with lavender and blue hues',
    author: 'OpenCode Team',
    version: '1.0.0',
    variant: 'light',
    tags: ['light', 'purple', 'blue', 'soft']
  },

  colors: {
    // Core semantic colors
    primary: {
      base: '#82aaff',
      hover: '#92baff',
      active: '#a2caff',
      foreground: '#14203d',
      muted: '#82aaff80',
      emphasis: '#7292ef'
    },

    surface: {
      background: '#f4f5ff',
      foreground: '#282c3f',
      muted: '#eceeff',
      mutedForeground: '#5d6380',
      elevated: '#ffffff',
      elevatedForeground: '#282c3f',
      overlay: '#00000020',
      subtle: '#e0e4fb'
    },

    interactive: {
      border: '#d4d7ee',
      borderHover: '#c6c9e0',
      borderFocus: '#82aaff',
      selection: '#82aaff30',
      selectionForeground: '#282c3f',
      focus: '#82aaff',
      focusRing: '#82aaff40',
      cursor: '#5f7fff',
      hover: '#eef0ff',
      active: '#e0e4fb'
    },

    status: {
      error: '#f07178',
      errorForeground: '#ffffff',
      errorBackground: '#ffe6ea',
      errorBorder: '#f5b6bb',

      warning: '#ffcb6b',
      warningForeground: '#3d2800',
      warningBackground: '#fff4dd',
      warningBorder: '#f5d59a',

      success: '#c3e88d',
      successForeground: '#203312',
      successBackground: '#f1f9e7',
      successBorder: '#d6efb8',

      info: '#82aaff',
      infoForeground: '#14203d',
      infoBackground: '#e5edff',
      infoBorder: '#c3d6ff'
    },

    // Syntax highlighting
    syntax: {
      base: {
        background: '#f4f5ff',
        foreground: '#282c3f',
        comment: '#8589ad',
        keyword: '#c792ea',
        string: '#a8dba0',
        number: '#f78c6c',
        function: '#82aaff',
        variable: '#4d536b',
        type: '#ffcb6b',
        operator: '#89ddff'
      },

      tokens: {
        commentDoc: '#9498ba',
        stringEscape: '#c1f09b',
        keywordImport: '#d7a2fa',
        functionCall: '#92baff',
        variableProperty: '#596081',
        className: '#ffd7ab',
        punctuation: '#282c3f',
        tag: '#c792ea',
        tagAttribute: '#82aaff',
        tagAttributeValue: '#a8dba0'
      },

      highlights: {
        diffAdded: '#c3e88d',
        diffAddedBackground: '#c3e88d18',
        diffRemoved: '#f07178',
        diffRemovedBackground: '#f0717818',
        diffModified: '#82aaff',
        diffModifiedBackground: '#82aaff18',
        lineNumber: '#cbd0e6',
        lineNumberActive: '#5d6380'
      }
    },

    // Component-specific colors
    markdown: {
      heading1: '#82aaff',
      heading2: '#82aaffdd',
      heading3: '#82aaffbb',
      heading4: '#282c3f',
      link: '#c792ea',
      linkHover: '#d7a2fa',
      inlineCode: '#a8dba0',
      inlineCodeBackground: '#e0e4fb',
      blockquote: '#5d6380',
      blockquoteBorder: '#d4d7ee',
      listMarker: '#82aaff99'
    },

    chat: {
      userMessage: '#282c3f',
      userMessageBackground: '#eceeff',
      assistantMessage: '#282c3f',
      assistantMessageBackground: '#f4f5ff',
      timestamp: '#5d6380',
      divider: '#d4d7ee'
    },

    tools: {
      background: '#eceeff50',
      border: '#d4d7ee80',
      headerHover: '#e0e4fb',
      icon: '#5d6380',
      title: '#282c3f',
      description: '#666d87',

      edit: {
        added: '#c3e88d',
        addedBackground: '#c3e88d15',
        removed: '#f07178',
        removedBackground: '#f0717815',
        lineNumber: '#c6c9e0'
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
