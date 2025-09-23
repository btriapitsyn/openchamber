// Typography utility functions and style objects
// These helpers make it easy to apply typography CSS variables throughout the app
// Now using semantic typography system for consistent, logical sizing

/**
 * Semantic Typography style objects
 * All elements are grouped by their semantic role, not individual styling
 */
export const typography = {
  // Semantic typography groups - font-size only
  // Font-weight, line-height, and letter-spacing applied directly in components
  
  /**
   * Markdown Content Typography
   * All markdown elements (p, h1-h6, lists, blockquotes) use the same size
   * Visual hierarchy achieved through colors and font-weight only
   */
  semanticMarkdown: {
    fontSize: 'var(--text-markdown)',
  },
  
  /**
   * Code Content Typography  
   * All code-related content (blocks, inline, tool output, errors) use same size
   * Creates consistent code appearance regardless of context
   */
  semanticCode: {
    fontSize: 'var(--text-code)',
  },
  
  /**
   * UI Header Typography
   * Interface-level headings (dialog titles, panel headers, section titles)
   * Independent from markdown content hierarchy
   */
  uiHeader: {
    fontSize: 'var(--text-ui-header)',
  },
  
  /**
   * UI Label Typography
   * All interactive elements (buttons, menus, navigation, form labels)
   * Unified interaction patterns across the interface
   */
  uiLabel: {
    fontSize: 'var(--text-ui-label)',
  },
  
  /**
   * Metadata Typography
   * Secondary information (timestamps, status, helper text, descriptions)
   * Visually subordinate to primary content
   */
  meta: {
    fontSize: 'var(--text-meta)',
  },
  
  /**
   * Micro Typography
   * Smallest UI details (badges, shortcuts, indicators, tooltips)
   * Consistent unobtrusive appearance for minimal elements
   */
  micro: {
    fontSize: 'var(--text-micro)',
  },
  
  // Legacy compatibility - mapped to semantic variables
  // These maintain backward compatibility while using the new system
  
  scale: {
    xs: {
      fontSize: 'var(--text-meta)',
      lineHeight: 'var(--line-height-xs)',
      letterSpacing: 'var(--letter-spacing-xs)',
    },
    sm: {
      fontSize: 'var(--text-meta)',
      lineHeight: 'var(--line-height-sm)',
      letterSpacing: 'var(--letter-spacing-sm)',
    },
    base: {
      fontSize: 'var(--text-markdown)',
      lineHeight: 'var(--line-height-base)',
      letterSpacing: 'var(--letter-spacing-base)',
    },
    lg: {
      fontSize: 'var(--text-markdown)',
      lineHeight: 'var(--line-height-lg)',
      letterSpacing: 'var(--letter-spacing-lg)',
    },
    xl: {
      fontSize: 'var(--text-ui-header)',
      lineHeight: 'var(--line-height-xl)',
      letterSpacing: 'var(--letter-spacing-xl)',
    },
    '2xl': {
      fontSize: 'var(--text-ui-header)',
      lineHeight: 'var(--line-height-2xl)',
      letterSpacing: 'var(--letter-spacing-2xl)',
    },
    '3xl': {
      fontSize: 'var(--text-ui-header)',
      lineHeight: 'var(--line-height-3xl)',
      letterSpacing: 'var(--letter-spacing-3xl)',
    },
    '4xl': {
      fontSize: 'var(--text-ui-header)',
      lineHeight: 'var(--line-height-4xl)',
      letterSpacing: 'var(--letter-spacing-4xl)',
    },
    '5xl': {
      fontSize: 'var(--text-ui-header)',
      lineHeight: 'var(--line-height-5xl)',
      letterSpacing: 'var(--letter-spacing-5xl)',
    },
  },
  
  // Headings - all use markdown size, differentiated by weight/color
  heading: {
    h1: {
      fontSize: 'var(--text-markdown)',
      lineHeight: 'var(--h1-line-height)',
      letterSpacing: 'var(--h1-letter-spacing)',
      fontWeight: 'var(--h1-font-weight)',
    },
    h2: {
      fontSize: 'var(--text-markdown)',
      lineHeight: 'var(--h2-line-height)',
      letterSpacing: 'var(--h2-letter-spacing)',
      fontWeight: 'var(--h2-font-weight)',
    },
    h3: {
      fontSize: 'var(--text-markdown)',
      lineHeight: 'var(--h3-line-height)',
      letterSpacing: 'var(--h3-letter-spacing)',
      fontWeight: 'var(--h3-font-weight)',
    },
    h4: {
      fontSize: 'var(--text-markdown)',
      lineHeight: 'var(--h4-line-height)',
      letterSpacing: 'var(--h4-letter-spacing)',
      fontWeight: 'var(--h4-font-weight)',
    },
    h5: {
      fontSize: 'var(--text-markdown)',
      lineHeight: 'var(--h5-line-height)',
      letterSpacing: 'var(--h5-letter-spacing)',
      fontWeight: 'var(--h5-font-weight)',
    },
    h6: {
      fontSize: 'var(--text-markdown)',
      lineHeight: 'var(--h6-line-height)',
      letterSpacing: 'var(--h6-letter-spacing)',
      fontWeight: 'var(--h6-font-weight)',
    },
  },
  
  // UI elements - mapped to semantic variables
  ui: {
    button: {
      fontSize: 'var(--text-ui-label)',
      lineHeight: 'var(--ui-button-line-height)',
      letterSpacing: 'var(--ui-button-letter-spacing)',
      fontWeight: 'var(--ui-button-font-weight)',
    },
    buttonSmall: {
      fontSize: 'var(--text-meta)',
      lineHeight: 'var(--ui-button-small-line-height)',
      letterSpacing: 'var(--ui-button-small-letter-spacing)',
      fontWeight: 'var(--ui-button-small-font-weight)',
    },
    buttonLarge: {
      fontSize: 'var(--text-ui-label)',
      lineHeight: 'var(--ui-button-large-line-height)',
      letterSpacing: 'var(--ui-button-large-letter-spacing)',
      fontWeight: 'var(--ui-button-large-font-weight)',
    },
    label: {
      fontSize: 'var(--text-meta)',
      lineHeight: 'var(--ui-label-line-height)',
      letterSpacing: 'var(--ui-label-letter-spacing)',
      fontWeight: 'var(--ui-label-font-weight)',
    },
    caption: {
      fontSize: 'var(--text-micro)',
      lineHeight: 'var(--ui-caption-line-height)',
      letterSpacing: 'var(--ui-caption-letter-spacing)',
      fontWeight: 'var(--ui-caption-font-weight)',
    },
    badge: {
      fontSize: 'var(--text-micro)',
      lineHeight: 'var(--ui-badge-line-height)',
      letterSpacing: 'var(--ui-badge-letter-spacing)',
      fontWeight: 'var(--ui-badge-font-weight)',
    },
    tooltip: {
      fontSize: 'var(--text-micro)',
      lineHeight: 'var(--ui-tooltip-line-height)',
      letterSpacing: 'var(--ui-tooltip-letter-spacing)',
      fontWeight: 'var(--ui-tooltip-font-weight)',
    },
    input: {
      fontSize: 'var(--text-ui-label)',
      lineHeight: 'var(--ui-input-line-height)',
      letterSpacing: 'var(--ui-input-letter-spacing)',
      fontWeight: 'var(--ui-input-font-weight)',
    },
    helperText: {
      fontSize: 'var(--text-meta)',
      lineHeight: 'var(--ui-helper-text-line-height)',
      letterSpacing: 'var(--ui-helper-text-letter-spacing)',
      fontWeight: 'var(--ui-helper-text-font-weight)',
    },
  },
  
  // Code - mapped to semantic variables
  code: {
    inline: {
      fontSize: 'var(--text-code)',
      lineHeight: 'var(--code-inline-line-height)',
      letterSpacing: 'var(--code-inline-letter-spacing)',
      fontWeight: 'var(--code-inline-font-weight)',
    },
    block: {
      fontSize: 'var(--text-code)',
      lineHeight: 'var(--code-block-line-height)',
      letterSpacing: 'var(--code-block-letter-spacing)',
      fontWeight: 'var(--code-block-font-weight)',
    },
    lineNumbers: {
      fontSize: 'var(--text-micro)',
      lineHeight: 'var(--code-line-numbers-line-height)',
      letterSpacing: 'var(--code-line-numbers-letter-spacing)',
      fontWeight: 'var(--code-line-numbers-font-weight)',
    },
  },
  
  // Markdown - all use semantic markdown size
  markdown: {
    h1: {
      fontSize: 'var(--text-markdown)',
      lineHeight: 'var(--markdown-h1-line-height)',
      letterSpacing: 'var(--markdown-h1-letter-spacing)',
      fontWeight: 'var(--markdown-h1-font-weight)',
    },
    h2: {
      fontSize: 'var(--text-markdown)',
      lineHeight: 'var(--markdown-h2-line-height)',
      letterSpacing: 'var(--markdown-h2-letter-spacing)',
      fontWeight: 'var(--markdown-h2-font-weight)',
    },
    h3: {
      fontSize: 'var(--text-markdown)',
      lineHeight: 'var(--markdown-h3-line-height)',
      letterSpacing: 'var(--markdown-h3-letter-spacing)',
      fontWeight: 'var(--markdown-h3-font-weight)',
    },
    h4: {
      fontSize: 'var(--text-markdown)',
      lineHeight: 'var(--markdown-h4-line-height)',
      letterSpacing: 'var(--markdown-h4-letter-spacing)',
      fontWeight: 'var(--markdown-h4-font-weight)',
    },
    h5: {
      fontSize: 'var(--text-markdown)',
      lineHeight: 'var(--markdown-h5-line-height)',
      letterSpacing: 'var(--markdown-h5-letter-spacing)',
      fontWeight: 'var(--markdown-h5-font-weight)',
    },
    h6: {
      fontSize: 'var(--text-markdown)',
      lineHeight: 'var(--markdown-h6-line-height)',
      letterSpacing: 'var(--markdown-h6-letter-spacing)',
      fontWeight: 'var(--markdown-h6-font-weight)',
    },
    body: {
      fontSize: 'var(--text-markdown)',
      lineHeight: 'var(--markdown-body-line-height)',
      letterSpacing: 'var(--markdown-body-letter-spacing)',
      fontWeight: 'var(--markdown-body-font-weight)',
    },
    bodySmall: {
      fontSize: 'var(--text-meta)',
      lineHeight: 'var(--markdown-body-small-line-height)',
      letterSpacing: 'var(--markdown-body-small-letter-spacing)',
      fontWeight: 'var(--markdown-body-small-font-weight)',
    },
    bodyLarge: {
      fontSize: 'var(--text-markdown)',
      lineHeight: 'var(--markdown-body-large-line-height)',
      letterSpacing: 'var(--markdown-body-large-letter-spacing)',
      fontWeight: 'var(--markdown-body-large-font-weight)',
    },
    blockquote: {
      fontSize: 'var(--text-markdown)',
      lineHeight: 'var(--markdown-blockquote-line-height)',
      letterSpacing: 'var(--markdown-blockquote-letter-spacing)',
      fontWeight: 'var(--markdown-blockquote-font-weight)',
    },
    list: {
      fontSize: 'var(--text-markdown)',
      lineHeight: 'var(--markdown-list-line-height)',
      letterSpacing: 'var(--markdown-list-letter-spacing)',
      fontWeight: 'var(--markdown-list-font-weight)',
    },
    link: {
      fontSize: 'var(--text-markdown)',
      lineHeight: 'var(--markdown-link-line-height)',
      letterSpacing: 'var(--markdown-link-letter-spacing)',
      fontWeight: 'var(--markdown-link-font-weight)',
    },
    code: {
      fontSize: 'var(--text-code)',
      lineHeight: 'var(--markdown-code-line-height)',
      letterSpacing: 'var(--markdown-code-letter-spacing)',
      fontWeight: 'var(--markdown-code-font-weight)',
    },
    codeBlock: {
      fontSize: 'var(--text-code)',
      lineHeight: 'var(--markdown-code-block-line-height)',
      letterSpacing: 'var(--markdown-code-block-letter-spacing)',
      fontWeight: 'var(--markdown-code-block-font-weight)',
    },
  },
};

