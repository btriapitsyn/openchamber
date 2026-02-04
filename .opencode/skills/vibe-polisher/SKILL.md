---
name: vibe-polisher
description: Expert skill for creating premium, "Ultimate Vibe" UI/UX. Focuses on animations, glassmorphism, and responsive design.
---

# Vibe Polisher Skill

Use this skill when the user wants to "wow" their audience with a premium interface.

## Core Directives

1. **Aesthetics are Functional**: A beautiful UI increases perceived performance and trust.
2. **Micro-animations**: Subtle transitions (200-300ms) on hover and state changes.
3. **Glassmorphism**: Use translucent backgrounds with backdrop-blur for a modern "OS" feel.
4. **Vibrant Gradients**: Avoid boring flat colors. Use HSL-based gradients.

## UI Tokens

When using this skill in OpenChamber, ensure you map these to the theme system:

- `surface.elevated` + `backdrop-blur-md` for cards.
- `primary.base` + `shadow-lg` for CTAs.

## Animation Checklist

- [ ] Does it fade in?
- [ ] Does it scale slightly on hover (e.g., `scale-[1.02]`)?
- [ ] Is the easing `cubic-bezier(0.4, 0, 0.2, 1)`?

_Vibe: Fluid, Premium, Modern._
