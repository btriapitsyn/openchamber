import type { Theme } from '@/types/theme';

/**
 * Everforest Dark Theme
 * A nature-inspired theme with green and brown accents (same as light variant)
 */
export const everforestDarkTheme: Theme = {
  metadata: {
    id: 'everforest-dark',
    name: 'Everforest Dark',
    description: 'Dark variant of the Everforest theme with nature-inspired colors',
    author: 'OpenCode Team',
    version: '1.0.0',
    variant: 'dark',
    tags: ['dark', 'nature', 'green', 'brown']
  },

  colors: {
    // Core semantic colors
    primary: {
      base: '#a7c080',
      hover: '#b7d090',
      active: '#c7e0a0',
      foreground: '#000000',
      muted: '#a7c08080',
      emphasis: '#97b070'
    },

    surface: {
      background: '#2f383e',
      foreground: '#d3c6aa',
      muted: '#374145',
      mutedForeground: '#9da9a0',
      elevated: '#374145',
      elevatedForeground: '#d3c6aa',
      overlay: '#00000080',
      subtle: '#374145'
    },

    interactive: {
      border: '#4a5559',
      borderHover: '#5a6569',
      borderFocus: '#a7c080',
      selection: '#a7c08030',
      selectionForeground: '#d3c6aa',
      focus: '#a7c080',
      focusRing: '#a7c08050',
      cursor: '#a7c080',
      hover: '#475155',
      active: '#576165'
    },

    status: {
      error: '#e67e80',
      errorForeground: '#000000',
      errorBackground: '#e67e8020',
      errorBorder: '#e67e8050',

      warning: '#e3a84e',
      warningForeground: '#000000',
      warningBackground: '#e3a84e20',
      warningBorder: '#e3a84e50',

      success: '#a7c080',
      successForeground: '#000000',
      successBackground: '#a7c08020',
      successBorder: '#a7c08050',

      info: '#7fbbb3',
      infoForeground: '#000000',
      infoBackground: '#7fbbb320',
      infoBorder: '#7fbbb350'
    },

    // Syntax highlighting
    syntax: {
      base: {
        background: '#374145',
        foreground: '#d3c6aa',
        comment: '#859289',
        keyword: '#e67e80',
        string: '#dbbc7f',
        number: '#d699b6',
        function: '#a7c080',
        variable: '#e3a84e',
        type: '#7fbbb3',
        operator: '#e67e80'
      },

      tokens: {
        commentDoc: '#95a299',
        stringEscape: '#cbbc6f',
        keywordImport: '#f68e90',
        functionCall: '#b7d090',
        variableProperty: '#f3b85e',
        className: '#8fcbb3',
        punctuation: '#d3c6aa',
        tag: '#e67e80',
        tagAttribute: '#a7c080',
        tagAttributeValue: '#dbbc7f'
      },

      highlights: {
        diffAdded: '#a7c080',
        diffAddedBackground: '#a7c08015',
        diffRemoved: '#e67e80',
        diffRemovedBackground: '#e67e8015',
        diffModified: '#a7c080',
        diffModifiedBackground: '#a7c08015',
        lineNumber: '#4a5559',
        lineNumberActive: '#9da9a0'
      }
    },

    // Component-specific colors
    markdown: {
      heading1: '#a7c080',
      heading2: '#a7c080dd',
      heading3: '#a7c080bb',
      heading4: '#d3c6aa',
      link: '#e67e80',
      linkHover: '#f68e90',
      inlineCode: '#dbbc7f',
      inlineCodeBackground: '#37414520',
      blockquote: '#9da9a0',
      blockquoteBorder: '#4a5559',
      listMarker: '#a7c08099'
    },

    chat: {
      userMessage: '#d3c6aa',
      userMessageBackground: '#374145',
      assistantMessage: '#d3c6aa',
      assistantMessageBackground: '#475155',
      timestamp: '#9da9a0',
      divider: '#4a5559'
    },

    tools: {
      background: '#37414530',
      border: '#4a555950',
      headerHover: '#47515550',
      icon: '#9da9a0',
      title: '#d3c6aa',
      description: '#adb9b0',

      edit: {
        added: '#a7c080',
        addedBackground: '#a7c08015',
        removed: '#e67e80',
        removedBackground: '#e67e8015',
        lineNumber: '#4a5559'
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