import type { Theme } from '@/types/theme';

export const vercelLightTheme: Theme = {
  metadata: {
    id: 'vercel-light',
    name: 'Vercel Light',
    description: 'Clean, modern color scheme inspired by Vercel - light variant',
    author: 'Gabriel Antoreno',
    version: '1.0.0',
    variant: 'light',
    tags: ['light', 'modern', 'clean', 'minimal']
  },

  colors: {

    primary: {
      base: '#171717',
      hover: '#000000',
      active: '#000000',
      foreground: '#fafafa',
      muted: '#17171780',
      emphasis: '#000000'
    },

    surface: {
      background: '#ffffff',
      foreground: '#171717',
      muted: '#fafafa',
      mutedForeground: '#666666',
      elevated: '#f5f5f5',
      elevatedForeground: '#171717',
      overlay: '#0000001a',
      subtle: '#ebebeb'
    },

    interactive: {
      border: '#ebebeb',
      borderHover: '#cccccc',
      borderFocus: '#171717',
      selection: '#0000001a',
      selectionForeground: '#171717',
      focus: '#171717',
      focusRing: '#17171740',
      cursor: '#171717',
      hover: '#0000001a',
      active: '#cccccc'
    },

    status: {
       error: '#c62128',
       errorForeground: '#ffffff',
       errorBackground: '#c6212820',
       errorBorder: '#c6212850',

       warning: '#9e5200',
      warningForeground: '#ffffff',
      warningBackground: '#9e520020',
      warningBorder: '#9e520050',

      success: '#397c3b',
      successForeground: '#ffffff',
      successBackground: '#397c3b20',
      successBorder: '#397c3b50',

      info: '#005ee9',
      infoForeground: '#ffffff',
      infoBackground: '#005ee920',
      infoBorder: '#005ee950'
    },

    syntax: {
      base: {
        background: '#fafafa',
        foreground: '#171717',
        comment: '#666666',
        keyword: '#b32c62',
        string: '#397c3b',
        number: '#005ee9',
        function: '#7200c4',
        variable: '#171717',
        type: '#005ee9',
        operator: '#b32c62'
      },

      tokens: {
        commentDoc: '#666666',
        stringEscape: '#005ee9',
        keywordImport: '#b32c62',
        storageModifier: '#b32c62',
        functionCall: '#7200c4',
        method: '#7200c4',
        variableProperty: '#005ee9',
        variableOther: '#171717',
        variableGlobal: '#005ee9',
        variableLocal: '#171717',
        parameter: '#171717',
        constant: '#005ee9',
        class: '#7200c4',
        className: '#7200c4',
        interface: '#005ee9',
        struct: '#7200c4',
        enum: '#7200c4',
        typeParameter: '#005ee9',
        namespace: '#005ee9',
        module: '#005ee9',
        tag: '#397c3b',
        jsxTag: '#005ee9',
        tagAttribute: '#7200c4',
        tagAttributeValue: '#397c3b',
        boolean: '#005ee9',
        decorator: '#7200c4',
        label: '#005ee9',
        punctuation: '#666666',
        macro: '#7200c4',
        preprocessor: '#b32c62',
        regex: '#005ee9',
        url: '#005ee9',
        key: '#005ee9',
        exception: '#b32c62'
      },

      highlights: {
        diffAdded: '#397c3b',
        diffAddedBackground: '#397c3b33',
        diffRemoved: '#b32c62',
        diffRemovedBackground: '#b32c6233',
        diffModified: '#9e5200',
        diffModifiedBackground: '#9e520033',
        lineNumber: '#a8a8a8',
        lineNumberActive: '#666666'
      }
    },

    markdown: {
      heading1: '#005ee9',
      heading2: '#005ee9',
      heading3: '#005ee9',
      heading4: '#171717',
      link: '#005ee9',
      linkHover: '#0052cc',
      inlineCode: '#005ee9',
      inlineCodeBackground: '#fafafa',
      blockquote: '#005ee9',
      blockquoteBorder: '#ebebeb',
      listMarker: '#9e5200'
    },

    chat: {
      userMessage: '#171717',
      userMessageBackground: '#fafafa',
      assistantMessage: '#171717',
      assistantMessageBackground: '#ffffff',
      timestamp: '#666666',
      divider: '#ebebeb'
    },

    tools: {
      background: '#fafafa50',
      border: '#ebebeb80',
      headerHover: '#ebebeb',
      icon: '#666666',
       title: '#171717',
      description: '#666666',

      edit: {
        added: '#397c3b',
        addedBackground: '#397c3b25',
        removed: '#b32c62',
        removedBackground: '#b32c6225',
        lineNumber: '#a8a8a8'
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
