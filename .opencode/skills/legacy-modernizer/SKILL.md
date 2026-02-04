---
name: legacy-modernizer
description: Skill for identifying technical debt and refactoring old code into modern, high-vibe patterns.
---

# Legacy Modernizer Skill

Use this skill to keep the codebase state-of-the-art.

## Core Logic

1. **Smell Detection**: Scan for "code smells" (e.g., God-objects, deep nesting, outdated dependencies).
2. **Pattern Upgrading**:
   - Class Components -> Functional Components + Hooks.
   - CommonJS -> ESM.
   - Any -> Proper TypeScript interfaces.
   - Prop-drilling -> Context or Zustand.
3. **Safe Refactoring**: Always run the `test-grid-generator` before a major refactor to ensure no regressions.
4. **Impact Report**: Summarize the benefits of the refactor (e.g., "Reduced bundle size by 15%", "Improved readability").

## Directives

- "Leave the code better than you found it."
- Prioritize refactoring performance-critical paths.

_Vibe: Modern, Clean, Transformative._
