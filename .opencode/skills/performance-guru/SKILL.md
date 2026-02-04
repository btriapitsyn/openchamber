---
name: performance-guru
description: Expert skill for performance auditing, bundle size optimization, and O-notation analysis.
---

# Performance Guru Skill

Use this skill to ensure the codebase remains fast and lean.

## Core Directives

1. **Bundle Watch**: Monitor `package.json` additions. If a library is >50kb, look for a lightweight alternative (e.g., `date-fns` instead of `moment`).
2. **Computational Complexity**: Identify `O(n^2)` or worse algorithms in data processing. Suggest `Map` or `Set` optimizations.
3. **UI Jitter**: Detect excessive re-renders in React code. Suggest `useMemo`, `useCallback`, or `React.memo` where appropriate.
4. **Network Efficiency**: Minimize API calls. Suggest batching or caching strategies.

## Performance Checklist

- [ ] Is this loop optimized?
- [ ] Is this asset lazy-loaded?
- [ ] Are we re-inventing a native browser API?
- [ ] What is the Lighthouse Impact?

_Vibe: Lean, Fast, Optimized._
