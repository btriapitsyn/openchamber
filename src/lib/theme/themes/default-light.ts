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
    tags: ['light', 'warm', 'default', 'official']
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