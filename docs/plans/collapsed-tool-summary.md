# Collapsed Tool Summary Concept

## Background

When the assistant issues a burst of tool calls and then follows up with a natural language response, the chat currently leaves every tool output expanded in-line. On desktop this occupies considerable vertical space but is still manageable; on mobile it becomes hard to scroll past the long trail of tool cards to reach the assistant’s explanation.

The user experience we want mirrors what’s already present in the desktop header: once the assistant is done “working”, show a compact summary (“Finished working”) with the set of tool icons that were involved, and allow the viewer to expand if they need the detailed outputs.

We will implement this behaviour in a future session. This document outlines the intended design and the code touches we anticipate.

## Goals

1. Automatically wrap consecutive tool parts that immediately precede an assistant text part into a single collapsible group once the assistant response is complete.
2. Present a concise header reading “Finished working” plus a horizontal row of unique tool icons used in that burst.
3. Preserve the exact existing `ToolPart` rendering inside the collapsible section so behaviour, formatting, popups, etc. remain unchanged when expanded.
4. Keep the default state collapsed on mobile (and probably desktop as well) while allowing the user to expand on demand.
5. Ensure accessibility (keyboard navigation, aria-expanded) and remember the expanded/collapsed state for the current message during the viewing session.

## High-Level Behaviour

1. Detect “tool burst” regions:
   - Within a single assistant message, examine the ordered `parts`.
   - Identify sequences of one or more `tool` parts that appear before a `text` part.
   - Only group once the assistant has completed the message (i.e. no streaming).
2. Replace the rendered sequence with a new component (`CollapsedToolGroup`) that:
   - Renders the header row.
   - Toggles a disclosure state (collapsed vs expanded).
   - When expanded, maps each original `ToolPart` as-is.
3. Derive the tool icon list:
   - Collect tool names from the grouped parts.
   - Use the existing `getToolIcon` helper so the icons match the standard cards.
   - Deduplicate while preserving order of first appearance.
4. Provide a summary tooltip / accessible description (e.g. “Finished working — tools used: Bash, Edit”).
5. Store the open/closed state in component state keyed by message ID + group index. We can keep it in a `useState` inside `ToolPart`’s parent (`MessageBody` / `MessageList`) or in the session store if we need persistence across re-renders.

## Target Components / Files

- `src/components/chat/message/MessageList.tsx` (or the layer that iterates over message parts) – responsible for detecting groups before rendering.
- `src/components/chat/message/parts/ToolPart.tsx` – will remain unchanged, but grouped items will be passed into a new wrapper.
- New component `CollapsedToolGroup.tsx` under `message/parts/` that renders the summary header + disclosure content.
- `src/lib/toolHelpers.ts` (if we need an exported icon map for reuse).
- Styling additions in `src/index.css` for the collapsed header (hover state, icon layout).

## Interaction & Visual Details

- Header row: use a neutral background similar to the existing tool cards, with subtle border and rounded corners.
- Left side: text “Finished working”.
- Right side / trailing: horizontal row of tool icons (only unique tools). If icons overflow, wrap or use `overflow-hidden` with tooltip.
- Chevron icon to indicate collapsed/expanded state. Rotation animation optional but nice to have.
- When expanded, render the tool cards in the same vertical stack as today, including their headers and controls.
- The collapse transition can be an instant toggle for MVP; later we can animate height.

## Implementation Steps (Future Work)

1. **Message preprocessing**
   - Extend the rendering pipeline to transform message parts into either `TextPart`, `ToolPart`, or `ToolGroupPart` objects. This keeps `MessageList` clean.
   - Guard grouping with message completion (ensure no streaming placeholder).
2. **Collapsed group component**
   - Accept `toolParts: ToolPartType[]`, `icons`, `defaultExpanded?`.
   - Manage local `expanded` state and render header + children.
   - Wire `aria-expanded`, `role="button"` or use a proper `<button>`.
3. **Icon derivation helper**
   - Extract tool names (`part.tool`) and resolve icons via existing helper.
   - Provide fallback icon if unknown.
4. **State persistence**
   - For MVP, store state in component-level `useState`.
   - Optionally persist per message in `useSessionStore` if we find re-renders collapsing unexpectedly.
5. **Accessibility / Tests**
   - Keyboard accessible toggling.
   - Unit or snapshot tests to ensure grouping logic works (e.g. 3 tool parts + text compresses into a group).
6. **Styling**
   - Add CSS tokens for the header background/border, or reuse tool card CSS.
   - Ensure dark/light theming respects existing variables.
7. **QA Checklist**
   - Mobile view: check collapsed default and manual expand.
   - Desktop view: confirm icons present identical to header.
   - Streams: ensure partially streamed responses do not collapse prematurely.
   - Regression: popups, diff toggles, etc. still work when expanded.

## Open Questions / Next Session Items

- Should the default be collapsed only on mobile or on all platforms? We can decide during implementation.
- Do we need to persist the expanded state across navigation or re-render (e.g. when new messages arrive)?
- For very large tool outputs, should we lazy-mount once expanded?
- Any analytics or telemetry required when users expand the group?

This document captures the intent so we can return in the next session and execute the plan without rediscovery.
