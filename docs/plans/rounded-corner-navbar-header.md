# Rounded Corner Between NavigationBar and Header

## Visual Requirement

Currently, the desktop layout has a sharp 90-degree angle where two borders meet:
- The NavigationBar's right-side vertical border (going downward)
- The Header's bottom horizontal border (going rightward)

**Desired Result**: Replace the sharp 90-degree corner with a smooth, concave (inward-curving) rounded corner at this intersection point.

## Visual Description

The corner should curve inward (concave), creating a smooth arc transition between:
- The vertical border running down the right edge of the NavigationBar
- The horizontal border running across the bottom of the Header

Think of it like a rounded corner cut into the junction, similar to modern UI design patterns where borders flow smoothly into each other rather than meeting at harsh angles.

## Affected Components

### Primary Files
- `src/components/layout/NavigationBar.tsx` - Contains the vertical border element on the right side
- `src/components/layout/Header.tsx` - Contains the bottom border

### Layout Context
- `src/components/layout/MainLayout.tsx` - Shows how NavigationBar and Header are positioned relative to each other

## Current Implementation Details

### NavigationBar.tsx
- Desktop NavigationBar has width of 48px (NAV_BAR_WIDTH constant)
- Has a custom 1px vertical border div on its right edge
- Border starts at `top: DESKTOP_HEADER_HEIGHT` (48px from top)
- Uses `backgroundColor: 'var(--interactive-border)'`
- Located at lines 43-52

### Header.tsx
- Header has `border-b` class for bottom border
- Uses `borderColor: 'var(--interactive-border)'` inline style
- Header height is `h-12` (48px)
- Located at lines 302-304

### Layout Structure
- NavigationBar is positioned on the left (desktop only)
- Header is inside the "Main Content Area" which starts after the NavigationBar
- Header's bottom border begins where NavigationBar's right edge ends
- This creates the 90-degree corner junction at coordinates (48px from left, 48px from top)

## Visual Target

The rounded corner should be approximately 8px radius, creating a subtle but noticeable smoothing effect at the border junction. The corner must use the same `--interactive-border` CSS variable for color consistency.
