# Markdown Rendering Refinement Plan

## Objectives
- Reduce duplication between assistant and user markdown presets while preserving current visual fidelity.
- Centralize typography, spacing, and color tokens in shared helpers or CSS modules to simplify future tweaks.
- Evaluate FlowToken integration points to rely more on library-level animations instead of bespoke caching logic.
- Add regression coverage so future refactors are safe.

## Proposed Steps
1. **Audit Shared Styles**  
   - Identify repeated `fontSize`, `lineHeight`, `letterSpacing`, and spacing declarations across both presets.  
   - Draft helper utilities (e.g., `headingStyle(level)`, `bodyStyle(kind)`) or Tailwind/CSS class encapsulations.

2. **Create Unified Component Factory**  
   - Build a configurable `createMarkdownComponents({ animated, isMobile, syntaxTheme, copyControls })` helper that returns the component map.  
   - Have assistant/user presets call this helper with different flags to keep behavior differences explicit yet concise.

3. **Refine Animation Hooks**  
   - Investigate whether FlowToken exposes block-level transforms to eliminate `ListItemAnimatedContent` cache complexity.  
   - If not, encapsulate list animation logic in a standalone hook/component with tests to ensure deterministic behavior.

4. **Theme Token Consolidation**  
   - Move inline `style` objects into CSS classes (e.g., `typography-markdown-heading`) backed by CSS variables for light/dark parity.  
   - Ensure classes live in a single stylesheet so future theme adjustments happen in one place.

5. **Regression Testing**  
   - Assemble representative markdown samples (headings, nested lists, code blocks, tables, blockquotes).  
   - Implement snapshot or visual-diff tests to guard the rendering output before refactoring.

6. **Performance Review**  
   - Profile rendering cost with and without animation to ensure consolidation doesnt degrade perceived performance.  
   - Verify that memoization boundaries and `React.memo` usage keep large conversations responsive.

## Open Questions
- Do we need separate typography between assistant/user messages after consolidation?  
- Should reasoning blocks share the same markdown pipeline or remain bespoke?
