# Overlay / Popup Redesign Plan

## Background
- Current model/provider selector, agent selector, and server file picker rely on nested dropdown menus styled like legacy popups.
- On mobile they push chat content because they are rendered inline, leading to jarring scroll jumps.
- Visual styling (tight paddings, stark borders) clashes with the newer WebUI aesthetic.
- Theme switcher was already upgraded to a modal flow; we want the same treatment elsewhere.

## Goals
1. Deliver a unified overlay experience that keeps chat layout stable on mobile and desktop.
2. Align visual design of all popups with the current theme system (rounded surfaces, soft borders, consistent typography).
3. Preserve existing functionality (search, multi-select, metadata previews) while improving discoverability.

## Scope
- Model & Provider Selector (ModelControls)
- Agent Selector (ModelControls)
- Server File Picker (chat/ServerFilePicker)
- Ensure accessory overlays (e.g. theme picker) remain consistent after changes.

## Proposed Approach
### 1. Introduce Responsive "Sheet" Component
- Add a shared `Sheet` (sliding panel) primitive, using Radix `Dialog` under the hood.
- Behaviour:
  - Mobile: slides from bottom, covers ~90% height, fixed layout, backdrop blur.
  - Desktop: appears as centered modal with max-width breakpoints.
- Provide reusable structure: header with title + optional search, body scroll area, footer with actions.

### 2. Model & Provider Selector
- Replace nested dropdown with sheet.
- Tabs at top (Providers / Models) or two-column layout on desktop.
- Provider list left, models right with metadata summary.
- Keep capability icons, modality chips, cost/limit info.
- Add persistent search + filters (e.g. by capability) for future expansion.

### 3. Agent Selector
- Convert from dropdown to sheet/modal.
- Present agents as stacked cards with description, permissions, and quick actions (set default, edit mode toggle).
- Include search bar and grouping (Primary, Subagents, Disabled) to scale.

### 4. Server File Picker
- Full-height sheet with tree navigation + breadcrumb at top.
- Left: directory tree with collapsible nodes; Right: file list with preview/info.
- Top-right quick actions: refresh, collapse all, search toggle.
- Selected files summary pinned at bottom, with “Attach” button.

### 5. Visual Refresh Guidelines
- Adopt new surface variables (`bg-surface`, `border-border/60`) and typography (`typography-ui-label`, `typography-meta`).
- Standardise paddings (`px-4 py-4` desktop, `px-3 py-3` mobile).
- Use icon buttons with `variant="ghost"` inside overlays; large actions as `variant="outline"` or primary.
- Ensure full keyboard accessibility (focus traps, ESC to close, `aria` labels).

### 6. Behavioural Enhancements
- Prevent body scroll when sheet open (mobile bounce fix).
- Retain current selection while overlay open; commit on “Apply” to avoid accidental changes.
- Persist last-used filters per component (optional, low priority).

## Implementation Notes
- Create `Sheet` primitive in `src/components/ui/sheet.tsx` with props: `open`, `onOpenChange`, `title`, `description`, `footer`. Should wrap Radix Dialog.
- Refactor `ThemeSwitcher` mobile dialog to use new sheet for consistency.
- For desktop overlays, reuse same component with `variant="dialog"` to centralize styling.
- Ensure existing stores (`useConfigStore`, `useSessionStore`) do not need behavioural changes; only UI wrappers.
- Add storybook examples for sheet states if time permits (use `references/flowtoken` or create new story).

## Risks / Considerations
- Need to verify keyboard navigation (focus trap) works across nested components (e.g. search field + tree view).
- Large provider lists might require virtualization (Monitor performance after redesign).
- Additional bundle size from new primitives should be minimal; re-use existing button/input components.

## Success Criteria
- Overlay opening/closing does not push chat content on any viewport.
- Visual style matches new WebUI (rounded surfaces, consistent spacing, animations).
- Usability validated on iOS Safari, Android Chrome, and desktop browsers.
- No regression in functionality: selection, search, multi-select, and metadata display remain intact.

## Next Steps
1. Implement shared `Sheet` + updated ThemeSwitcher to dogfood component (in progress).
2. Convert model/provider selector to sheet.
3. Convert agent selector, then server file picker.
4. QA on mobile/desktop, adjust transitions & responsiveness.
