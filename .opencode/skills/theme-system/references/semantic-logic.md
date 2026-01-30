---
title: Semantic Color Logic
---

# Semantic Color Logic

## Decision Tree

When choosing a color, ask in order:

1. **Is this code/programming-related?** → `syntax.*`
2. **Is this feedback/status?** → `status.*`
   - Error/failure? → `status.error`
   - Success? → `status.success`
   - Warning? → `status.warning`
   - Info? → `status.info`
3. **Is this a primary CTA or link?** → `primary.*`
4. **Is this interactive/clickable?** → `interactive.*`
   - Hover on clickable? → `interactive.hover`
   - Selected/active? → `interactive.selection`
5. **Is this a background layer?** → `surface.*`
   - Input/card/panel? → `surface.elevated`
   - Main background? → `surface.background`
6. **Is this text?** → `surface.foreground` or `surface.mutedForeground`

## Critical Rules

### Surface
- **elevated** = inputs, cards, panels, popovers
- **background** = main page background
- **muted** = secondary backgrounds

### Interactive
- **hover** = ONLY on truly clickable elements (buttons, links, list items)
- **selection** = active/selected states (tabs, checked items)
- **border** = all form element borders

### Primary vs Selection
- **Primary** = brand color for CTAs ("click me")
- **Selection** = background for active state ("currently selected")
- **Never use primary for active tabs** - use selection!

### Status
- **Error** = only for actual errors (not emphasis)
- **Success** = completed operations only
- **Warning** = caution, attention needed
- **Info** = neutral information only

### Syntax
- **Only for code display** (blocks, inline, diffs)
- Never for UI elements

## Input Pattern (Most Common)

```tsx
<div style={{ backgroundColor: currentTheme?.colors?.surface?.elevated }}>
  <textarea className="bg-transparent" />
  <div className="bg-transparent"> {/* Footer */}
    {/* Controls */}
  </div>
</div>
```

Key: Footer is transparent on elevated background - no separate color.
