---
name: ui-vision-verifier
description: Expert skill for verifying UI changes using browser automation tools.
---

# UI Vision Verifier Skill

Use this skill to ensure UI changes actually look and behave correctly.

## The Verification Loop

1. **Snap**: After a UI change, run a visual regression test (if available) or a smoke test (e.g., `playwright test`).
2. **Accessibility Audit**: Check for `aria-label` and `alt` tags. Use `axe-core` if possible.
3. **Responsiveness**: Verify the UI doesn't break on mobile breakpoints (375px bandwidth).
4. **Interaction**: Click buttons, fill forms, and verify transitions.

## Directives

- "If it isn't tested in a browser, it's not finished."
- Fix any layout shifts (CLS) immediately.

_Vibe: Visual, Detailed, User-Centric._
