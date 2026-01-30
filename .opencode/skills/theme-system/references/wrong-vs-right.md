---
title: Wrong vs Right Patterns
---

# Common Mistakes

## ❌ WRONG: Hardcoded Colors

```tsx
// Never do this:
<div style={{ backgroundColor: '#F2F0E5' }}>
<button className="bg-blue-500">
<span className="text-red-500">
```

## ❌ WRONG: Wrong Semantic Usage

```tsx
// Primary for active tab (wrong!)
<Tab className="bg-primary text-white">Active</Tab>

// Hover on static element (wrong!)
<div className="hover:bg-interactive-hover">Static card</div>

// Status for emphasis (wrong!)
<span className="text-red-500">Important</span>

// Colored footer on input (wrong!)
<div style={{ backgroundColor: currentTheme?.colors?.surface?.elevated }}>
  <textarea />
  <div style={{ backgroundColor: currentTheme?.colors?.surface?.muted }}>Footer</div>
</div>
```

## ✅ RIGHT: Theme Colors

```tsx
// Selection for active tab
<Tab style={{ backgroundColor: currentTheme?.colors?.interactive?.selection }}>Active</Tab>

// Hover only on clickable
<button className="hover:bg-[var(--interactive-hover)]">Click</button>

// Primary for emphasis
<span style={{ color: currentTheme?.colors?.primary?.base }}>Important</span>

// Transparent footer
<div style={{ backgroundColor: currentTheme?.colors?.surface?.elevated }}>
  <textarea className="bg-transparent" />
  <div className="bg-transparent">Footer</div>
</div>
```

## Deprecated Classes (Never Use)

- `bg-secondary` → Use `surface.*` tokens
- `bg-muted` → Use `surface.muted`
- `bg-background` for elevated → Use `surface.elevated`
- `text-warning` → Use `text-status-warning`

## Tailwind Color Classes (Never Use)

- `bg-white`, `bg-gray-*`, `bg-zinc-*`, `bg-slate-*`
- `text-gray-*`, `text-blue-*`, `text-red-*`
- `border-gray-*`
