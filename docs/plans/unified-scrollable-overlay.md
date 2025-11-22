# Unified Scrollable Overlay Rollout Plan

Objective: replace all native scrollbars with the custom overlay scrollbar (`ScrollableOverlay` + `OverlayScrollbar`) across the UI, ensuring consistent behavior in WebKit (macOS WebView), Chrome, and Electron. This removes native scrollbar variance and keeps visual/UX parity.

## Components/Patterns to Use
- `ScrollableOverlay` (packages/ui/src/components/ui/ScrollableOverlay.tsx):
  - Outer wrapper: `relative flex flex-col min-h-0 w-full overflow-hidden` (can override via `outerClassName`).
  - Inner scroll element: `overlay-scrollbar-target overlay-scrollbar-container flex-1 min-h-0 overflow-auto w/full h/full` plus any layout classes passed via `className`.
  - Renders `<OverlayScrollbar>` as a sibling; auto-hides native scrollbars; supports vertical/horizontal auto-detect and thumb dragging.
- `OverlayScrollbar` (already implemented): hides native bar for targets and renders custom thumbs.

## Conversion Rules
1) Identify the actual scrollable element (the one with `overflow-y-auto`, `overflow-auto`, etc.). That element must receive `overlay-scrollbar-target` and the `ref` used by `OverlayScrollbar`.
2) Wrap the scrollable element and the `OverlayScrollbar` in a relative container. `ScrollableOverlay` provides this; prefer it over manual wiring.
3) Maintain flex sizing:
   - Outer wrapper should usually be `flex-1 min-h-0` in flex parents.
   - Inner scroll element should include `flex-1 min-h-0` when it must stretch within a flex container.
4) Do NOT wrap footers/headers that should stay static; only wrap the scrollable content section.
5) For dropdowns/popovers (Select, DropdownMenu, Command palette), wrap the overflow area only, not the trigger.

## Components to Convert (from rg scan)
- **Sidebar/Navigation**
  - SessionSidebar: already converted.
  - CommandsSidebar: `flex-1 overflow-y-auto overflow-x-hidden`.
  - GitIdentitiesSidebar: `flex-1 overflow-y-auto overflow-x-hidden`.
- **Pages/Sections**
  - CommandsPage: `h-full overflow-y-auto`.
  - GitIdentitiesPage: `h-full overflow-y-auto`.
  - SettingsPage: `h-full overflow-y-auto`.
  - AgentsPage: `h-full overflow-y-auto`.
  - AppearanceSettings: `h-full overflow-y-auto overflow-x-hidden`.
  - CommandsPage also contains nested scrollable testing area? (check for overflow).
- **Right Sidebar**
  - GitTab: converted main scroll region.
  - DiffTab: converted main diff area; also convert nested `max-h-96 overflow-y-auto` panels if present.
- **Dialogs/Overlays**
  - DirectoryExplorerDialog: converted main scroll region.
  - MobileOverlayPanel: `max-h-[min(70vh,520px)] overflow-y-auto`.
  - ToolOutputDialog content: `h-full max-h-[75vh] overflow-y-auto`.
- **Chat Components**
  - Chat main: already using overlay.
  - CommandAutocomplete, FileMentionAutocomplete: `overflow-auto flex-1`.
  - PermissionCard blocks with `max-h-* overflow-y-auto/overflow-auto`.
  - Message parts (ToolPart variants, ReasoningPart blockquote) with `max-h-* overflow-*`.
- **Model/Select/Dropdown Lists**
  - ModelSelector dropdown lists (two instances): `max-h-[320px] overflow-y-auto`.
  - SelectContent/DropdownMenuContent/CommandList components: many have `overflow-y-auto` (select.tsx, dropdown-menu.tsx, command.tsx).
  - ThemeSwitcher dialog content: `max-h-[80vh] overflow-y-auto`.
  - MemoryDebugPanel: `max-h-48 overflow-y-auto`.
- **Other**
  - DirectoryTree inline containers: `max-h-full overflow-y-auto`.
  - DiffTab/GitTab nested lists/panels with `max-h-* overflow-*`.

