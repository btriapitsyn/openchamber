# Turn Implementation Notes (Anchoring, Spacer, Grouping)

This document is for the implementation agent. It assumes the conceptual model from `turns-design-overview.md` and maps it onto the existing OpenChamber UI code.

## Existing Structure (Quick Map)

Relevant files:

- `packages/ui/src/components/chat/ChatContainer.tsx`
  - Owns the scroll container (`ScrollShadow` with `ref={scrollRef}`)
  - Selects `sessionMessages`, `sessionPermissions`, `streamingMessageId`, `messageStreamStates` from `useSessionStore`
  - Wires in `useChatScrollManager` via `handleMessageContentChange`, `getAnimationHandlers`, `scrollToBottom`, `showScrollButton`

- `packages/ui/src/hooks/useChatScrollManager.ts` (not listed earlier, but this is where scroll logic lives)
  - Manages viewport anchors, autoscroll, and the scroll-to-bottom button
  - Receives `sessionMessages`, `streamingMessageId`, `messageStreamStates`, `sessionPermissions`, `trimToViewportWindow`

- `packages/ui/src/components/chat/MessageList.tsx`
  - Renders `ChatMessage` for each `{ info, parts }`

- `packages/ui/src/components/chat/ChatMessage.tsx`
  - Derives `messageRole`, `visibleParts`, `displayParts`
  - Manages assistant text animation and reasoning reservation
  - Passes `visibleParts` into `MessageBody`

- `packages/ui/src/components/chat/message/MessageBody.tsx`
  - Filters parts per message, decides when to render text/tool/reasoning
  - Coordinates timing of tools and reasoning relative to steps

We will not change the stores or message schemas. All logic is local to the UI layer.

## New State: Anchor + Spacer + Turn Identity

### Anchor/Spacer State Shape

`useChatScrollManager` should own the active-turn scroll state, per session:

```ts
interface ActiveTurnScrollState {
  anchoredUserMessageId: string | null;
  targetOffset: number | null; // px from container top to user message top
  isPinnedToAnchor: boolean;
  spacerHeight: number; // px; active-turn spacer at bottom of content
}
```

We do **not** need to persist this across sessions or reloads; it is purely runtime state.

Because `useChatScrollManager` already works with `currentSessionId` and `sessionMessages`, it is a natural owner for this state (one state instance per active chat container).

### Where The Spacer Renders

We need a single spacer element at the bottom of the scrollable content, not per turn:

- In `ChatContainer.tsx`, the scrollable area is:

  ```tsx
  <ScrollShadow ref={scrollRef} ...>
    <div className="relative z-0 min-h-full">
      <MessageList ... />
    </div>
  </ScrollShadow>
  ```

We can extend this to:

```tsx
<ScrollShadow ref={scrollRef} ...>
  <div className="relative z-0 min-h-full">
    <MessageList ... />
    <div
      data-role="active-turn-spacer"
      style={{ height: activeTurnSpacerHeight }}
    />
  </div>
</ScrollShadow>
```

Where `activeTurnSpacerHeight` comes from `useChatScrollManager` (derived from `spacerHeight` for the current session). If there is no active turn or no need for extra padding, `height` is 0.

Important: this spacer is conceptually attached to the **active turn**, but physically it is just a bottom padding element in the scroll container.

## Turn Grouping (Message-Level)

### Deriving Turns From Messages

We do **not** add a new store structure. Instead, in `MessageList.tsx` or just above it, we can derive a turn model from the flat `messages` array that `ChatContainer` already passes in.

Each `message.info` is a `Message` from `@opencode-ai/sdk`. The important fields for grouping are:

- `message.info.id` – unique per message
- `message.info.role` or `clientRole` – tells us user vs assistant
- `message.info.parentID` – for assistant messages, points to the id of the user message that triggered them

Algorithm sketch (per session):

