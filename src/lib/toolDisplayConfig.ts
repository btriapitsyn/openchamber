// Centralized configuration for tool display styles
// This ensures consistency across collapsed/expanded views and popup dialogs

export const TOOL_DISPLAY_STYLES = {
  // Text sizes
  fontSize: {
    collapsed: '0.75rem',   // Used in collapsed/expanded tool view
    popup: '0.75rem',       // Used in popup dialog
    inline: '0.75rem',      // Used for inline code blocks in messages
  },
  
  // Line heights
  lineHeight: {
    collapsed: '1.4',       // Standard line height for tool displays
    popup: '1.4',           // Matching line height in popups
    inline: '1.4',          // Same line height for inline code
  },
  
  // Padding
  padding: {
    collapsed: '0.5rem',    // Collapsed view padding
    popup: '0.75rem',       // Popup view padding
    popupContainer: '1rem', // Outer popup container padding
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