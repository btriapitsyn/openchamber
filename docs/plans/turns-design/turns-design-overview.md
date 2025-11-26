# Turn-Based Chat Layout & Anchored Scroll

## Purpose

Document how we want to model "turns" in the chat UI (user message + all assistant children), and how anchored scrolling and the active-turn spacer should behave. This is a working design for the OpenChamber UI implementation, written for the future coding agent that will implement it.

This is **not** a generic multi-team spec. It is a precise description of:

- What a turn is
- How we group tools / reasoning / justification into that turn
- How the viewport behaves for the active turn
- How we avoid permanent gaps in history

## Core Concepts

### Turn

- **Turn** = one user message and all assistant messages that logically belong to it.
- Each assistant message has a `parentID` that points to the triggering user message id.
- A turn spans multiple assistant messages:
  - Tools
  - Reasoning entries
  - Justification text
  - Final summary text

We treat the **user message** as the root of the turn, not the assistant summary.

### Active Turn

- The **active turn** is the turn for the most recently sent user message in the current session.
- Only one active turn exists at a time per session.
- All special layout behavior (anchoring, spacer, "scroll to bottom" rules) applies to the active turn only.
- Older turns are rendered as plain history (no spacer, no special anchoring).

### Anchored User Message

- For the active turn, we anchor the **user message** in a stable vertical position near the top of the chat viewport.
- The anchor is defined by two values:
  - `anchoredUserMessageId` – id of the user message that defines the active turn
  - `targetOffset` – desired distance (in pixels) from the top of the scroll container to the **top** of that user message
- As the layout changes (window resize, sidebars, streaming content below), we adjust scroll so that the anchored user message stays at `targetOffset` when the user is "following" the active turn.

### Active Turn Spacer

- The **active turn spacer** is a single invisible block at the bottom of the content for the active turn that ensures there is enough scrollable height to place the anchored user message at `targetOffset`, even when the total content would otherwise be shorter than the viewport.
- There is **at most one spacer** in the entire chat at any time.
- The spacer belongs conceptually to the active turn, not to individual messages.
- When a new user message starts a new active turn, the spacer is reassigned to that new turn (the old turn no longer has a spacer).

This is the mechanism that allows consistent anchoring even for short conversations (e.g. "hi" / "hello" / "how are you") without leaving permanent 80% gaps between turns.

## Grouping Inside a Turn

The turn is the unit that groups these items:

- User message (root)
- Assistant messages with `parentID` equal to the user message id
- Within those assistant messages:
  - `tool` parts (tool calls and outputs)
  - `reasoning` parts
  - Assistant `text` parts that act as **justification** for tools

We do **not** change the underlying message store. We derive grouping at render time.

### Turn Entries

Within a turn we define **entries**:

- `tool` entry:
  - A `Part` with `type === 'tool'`
  - Carries tool name, state (pending/running/completed/error), timestamps, and metadata
- `reasoning` entry:
  - A `Part` with `type === 'reasoning'`
  - Rendered via the existing `ReasoningTimelineBlock` UI
- `justification` entry:
  - Assistant `text` part that we treat as justification for tools, not as standalone chat
  - This corresponds to the case where `showReasoningTraces` is on and the assistant text is meant to explain tool usage

Turn entries are identified by `(messageId, partId)` pairs and are grouped by `parentUserId`.

## Layout Intent

### High-Level Layout for a Turn

For each turn (user + children), we want a layout like this:

- Anchored user message at the top (or near the top) of the chat viewport
- Immediately below it: turn-specific auxiliary content:
  - Group header summarizing tools / reasoning / justification for this turn
  - Grouped list of entries under that header (tools + reasoning + justification)
- Below that: assistant final summary text for this turn

Important nuance from the product intent:

- By the time the final assistant summary text arrives for a turn, we want all tool/reasoning/justification entries for that turn to **already be grouped** under the header.
- The summary text should appear so that the user sees it from the **start**, without being auto-scrolled to the end.

### Progressive Grouping (Slide-In Behavior)

During a turn:

