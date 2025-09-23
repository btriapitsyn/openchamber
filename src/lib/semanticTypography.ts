/**
 * Semantic Typography Configuration
 *
 * This file defines the semantic typography system for OpenCode WebUI.
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
  markdown: '0.875rem',

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
  uiHeader: '0.8125rem',

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
  uiLabel: '0.75rem',

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
   * - Tooltip content
   *
   * Rationale: All contextual/secondary information should be visually subordinate.
   * This helps users focus on primary content while maintaining access to context.
   */
  meta: '0.75rem',

  /**
   * Micro Typography
   *
   * Smallest UI details and indicators that need minimal visual presence.
   * These elements should be unobtrusive but still readable.
   *
   * UI Elements that should use --text-micro:
   * - Badges and counters (notification counts, item counts)
   * - Keyboard shortcut indicators in UI
   - Version numbers in headers/footers
   - Tooltips (when displayed as UI elements)
   - Line numbers in code blocks
   - File extensions in file names
   - Agent type indicators
   - Model provider indicators
   - Status dots with text labels
   - Small indicator text
   - Copyright notices
   - Build information
   - Environment indicators
   - Small tag text
   - Micro copy in dense interfaces
   - Data table footers
   - Small legend text
   - Compact list item details
   *
   * Rationale: Minimal UI details should be consistent and unobtrusive.
   * These elements provide information without competing for attention.
   */
  micro: '0.6875rem',
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
