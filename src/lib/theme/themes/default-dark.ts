import type { Theme } from '@/types/theme';

/**
 * Default Dark Theme
 * A warm dark theme with golden accents
 */
export const defaultDarkTheme: Theme = {
  metadata: {
    id: 'default-dark',
    name: 'Dark',
    description: 'Default dark theme with warm colors and golden accents',
    author: 'OpenCode Team',
    version: '1.0.0',
    variant: 'dark',
    tags: ['dark', 'warm', 'default', 'official']
  },
  
  colors: {
    // Core semantic colors
    primary: {
      base: '#edb449',           // Golden accent
      hover: '#d4a03f',
      active: '#ba8e36',
      foreground: '#151313',     // Dark text on golden
      muted: '#edb44980',
      emphasis: '#f0c060'
    },
    
    surface: {
      background: '#151313',     // Dark background
      foreground: '#cdccc3',     // Light text
      muted: '#1f1d1b',          // Slightly lighter dark
      mutedForeground: '#9b9a93',
      elevated: '#252321',       // Elevated surfaces
      elevatedForeground: '#d4d3ca',
      overlay: '#00000080',
      subtle: '#2a2826'
    },
    
    interactive: {
      border: '#3a3836',
      borderHover: '#4a4846',
      borderFocus: '#edb449',
      selection: '#edb44930',
      selectionForeground: '#cdccc3',
      focus: '#edb449',
      focusRing: '#edb44950',
      cursor: '#edb449',
      hover: '#2a2826',
      active: '#323030'
    },
    
    status: {
      error: '#e06c75',
      errorForeground: '#ffffff',
      errorBackground: '#e06c7520',
      errorBorder: '#e06c7550',
      
      warning: '#e5c07b',
      warningForeground: '#151313',
      warningBackground: '#e5c07b20',
      warningBorder: '#e5c07b50',
      
      success: '#98c379',
      successForeground: '#151313',
      successBackground: '#98c37920',
      successBorder: '#98c37950',
      
      info: '#61afef',
      infoForeground: '#ffffff',
      infoBackground: '#61afef20',
      infoBorder: '#61afef50'
    },
    
    // Syntax highlighting
    syntax: {
      base: {
        background: '#1a1817',     // Code block background
        foreground: '#cdccc3',     // Default text
        comment: '#7d7c75',        // Muted gray
        keyword: '#c678dd',        // Purple
        string: '#98c379',         // Green
        number: '#d19a66',         // Orange
        function: '#61afef',       // Blue
        variable: '#e06c75',       // Red
        type: '#56b6c2',           // Cyan
        operator: '#abb2bf'        // Gray
      },
      
      // Optional token overrides for fine-tuning
      tokens: {
        commentDoc: '#8d8c85',
        stringEscape: '#7db359',
        keywordImport: '#d688e9',
        functionCall: '#71bfff',
        variableProperty: '#f07c85',
        className: '#66c6d2',
        punctuation: '#9b9a93',
        tag: '#e06c75',
        tagAttribute: '#d19a66',
        tagAttributeValue: '#98c379'
      },
      
      // Diff highlighting
      highlights: {
        diffAdded: '#98c379',
        diffAddedBackground: '#98c37915',
        diffRemoved: '#e06c75',
        diffRemovedBackground: '#e06c7515',
        diffModified: '#61afef',
        diffModifiedBackground: '#61afef15',
        lineNumber: '#4a4846',
        lineNumberActive: '#7d7c75'
      }
    },
    
    // Component-specific colors (optional overrides)
    markdown: {
      heading1: '#edb449',
      heading2: '#edb449dd',
      heading3: '#edb449bb',
      heading4: '#cdccc3',
      link: '#61afef',
      linkHover: '#71bfff',
      inlineCode: '#98c379',
      inlineCodeBackground: '#2a282620',
      blockquote: '#9b9a93',
      blockquoteBorder: '#3a3836',
      listMarker: '#edb44999'
    },
    
    chat: {
      userMessage: '#cdccc3',
      userMessageBackground: '#252321',
      assistantMessage: '#cdccc3',
      assistantMessageBackground: '#1f1d1b',
      timestamp: '#7d7c75',
      divider: '#3a3836'
    },
    
    tools: {
      background: '#1f1d1b30',
      border: '#3a383650',
      headerHover: '#2a282650',
      icon: '#9b9a93',
      title: '#cdccc3',
      description: '#7d7c75',
      
      edit: {
        added: '#98c379',
        addedBackground: '#98c37915',
        removed: '#e06c75',
        removedBackground: '#e06c7515',
        lineNumber: '#4a4846'
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