# Collapsed Tool Summary Concept

## Background

When the assistant issues a burst of tool calls and then follows up with a natural language response, the chat currently leaves every tool output expanded in-line. On desktop this occupies considerable vertical space but is still manageable; on mobile it becomes hard to scroll past the long trail of tool cards to reach the assistant’s explanation.

The user experience we want mirrors what’s already present in the desktop header: once the assistant is done “working”, show a compact summary (“Finished working”) with the set of tool icons that were involved, and allow the viewer to expand if they need the detailed outputs.

We will implement this behaviour in a future session. This document outlines the intended design and the code touches we anticipate.

## Goals

1. Start a group the moment we receive the first `tool` part **or** an assistant reasoning part, display the header as “Working…”, and keep adding subsequent tool/reasoning parts while the burst continues.
2. Once the assistant emits a text part (or the message finalises without text), consider the burst complete, auto-collapse the group, and update the header to “Finished working”.
3. Present a concise header with the status text plus a horizontal row of unique tool icons used in that burst.
4. Preserve the exact existing `ToolPart` rendering inside the collapsible section so behaviour, formatting, popups, etc. remain unchanged when expanded.
5. Keep the default state collapsed for historical messages and immediately collapse live groups after the text part begins streaming; allow users to expand on demand.
6. Ensure accessibility (keyboard navigation, aria-expanded) and remember the expanded/collapsed state for the current message during the viewing session.

## High-Level Behaviour

1. Detect “tool burst” regions in real time:
   - Within a single assistant message, examine the ordered `parts`.
   - When the first `tool` or reasoning part arrives, start a group immediately and show it as “Working…”.
   - Keep appending tool/reasoning parts until a text part starts streaming or the message finalises without text.
2. When a text part begins (or the message ends without text), mark the group as complete, collapse it by default, and update the header to “Finished working”.
3. Replace the rendered sequence with a new component (`CollapsedToolGroup`) that:
   - Renders the header row with the appropriate status label.
   - Toggles a disclosure state (collapsed vs expanded).
   - When expanded, maps each original `ToolPart` as-is.
4. Derive the tool icon list:
   - Collect tool names from the grouped parts.
   - Use the existing `getToolIcon` helper so the icons match the standard cards.
   - Deduplicate while preserving order of first appearance.
5. Provide a summary tooltip / accessible description (e.g. “Finished working — tools used: Bash, Edit”).
6. Store the open/closed state in component state keyed by message ID + group index. We can keep it in a `useState` inside `ToolPart`’s parent (`MessageBody` / `MessageList`) or in the session store if we need persistence across re-renders.

### Streaming vs. Historical Messages

- **Streaming**: Show the grouped parts immediately with “Working…”. Transition to “Finished working” and collapse as soon as the assistant text stream starts, but keep the expanded/closed state controllable by the user. Handle the edge case where the stream ends without text by finalising the group once `message.updated` indicates completion.
- **Historical**: Render the same grouping structure but default to collapsed “Finished working” state from the outset to save space. Ensure reasoning parts are included in the group.

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
   - Keep grouping state while the message is streaming so we can pivot the header from “Working…” to “Finished working” without re-render glitches.
2. **Collapsed group component**
   - Accept `toolParts: ToolPartType[]`, reasoning parts, status label, `icons`, `defaultExpanded?`.
   - Manage local `expanded` state and render header + children.
   - Wire `aria-expanded`, `role="button"` or use a proper `<button>`.
3. **Icon derivation helper**
   - Extract tool names (`part.tool`) and resolve icons via existing helper.
   - Provide fallback icon if unknown.
4. **State persistence**
   - For MVP, store state in component-level `useState`, seeded with `defaultExpanded=false` once the group is marked finished.
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
