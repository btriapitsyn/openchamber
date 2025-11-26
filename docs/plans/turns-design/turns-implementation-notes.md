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
  anchorId: string | null; // ID of the active user message
  targetOffset: number; // px from container top
  spacerHeight: number; // px; dynamic spacer at bottom
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

Where `activeTurnSpacerHeight` comes from `useChatScrollManager` (derived from `spacerHeight` for the current session).

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

Anchoring behavior is defined by the "One Movement" rule.

### Event: User Sends a New Message

This is the **only** event that triggers an auto-scroll.

1. When `sessionMessages` updates with a new message at the end that is distinct from the last known message ID:
   - Set `activeTurnState.anchorId` to the new message ID.
   - Set `spacerHeight` to ensure valid scroll space.
   - Trigger `scrollEngine.scrollToPosition(targetTop)` **once**.
   - Store the ID in a ref (`lastScrolledAnchorIdRef`) to prevent loops.

### Event: New Assistant Part / Content Change

When streaming tool/reasoning/summary parts arrive:

- Call `refreshSpacer()`.
- This recalculates `spacerHeight` to maintain the *potential* for the anchor position.
- It explicitly **does not** touch `scrollTop`. The user stays where they are.

### Event: Container Resize

- Use `ResizeObserver` to call `refreshSpacer()`.
- This keeps the spacer correct relative to the new viewport height.

## Scroll-To-Bottom Button Integration

`useChatScrollManager` computes `showScrollButton` locally:

- Determine `targetTop` for the current `anchorId`.
- `isAtAnchor = Math.abs(scrollTop - targetTop) <= threshold` (e.g. 40px).
- `showScrollButton = !isAtAnchor`.

Clicking the button calls `scrollToBottom`, which is implemented to scroll specifically to `targetTop` of the active anchor (or physical bottom if no anchor).

## History Loading

- Detect when messages are prepended (message count increases but last message ID is stable).
- Do **not** trigger the "New User Message" logic.
- `refreshSpacer` ensures the spacer is correct, but no scroll happens.


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
