## 2025-05-23 - Utility Function Referential Stability
**Learning:** Utility functions like `filterSyntheticParts` that return modified versions of data must be careful to preserve referential equality when no changes are actually made. In this codebase, the `filter` method was used unconditionally, breaking `React.memo` in `MessageList`.
**Action:** When optimizing React lists, always trace back data transformation pipelines (like `.map` or utility filters) to ensure they don't break reference chains unnecessarily. Check if input === output for transformations.
