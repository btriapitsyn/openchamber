import type { Theme } from '@/types/theme';

/**
 * Flexoki Dark Theme
 * Inky color scheme for low-light situations
 */
export const flexokiDarkTheme: Theme = {
  metadata: {
    id: 'flexoki-dark',
    name: 'Flexoki Dark',
    description: 'Inky color scheme for low-light situations',
    author: 'Steph Ango <stephango.com>',
    version: '1.0.0',
    variant: 'dark',
    tags: ['dark', 'flexoki', 'minimal', 'editor'],
    wcagCompliance: {
      AA: true,
      AAA: false
    }
  },

  colors: {
    primary: {
      base: '#3AA99F',
      hover: '#24837B',
      active: '#164F4A',
      foreground: '#100F0F',
      muted: '#3AA99F80',
      emphasis: '#4CC9BE'
    },

    surface: {
      background: '#100F0F',
      foreground: '#CECDC3',
      muted: '#282726',
      mutedForeground: '#878580',
      elevated: '#1C1B1A',
      elevatedForeground: '#CECDC3',
      overlay: '#00000080',
      subtle: '#343331'
    },

    interactive: {
      border: '#282726',
      borderHover: '#343331',
      borderFocus: '#3AA99F',
      selection: '#3AA99F40',
      selectionForeground: '#CECDC3',
      focus: '#3AA99F',
      focusRing: '#3AA99F50',
      cursor: '#CECDC3',
      hover: '#282726',
      active: '#343331'
    },

    status: {
      error: '#D14D41',
      errorForeground: '#FFFCF0',
      errorBackground: '#261312',
      errorBorder: '#D14D4150',

      warning: '#D0A215',
      warningForeground: '#100F0F',
      warningBackground: '#241E08',
      warningBorder: '#D0A21550',

      success: '#879A39',
      successForeground: '#FFFCF0',
      successBackground: '#1A1E0C',
      successBorder: '#879A3950',

      info: '#3AA99F',
      infoForeground: '#FFFCF0',
      infoBackground: '#101F1D',
      infoBorder: '#3AA99F50'
    },

    syntax: {
      base: {
        background: '#100F0F',
        foreground: '#CECDC3',
        comment: '#575653',
        keyword: '#879A39',
        string: '#3AA99F',
        number: '#8B7EC8',
        function: '#DA702C',
        variable: '#4385BE',
        type: '#D0A215',
        operator: '#878580'
      },

      tokens: {
        commentDoc: '#6F6E69',
        stringEscape: '#4CC9BE',
        keywordImport: '#9BB346',
        functionCall: '#E8994D',
        variableProperty: '#4385BE',
        variableBuiltin: '#5B9FD8',
        className: '#E1B434',
        constant: '#8B7EC8',
        punctuation: '#878580',
        tag: '#4385BE',
        tagAttribute: '#DA702C',
        namespace: '#CE5D97',
        decorator: '#DA702C',
        boolean: '#DA702C',
        property: '#DA702C',
        constructor: '#4385BE',
        preproc: '#CE5D97'
      }
    },

    charts: {
      series: ['#3AA99F', '#879A39', '#D0A215', '#D14D41', '#CE5D97', '#4385BE']
    },

    loading: {
      spinner: '#3AA99F',
      spinnerTrack: '#282726'
    },

    markdown: {
      heading1: '#879A39',
      heading2: '#879A39',
      heading3: '#879A39',
      heading4: '#CECDC3',
      link: '#3AA99F',
      linkHover: '#4CC9BE',
      inlineCode: '#879A39',
      inlineCodeBackground: '#28272620',
      blockquote: '#878580',
      blockquoteBorder: '#282726',
      listMarker: '#3AA99F99'
    },

    chat: {
      userMessage: '#CECDC3',
      userMessageBackground: '#1C1B1A',
      assistantMessage: '#CECDC3',
      assistantMessageBackground: '#282726',
      timestamp: '#878580',
      divider: '#343331'
    },

    tools: {
      background: '#28272630',
      border: '#34333150',
      headerHover: '#34333150',
      icon: '#878580',
      title: '#CECDC3',
      description: '#878580',
      edit: {
        added: '#879A39',
        addedBackground: '#879A3915',
        removed: '#D14D41',
        removedBackground: '#D14D4115',
        lineNumber: '#575653'
      }
    }
  },

  typography: {
    scale: {
      xs: { fontSize: '0.75rem', lineHeight: '1rem', letterSpacing: '0.025em' },
      sm: { fontSize: '0.875rem', lineHeight: '1.25rem', letterSpacing: '0.015em' },
      base: { fontSize: '0.9375rem', lineHeight: '1.375rem', letterSpacing: '0' },
      lg: { fontSize: '1.0625rem', lineHeight: '1.625rem', letterSpacing: '-0.01em' },
      xl: { fontSize: '1.1875rem', lineHeight: '1.8125rem', letterSpacing: '-0.015em' },
      '2xl': { fontSize: '1.3125rem', lineHeight: '1.8125rem', letterSpacing: '-0.02em' },
      '3xl': { fontSize: '1.5625rem', lineHeight: '2.0625rem', letterSpacing: '-0.025em' },
      '4xl': { fontSize: '1.9375rem', lineHeight: '2.3125rem', letterSpacing: '-0.03em' },
      '5xl': { fontSize: '2.3125rem', lineHeight: '2.5625rem', letterSpacing: '-0.035em' }
    },

    heading: {
      h1: { fontSize: '1.875rem', lineHeight: '2.25rem', letterSpacing: '-0.025em', fontWeight: '700' },
      h2: { fontSize: '1.5rem', lineHeight: '2rem', letterSpacing: '-0.02em', fontWeight: '600' },
      h3: { fontSize: '1.25rem', lineHeight: '1.75rem', letterSpacing: '-0.015em', fontWeight: '600' },
      h4: { fontSize: '1.125rem', lineHeight: '1.5rem', letterSpacing: '-0.01em', fontWeight: '600' },
      h5: { fontSize: '1rem', lineHeight: '1.5rem', letterSpacing: '0', fontWeight: '600' },
      h6: { fontSize: '0.9375rem', lineHeight: '1.375rem', letterSpacing: '0.01em', fontWeight: '600' }
    },

    ui: {
      button: { fontSize: '0.9375rem', lineHeight: '1.375rem', letterSpacing: '0.02em', fontWeight: '500' },
      buttonSmall: { fontSize: '0.8125rem', lineHeight: '1.125rem', letterSpacing: '0.025em', fontWeight: '500' },
      buttonLarge: { fontSize: '1.0625rem', lineHeight: '1.625rem', letterSpacing: '0.015em', fontWeight: '500' },
      label: { fontSize: '0.8125rem', lineHeight: '1.125rem', letterSpacing: '0.025em', fontWeight: '500' },
      caption: { fontSize: '0.8125rem', lineHeight: '1.125rem', letterSpacing: '0.025em', fontWeight: '400' },
      badge: { fontSize: '0.8125rem', lineHeight: '1.125rem', letterSpacing: '0.025em', fontWeight: '600' },
      tooltip: { fontSize: '0.8125rem', lineHeight: '1.125rem', letterSpacing: '0.015em', fontWeight: '400' },
      input: { fontSize: '0.9375rem', lineHeight: '1.375rem', letterSpacing: '0', fontWeight: '400' },
      helperText: { fontSize: '0.8125rem', lineHeight: '1.125rem', letterSpacing: '0.015em', fontWeight: '400' }
    },

    code: {
      inline: { fontSize: '0.85em', lineHeight: '1.4', letterSpacing: '0', fontWeight: '500' },
      block: { fontSize: '0.75rem', lineHeight: '1.25rem', letterSpacing: '0', fontWeight: '400' },
      lineNumbers: { fontSize: '0.75rem', lineHeight: '1.25rem', letterSpacing: '0', fontWeight: '400' }
    },

    markdown: {
      h1: { fontSize: '1.125rem', lineHeight: '1.5rem', letterSpacing: '-0.025em', fontWeight: '700' },
      h2: { fontSize: '1rem', lineHeight: '1.5rem', letterSpacing: '-0.02em', fontWeight: '600' },
      h3: { fontSize: '0.875rem', lineHeight: '1.25rem', letterSpacing: '-0.015em', fontWeight: '600' },
      h4: { fontSize: '0.875rem', lineHeight: '1.25rem', letterSpacing: '-0.01em', fontWeight: '600' },
      h5: { fontSize: '0.875rem', lineHeight: '1.25rem', letterSpacing: '0', fontWeight: '600' },
      h6: { fontSize: '0.875rem', lineHeight: '1.25rem', letterSpacing: '0.01em', fontWeight: '600' },
      body: { fontSize: '0.9375rem', lineHeight: '1.375rem', letterSpacing: '0', fontWeight: '400' },
      bodySmall: { fontSize: '0.8125rem', lineHeight: '1.125rem', letterSpacing: '0.01em', fontWeight: '400' },
      bodyLarge: { fontSize: '1.0625rem', lineHeight: '1.625rem', letterSpacing: '0', fontWeight: '400' },
      blockquote: { fontSize: '0.9375rem', lineHeight: '1.375rem', letterSpacing: '0.01em', fontWeight: '400' },
      list: { fontSize: '0.9375rem', lineHeight: '1.375rem', letterSpacing: '0', fontWeight: '400' },
      link: { fontSize: 'inherit', lineHeight: 'inherit', letterSpacing: 'inherit', fontWeight: '500' },
      code: { fontSize: '0.85em', lineHeight: '1.4', letterSpacing: '0', fontWeight: '500' },
      codeBlock: { fontSize: '0.75rem', lineHeight: '1.25rem', letterSpacing: '0', fontWeight: '400' }
    }
  },

  config: {
    fonts: {
      sans: 'system-ui, -apple-system, \'Segoe UI\', sans-serif',
      mono: '\'JetBrains Mono\', \'Fira Code\', monospace'
    },
    radius: {
      none: '0',
      sm: '0.125rem',
      md: '0.375rem',
      lg: '0.5rem',
      xl: '0.75rem',
      full: '9999px'
    }
  }
};