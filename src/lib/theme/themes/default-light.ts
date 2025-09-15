import type { Theme } from '@/types/theme';

/**
 * Default Light Theme
 * A warm light theme with golden accents
 */
export const defaultLightTheme: Theme = {
  metadata: {
    id: 'default-light',
    name: 'Light',
    description: 'Default light theme with warm colors and golden accents',
    author: 'OpenCode Team',
    version: '1.0.0',
    variant: 'light',
    tags: ['light', 'warm', 'default', 'official'],
    wcagCompliance: {
      AA: true,
      AAA: false
    }
  },
  
  colors: {
    // Core semantic colors
    primary: {
      base: '#d4a03f',           // Golden sand (lighter version)
      hover: '#c09036',
      active: '#a67d2e',
      foreground: '#ffffff',
      muted: '#d4a03f80',
      emphasis: '#e0b050'
    },
    
    surface: {
      background: '#faf9f8',     // Warm white
      foreground: '#1f1d1b',     // Dark warm text
      muted: '#f5f3f0',          // Light warm gray
      mutedForeground: '#656055',
      elevated: '#ffffff',
      elevatedForeground: '#1f1d1b',
      overlay: '#00000020',
      subtle: '#f0ede8'
    },
    
    interactive: {
      border: '#e5e1dc',
      borderHover: '#d0cbc4',
      borderFocus: '#d4a03f',
      selection: '#d4a03f20',
      selectionForeground: '#1f1d1b',
      focus: '#d4a03f',
      focusRing: '#d4a03f40',
      cursor: '#d4a03f',
      hover: '#f5f3f0',
      active: '#ebe8e4'
    },
    
    status: {
      error: '#d1242f',
      errorForeground: '#ffffff',
      errorBackground: '#ffebe9',
      errorBorder: '#ff818266',
      
      warning: '#9a6700',
      warningForeground: '#ffffff',
      warningBackground: '#fff8c5',
      warningBorder: '#f9c51366',
      
      success: '#1a7f37',
      successForeground: '#ffffff',
      successBackground: '#dafbe1',
      successBorder: '#4ac26b66',
      
      info: '#0969da',
      infoForeground: '#ffffff',
      infoBackground: '#ddf4ff',
      infoBorder: '#54aeff66'
    },
    
    // Syntax highlighting
    syntax: {
      base: {
        background: '#f6f8fa',     // Light code background
        foreground: '#24292f',     // Dark text
        comment: '#57606a',        // Gray
        keyword: '#cf222e',        // Red
        string: '#0a3069',         // Dark blue
        number: '#0550ae',         // Blue
        function: '#8250df',       // Purple
        variable: '#953800',       // Brown
        type: '#116329',           // Green
        operator: '#24292f'        // Black
      },
      
      tokens: {
        commentDoc: '#6e7781',
        stringEscape: '#0a3069bb',
        keywordImport: '#cf222edd',
        functionCall: '#8250dfdd',
        variableProperty: '#953800dd',
        className: '#116329dd',
        punctuation: '#57606a',
        tag: '#116329',
        tagAttribute: '#0550ae',
        tagAttributeValue: '#0a3069'
      },
      
      highlights: {
        diffAdded: '#1a7f37',
        diffAddedBackground: '#dafbe1',
        diffRemoved: '#d1242f',
        diffRemovedBackground: '#ffebe9',
        diffModified: '#0969da',
        diffModifiedBackground: '#ddf4ff',
        lineNumber: '#8c959f',
        lineNumberActive: '#1f2328'
      }
    },
    
    markdown: {
      heading1: '#d4a03f',
      heading2: '#d4a03fdd',
      heading3: '#d4a03fbb',
      heading4: '#1f1d1b',
      link: '#0969da',
      linkHover: '#0860c9',
      inlineCode: '#cf222e',
      inlineCodeBackground: '#f5f3f0',
      blockquote: '#656055',
      blockquoteBorder: '#e5e1dc',
      listMarker: '#d4a03f99'
    },
    
    chat: {
      userMessage: '#1f1d1b',
      userMessageBackground: '#f5f3f0',
      assistantMessage: '#1f1d1b',
      assistantMessageBackground: '#ffffff',
      timestamp: '#656055',
      divider: '#e5e1dc'
    },
    
    tools: {
      background: '#f5f3f050',
      border: '#e5e1dc80',
      headerHover: '#ebe8e4',
      icon: '#656055',
      title: '#1f1d1b',
      description: '#656055',
      
      edit: {
        added: '#1a7f37',
        addedBackground: '#dafbe1',
        removed: '#d1242f',
        removedBackground: '#ffebe9',
        lineNumber: '#8c959f'
      }
    }
  },
  
  // Typography system - centralized control over all text styles
  typography: {
    // Base scale for general text - Slightly bigger for better readability
    scale: {
      xs: {
        fontSize: '0.75rem',     // 12px - slightly bigger
        lineHeight: '1.125rem',  // 18px
        letterSpacing: '0.025em'
      },
      sm: {
        fontSize: '0.8125rem',   // 13px - slightly bigger
        lineHeight: '1.25rem',   // 20px
        letterSpacing: '0.02em'
      },
      base: {
        fontSize: '0.9375rem',   // 15px - slightly bigger
        lineHeight: '1.5rem',    // 24px
        letterSpacing: '0.01em'
      },
      lg: {
        fontSize: '1.0625rem',   // 17px - slightly bigger
        lineHeight: '1.625rem',  // 26px
        letterSpacing: '0'
      },
      xl: {
        fontSize: '1.125rem',    // 18px
        lineHeight: '1.75rem',   // 28px
        letterSpacing: '-0.01em'
      },
      '2xl': {
        fontSize: '1.25rem',     // 20px
        lineHeight: '1.875rem',  // 30px
        letterSpacing: '-0.015em'
      },
      '3xl': {
        fontSize: '1.5rem',      // 24px
        lineHeight: '2rem',      // 32px
        letterSpacing: '-0.02em'
      },
      '4xl': {
        fontSize: '1.875rem',    // 30px
        lineHeight: '2.25rem',   // 36px
        letterSpacing: '-0.025em'
      },
      '5xl': {
        fontSize: '2.25rem',     // 36px
        lineHeight: '2.5rem',    // 40px
        letterSpacing: '-0.03em'
      }
    },
    
    // Heading styles - Smaller, more standard sizes
    heading: {
      h1: {
        fontSize: '1.75rem',     // 28px
        lineHeight: '2.25rem',   // 36px
        letterSpacing: '-0.025em',
        fontWeight: '700'
      },
      h2: {
        fontSize: '1.375rem',    // 22px
        lineHeight: '1.875rem',  // 30px
        letterSpacing: '-0.02em',
        fontWeight: '600'
      },
      h3: {
        fontSize: '1.125rem',    // 18px
        lineHeight: '1.625rem',  // 26px
        letterSpacing: '-0.015em',
        fontWeight: '600'
      },
      h4: {
        fontSize: '1rem',        // 16px
        lineHeight: '1.5rem',    // 24px
        letterSpacing: '-0.01em',
        fontWeight: '600'
      },
      h5: {
        fontSize: '0.875rem',    // 14px
        lineHeight: '1.375rem',  // 22px
        letterSpacing: '0',
        fontWeight: '600'
      },
      h6: {
        fontSize: '0.8125rem',   // 13px
        lineHeight: '1.25rem',   // 20px
        letterSpacing: '0.01em',
        fontWeight: '600'
      }
    },
    
    // UI element typography - Slightly bigger for better usability
    ui: {
      button: {
        fontSize: '0.875rem',    // 14px - slightly bigger
        lineHeight: '1.375rem',  // 22px
        letterSpacing: '0.02em',
        fontWeight: '500'
      },
      buttonSmall: {
        fontSize: '0.75rem',     // 12px - slightly bigger
        lineHeight: '1.125rem',  // 18px
        letterSpacing: '0.025em',
        fontWeight: '500'
      },
      buttonLarge: {
        fontSize: '0.9375rem',   // 15px - slightly bigger
        lineHeight: '1.5rem',    // 24px
        letterSpacing: '0.015em',
        fontWeight: '500'
      },
      label: {
        fontSize: '0.6875rem',   // 11px
        lineHeight: '1rem',      // 16px
        letterSpacing: '0.03em',
        fontWeight: '500'
      },
      caption: {
        fontSize: '0.6875rem',   // 11px
        lineHeight: '1rem',      // 16px
        letterSpacing: '0.025em',
        fontWeight: '400'
      },
      badge: {
        fontSize: '0.625rem',    // 10px
        lineHeight: '0.875rem',  // 14px
        letterSpacing: '0.03em',
        fontWeight: '600'
      },
      tooltip: {
        fontSize: '0.6875rem',   // 11px
        lineHeight: '1rem',      // 16px
        letterSpacing: '0.02em',
        fontWeight: '400'
      },
      input: {
        fontSize: '0.875rem',    // 14px - comfortable for input
        lineHeight: '1.375rem',  // 22px
        letterSpacing: '0',
        fontWeight: '400'
      },
      helperText: {
        fontSize: '0.625rem',    // 10px
        lineHeight: '0.875rem',  // 14px
        letterSpacing: '0.02em',
        fontWeight: '400'
      }
    },
    
    // Code typography - Slightly bigger but still compact
    code: {
      inline: {
        fontSize: '0.875em',     // Relative to parent
        lineHeight: '1.4',
        letterSpacing: '0',
        fontWeight: '500'
      },
      block: {
        fontSize: '0.75rem',     // 12px - slightly bigger
        lineHeight: '1.4',
        letterSpacing: '0',
        fontWeight: '400'
      },
      lineNumbers: {
        fontSize: '0.6875rem',   // 11px - slightly bigger
        lineHeight: '1.4',
        letterSpacing: '0',
        fontWeight: '400'
      }
    },
    
    // Markdown-specific typography - Smaller headers, slightly bigger body
    markdown: {
      h1: {
        fontSize: '1.375rem',    // 22px - smaller headers
        lineHeight: '1.875rem',  // 30px
        letterSpacing: '-0.025em',
        fontWeight: '700'
      },
      h2: {
        fontSize: '1.125rem',    // 18px
        lineHeight: '1.625rem',  // 26px
        letterSpacing: '-0.02em',
        fontWeight: '600'
      },
      h3: {
        fontSize: '1rem',        // 16px
        lineHeight: '1.5rem',    // 24px
        letterSpacing: '-0.015em',
        fontWeight: '600'
      },
      h4: {
        fontSize: '0.9375rem',   // 15px
        lineHeight: '1.375rem',  // 22px
        letterSpacing: '-0.01em',
        fontWeight: '600'
      },
      h5: {
        fontSize: '0.875rem',    // 14px
        lineHeight: '1.25rem',   // 20px
        letterSpacing: '0',
        fontWeight: '600'
      },
      h6: {
        fontSize: '0.8125rem',   // 13px
        lineHeight: '1.125rem',  // 18px
        letterSpacing: '0.01em',
        fontWeight: '600'
      },
      body: {
        fontSize: '0.875rem',    // 14px - slightly bigger
        lineHeight: '1.5rem',    // 24px
        letterSpacing: '0',
        fontWeight: '400'
      },
      bodySmall: {
        fontSize: '0.75rem',     // 12px - slightly bigger
        lineHeight: '1.25rem',   // 20px
        letterSpacing: '0.01em',
        fontWeight: '400'
      },
      bodyLarge: {
        fontSize: '0.9375rem',   // 15px - slightly bigger
        lineHeight: '1.625rem',  // 26px
        letterSpacing: '0',
        fontWeight: '400'
      },
      blockquote: {
        fontSize: '0.8125rem',   // 13px
        lineHeight: '1.375rem',  // 22px
        letterSpacing: '0.01em',
        fontWeight: '400'
      },
      list: {
        fontSize: '0.8125rem',   // 13px
        lineHeight: '1.375rem',  // 22px
        letterSpacing: '0',
        fontWeight: '400'
      },
      link: {
        fontSize: 'inherit',     // Inherit from parent
        lineHeight: 'inherit',
        letterSpacing: 'inherit',
        fontWeight: '500'
      },
      code: {
        fontSize: '0.85em',      // Relative to parent
        lineHeight: '1.3',
        letterSpacing: '0',
        fontWeight: '500'
      },
      codeBlock: {
        fontSize: '0.6875rem',   // 11px
        lineHeight: '1.35',
        letterSpacing: '0',
        fontWeight: '400'
      }
    }
  },
  
  config: {
    fonts: {
      sans: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      mono: '"SF Mono", Monaco, "Cascadia Code", "Roboto Mono", Consolas, monospace',
      heading: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
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