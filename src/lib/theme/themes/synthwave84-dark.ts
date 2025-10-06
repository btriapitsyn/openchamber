import type { Theme } from '@/types/theme';

/**
 * Synthwave84 Dark Theme
 * A retro synthwave theme with pink and cyan accents (same as light variant)
 */
export const synthwave84DarkTheme: Theme = {
  metadata: {
    id: 'synthwave84-dark',
    name: 'Synthwave84 Dark',
    description: 'Dark variant of the Synthwave84 theme with retro colors',
    author: 'OpenCode Team',
    version: '1.0.0',
    variant: 'dark',
    tags: ['dark', 'synthwave', 'retro', 'pink', 'cyan']
  },

  colors: {
    // Core semantic colors
    primary: {
      base: '#ff007c',
      hover: '#ff107c',
      active: '#ff207c',
      foreground: '#ffffff',
      muted: '#ff007c80',
      emphasis: '#ef006c'
    },

    surface: {
      background: '#0a0a0a',
      foreground: '#ff1493',
      muted: '#1a1a1a',
      mutedForeground: '#cc1493',
      elevated: '#1a1a1a',
      elevatedForeground: '#ff1493',
      overlay: '#00000080',
      subtle: '#1a1a1a'
    },

    interactive: {
      border: '#2a2a2a',
      borderHover: '#3a3a3a',
      borderFocus: '#ff007c',
      selection: '#ff007c30',
      selectionForeground: '#ff1493',
      focus: '#ff007c',
      focusRing: '#ff007c50',
      cursor: '#ff007c',
      hover: '#1a1a1a',
      active: '#2a2a2a'
    },

    status: {
      error: '#ff007c',
      errorForeground: '#ffffff',
      errorBackground: '#ff007c20',
      errorBorder: '#ff007c50',

      warning: '#ffd700',
      warningForeground: '#000000',
      warningBackground: '#ffd70020',
      warningBorder: '#ffd70050',

      success: '#00ff7f',
      successForeground: '#000000',
      successBackground: '#00ff7f20',
      successBorder: '#00ff7f50',

      info: '#ff1493',
      infoForeground: '#ffffff',
      infoBackground: '#ff149320',
      infoBorder: '#ff149350'
    },

    // Syntax highlighting
    syntax: {
      base: {
        background: '#1a1a1a',
        foreground: '#ff1493',
        comment: '#848bbd',
        keyword: '#ff007c',
        string: '#ff8c00',
        number: '#00ff7f',
        function: '#ffd700',
        variable: '#ff007c',
        type: '#ff1493',
        operator: '#ff007c'
      },

      tokens: {
        commentDoc: '#949bbd',
        stringEscape: '#ff9c10',
        keywordImport: '#ff107c',
        functionCall: '#ffe710',
        variableProperty: '#ff107c',
        className: '#ff2493',
        punctuation: '#ff1493',
        tag: '#ff007c',
        tagAttribute: '#ff007c',
        tagAttributeValue: '#ff8c00'
      },

      highlights: {
        diffAdded: '#00ff7f',
        diffAddedBackground: '#00ff7f15',
        diffRemoved: '#ff007c',
        diffRemovedBackground: '#ff007c15',
        diffModified: '#ff007c',
        diffModifiedBackground: '#ff007c15',
        lineNumber: '#2a2a2a',
        lineNumberActive: '#cc1493'
      }
    },

    // Component-specific colors
    markdown: {
      heading1: '#ff007c',
      heading2: '#ff007cdd',
      heading3: '#ff007cbb',
      heading4: '#ff1493',
      link: '#ff007c',
      linkHover: '#ff107c',
      inlineCode: '#ff8c00',
      inlineCodeBackground: '#1a1a1a20',
      blockquote: '#cc1493',
      blockquoteBorder: '#2a2a2a',
      listMarker: '#ff007c99'
    },

    chat: {
      userMessage: '#ff1493',
      userMessageBackground: '#1a1a1a',
      assistantMessage: '#ff1493',
      assistantMessageBackground: '#1a1a1a',
      timestamp: '#cc1493',
      divider: '#2a2a2a'
    },

    tools: {
      background: '#1a1a1a30',
      border: '#2a2a2a50',
      headerHover: '#1a1a1a50',
      icon: '#cc1493',
      title: '#ff1493',
      description: '#dc1493',

      edit: {
        added: '#00ff7f',
        addedBackground: '#00ff7f15',
        removed: '#ff007c',
        removedBackground: '#ff007c15',
        lineNumber: '#2a2a2a'
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