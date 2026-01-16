import type { Theme } from '@/types/theme';

export const kanagawaLightTheme: Theme = {
  metadata: {
    id: 'kanagawa-light',
    name: 'Kanagawa Light',
    description: 'A color scheme inspired by Japanese art and ink painting - light variant (Lotus)',
    author: 'rebelot',
    version: '1.0.0',
    variant: 'light',
    tags: ['light', 'japanese', 'lotus', 'elegant']
  },

  colors: {

    primary: {
      base: '#4d699b',
      hover: '#6693bf',
      active: '#5d57a3',
      foreground: '#F2ECBC',
      muted: '#4d699b80',
      emphasis: '#6693bf'
    },

    surface: {
      background: '#F2ECBC',
      foreground: '#545464',
      muted: '#DCD5AC',
      mutedForeground: '#8a8980',
      elevated: '#D5CEA3',
      elevatedForeground: '#545464',
      overlay: '#54546433',
      subtle: '#B7D0AE'
    },

    interactive: {
      border: '#716e61',
      borderHover: '#8a8980',
      borderFocus: '#4d699b',
      selection: '#4d699b33',
      selectionForeground: '#545464',
      focus: '#4d699b',
      focusRing: '#4d699b40',
      cursor: '#545464',
      hover: '#716e61',
      active: '#8a8980'
    },

    status: {
       error: '#E82424',
       errorForeground: '#F2ECBC',
       errorBackground: '#E8242420',
       errorBorder: '#E8242450',

       warning: '#de9800',
      warningForeground: '#545464',
      warningBackground: '#de980020',
      warningBorder: '#de980050',

      success: '#6f894e',
      successForeground: '#F2ECBC',
      successBackground: '#98BB6C20',
      successBorder: '#6f894e50',

      info: '#4d699b',
      infoForeground: '#F2ECBC',
      infoBackground: '#6693bf20',
      infoBorder: '#4d699b50'
    },

    syntax: {
      base: {
        background: '#DCD5AC',
        foreground: '#545464',
        comment: '#716e61',
        keyword: '#4d699b',
        string: '#6f894e',
        number: '#836f4a',
        function: '#cc6d00',
        variable: '#545464',
        type: '#77713f',
        operator: '#c84053'
      },

      tokens: {
        commentDoc: '#8a8980',
        stringEscape: '#545464',
        keywordImport: '#624c83',
        storageModifier: '#4d699b',
        functionCall: '#cc6d00',
        method: '#6e915f',
        variableProperty: '#4d699b',
        variableOther: '#6e915f',
        variableGlobal: '#b35b79',
        variableLocal: '#D5CEA3',
        parameter: '#545464',
        constant: '#545464',
        class: '#cc6d00',
        className: '#cc6d00',
        interface: '#77713f',
        struct: '#cc6d00',
        enum: '#cc6d00',
        typeParameter: '#cc6d00',
        namespace: '#77713f',
        module: '#c84053',
        tag: '#4d699b',
        jsxTag: '#b35b79',
        tagAttribute: '#77713f',
        tagAttributeValue: '#6f894e',
        boolean: '#77713f',
        decorator: '#77713f',
        label: '#b35b79',
        punctuation: '#716e61',
        macro: '#4d699b',
        preprocessor: '#b35b79',
        regex: '#6f894e',
        url: '#4d699b',
        key: '#cc6d00',
        exception: '#b35b79'
      },

      highlights: {
        diffAdded: '#6f894e',
        diffAddedBackground: '#6f894e20',
        diffRemoved: '#c84053',
        diffRemovedBackground: '#c8405320',
        diffModified: '#4d699b',
        diffModifiedBackground: '#4d699b20',
        lineNumber: '#8a8980',
        lineNumberActive: '#545464'
      }
    },

    markdown: {
      heading1: '#836f4a',
      heading2: '#cc6d00',
      heading3: '#4d699b',
      heading4: '#545464',
      link: '#5d57a3',
      linkHover: '#4d699b',
      inlineCode: '#6f894e',
      inlineCodeBackground: '#DCD5AC',
      blockquote: '#716e61',
      blockquoteBorder: '#716e61',
      listMarker: '#836f4a99'
    },

    chat: {
      userMessage: '#545464',
      userMessageBackground: '#DCD5AC',
      assistantMessage: '#545464',
      assistantMessageBackground: '#F2ECBC',
      timestamp: '#716e61',
      divider: '#716e61'
    },

    tools: {
      background: '#DCD5AC50',
      border: '#716e6180',
      headerHover: '#716e61',
      icon: '#8a8980',
       title: '#545464',
      description: '#8a8980',

      edit: {
        added: '#6f894e',
        addedBackground: '#6f894e25',
        removed: '#c84053',
        removedBackground: '#c8405325',
        lineNumber: '#8a8980'
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
