import type { Theme } from '@/types/theme';

export const vercelDarkTheme: Theme = {
  metadata: {
    id: 'vercel-dark',
    name: 'Vercel Dark',
    description: 'Clean, modern dark theme inspired by Vercel\'s design system',
    author: 'Gabriel Romero',
    version: '1.0.0',
    variant: 'dark',
    tags: ['dark', 'modern', 'clean', 'monochrome']
  },

  colors: {

    primary: {
      base: '#ededed',
      hover: '#ffffff',
      active: '#a1a1a1',
      foreground: '#000000',
      muted: '#ededed80',
      emphasis: '#ffffff'
    },

    surface: {
      background: '#0a0a0a',
      foreground: '#ededed',
      muted: '#000000',
      mutedForeground: '#a1a1a1',
      elevated: '#000000',
      elevatedForeground: '#ededed',
      overlay: '#00000080',
      subtle: '#242424'
    },

    interactive: {
      border: '#333333',
      borderHover: '#676767',
      borderFocus: '#ededed',
      selection: '#ffffff1a',
      selectionForeground: '#ededed',
      focus: '#ededed',
      focusRing: '#ededed50',
      cursor: '#ededed',
      hover: '#ffffff1a',
      active: '#333333'
    },

    status: {
      error: '#f05b8d',
      errorForeground: '#000000',
      errorBackground: '#f5646420',
      errorBorder: '#f5646450',

      warning: '#f99902',
      warningForeground: '#000000',
      warningBackground: '#f9990220',
      warningBorder: '#f9990250',

      success: '#58c760',
      successForeground: '#000000',
      successBackground: '#58c76020',
      successBorder: '#58c76050',

      info: '#62a6ff',
      infoForeground: '#000000',
      infoBackground: '#62a6ff20',
      infoBorder: '#62a6ff50'
    },

    syntax: {
      base: {
        background: '#000000',
        foreground: '#ededed',
        comment: '#a1a1a1',
        keyword: '#f05b8d',
        string: '#58c760',
        number: '#62a6ff',
        function: '#b675f1',
        variable: '#ededed',
        type: '#62a6ff',
        operator: '#f05b8d'
      },

      tokens: {
        commentDoc: '#a1a1a1',
        stringEscape: '#ededed',
        keywordImport: '#f05b8d',
        storageModifier: '#f05b8d',
        functionCall: '#b675f1',
        method: '#b675f1',
        variableProperty: '#62a6ff',
        variableOther: '#ededed',
        variableGlobal: '#62a6ff',
        variableLocal: '#ededed',
        parameter: '#ededed',
        constant: '#62a6ff',
        class: '#62a6ff',
        className: '#62a6ff',
        interface: '#62a6ff',
        struct: '#62a6ff',
        enum: '#62a6ff',
        typeParameter: '#62a6ff',
        namespace: '#62a6ff',
        module: '#f05b8d',
        tag: '#f05b8d',
        jsxTag: '#62a6ff',
        tagAttribute: '#b675f1',
        tagAttributeValue: '#58c760',
        boolean: '#62a6ff',
        decorator: '#b675f1',
        label: '#62a6ff',
        punctuation: '#a1a1a1',
        macro: '#b675f1',
        preprocessor: '#f05b8d',
        regex: '#62a6ff',
        url: '#62a6ff',
        key: '#62a6ff',
        exception: '#f05b8d'
      },

      highlights: {
        diffAdded: '#58c760',
        diffAddedBackground: '#58c76020',
        diffRemoved: '#f05b8d',
        diffRemovedBackground: '#f05b8d20',
        diffModified: '#f99902',
        diffModifiedBackground: '#f9990220',
        lineNumber: '#878787',
        lineNumberActive: '#a1a1a1'
      }
    },

    markdown: {
      heading1: '#62a6ff',
      heading2: '#62a6ff',
      heading3: '#62a6ff',
      heading4: '#ededed',
      link: '#62a6ff',
      linkHover: '#b675f1',
      inlineCode: '#b675f1',
      inlineCodeBackground: '#000000',
      blockquote: '#a1a1a1',
      blockquoteBorder: '#333333',
      listMarker: '#f99902'
    },

    chat: {
      userMessage: '#ededed',
      userMessageBackground: '#ffffff1a',
      assistantMessage: '#ededed',
      assistantMessageBackground: '#0a0a0a',
      timestamp: '#a1a1a1',
      divider: '#242424'
    },

    tools: {
      background: '#00000050',
      border: '#33333380',
      headerHover: '#ffffff1a',
      icon: '#a1a1a1',
      title: '#ededed',
      description: '#a1a1a1',

      edit: {
        added: '#58c760',
        addedBackground: '#58c76025',
        removed: '#f05b8d',
        removedBackground: '#f05b8d25',
        lineNumber: '#878787'
      }
    }
  },

  config: {
    fonts: {
      sans: '"System", sans-serif',
      mono: '"Berkeley Mono Variable", monospace',
      heading: '"System", sans-serif'
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
