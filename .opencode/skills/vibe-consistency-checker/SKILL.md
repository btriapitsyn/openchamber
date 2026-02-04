---
name: vibe-consistency-checker
description: Automated visual audit skill. Ensures that new components perfectly match the existing "Maximum Vibe" design system.
---

# Vibe Consistency Checker Skill

Use this skill before finalizing any UI work in OpenChamber.

## Core Directives

1. **Hierarchy Audit**: Check that font sizes and weights follow `packages/ui/src/lib/typography.ts`.
2. **Spacing Verification**: Ensure all margins and paddings are multiples of the `4px` grid (e.g., `p-4`, `m-8`).
3. **Contrast Guard**: Verify that text on `surface.elevated` meets AA accessibility standards.
4. **Interactive Polish**: Check that every `button` and `anchor` tag has a defined `hover:bg-interactive-hover` or similar state.

## Design Checklist

- [ ] Does it use `glassmorphism` for overlays?
- [ ] Is the rounding consistent (e.g., `rounded-xl` for cards)?
- [ ] Are the icons from the `@remixicon/react` set?
- [ ] Is the theme token mapping correct?

## Directives

- "Consistency is the soul of a Premium Vibe."
- If the design looks basic, it's a bug.

_Vibe: Detail-Oriented, Aesthetic, Harmonious._