/**
 * Helper function to get typography styles with fallbacks
 */
export function getTypographyStyle(path: string, fallback?: React.CSSProperties): React.CSSProperties {
  const parts = path.split('.');
  let current: any = typography;
  
  for (const part of parts) {
    if (current && current[part]) {
      current = current[part];
    } else {
      return fallback || {};
    }
  }
  
  return current || fallback || {};
}

/**
 * CSS class mappings for Tailwind-style usage
 * These can be used with className prop
 */
export const typographyClasses = {
  // Scale classes
  'text-xs': 'typography-xs',
  'text-sm': 'typography-sm',
  'text-base': 'typography-base',
  'text-lg': 'typography-lg',
  'text-xl': 'typography-xl',
  'text-2xl': 'typography-2xl',
  'text-3xl': 'typography-3xl',
  'text-4xl': 'typography-4xl',
  'text-5xl': 'typography-5xl',
  
  // Heading classes
  'heading-1': 'typography-h1',
  'heading-2': 'typography-h2',
  'heading-3': 'typography-h3',
  'heading-4': 'typography-h4',
  'heading-5': 'typography-h5',
  'heading-6': 'typography-h6',
  
  // UI classes
  'ui-button': 'typography-ui-button',
  'ui-button-small': 'typography-ui-button-small',
  'ui-button-large': 'typography-ui-button-large',
  'ui-label': 'typography-ui-label',
  'ui-caption': 'typography-ui-caption',
  'ui-badge': 'typography-ui-badge',
  'ui-tooltip': 'typography-ui-tooltip',
  'ui-input': 'typography-ui-input',
  'ui-helper': 'typography-ui-helper-text',
  
  // Code classes
  'code-inline': 'typography-code-inline',
  'code-block': 'typography-code-block',
  'code-line-numbers': 'typography-code-line-numbers',
  
  // Markdown classes
  'markdown-h1': 'typography-markdown-h1',
  'markdown-h2': 'typography-markdown-h2',
  'markdown-h3': 'typography-markdown-h3',
  'markdown-h4': 'typography-markdown-h4',
  'markdown-h5': 'typography-markdown-h5',
  'markdown-h6': 'typography-markdown-h6',
  'markdown-body': 'typography-markdown-body',
  'markdown-body-small': 'typography-markdown-body-small',
  'markdown-body-large': 'typography-markdown-body-large',
  'markdown-blockquote': 'typography-markdown-blockquote',
  'markdown-list': 'typography-markdown-list',
  'markdown-link': 'typography-markdown-link',
  'markdown-code': 'typography-markdown-code',
  'markdown-code-block': 'typography-markdown-code-block',
};