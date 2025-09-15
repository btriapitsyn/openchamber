// Centralized configuration for tool display styles
// This ensures consistency across collapsed/expanded views and popup dialogs
// Now uses CSS variables from the typography system for centralized control

export const TOOL_DISPLAY_STYLES = {
  // Text sizes - using CSS variables from typography system
  fontSize: {
    collapsed: 'var(--code-block-font-size, 0.6875rem)', // Uses code block typography (11px default)
    popup: 'var(--code-block-font-size, 0.6875rem)',     // Same as collapsed for consistency
    inline: 'var(--code-inline-font-size, 0.85em)',      // Uses inline code typography
  },
  
  // Line heights - using CSS variables from typography system
  lineHeight: {
    collapsed: 'var(--code-block-line-height, 1.35)',    // Uses code block line height
    popup: 'var(--code-block-line-height, 1.35)',        // Same as collapsed
    inline: 'var(--code-inline-line-height, 1.3)',       // Uses inline code line height
  },
  
  // Padding - Reduced for more compact display
  padding: {
    collapsed: '0.375rem',    // Collapsed view padding (6px)
    popup: '0.5rem',          // Popup view padding (8px)
    popupContainer: '0.75rem', // Outer popup container padding (12px)
  },
  
  // Background opacity
  backgroundOpacity: {
    muted: '30',            // bg-muted/30
    mutedAlt: '50',         // bg-muted/50
  },
  
  // Helper functions to get consistent styles
  getCollapsedStyles: () => ({
    fontSize: TOOL_DISPLAY_STYLES.fontSize.collapsed,
    lineHeight: TOOL_DISPLAY_STYLES.lineHeight.collapsed,
    background: 'transparent !important',
    margin: 0,
    padding: TOOL_DISPLAY_STYLES.padding.collapsed,
    borderRadius: 0,
  }),
  
  getPopupStyles: () => ({
    fontSize: TOOL_DISPLAY_STYLES.fontSize.popup,
    lineHeight: TOOL_DISPLAY_STYLES.lineHeight.popup,
    background: 'transparent !important',
    margin: 0,
    padding: TOOL_DISPLAY_STYLES.padding.popup,
    borderRadius: 0,
  }),
  
  getPopupContainerStyles: () => ({
    fontSize: TOOL_DISPLAY_STYLES.fontSize.popup,
    lineHeight: TOOL_DISPLAY_STYLES.lineHeight.popup,
    background: 'transparent !important',
    margin: 0,
    padding: TOOL_DISPLAY_STYLES.padding.popupContainer,
    borderRadius: '0.5rem',
    overflowX: 'auto' as const,
  }),
  
  getInlineStyles: () => ({
    fontSize: TOOL_DISPLAY_STYLES.fontSize.inline,
    lineHeight: TOOL_DISPLAY_STYLES.lineHeight.inline,
  }),
};