1. A new tool/reasoning/justification entry completes.
2. Initially, it appears exactly as today, inside its own message bubble.
3. After a short delay (e.g. ~1s), that entry is **pulled up** under the turn-level group header and hidden from its original message bubble view.
4. Visually, with CSS transitions, this should feel like it "slides" into the group header.

This progressive move keeps the live feeling and avoids flicker mid-stream, but converges on a clean grouped presentation by the time the turn finishes.

Implementation-wise, this will likely be an internal state in a "TurnView" layer (documented in `turns-implementation-notes.md`), not in the message store.

## Scrolling Behavior

### Anchoring Rules

- When the user sends a new message U_n in a session:
  - Set `anchoredUserMessageId = U_n.id`.
  - Compute `targetOffset` (for example, 16–24px from the top of the chat scroll container).
  - Ensure there is enough scrollable height for the anchoring (resize spacer as needed).
  - Perform one scroll adjustment so that U_n sits at `targetOffset`.
  - Mark the view as **pinned to anchor** (see below).

- While pinned to anchor:
  - Layout changes (streaming content, window resize, sidebar toggles) may move the anchored message.
  - After those changes, we adjust `scrollTop` so that the anchored message returns to `targetOffset`.
  - We do not bottom-pin in the classic sense; we anchor relative to the user message.

### Pinned vs Unpinned

We maintain a simple boolean:

- `isPinnedToAnchor`:
  - `true` when the user is considered to be "following" the active turn.
  - `false` when the user has scrolled away intentionally.

Rules:

- On new user message:
  - `isPinnedToAnchor = true`.
- On manual user scroll:
  - If the user scrolls more than some threshold away from the anchored region, set `isPinnedToAnchor = false`.
- When `isPinnedToAnchor` is `false`:
  - We do not attempt to re-anchor on layout changes.
  - The spacer may still exist, but we stop correcting scroll position.

### Spacer Behavior

The spacer is always placed at the **bottom** of the content for the active turn.

Lifecycle:

- On new active turn:
  - Reassign the spacer to the new turn.
  - Compute initial height based on viewport size and content height.
- On content growth within the active turn:
  - Shrink the spacer as more content appears, so the anchored user message remains at `targetOffset`.
- On layout change (resize, sidebars):
  - Recompute required spacer height.
  - If `isPinnedToAnchor` is true, adjust scroll after layout settles.
- On switching active turn (new user message):
  - Remove spacer from old turn, attach it to the new turn.

The key property: **no spacer is permanently attached to old turns**, so we do not accumulate large empty gaps between historical turns.

### Scroll-To-Bottom Button Logic

We want a "scroll to bottom" button that does not flicker when the spacer height changes or when streaming changes heights by a few pixels.

- Define a tolerance:

  - `gap = scrollHeight - (scrollTop + clientHeight)`
  - `AT_BOTTOM_THRESHOLD = e.g. 24px`

- Consider the view to be "at bottom" if `gap <= AT_BOTTOM_THRESHOLD`.
- Only treat the user as having "left" the bottom if `gap` grows beyond some larger threshold.

For active turns:

- When `isPinnedToAnchor` is true, we can bias the behavior:
  - Option A: never show the scroll-to-bottom button (we assume the user is looking at the active workspace).
  - Option B: show it only if the **last entry for the active turn** is below the viewport by more than a threshold.

The important bit for implementation: decouple spacer updates from bottom detection, and use hysteresis instead of a strict `gap < 1` check.

## Non-Goals

- No separate pagination UI (no explicit "page per user message" navigation right now).
- No changes to the underlying message store schema; grouping is a render-time concept.
- No hard coupling of turns to the backend; turns are a UI affordance, not a protocol change.

## Implementation Strategy (High Level)

The implementation notes will live in `turns-implementation-notes.md`, but the intended rough sequence is:

1. Add a turn abstraction at the UI level (group messages by `parentID`).
2. Introduce anchor + spacer state in the scroll manager for the active turn.
3. Wire up anchoring on new user messages and layout changes.
4. Implement grouped header and entry rendering inside a per-turn view.
5. Add the progressive "slide into group" behavior with a short delay.

This file is the conceptual reference; the companion notes will spell out which components and hooks to touch.
