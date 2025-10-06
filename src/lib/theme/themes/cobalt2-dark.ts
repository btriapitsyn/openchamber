import type { Theme } from '@/types/theme';

/**
 * Cobalt2 Dark Theme
 * A vibrant theme with yellow and blue accents (same as light variant)
 */
export const cobalt2DarkTheme: Theme = {
  metadata: {
    id: 'cobalt2-dark',
    name: 'Cobalt2 Dark',
    description: 'Dark variant of the Cobalt2 theme with vibrant colors',
    author: 'OpenCode Team',
    version: '1.0.0',
    variant: 'dark',
    tags: ['dark', 'vibrant', 'yellow', 'blue']
  },

  colors: {
    // Core semantic colors
    primary: {
      base: '#ffc600',
      hover: '#ffd120',
      active: '#ffe040',
      foreground: '#000000',
      muted: '#ffc60080',
      emphasis: '#efb600'
    },

    surface: {
      background: '#122637',
      foreground: '#ffffff',
      muted: '#1a2e40',
      mutedForeground: '#a0b0c0',
      elevated: '#1a2e40',
      elevatedForeground: '#ffffff',
      overlay: '#00000080',
      subtle: '#1a2e40'
    },

    interactive: {
      border: '#2a3e50',
      borderHover: '#3a4e60',
      borderFocus: '#ffc600',
      selection: '#ffc60030',
      selectionForeground: '#ffffff',
      focus: '#ffc600',
      focusRing: '#ffc60050',
      cursor: '#ffc600',
      hover: '#2a3e50',
      active: '#3a4e60'
    },

    status: {
      error: '#ff628c',
      errorForeground: '#000000',
      errorBackground: '#ff628c20',
      errorBorder: '#ff628c50',

      warning: '#ff9d00',
      warningForeground: '#000000',
      warningBackground: '#ff9d0020',
      warningBorder: '#ff9d0050',

      success: '#3ad900',
      successForeground: '#000000',
      successBackground: '#3ad90020',
      successBorder: '#3ad90050',

      info: '#0088ff',
      infoForeground: '#000000',
      infoBackground: '#0088ff20',
      infoBorder: '#0088ff50'
    },

    // Syntax highlighting
    syntax: {
      base: {
        background: '#1a2e40',
        foreground: '#ffffff',
        comment: '#0088ff',
        keyword: '#ff9d00',
        string: '#3ad900',
        number: '#ff628c',
        function: '#ffc600',
        variable: '#ffb851',
        type: '#80ffbb',
        operator: '#ff9d00'
      },

      tokens: {
        commentDoc: '#1088ff',
        stringEscape: '#2ac900',
        keywordImport: '#ffad10',
        functionCall: '#ffd620',
        variableProperty: '#ffc861',
        className: '#90ffcb',
        punctuation: '#ffffff',
        tag: '#ff9d00',
        tagAttribute: '#ffc600',
        tagAttributeValue: '#3ad900'
      },

      highlights: {
        diffAdded: '#3ad900',
        diffAddedBackground: '#3ad90015',
        diffRemoved: '#ff628c',
        diffRemovedBackground: '#ff628c15',
        diffModified: '#ffc600',
        diffModifiedBackground: '#ffc60015',
        lineNumber: '#2a3e50',
        lineNumberActive: '#a0b0c0'
      }
    },

    // Component-specific colors
    markdown: {
      heading1: '#ffc600',
      heading2: '#ffc600dd',
      heading3: '#ffc600bb',
      heading4: '#ffffff',
      link: '#ff9d00',
      linkHover: '#ffad10',
      inlineCode: '#3ad900',
      inlineCodeBackground: '#1a2e4020',
      blockquote: '#a0b0c0',
      blockquoteBorder: '#2a3e50',
      listMarker: '#ffc60099'
    },

    chat: {
      userMessage: '#ffffff',
      userMessageBackground: '#1a2e40',
      assistantMessage: '#ffffff',
      assistantMessageBackground: '#2a3e50',
      timestamp: '#a0b0c0',
      divider: '#2a3e50'
    },

    tools: {
      background: '#1a2e4030',
      border: '#2a3e5050',
      headerHover: '#2a3e5050',
      icon: '#a0b0c0',
      title: '#ffffff',
      description: '#b0c0d0',

      edit: {
        added: '#3ad900',
        addedBackground: '#3ad90015',
        removed: '#ff628c',
        removedBackground: '#ff628c15',
        lineNumber: '#2a3e50'
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