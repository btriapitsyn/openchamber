# Tool Card Scrollable Content Requirements

Goal: keep tool cards at a fixed height while making their inner content scrollable with the custom overlay scrollbar.

What to implement:
- Expanded tool cards stay the same height they do today; do not wrap the entire expanded area in an overlay.
- Only scroll the content blocks (inputs/outputs) inside the card. Each scrollable block uses `ScrollableOverlay` with:
  - `outerClassName`: `max-h-[60vh] w-full min-w-0 flex-none overflow-hidden`
  - `className`: `p-0 rounded-xl w-full min-w-0`
  - Use a single inner container for borders/backgrounds (e.g., `rounded-xl border border-border/20 bg-muted/30 p-2`), so there are never double borders.
- Preserve horizontal scrolling where content is wide (code/output) by leaving horizontal overflow enabled on the overlay target.
- Apply the same pattern to all tool outputs and inputs that can overflow:
  - Todo write/read
  - List directories
  - Grep, Glob
  - Task (markdown)
  - Web search
  - Edit/Multiedit readouts
  - Generic read text blocks
  - Input blockquote (when present) should also use a `ScrollableOverlay` with `max-h-60 w-full min-w-0`.
- Ensure `min-w-0` is on both overlay and inner content to prevent horizontal stretching.
- Keep the outer card/layout unchanged; only the inner scroll targets should manage overflow.

Success criteria:
- Tool cards keep their current height; only inner blocks scroll.
- Custom overlay scrollbars appear for both axes where needed.
- No double borders or duplicate padding around scrollable content.
