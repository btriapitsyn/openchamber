# Markdown Rendering Simplification Plan (Nov 2025)

## Goal

Simplify markdown component rendering rules to maximize compatibility with FlowToken streaming animation library while maintaining visual hierarchy through `compact` vs `comfort` display modes. Reduce CSS complexity and eliminate rendering inconsistencies caused by excessive custom styling rules.

## Problem Statement

The current markdown rendering system (`src/components/chat/message/markdownPresets.tsx`) applies complex, multi-layered style objects to heading elements (h1-h6). This includes:
- Custom size variables (`--markdown-heading1-size` through `--markdown-heading6-size`)
- Font-weight variables computed per heading level
- Letter-spacing and line-height variables
- Multiple style object merges (`baseMarkdownStyle` + `headingPrimarySpacingStyle` + element-specific overrides)

These custom rules interfere with FlowToken's streaming text animation, causing unreliable animation targeting and visual glitches during assistant message streaming.

## Scope

### 1. Eliminate redundant heading size variables

**Current state:**
- `src/lib/typography.ts` defines `typography.heading` object with h1-h6 using `var(--text-markdown)`
- `src/lib/markdownDisplayModes.ts` defines `--markdown-heading1-size` through `--markdown-heading6-size` separately
- These override each other and create maintenance burden

**Action:**
- Remove `--markdown-heading1-size` through `--markdown-heading6-size` from `markdownDisplayModes.ts`
- Remove `typography.heading` object from `typography.ts`
- All markdown headings uniformly use `fontSize: var(--text-markdown)` (semantic typography base)

### 2. Simplify heading component rendering

**Current state:**
- Each heading (h1-h6) applies: `baseMarkdownStyle` + `headingPrimarySpacingStyle`/`headingSecondarySpacingStyle` + element-specific font-weight + color
- Font-weight comes from CSS variables like `--markdown-h1-font-weight`, `--markdown-h2-font-weight`
- Line-height and letter-spacing applied via variables

**Action:**
- Remove font-weight CSS variables from `cssGenerator.ts` typography generation
- Hardcode font-weight directly in component: h1/h2 = 700, h3/h4/h5/h6 = 600
- Remove line-height and letter-spacing from individual heading rules
- Keep **only**: `fontSize: var(--text-markdown)`, `fontWeight: [hardcoded]`, `color: var(--markdown-heading-N)`
- Spacing (margins) controlled **solely** by `--markdown-heading-primary-top/bottom` and `--markdown-heading-secondary-top/bottom` from display modes

### 3. Consolidate spacing control in display modes

**Current state:**
- Spacing values exist in `markdownDisplayModes.ts` but heading components merge them with other style objects

**Action:**
- `markdownDisplayModes.ts` remains the single source of truth for heading spacing
- Components directly apply these values: `marginBlockStart: var(--markdown-heading-primary-top)`, etc.
- No intermediate style object merging
- Display mode switching automatically updates all heading margins

### 4. Reduce component styling complexity

**Current state:**
- Helper style objects: `baseMarkdownStyle`, `paragraphSpacingStyle`, `headingPrimarySpacingStyle`, `headingSecondarySpacingStyle`, `listItemBaseStyle`
- Components merge multiple objects together

**Action:**
- Keep only necessary base styles for markdown semantic meaning
- Inline simple styles directly in component JSX
- Remove style object merging chains

### 5. Align list marker handling (bullets and numbers)

**Current state:**
- Bullet lists (`<ul>`): Use browser's default `list-disc` marker, rendering varies by font (Inter's bullets are rounder, IBM Plex Mono's are more geometric)
- Numbered lists (`<ol>`): Custom implementation using `::before` pseudo-elements with hardcoded counter and tabular number formatting
- Inconsistent control: bullets inherit font naturally, numbers are explicitly styled but uncontrolled for font
- Ordered list indentation hardcoded in `index.css` (lines 211, 224), ignoring display mode system (unlike unordered lists)

**Problems:**
- Bullet appearance changes when user switches fonts (natural but visually inconsistent)
- Numbered lists don't respect display mode changes (use hardcoded CSS values)
- Unordered and ordered lists use incompatible styling patterns
- `--markdown-ordered-indent` variables defined only in hardcoded CSS, not in `markdownDisplayModes.ts`

**Action:**
- Move ordered list indentation variables to `markdownDisplayModes.ts`:
  - Add `--markdown-ordered-indent` and `--markdown-ordered-indent-mobile` to both `compact` and `comfort` presets
  - Remove hardcoded values from `src/index.css` (lines 211-230)
- **Design decision on bullet consistency (choose one):**
  - **Option A (unified appearance):** Control bullet appearance explicitly using `::marker` pseudo-element styling to ensure consistency across fonts
  - **Option B (font-adaptive):** Accept natural font variance for bullets, documenting that they reflect chosen font's typography
  - **Recommendation:** Option B (font-adaptive) aligns with principle of letting markdown typography adapt to interface font choice while keeping implementation simpler

**Files affected:**
- `src/lib/markdownDisplayModes.ts` (add ordered list variables)
- `src/index.css` (remove hardcoded ordered list CSS)
- `src/components/chat/message/markdownPresets.tsx` (update ol component to use display mode variables)

## Implementation Details

### Markdown Component Changes

