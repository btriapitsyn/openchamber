// Typography utility functions and style objects
// These helpers make it easy to apply typography CSS variables throughout the app
// Now using semantic typography system for consistent, logical sizing

/**
 * Semantic Typography Configuration
 *
 * This file defines the semantic typography system for OpenChamber.
 * Instead of arbitrary sizes, we group elements by their semantic role
 * and apply consistent sizing across related UI elements.
 *
 * Key Principles:
 * 1. Elements serving the same conceptual role share typography variables
 * 2. Markdown content is independent from UI interface elements
 * 3. Font sizes controlled by single config, themes only control colors
 * 4. Font-weight, line-height applied directly in components, not through variables
 *
 * REM to PX Conversion Reference:
 * 0.625rem = 10px
 * 0.6875rem = 11px
 * 0.75rem = 12px
 * 0.8125rem = 13px
 * 0.875rem = 14px
 * 0.9375rem = 15px
 * 1rem = 16px
 * 1.0625rem = 17px
 * 1.125rem = 18px
 * 1.1875rem = 19px
 * 1.25rem = 20px
 * 1.3125rem = 21px
 * 1.375rem = 22px
 * 1.4375rem = 23px
 * 1.5rem = 24px
 * 1.625rem = 26px
 * 1.75rem = 28px
 * 1.875rem = 30px
 * 2rem = 32px
 */
export const SEMANTIC_TYPOGRAPHY = {
  /**
   * Markdown Content Typography
   *
   * All markdown-rendered content in chat messages should use this variable.
   * This creates a consistent reading experience for user-generated content.
   *
   * UI Elements that should use --text-markdown:
   * - Markdown paragraphs (<p>)
   * - Markdown headings (<h1>, <h2>, <h3>, <h4>, <h5>, <h6>)
   * - Markdown lists (<ul>, <ol>, <li>)
   * - Markdown blockquotes (<blockquote>)
   * - Markdown tables (<table>, <th>, <td>)
   * - Markdown links (<a>)
   * - Markdown horizontal rules (<hr>)
   *
   * Visual hierarchy should be achieved through:
   * - Colors only (themes control H1 vs H2 vs p colors)
   * - Font-weight applied directly (font-bold, font-semibold, font-normal)
   * - Spacing/margins applied directly in components
   *
   * Rationale: Markdown is user content with its own hierarchy,
   * independent from interface design patterns.
   */
  markdown: '0.9375rem',

  /**
   * Code Content Typography
   *
   * All code-related content should use this variable regardless of context.
   * This ensures code looks consistent whether it's in markdown, tools, or errors.
   *
   * UI Elements that should use --text-code:
   * - Markdown code blocks (<pre><code>)
   * - Markdown inline code spans (<code>)
   * - Tool output code blocks
   * - Terminal/bash command output
   * - JSON/config file displays
   * - File content previews
   * - Error stack traces
   * - Syntax highlighting content
   * - Code line numbers
   * - File extension indicators in code context
   *
   * Rationale: Code should look consistent regardless of where it appears.
   * Users should recognize code immediately by its consistent typography.
   */
  code: '0.75rem',

  /**
   * UI Header Typography
   *
   * Interface-level headings and titles for structural organization.
   * These are separate from markdown headings and serve UI navigation.
   *
   * UI Elements that should use --text-ui-header:
   * - Dialog titles (modal headers)
   * - Panel headers (sidebars, sections)
   * - Card titles
   * - Section headers in UI components
   * - Modal titles
   * - Form section titles
   * - Settings page headings
   * - Tab group headers
   * - Accordion headers
   * - Wizard step titles
   *
   * Rationale: UI structural headings independent from markdown content hierarchy.
   * These help users navigate the interface structure.
   */
  uiHeader: '0.875rem',

  /**
   * UI Label Typography
   *
   * All interactive and labeling elements throughout the interface.
   * This creates unified interaction patterns across the entire application.
   *
   * UI Elements that should use --text-ui-label:
   * - Button text (all button variants)
   * - Menu items (dropdown, context menus)
   * - Navigation items (sidebar, breadcrumbs)
   * - Form labels (input, select, textarea labels)
   * - Tab labels
   * - Tool names in tool execution panels
   * - File names in file lists
   * - Session titles in session list
   * - Dropdown options
   * - Checkbox/radio labels
   * - Link text in navigation
   * - Badge text (when used as labels)
   * - Toggle switch labels
   * - Search input placeholder text
   * - Filter tags
   *
   * Rationale: All interface interaction elements should have unified labeling.
   * This creates predictable interaction patterns.
   */
  uiLabel: '0.8125rem',

  /**
   * Metadata Typography
   *
   * Secondary information and status text throughout the interface.
   * This creates clear visual hierarchy for contextual information.
   *
   * UI Elements that should use --text-meta:
   * - Message timestamps in chat
   * - File sizes and dates in file lists
   * - Status indicators (online, offline, loading)
   * - Helper text under form inputs
   * - Tool descriptions in tool panels
   * - Progress messages and status updates
   * - Reasoning text (AI thinking content)
   * - Validation messages (error, warning, success)
   * - Character counters
   * - Version information
   * - Last modified timestamps
   * - User status indicators
   * - System notification text
   * - Caption text under images
   * - Footer information
   * - Keyboard shortcut hints
   *
   * Rationale: All contextual/secondary information should be visually subordinate.
   * This helps users focus on primary content while maintaining access to context.
   */
  meta: '0.8125rem',

  /**
   * Micro Typography
   *
   * Smallest UI details and indicators that need minimal visual presence.
   * These elements should be unobtrusive but still readable.
   *
   * UI Elements that should use --text-micro:
   * - Badges and counters (notification counts, item counts)
   * - Keyboard shortcut indicators in UI
   * - Version numbers in headers/footers
   * - Tooltips (when displayed as UI elements)
   * - Line numbers in code blocks
   * - File extensions in file names
   * - Agent type indicators
   * - Model provider indicators
   * - Status dots with text labels
   * - Small indicator text
   * - Copyright notices
   * - Build information
   * - Environment indicators
   * - Small tag text
   * - Micro copy in dense interfaces
   * - Data table footers
   * - Small legend text
   * - Compact list item details
   *
   * Rationale: Minimal UI details should be consistent and unobtrusive.
   * These elements provide information without competing for attention.
   */
  micro: '0.75rem',
} as const;

