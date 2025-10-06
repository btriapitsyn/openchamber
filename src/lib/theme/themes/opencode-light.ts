import type { Theme } from '@/types/theme';

/**
 * OpenCode Light Theme
 * The official OpenCode theme with golden accents
 */
export const opencodeLightTheme: Theme = {
  metadata: {
    id: 'opencode-light',
    name: 'OpenCode Light',
    description: 'Light variant of the official OpenCode theme',
    author: 'OpenCode Team',
    version: '1.0.0',
    variant: 'light',
    tags: ['light', 'official', 'golden', 'warm']
  },

  colors: {
    // Core semantic colors
    primary: {
      base: '#edb449',
      hover: '#f0c459',
      active: '#f3d569',
      foreground: '#251b0a',
      muted: '#edb44980',
      emphasis: '#d99a2c'
    },

    surface: {
      background: '#f7f3eb',
      foreground: '#2f2515',
      muted: '#efe7db',
      mutedForeground: '#6e5b3a',
      elevated: '#ffffff',
      elevatedForeground: '#2f2515',
      overlay: '#00000020',
      subtle: '#e8decf'
    },

    interactive: {
      border: '#e0d5c3',
      borderHover: '#d4c7b4',
      borderFocus: '#edb449',
      selection: '#edb44920',
      selectionForeground: '#2f2515',
      focus: '#edb449',
      focusRing: '#edb44940',
      cursor: '#d99a2c',
      hover: '#f0e6d9',
      active: '#e4d6c6'
    },

    status: {
      error: '#c2504c',
      errorForeground: '#ffffff',
      errorBackground: '#fbe7e5',
      errorBorder: '#e4a5a3',

      warning: '#d19d2a',
      warningForeground: '#2d1f00',
      warningBackground: '#fff2d8',
      warningBorder: '#edca76',

      success: '#4c9a6a',
      successForeground: '#0c2616',
      successBackground: '#e4f3ea',
      successBorder: '#a8d7b9',

      info: '#3a7bd5',
      infoForeground: '#ffffff',
      infoBackground: '#e1ecfb',
      infoBorder: '#b7cff4'
    },

    // Syntax highlighting
    syntax: {
      base: {
        background: '#f7f3eb',
        foreground: '#2f2515',
        comment: '#8c7a5b',
        keyword: '#b07ad6',
        string: '#4c9a6a',
        number: '#c6844c',
        function: '#3a7bd5',
        variable: '#c65d64',
        type: '#5ab0c2',
        operator: '#8c7a5b'
      },

      tokens: {
        commentDoc: '#9d8970',
        stringEscape: '#54b57a',
        keywordImport: '#c993e1',
        functionCall: '#4f8ad8',
        variableProperty: '#d8746d',
        className: '#628fb0',
        punctuation: '#2f2515',
        tag: '#b07ad6',
        tagAttribute: '#edb449',
        tagAttributeValue: '#4c9a6a'
      },

      highlights: {
        diffAdded: '#4c9a6a',
        diffAddedBackground: '#4c9a6a18',
        diffRemoved: '#c2504c',
        diffRemovedBackground: '#c2504c18',
        diffModified: '#edb449',
        diffModifiedBackground: '#edb4491a',
        lineNumber: '#ddcfbb',
        lineNumberActive: '#6e5b3a'
      }
    },

    // Component-specific colors
    markdown: {
      heading1: '#edb449',
      heading2: '#edb449dd',
      heading3: '#edb449bb',
      heading4: '#2f2515',
      link: '#3a7bd5',
      linkHover: '#4f8ad8',
      inlineCode: '#4c9a6a',
      inlineCodeBackground: '#e8decf',
      blockquote: '#6e5b3a',
      blockquoteBorder: '#e0d5c3',
      listMarker: '#edb44999'
    },

    chat: {
      userMessage: '#2f2515',
      userMessageBackground: '#efe7db',
      assistantMessage: '#2f2515',
      assistantMessageBackground: '#f7f3eb',
      timestamp: '#6e5b3a',
      divider: '#e0d5c3'
    },

    tools: {
      background: '#efe7db50',
      border: '#e0d5c380',
      headerHover: '#e4d6c6',
      icon: '#6e5b3a',
      title: '#2f2515',
      description: '#7a6646',

      edit: {
        added: '#4c9a6a',
        addedBackground: '#4c9a6a15',
        removed: '#c2504c',
        removedBackground: '#c2504c15',
        lineNumber: '#d8ccb9'
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
