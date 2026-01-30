---
name: theme-system
description: Use when creating or modifying UI components, styling, or visual elements in OpenChamber. All UI colors must use theme tokens - never hardcoded values or Tailwind color classes.
license: MIT
compatibility: opencode
---

## Overview

OpenChamber uses a JSON-based theme system with 14 built-in themes (Flexoki, Catppuccin, Dracula, etc.). All themes have consistent structure with light/dark variants defined in `packages/ui/src/lib/theme/themes/`.

**Core principle:** UI colors must use theme tokens - never hardcoded hex colors (`#FF0000`) or Tailwind color classes (`bg-white`, `text-blue-500`).

## When to Use

Use this skill when:
- Creating new UI components
- Modifying existing component styling
- Adding visual elements (cards, inputs, buttons)
- Working with colors, backgrounds, borders, or text

## Quick Decision Tree

When choosing a color:
1. **Code display?** → `syntax.*`
2. **Feedback/status?** → `status.*`
3. **Primary CTA?** → `primary.*`
4. **Interactive/clickable?** → `interactive.*`
5. **Background layer?** → `surface.*`
6. **Text?** → `surface.foreground`

## Critical Rules

### Surface Colors
- `surface.elevated` = inputs, cards, panels (**most used**)
- Input footers must be `bg-transparent` on elevated background

### Interactive Colors
- `interactive.hover` = **ONLY on clickable elements**
- `interactive.selection` = active/selected states (NOT primary!)

### Status Colors
- Use ONLY for actual feedback (errors, warnings, success, info)
- Never for decoration or emphasis

### Never Use
- Hardcoded hex colors
- Tailwind `bg-gray-*`, `text-blue-*`, etc.
- `bg-secondary` or `bg-muted` (deprecated)

## Basic Usage

### Via Hook (Dynamic)
```tsx
import { useThemeSystem } from '@/contexts/useThemeSystem';
const { currentTheme } = useThemeSystem();

<div style={{ backgroundColor: currentTheme?.colors?.surface?.elevated }}>
```

### Via CSS Variables (Static)
```tsx
<div className="bg-[var(--surface-elevated)] hover:bg-[var(--interactive-hover)]">
```

## Common Patterns

**Input Area:**
```tsx
<div style={{ backgroundColor: currentTheme?.colors?.surface?.elevated }}>
  <textarea className="bg-transparent" />
  <div className="bg-transparent"> {/* Footer */}</div>
</div>
```

**Active Tab:**
```tsx
<button className={isActive 
  ? 'bg-interactive-selection text-interactive-selection-foreground'
  : 'hover:bg-interactive-hover/50'
}>
```

**Error Message:**
```tsx
<div style={{ 
  color: currentTheme?.colors?.status?.error,
  backgroundColor: currentTheme?.colors?.status?.errorBackground 
}}>
```

## References

- **[Token Reference](references/tokens-reference.md)** - All color tokens and their usage
- **[Semantic Logic](references/semantic-logic.md)** - Decision tree and critical rules
- **[Examples](references/examples.md)** - Code examples for common patterns  
- **[Wrong vs Right](references/wrong-vs-right.md)** - Common mistakes to avoid
- **[Markdown Colors](references/markdown-colors.md)** - How markdown rendering uses themes
- **[Adding Themes](references/adding-themes.md)** - How to add new themes

## Resources

- Theme types: `packages/ui/src/types/theme.ts`
- Theme hook: `packages/ui/src/contexts/useThemeSystem.ts`
- CSS variables: `packages/ui/src/styles/design-system.css`
- Theme presets: `packages/ui/src/lib/theme/themes/presets.ts`