/**
 * CSS Custom Properties Mapping
 *
 * These CSS variables are generated from the semantic typography configuration
 * and used throughout the application for consistent styling.
 */
export const SEMANTIC_TYPOGRAPHY_CSS = {
  '--text-markdown': SEMANTIC_TYPOGRAPHY.markdown,
  '--text-code': SEMANTIC_TYPOGRAPHY.code,
  '--text-ui-header': SEMANTIC_TYPOGRAPHY.uiHeader,
  '--text-ui-label': SEMANTIC_TYPOGRAPHY.uiLabel,
  '--text-meta': SEMANTIC_TYPOGRAPHY.meta,
  '--text-micro': SEMANTIC_TYPOGRAPHY.micro,
} as const;

/**
 * Typography Class Names
 *
 * CSS class names that correspond to each semantic typography category.
 * These classes should be used in components alongside other styling classes.
 */
export const TYPOGRAPHY_CLASSES = {
  markdown: 'typography-markdown',
  code: 'typography-code',
  uiHeader: 'typography-ui-header',
  uiLabel: 'typography-ui-label',
  meta: 'typography-meta',
  micro: 'typography-micro',
} as const;

/**
 * Type definitions for semantic typography
 */
export type SemanticTypographyKey = keyof typeof SEMANTIC_TYPOGRAPHY;
export type TypographyClassKey = keyof typeof TYPOGRAPHY_CLASSES;

/**
 * Helper function to get CSS variable name for a semantic typography key
 */
export function getTypographyVariable(key: SemanticTypographyKey): string {
  return `--text-${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`;
}

/**
 * Helper function to get CSS class name for a semantic typography key
 */
export function getTypographyClass(key: TypographyClassKey): string {
  return TYPOGRAPHY_CLASSES[key];
}

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

  // Tool display styles - integrated with typography system
  tool: {
    // Collapsed tool view in chat - compact but readable
    collapsed: {
      fontSize: 'var(--text-code)',
      lineHeight: 'var(--code-block-line-height)',
      letterSpacing: 'var(--code-block-letter-spacing)',
      fontWeight: 'var(--code-block-font-weight)',
    },

    // Popup tool view - larger for better readability
    popup: {
      fontSize: 'var(--text-code)',
      lineHeight: 'var(--code-block-line-height)',
      letterSpacing: 'var(--code-block-letter-spacing)',
      fontWeight: 'var(--code-block-font-weight)',
    },

    // Inline code in tool output
    inline: {
      fontSize: 'var(--text-code)',
      lineHeight: 'var(--code-inline-line-height)',
      letterSpacing: 'var(--code-inline-letter-spacing)',
      fontWeight: 'var(--code-inline-font-weight)',
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
 * Tool display configuration - integrated with typography system
 * Centralized configuration for tool display styles across collapsed/expanded views and popup dialogs
 */
export const toolDisplayStyles = {
  // Padding configuration for different tool display modes
  padding: {
    collapsed: '0.375rem',    // Collapsed view padding (6px)
    popup: '0.75rem',         // Popup view padding (12px) - increased for better readability
    popupContainer: '1rem',    // Outer popup container padding (16px) - increased for better readability
  },

  // Background opacity for tool displays
  backgroundOpacity: {
    muted: '30',            // bg-muted/30
    mutedAlt: '50',         // bg-muted/50
  },

  // Helper functions to get consistent styles
  getCollapsedStyles: () => ({
    ...typography.tool.collapsed,
    background: 'transparent !important',
    margin: 0,
    padding: toolDisplayStyles.padding.collapsed,
    borderRadius: 0,
  }),

  getPopupStyles: () => ({
    ...typography.tool.popup,
    background: 'transparent !important',
    margin: 0,
    padding: toolDisplayStyles.padding.popup,
    borderRadius: 0,
  }),

  getPopupContainerStyles: () => ({
    ...typography.tool.popup,
    background: 'transparent !important',
    margin: 0,
    padding: toolDisplayStyles.padding.popupContainer,
    borderRadius: '0.5rem',
    overflowX: 'auto' as const,
  }),

  getInlineStyles: () => ({
    ...typography.tool.inline,
  }),
};

/**
 * CSS class mappings for Tailwind-style usage
 * These can be used with className prop
 */
export const typographyClasses = {
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

  // Basic semantic classes (from TYPOGRAPHY_CLASSES)
  'semantic-markdown': 'typography-markdown',
  'semantic-code': 'typography-code',
  'semantic-ui-header': 'typography-ui-header',
  'semantic-ui-label': 'typography-ui-label',
  'semantic-meta': 'typography-meta',
  'semantic-micro': 'typography-micro',
};
