## 2025-02-13 - Icon-Only Button Accessibility Pattern
**Learning:** The `Button` component with `size="icon"` is frequently used without `aria-label`, creating a pattern of inaccessible interactive elements across the sidebar and other views.
**Action:** When using `size="icon"`, always audit for `aria-label` or `Tooltip`. Consider adding a prop constraint or lint rule in the future to enforce this.