```ts
type ChatMessageEntry = { info: Message; parts: Part[] };

type TurnId = string; // user message id

interface Turn {
  id: TurnId;
  userMessage: ChatMessageEntry;
  assistantMessages: ChatMessageEntry[];
}

function groupMessagesIntoTurns(messages: ChatMessageEntry[]): Turn[] {
  const byId = new Map<string, ChatMessageEntry>();
  const result: Turn[] = [];
  const turnsByUserId = new Map<TurnId, Turn>();

  messages.forEach((msg) => {
    byId.set(msg.info.id, msg);
  });

  messages.forEach((msg) => {
    const role = (msg.info as any).clientRole ?? msg.info.role;

    if (role === "user") {
      const turn: Turn = {
        id: msg.info.id,
        userMessage: msg,
        assistantMessages: [],
      };
      turnsByUserId.set(msg.info.id, turn);
      result.push(turn);
      return;
    }

    const parentID = (msg.info as any).parentID as string | undefined;
    if (!parentID) {
      return; // assistant message without parent stays outside turns for now
    }

    const turn = turnsByUserId.get(parentID);
    if (turn) {
      turn.assistantMessages.push(msg);
    }
  });

  return result;
}
```

This preserves the server ordering for user messages (turn roots) and attaches assistant messages by parentID.

### Where To Put Turn Logic

We have two options:

1. **Inside `MessageList`**:
   - Replace `displayMessages.map(...)` with a turn-aware rendering loop.
   - For each `Turn`, render a `TurnView` component that owns:
     - User message bubble
     - Group header and entries
     - Assistant messages

2. **Above `MessageList`**:
   - Keep `MessageList` as a "dumb" message list.
   - Introduce a new `TurnList` in `ChatContainer` that groups and then renders either `TurnView` or `ChatMessage` depending on the role.

Option 1 is less invasive and keeps chat layout local.

## TurnView: Owning Group Header and Entries

`TurnView` is a new internal component that receives a `Turn` and renders:

- The `ChatMessage` for the user message
- The grouped header + entries for tools/reasoning/justification
- The `ChatMessage`s for assistant messages

Rough structure:

```tsx
interface TurnViewProps {
  turn: Turn;
  // plus all the props needed by ChatMessage/MessageBody, forwarded appropriately
}

const TurnView: React.FC<TurnViewProps> = ({ turn, ...rest }) => {
  // 1. Render user message (ChatMessage for turn.userMessage)
  // 2. Render turn header + entries
  // 3. Render assistant messages (ChatMessage for each assistant message)
};
```

Important:

- `TurnView` should decide which `tool` / `reasoning` / `justification` entries are rendered under the group header vs left inside each `ChatMessage`.
- We will likely pass a `hiddenPartIds: Set<string>` down to `ChatMessage` / `MessageBody` so that grouped entries are not double-rendered.

Grouping algorithm itself (tool/reasoning/justification collection) can live in a helper shared between `TurnView` and the scroll manager if needed.

## Hooking Anchoring Into Events

Anchoring behavior is mostly about **when** to update `anchoredUserMessageId`, `targetOffset`, `spacerHeight`, and `isPinnedToAnchor`.

### Event: User Sends a New Message

This is the clearest segment boundary.

Today, the send path flows through `useSessionStore` / `useMessageStore` and eventually updates `sessionMessages`, causing `ChatContainer` and `MessageList` to re-render.

For anchoring:

1. When the new user message U_n appears in `sessionMessages`, we can detect it by comparing the previous and next message lists in `useChatScrollManager`.
2. On detection:
   - Set `anchoredUserMessageId = U_n.id`.
   - Set `isPinnedToAnchor = true`.
   - Compute `targetOffset`:
     - After the DOM re-renders, use `scrollRef.current` and `querySelector` with `[data-message-id="U_n.id"]` to get bounding rects.
   - Compute initial `spacerHeight` such that there is enough scroll space to position U_n at `targetOffset`.
   - Adjust `scrollTop` once so that U_n sits at `targetOffset`.

We must avoid doing the scroll adjustment before the DOM has updated. A common pattern:

- Use `requestAnimationFrame` inside the `useEffect` that detects the new anchor.

### Event: New Assistant Part for Active Turn

When streaming tool/reasoning/summary parts arrive for the active turn:

- The total content height changes.
- If `isPinnedToAnchor` is `true`:
  - Recompute `spacerHeight` for the active turn (if needed).
  - After the DOM updates, recompute `currentOffset` for the anchored user message and adjust `scrollTop` by `delta = currentOffset - targetOffset`.

This should run through the same `useChatScrollManager` `onMessageContentChange` path we already have; we just need to make that hook aware of anchor state.

### Event: User Scrolls Manually

We need to stop fighting the user once they scroll away from the anchored view.

Implementation idea:

