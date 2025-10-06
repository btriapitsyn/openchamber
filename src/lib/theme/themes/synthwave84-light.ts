import type { Theme } from '@/types/theme';

/**
 * Synthwave84 Light Theme
 * Neon-soaked pastels inspired by retro wave aesthetics
 */
export const synthwave84LightTheme: Theme = {
  metadata: {
    id: 'synthwave84-light',
    name: 'Synthwave84 Light',
    description: 'Light variant of the Synthwave84 theme with pastel neon colors',
    author: 'OpenCode Team',
    version: '1.0.0',
    variant: 'light',
    tags: ['light', 'synthwave', 'retro', 'pink', 'cyan']
  },

  colors: {
    // Core semantic colors
    primary: {
      base: '#ff4fb8',
      hover: '#ff61bf',
      active: '#ff73c6',
      foreground: '#ffffff',
      muted: '#ff4fb880',
      emphasis: '#e03fa3'
    },

    surface: {
      background: '#fff2fa',
      foreground: '#341531',
      muted: '#ffe5f4',
      mutedForeground: '#a463a6',
      elevated: '#ffffff',
      elevatedForeground: '#341531',
      overlay: '#00000020',
      subtle: '#ffd8ef'
    },

    interactive: {
      border: '#ffcbe5',
      borderHover: '#f9bddc',
      borderFocus: '#ff4fb8',
      selection: '#ff4fb820',
      selectionForeground: '#341531',
      focus: '#ff4fb8',
      focusRing: '#ff4fb840',
      cursor: '#ff2fa8',
      hover: '#ffe5f4',
      active: '#ffd8ef'
    },

    status: {
      error: '#ff4f9c',
      errorForeground: '#ffffff',
      errorBackground: '#ffe6f0',
      errorBorder: '#f9b8ce',

      warning: '#ffbf3d',
      warningForeground: '#3a2400',
      warningBackground: '#fff3d9',
      warningBorder: '#f5d58f',

      success: '#2fe6a5',
      successForeground: '#003524',
      successBackground: '#e1fbf3',
      successBorder: '#a6f5d7',

      info: '#2dd9ff',
      infoForeground: '#003649',
      infoBackground: '#e1f7ff',
      infoBorder: '#a6eafe'
    },

    // Syntax highlighting
    syntax: {
      base: {
        background: '#fff2fa',
        foreground: '#341531',
        comment: '#a978b7',
        keyword: '#ff38b1',
        string: '#ff8c00',
        number: '#15d7a1',
        function: '#ffd700',
        variable: '#ff4fb8',
        type: '#2dd9ff',
        operator: '#ff38b1'
      },

      tokens: {
        commentDoc: '#ba8cc6',
        stringEscape: '#ff9f2c',
        keywordImport: '#ff5ac3',
        functionCall: '#ffd65a',
        variableProperty: '#ff6fbe',
        className: '#3acbff',
        punctuation: '#341531',
        tag: '#ff38b1',
        tagAttribute: '#ff4fb8',
        tagAttributeValue: '#ff8c00'
      },

      highlights: {
        diffAdded: '#2fe6a5',
        diffAddedBackground: '#2fe6a518',
        diffRemoved: '#ff4f9c',
        diffRemovedBackground: '#ff4f9c18',
        diffModified: '#2dd9ff',
        diffModifiedBackground: '#2dd9ff18',
        lineNumber: '#f4c8e0',
        lineNumberActive: '#a463a6'
      }
    },

    // Component-specific colors
    markdown: {
      heading1: '#ff4fb8',
      heading2: '#ff4fb8dd',
      heading3: '#ff4fb8bb',
      heading4: '#341531',
      link: '#2dd9ff',
      linkHover: '#4ae2ff',
      inlineCode: '#ff8c00',
      inlineCodeBackground: '#ffd8ef',
      blockquote: '#a463a6',
      blockquoteBorder: '#ffcbe5',
      listMarker: '#ff4fb899'
    },

    chat: {
      userMessage: '#341531',
      userMessageBackground: '#ffe5f4',
      assistantMessage: '#341531',
      assistantMessageBackground: '#fff2fa',
      timestamp: '#a463a6',
      divider: '#ffcbe5'
    },

    tools: {
      background: '#ffe5f450',
      border: '#ffcbe580',
      headerHover: '#ffd8ef',
      icon: '#a463a6',
      title: '#341531',
      description: '#8c4f8d',

      edit: {
        added: '#2fe6a5',
        addedBackground: '#2fe6a515',
        removed: '#ff4f9c',
        removedBackground: '#ff4f9c15',
        lineNumber: '#f0bfdc'
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
