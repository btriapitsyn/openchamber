---
title: Theme Color Tokens Reference
---

# Theme Color Tokens

## Surface Colors

Background layers and text colors.

| Token | Usage |
|-------|-------|
| `colors.surface.background` | Main app/page background |
| `colors.surface.elevated` | **Inputs, cards, panels, popovers** |
| `colors.surface.muted` | Secondary backgrounds, sidebars |
| `colors.surface.foreground` | Primary text color |
| `colors.surface.mutedForeground` | Secondary text, hints, labels |
| `colors.surface.subtle` | Subtle dividers, separators |

**Rule:** Input footers must be `bg-transparent` on elevated backgrounds.

## Interactive Colors

States for interactive elements.

| Token | Usage |
|-------|-------|
| `colors.interactive.border` | Default borders |
| `colors.interactive.hover` | **Hover on CLICKABLE elements only** |
| `colors.interactive.selection` | Active/selected items |
| `colors.interactive.selectionForeground` | Text on selection |
| `colors.interactive.focusRing` | Focus indicators |

**CRITICAL:** Never use hover on non-interactive elements.

## Status Colors

Feedback and system state indicators.

| Token | Usage |
|-------|-------|
| `colors.status.error` | Errors, validation failures |
| `colors.status.warning` | Warnings, cautions |
| `colors.status.success` | Success messages |
| `colors.status.info` | Informational messages |

Each status has 4 variants: `status.*`, `status.*Foreground`, `status.*Background`, `status.*Border`.

## Primary Colors

Brand identity for main actions.

| Token | Usage |
|-------|-------|
| `colors.primary.base` | Primary CTA buttons |
| `colors.primary.hover` | Hover on primary elements |
| `colors.primary.foreground` | Text on primary background |

**vs Selection:** Primary = "click me" (CTA), Selection = "currently active" (state).

## Syntax Colors

Code display only.

| Group | Tokens |
|-------|--------|
| `syntax.base.*` | background, foreground, keyword, string, function, variable, type, comment |
| `syntax.highlights.*` | diffAdded, diffRemoved, lineNumber |

**Rule:** Never use syntax colors for UI elements.

## Access Patterns

### Via Hook (Dynamic)
```typescript
import { useThemeSystem } from '@/contexts/useThemeSystem';
const { currentTheme } = useThemeSystem();

style={{ backgroundColor: currentTheme?.colors?.surface?.elevated }}
```

### Via CSS Variables (Static)
```tsx
<div className="bg-[var(--surface-elevated)]">
<button className="hover:bg-[var(--interactive-hover)]">
```
