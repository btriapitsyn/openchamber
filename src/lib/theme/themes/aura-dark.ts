import type { Theme } from '@/types/theme';

/**
 * Aura Dark Theme
 * A vibrant theme with purple and pink accents (same as light variant)
 */
export const auraDarkTheme: Theme = {
  metadata: {
    id: 'aura-dark',
    name: 'Aura Dark',
    description: 'Dark variant of the Aura theme with purple and pink accents',
    author: 'OpenCode Team',
    version: '1.0.0',
    variant: 'dark',
    tags: ['dark', 'purple', 'pink', 'vibrant']
  },

  colors: {
    // Core semantic colors
    primary: {
      base: '#a277ff',
      hover: '#b087ff',
      active: '#c097ff',
      foreground: '#ffffff',
      muted: '#a277ff80',
      emphasis: '#9a67ff'
    },

    surface: {
      background: '#0f0f0f',
      foreground: '#edecee',
      muted: '#15141b',
      mutedForeground: '#6d6d6d',
      elevated: '#15141b',
      elevatedForeground: '#edecee',
      overlay: '#00000080',
      subtle: '#15141b'
    },

    interactive: {
      border: '#2d2d2d',
      borderHover: '#3d3d3d',
      borderFocus: '#a277ff',
      selection: '#a277ff30',
      selectionForeground: '#edecee',
      focus: '#a277ff',
      focusRing: '#a277ff50',
      cursor: '#a277ff',
      hover: '#1d1d1d',
      active: '#2d2d2d'
    },

    status: {
      error: '#ff6767',
      errorForeground: '#ffffff',
      errorBackground: '#ff676720',
      errorBorder: '#ff676750',

      warning: '#ffca85',
      warningForeground: '#000000',
      warningBackground: '#ffca8520',
      warningBorder: '#ffca8550',

      success: '#61ffca',
      successForeground: '#000000',
      successBackground: '#61ffca20',
      successBorder: '#61ffca50',

      info: '#a277ff',
      infoForeground: '#ffffff',
      infoBackground: '#a277ff20',
      infoBorder: '#a277ff50'
    },

    // Syntax highlighting
    syntax: {
      base: {
        background: '#15141b',
        foreground: '#edecee',
        comment: '#6d6d6d',
        keyword: '#f694ff',
        string: '#61ffca',
        number: '#9dff65',
        function: '#a277ff',
        variable: '#a277ff',
        type: '#a277ff',
        operator: '#f694ff'
      },

      tokens: {
        commentDoc: '#7d7d7d',
        stringEscape: '#51ffba',
        keywordImport: '#ff94ff',
        functionCall: '#b287ff',
        variableProperty: '#b287ff',
        className: '#b287ff',
        punctuation: '#edecee',
        tag: '#f694ff',
        tagAttribute: '#a277ff',
        tagAttributeValue: '#61ffca'
      },

      highlights: {
        diffAdded: '#61ffca',
        diffAddedBackground: '#61ffca15',
        diffRemoved: '#ff6767',
        diffRemovedBackground: '#ff676715',
        diffModified: '#a277ff',
        diffModifiedBackground: '#a277ff15',
        lineNumber: '#2d2d2d',
        lineNumberActive: '#6d6d6d'
      }
    },

    // Component-specific colors
    markdown: {
      heading1: '#a277ff',
      heading2: '#a277ffdd',
      heading3: '#a277ffbb',
      heading4: '#edecee',
      link: '#f694ff',
      linkHover: '#ff94ff',
      inlineCode: '#61ffca',
      inlineCodeBackground: '#15141b20',
      blockquote: '#6d6d6d',
      blockquoteBorder: '#2d2d2d',
      listMarker: '#a277ff99'
    },

    chat: {
      userMessage: '#edecee',
      userMessageBackground: '#15141b',
      assistantMessage: '#edecee',
      assistantMessageBackground: '#1d1d1d',
      timestamp: '#6d6d6d',
      divider: '#2d2d2d'
    },

    tools: {
      background: '#15141b30',
      border: '#2d2d2d50',
      headerHover: '#1d1d1d50',
      icon: '#6d6d6d',
      title: '#edecee',
      description: '#7d7d7d',

      edit: {
        added: '#61ffca',
        addedBackground: '#61ffca15',
        removed: '#ff6767',
        removedBackground: '#ff676715',
        lineNumber: '#2d2d2d'
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