- Attach a scroll listener (or reuse the one inside `useChatScrollManager`).
- When the user scrolls and the anchored message moves more than some threshold from `targetOffset`, set `isPinnedToAnchor = false`.
- When `isPinnedToAnchor` is `false`, we:
  - Stop re-anchoring on layout changes.
  - The spacer can still exist, but we stop touching `scrollTop`.

We can still keep the scroll-to-bottom button logic as a separate concern.

### Event: Container Resize / Sidebar Toggle

We should use `ResizeObserver` on the scroll container element to detect when its size changes (height in particular).

- When size changes and `isPinnedToAnchor` is `true`:
  - Recompute required `spacerHeight`.
  - After layout settles, recompute `currentOffset` and adjust `scrollTop` so the anchor message returns to `targetOffset`.

This is what keeps the anchored message visually stable when the app layout changes, and is the part that most chat UIs do poorly.

## Scroll-To-Bottom Button Integration

`useChatScrollManager` already computes `showScrollButton`. We need to adjust the policy:

- Instead of a very strict `gap < 1`, use a threshold:

  ```ts
  const gap = scrollHeight - (scrollTop + clientHeight);
  const AT_BOTTOM_THRESHOLD = 24; // px
  const atBottom = gap <= AT_BOTTOM_THRESHOLD;
  ```

- Use hysteresis:
  - Only transition from "at bottom" to "not at bottom" when `gap` exceeds a larger threshold (e.g. 64px).
  - This avoids flicker when spacerHeight changes by 1–2px.

- For active turns:
  - If `isPinnedToAnchor` is true, we can treat the user as "following" the active turn and either:
    - Hide the scroll button entirely, or
    - Only show it if the last entry for the active turn is more than some threshold below the viewport.

Exact values can be tuned later; the key is that spacerHeight adjustments must not cause rapid toggling.

## Progressive Grouping Implementation Notes

This section is about how to move entries from per-message rendering into the grouped header with a delay.

### Entry Ownership

We need to decide who "owns" each entry at any moment:

- During the first phase (immediately after completion):
  - Entry is rendered inside its original `ChatMessage` only.
- After a short delay (e.g. 1s):
  - Entry is rendered under the turn-level header.
  - Entry is **hidden** in its original message bubble.

We should avoid rendering the same entry twice concurrently.

### Where To Store Entry State

Option:

- In `TurnView`, maintain a per-entry state map:

  ```ts
  type TurnEntryKey = string; // e.g. `${messageId}:${partId}`

  interface TurnEntryState {
    phase: 'local' | 'grouped';
    completedAt: number; // time when we first saw it as completed
  }

  const [entryStates, setEntryStates] = useState<Map<TurnEntryKey, TurnEntryState>>(...);
  ```

- When a new entry becomes completed:
  - If it is not in `entryStates`, insert it with `phase = 'local'` and `completedAt = now`.
  - Use a `setTimeout` or an effect that checks `now - completedAt >= DELAY_MS` to flip `phase` to `'grouped'`.

- Rendering logic:
  - `TurnView` passes a `hiddenPartIds` set to each `ChatMessage` / `MessageBody` containing the ids of entries whose `phase === 'grouped'`.
  - The group header and grouped list render entries whose `phase === 'grouped'`.

We will need a stable way to derive `TurnEntryKey` from `(messageId, part.id)` plus the entry type (tool/reasoning/justification).

### Ordering of Entries

Entries within a turn should be ordered by completion time, not necessarily by message index. We can reuse the `time.end` fields on parts/tool states where available.

Algorithm:

- For each entry, derive `completedAt` from its underlying `Part` or tool `state.time.end`.
- Sort turn entries ascending by `completedAt`.
- This ordering drives both the progressive header phase and the final grouped view.

## Summary

Key implementation points:

- Add active-turn anchor + spacer state in `useChatScrollManager`.
- Render a single bottom spacer in `ChatContainer`, driven by that state.
- Detect new user messages and make them the anchored root of an active turn.
- Group messages into turns by `parentID` and introduce a `TurnView` wrapper that owns grouped tool/reasoning/justification rendering.
- Use `hiddenPartIds` to avoid double-rendering entries once they move under the group header.
- Use `ResizeObserver` and simple hysteresis in scroll/button logic to keep the experience smooth.

This file should give enough detail for a coding agent to start wiring up the first iteration (anchor + spacer + basic grouping) and then layer on the progressive slide-in behavior.