## Step-by-Step Conversion Pattern
For each scrollable area:
1) Import `ScrollableOverlay` in the file.
2) Replace the scrollable `<div ...overflow...>` with:
   ```tsx
   <ScrollableOverlay outerClassName="flex-1 min-h-0" className="...existing padding/spacing...">
     {existing content}
   </ScrollableOverlay>
   ```
   - If the scrollable container is not flex-grown, omit `flex-1`/`min-h-0` as appropriate.
   - Remove `overflow-*` classes from the replaced element; `ScrollableOverlay` handles overflow.
   - Keep padding/margins on `className`.
   - If parent already handles relative positioning, `ScrollableOverlay`’s default is fine; otherwise, wrap in a relative parent if necessary.
3) For nested `max-h-* overflow-*` blocks (e.g., tool outputs, permission lists), wrap only the inner block (not the whole card) in `ScrollableOverlay` with appropriate sizing (e.g., `outerClassName="max-h-60"` or `className="max-h-60"` depending on layout).
4) For dropdown/popover scroll areas (SelectContent, DropdownMenuContent, CommandList), wrap the scrollable portion (often the content root) with `ScrollableOverlay` but keep positioning classes on the popover root.
5) Remove `scrollbar-hidden` where applied; `ScrollableOverlay` hides native scrollbars automatically.

## Sizing/Spacing Guidance
- Use `outerClassName="flex-1 min-h-0"` inside flex parents that expect the content to grow/shrink.
- Use `className` on the inner scroll element for padding (e.g., `px-3 py-3`) and width constraints (e.g., `max-w-*`).
- For constrained height lists (`max-h-60`), apply the height on `outerClassName` so the scroll area inherits it: `outerClassName="max-h-60"`.
- Overlay padding is controlled globally (`.overlay-scrollbar`), track inset via code (16px) to keep thumb inside bounds.

## Rollout Checklist
- [ ] CommandsSidebar
- [ ] CommandsPage
- [ ] GitIdentitiesSidebar
- [ ] GitIdentitiesPage
- [ ] SettingsPage
- [ ] AgentsPage
- [ ] AppearanceSettings
- [ ] DirectoryTree inline containers
- [ ] ModelSelector dropdown lists (both instances)
- [ ] CommandAutocomplete
- [ ] FileMentionAutocomplete
- [ ] MobileOverlayPanel
- [ ] ToolOutputDialog content
- [ ] PermissionCard scrollable sections (all `max-h-* overflow-*`)
- [ ] ToolPart/ReasoningPart scrollable sections (all `max-h-* overflow-*`)
- [ ] DiffTab nested `max-h-*` panels
- [ ] GitTab nested `max-h-*` panels
- [ ] SelectContent/DropdownMenuContent/CommandList scrollable areas
- [ ] ThemeSwitcher dialog content
- [ ] MemoryDebugPanel
- [ ] DirectoryExplorerDialog (DONE)
- [ ] SessionSidebar (DONE)
- [ ] Chat (already overlay)
- [ ] GitTab main (DONE)
- [ ] DiffTab main (DONE)

## Notes / Pitfalls
- Ensure the scrollable area has a height constraint; if the parent isn’t flexing, add an explicit `max-h` or `h-full` as appropriate.
- Keep static footers/headers outside the scroll wrapper; wrap only the scrollable content body.
- Some popovers may need `position: relative` on the wrapper if overlay positioning becomes an issue; adjust per-component.
- In macOS WebView, overlay replaces the native bar entirely; system preferences for scrollbars won’t affect the custom overlay.

## Suggested Rollout Order (larger batches)
1) Sidebars & Pages: CommandsSidebar, GitIdentitiesSidebar, CommandsPage, GitIdentitiesPage, SettingsPage, AgentsPage, AppearanceSettings.
2) Dialogs/Overlays: MobileOverlayPanel, ToolOutputDialog, DirectoryTree inline, PermissionCard/ToolPart/ReasoningPart scroll blocks.
3) Dropdowns/Selects/Command lists.
4) Remaining nested panels (Diff/Git tab sub-panels, MemoryDebugPanel).
