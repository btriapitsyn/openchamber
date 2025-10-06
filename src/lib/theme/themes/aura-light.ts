import type { Theme } from '@/types/theme';

/**
 * Aura Light Theme
 * A vibrant theme with purple and pink accents
 */
export const auraLightTheme: Theme = {
  metadata: {
    id: 'aura-light',
    name: 'Aura Light',
    description: 'Light variant of the Aura theme with purple and pink accents',
    author: 'OpenCode Team',
    version: '1.0.0',
    variant: 'light',
    tags: ['light', 'purple', 'pink', 'vibrant']
  },

  colors: {
    // Core semantic colors
    primary: {
      base: '#8c70ff',
      hover: '#9c80ff',
      active: '#ac90ff',
      foreground: '#ffffff',
      muted: '#8c70ff80',
      emphasis: '#7a62f2'
    },

    surface: {
      background: '#f5f2ff',
      foreground: '#1c1333',
      muted: '#ebe6ff',
      mutedForeground: '#5f5585',
      elevated: '#ffffff',
      elevatedForeground: '#1c1333',
      overlay: '#0000001f',
      subtle: '#e4defa'
    },

    interactive: {
      border: '#d8d0f5',
      borderHover: '#cbc2ee',
      borderFocus: '#8c70ff',
      selection: '#8c70ff24',
      selectionForeground: '#1c1333',
      focus: '#8c70ff',
      focusRing: '#8c70ff3d',
      cursor: '#7056f5',
      hover: '#f0ebff',
      active: '#e4ddfb'
    },

    status: {
      error: '#d35d8d',
      errorForeground: '#ffffff',
      errorBackground: '#fbe7f2',
      errorBorder: '#efb9d6',

      warning: '#f3b664',
      warningForeground: '#332200',
      warningBackground: '#fff4e4',
      warningBorder: '#f5d7a8',

      success: '#38c6aa',
      successForeground: '#032821',
      successBackground: '#e4f8f3',
      successBorder: '#a5eedf',

      info: '#7a62f2',
      infoForeground: '#ffffff',
      infoBackground: '#edeafe',
      infoBorder: '#cbc5ff'
    },

    // Syntax highlighting
    syntax: {
      base: {
        background: '#f5f2ff',
        foreground: '#1c1333',
        comment: '#7a6f9c',
        keyword: '#7460f0',
        string: '#2fbe9f',
        number: '#79c26f',
        function: '#8c70ff',
        variable: '#c268ff',
        type: '#5b84ff',
        operator: '#7460f0'
      },

      tokens: {
        commentDoc: '#8a81a9',
        stringEscape: '#22b995',
        keywordImport: '#9f7dff',
        functionCall: '#9b85ff',
        variableProperty: '#ba73ff',
        className: '#5b84ff',
        punctuation: '#3b3154',
        tag: '#7460f0',
        tagAttribute: '#8c70ff',
        tagAttributeValue: '#2fbe9f'
      },

      highlights: {
        diffAdded: '#38c6aa',
        diffAddedBackground: '#38c6aa18',
        diffRemoved: '#d35d8d',
        diffRemovedBackground: '#d35d8d18',
        diffModified: '#8c70ff',
        diffModifiedBackground: '#8c70ff1a',
        lineNumber: '#d0c6ef',
        lineNumberActive: '#5f5585'
      }
    },

    // Component-specific colors
    markdown: {
      heading1: '#8c70ff',
      heading2: '#8c70ffdd',
      heading3: '#8c70ffbb',
      heading4: '#1c1333',
      link: '#7460f0',
      linkHover: '#8c70ff',
      inlineCode: '#2fbe9f',
      inlineCodeBackground: '#ebe6ff',
      blockquote: '#5f5585',
      blockquoteBorder: '#d8d0f5',
      listMarker: '#8c70ff99'
    },

    chat: {
      userMessage: '#1c1333',
      userMessageBackground: '#ebe6ff',
      assistantMessage: '#1c1333',
      assistantMessageBackground: '#f5f2ff',
      timestamp: '#5f5585',
      divider: '#d8d0f5'
    },

    tools: {
      background: '#ebe6ff50',
      border: '#d8d0f580',
      headerHover: '#e4defa',
      icon: '#5f5585',
      title: '#1c1333',
      description: '#6a608f',

      edit: {
        added: '#38c6aa',
        addedBackground: '#38c6aa18',
        removed: '#d35d8d',
        removedBackground: '#d35d8d18',
        lineNumber: '#d0c6ef'
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