**Headings (h1-h6):**
```jsx
// Before: complex merging of multiple style objects + variables
<h1 style={{
  ...baseMarkdownStyle,
  ...headingPrimarySpacingStyle,
  fontSize: 'var(--markdown-heading1-size)',
  color: 'var(--markdown-heading1)',
  fontWeight: 'var(--markdown-h1-font-weight, 700)',
}}>

// After: minimal, predictable styling
<h1 style={{
  fontSize: 'var(--text-markdown)',
  fontWeight: '700',
  color: 'var(--markdown-heading1)',
  marginBlockStart: 'var(--markdown-heading-primary-top)',
  marginBlockEnd: 'var(--markdown-heading-primary-bottom)',
}}>
```

**Paragraphs:**
- Keep: `fontSize: var(--text-markdown)`, margins from display mode
- Remove: unnecessary line-height/letter-spacing variables

**Lists (unordered):**
- Spacing controlled by `--markdown-list-spacing`, `--markdown-list-item-gap` from display modes
- Bullet markers inherit font naturally (Option B: font-adaptive)

**Lists (ordered):**
- Spacing controlled by `--markdown-list-spacing`, `--markdown-list-item-gap` from display modes
- Ordered list indentation (`--markdown-ordered-indent`) controlled by display modes (moved from hardcoded CSS)
- Custom counter styling remains (tabular numbers)

**Code blocks:**
- Keep: `fontSize: var(--text-code)` (separate from markdown body)
- Code styling should remain independent and consistent

### CSS Variable Cleanup

**Remove from `cssGenerator.ts` typography generation:**
- `--markdown-h1-font-weight` through `--markdown-h6-font-weight`
- Keep `--markdown-heading-primary-top/bottom` and `--markdown-heading-secondary-top/bottom` (controlled by display modes)

**Keep in theme colors:**
- `--markdown-heading1` through `--markdown-heading4` (color only)
- `--markdown-link`, `--markdown-inline-code`, etc. (all color-related)

### Display Mode Responsibilities

**`markdownDisplayModes.ts` continues to control:**
- Heading spacing: `--markdown-heading-primary-top/bottom`, `--markdown-heading-secondary-top/bottom`
- Paragraph spacing: `--markdown-paragraph-spacing`
- List spacing: `--markdown-list-spacing`, `--markdown-list-item-gap`, `--markdown-list-indent`
- All line-height values (body, list, code, etc.)
- All vertical rhythm values

**Display mode does NOT control:**
- Font sizes (semantic typography layer)
- Colors (theme layer)
- Font weights (hardcoded in components)

## Benefits

1. **FlowToken compatibility:** Simpler DOM structure with fewer CSS rules = better animation targeting and more reliable streaming text animation
2. **Reduced maintenance:** Single source of truth for spacing (display modes), sizes (semantic typography), colors (theme)
3. **Predictable rendering:** No style object merging chains, no variable inheritance chains
4. **Easier theming:** Theme only concerns itself with colors; typography concerns itself with sizes
5. **Display mode clarity:** Spacing and rhythm fully controlled by one configuration

## What Stays the Same

- `compact` vs `comfort` display mode user preference and switching
- Visual hierarchy through color differentiation (theme-controlled)
- Visual hierarchy through font-weight (700 for h1/h2, 600 for h3-h6)
- Semantic typography scaling (users can adjust base `--text-markdown` size)
- Theme color application to all markdown elements
- Code block special handling (separate `--text-code` variable)

## Validation Checklist

- [ ] Remove heading size variables from `markdownDisplayModes.ts` (lines 22-27 and 47-52)
- [ ] Remove `typography.heading` object from `typography.ts`
- [ ] Update `cssGenerator.ts` to remove font-weight variable generation for headings
- [ ] Simplify h1-h6 components in `markdownPresets.tsx` to minimal style objects
- [ ] Simplify user markdown (createUserMarkdown) heading components similarly
- [ ] Remove unused style helper objects from `markdownPresets.tsx`
- [ ] Move ordered list variables to `markdownDisplayModes.ts`:
  - Add `--markdown-ordered-indent` and `--markdown-ordered-indent-mobile` to both presets
  - Remove hardcoded ordered list CSS from `src/index.css` (lines 211-230)
  - Update `ol` component in `markdownPresets.tsx` to reference display mode variables
- [ ] Test with `npm run build` (tsc + vite)
- [ ] Manual sanity checks:
  - Markdown headings render with correct hierarchy (weight + color)
  - Spacing changes when switching between `compact` and `comfort` modes
  - Ordered list indentation changes when switching display modes
  - Streaming animation flows smoothly across heading boundaries
  - Different themes apply heading colors correctly
  - Typography size adjustment affects all headings uniformly
  - Mobile and desktop rendering matches
  - Bullet list markers render consistently (font-adaptive)
  - Numbered list formatting displays correctly with tabular numbers
- [ ] No regressions in heading appearance across all 15 themes
- [ ] No regressions in list rendering across all 15 themes

## Timeline Estimate

- Variable cleanup (headings): 15 min
- Component simplification (headings): 45 min
- Style object removal: 30 min
- List marker consolidation: 20 min
- Testing and validation: 30 min
- **Total: ~2.5 hours**

## Notes

- This is a non-breaking change from user perspective—visual output should be identical
- Animation library compatibility improvement is the core motivation
- Semantic typography coupling becomes tighter (good for consistency, needs documentation)
- Display mode system remains fully flexible for future spacing adjustments
