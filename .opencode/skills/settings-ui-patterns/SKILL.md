---
name: settings-ui-patterns
description: Use when creating or modifying UI components, styling, or visual elements related to Settings in OpenChamber.
license: MIT
compatibility: opencode
---

# Settings UI Patterns Skill

## Purpose
This skill provides instructions for creating or redesigning Settings pages, informational panels, and configuration interfaces within the OpenChamber application.

## Core Design Philosophy
The design language for settings and informational panels is inspired by the polished UI found in `ContextPanel` and `TimelineDialog`. It emphasizes:
- **Subtle Elevation**: Grouping related settings into softly styled, elevated surface cards.
- **Hierarchical Typography**: Using micro-typography for labels and metadata so primary values stand out.
- **Clean Structure**: Using CSS Grid and Flexbox to create highly organized, scannable layouts.
- **Muted Interactive States**: Using soft hover transitions to indicate interactivity without overwhelming the UI.

## Typography Guidelines
Always utilize the standard OpenChamber typography classes defined in `packages/ui/src/lib/typography.ts`.

- **Main Headers**: Use `typography-ui-header font-semibold text-foreground` (with `truncate` if needed) for the very top of a page or major panel.
- **Section Labels / Subtitles**: Use `typography-micro text-muted-foreground` for labels positioned *above* groups of settings or values.
- **Values / Primary Text**: Use `typography-ui-label text-foreground`. Add `tabular-nums` if displaying numbers or stats to ensure vertical alignment.
- **Meta / Helper Text**: Use `typography-meta text-muted-foreground` or `typography-small text-muted-foreground` for descriptions or supplementary text below a setting. For even lower contrast, use `text-muted-foreground/70`.

## Layout & Background Patterns

### 1. Main Backgrounds
Main wrappers should generally use `bg-background` or `bg-[var(--surface-background)]`. Ensure adequate padding (e.g., `px-5 py-6` or `p-6`).

### 2. Elevated Cards (Primary Groupings)
Instead of flat lists, group related settings, stats, or inputs inside elevated cards with soft borders. To allow internal rows to stretch edge-to-edge, use `overflow-hidden` without inner padding on the container.
```tsx
<div className="mb-5 rounded-lg bg-[var(--surface-elevated)]/70 overflow-hidden flex flex-col">
  {/* Rows go here */}
</div>
```
*Note the `/70` opacity modifier on the elevated surface variable for a softer, more integrated look.*

### 3. Secondary Info Panels (Legend / Actions)
Use these for descriptions, help text, or secondary action lists.
```tsx
<div className="mt-4 rounded-lg bg-muted/30 p-3">
  <p className="typography-meta text-muted-foreground font-medium mb-2">Section Title</p>
  {/* Content goes here */}
</div>
```

## Structural Patterns

### 1. Stat / Value Grids
Use this pattern to display multiple related values side-by-side efficiently.
```tsx
<div className="mb-5 grid grid-cols-2 gap-2">
  <div className="rounded-lg bg-[var(--surface-elevated)]/70 px-3 py-2.5">
    <div className="typography-micro text-muted-foreground/70">Setting Label</div>
    <div className="mt-0.5 typography-ui-label text-foreground tabular-nums">Value</div>
  </div>
  {/* ... more items */}
</div>
```
For tighter or more numerous clusters, adjust the grid (e.g., `grid grid-cols-3 gap-x-4 gap-y-2.5`).

### 2. Interactive Rows (List Items)
Used for clickable settings, navigation items, or selectable lists inside an elevated card. They use ample padding (`px-4 py-3`) and do NOT have rounded corners so they sit flush edge-to-edge within their parent container.
```tsx
<label className="group flex cursor-pointer items-center justify-between gap-2 px-4 py-3 transition-colors hover:bg-[var(--interactive-hover)]/30 border-b border-[var(--surface-subtle)]">
  <div className="flex min-w-0 flex-col">
    <span className="typography-ui-label text-foreground">Setting Name</span>
    <span className="typography-meta text-muted-foreground truncate">Description of what this does</span>
  </div>
  {/* Action element (Toggle, Chevron, etc) */}
</label>
```

### 3. Key-Value Pairs
For simple inline alignments without needing full cards.
```tsx
<div className="flex items-baseline justify-between">
  <span className="typography-micro text-muted-foreground">Label</span>
  <span className="typography-micro text-muted-foreground/70 tabular-nums">Value</span>
</div>
```

## Icons
- **Size**: Typically `h-4 w-4` or `h-5 w-5` (or Tailwind v4 `size-4`, `size-5`).
- **Color**: Use `text-muted-foreground` by default, transitioning to `text-foreground` on hover if the container is interactive.
- **Spacing**: Use `gap-2` or `gap-1.5` when placing icons next to text in Flex containers.

## Best Practices
- **Spacing**: Maintain consistent vertical spacing. `mb-5` or `mb-6` is typical between major sections, while `mt-2.5` or `space-y-1` is used for items within a card.
- **Truncation**: Always consider long text. Use `min-w-0 flex-1 truncate` on text containers that sit next to buttons or icons to prevent layout breakage.
- **Theme Variables**: *Always* use CSS variables for colors (e.g., `var(--status-success)`) rather than hardcoded hex values or generic Tailwind colors when indicating semantic states.
