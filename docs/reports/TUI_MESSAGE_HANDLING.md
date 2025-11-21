# TUI Message Handling Documentation

This document explains how the TUI (Terminal User Interface) handles user messages, including field population, display timing, and message ID generation.

## Message Fields

When a user submits a message in the TUI prompt, the following fields are populated:

### Core Message Fields

- **`messageID`**: Generated client-side using `Identifier.ascending("message")`
- **`sessionID`**: Current session ID or creates new session
- **`agent`**: Current agent name from `local.agent.current().name`
- **`model`**: Current model from `local.model.current()`
- **`parts`**: Array containing:
  - Text part with user input
  - File parts for any attached files/images

### Additional Fields

- **`providerID`** and **`modelID`**: Extracted from current model selection
- **Non-text parts**: Files and images are processed separately and added to the parts array

## Display Timing

### Immediate Display (Optimistic UI)

Messages are displayed **immediately upon submission** with these characteristics:

- User messages appear instantly in the UI with a "QUEUED" status
- The TUI shows the message right away in the `UserMessage` component
- Messages are marked as "queued" until processed by the server

### Server Confirmation

- When the server processes the message, it emits `message.updated` events
- The sync context handles these events and updates the local store
- Messages transition from "queued" to their final state
- The UI automatically updates through reactive signals

## Message ID Generation

### Client-Side Generation

The TUI **creates message IDs client-side** using the `Identifier.ascending("message")` function. This ensures:

- Immediate display capability (no waiting for server ID)
- Monotonic ordering for proper message sequence
- Unique identification across the session

### ID Generation Logic

The `Identifier.ascending("message")` function works as follows:

```typescript
// From packages/opencode/src/id/id.ts

export function ascending(prefix: keyof typeof prefixes, given?: string) {
  return generateID(prefix, false, given)
}

function generateID(prefix: keyof typeof prefixes, descending: boolean, given?: string): string {
  if (!given) {
    return create(prefix, descending)
  }
  // Validation logic for existing IDs
  if (!given.startsWith(prefixes[prefix])) {
    throw new Error(`ID ${given} does not start with ${prefixes[prefix]}`)
  }
  return given
}

export function create(prefix: keyof typeof prefixes, descending: boolean, timestamp?: number): string {
  const currentTimestamp = timestamp ?? Date.now()

  // Monotonic counter for same-timestamp IDs
  if (currentTimestamp !== lastTimestamp) {
    lastTimestamp = currentTimestamp
    counter = 0
  }
  counter++

  // Combine timestamp and counter for ordering
  let now = BigInt(currentTimestamp) * BigInt(0x1000) + BigInt(counter)
  now = descending ? ~now : now

  // Convert to bytes and encode
  const timeBytes = Buffer.alloc(6)
  for (let i = 0; i < 6; i++) {
    timeBytes[i] = Number((now >> BigInt(40 - 8 * i)) & BigInt(0xff))
  }

  return prefixes[prefix] + "_" + timeBytes.toString("hex") + randomBase62(LENGTH - 12)
}
```

### ID Format

- **Prefix**: `msg_` for messages
- **Timestamp**: 6 bytes (48 bits) encoding time and counter
- **Random suffix**: Base62 encoded random string for uniqueness
- **Total length**: 26 characters + prefix
- **Example**: `msg_1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o6p7q8r9s0t1u2v3w4x5y6z`

### Monotonic Properties

- **Timestamp-based**: Uses `Date.now()` for chronological ordering
- **Counter**: Handles multiple IDs generated within the same millisecond
- **Stateful**: Maintains `lastTimestamp` and `counter` across calls
- **Collision-resistant**: Random suffix prevents conflicts

## Message Flow

### Submission Process

1. **User Input**: User types message and presses submit in TUI prompt
2. **ID Generation**: TUI generates messageID using `Identifier.ascending("message")`
3. **Local Creation**: Message object is created locally with all fields
4. **Immediate Display**: Message appears instantly in UI with "QUEUED" status
5. **Server Request**: TUI sends `sdk.client.session.prompt()` request to server
6. **Server Processing**: Server processes message and streams back response
7. **Event Emission**: Server emits `message.updated` events
8. **Sync Update**: Sync context updates local store with server-confirmed message
9. **UI Update**: UI removes "QUEUED" status and shows final message

### Data Storage

- **Messages**: Stored in `sync.data.message[sessionID]`
- **Parts**: Stored separately in `sync.data.part[messageID]`
- **Reactive Updates**: UI uses reactive signals for automatic updates
- **Pending Tracking**: Pending messages tracked via `pending()` memo

## Key Implementation Files

- **Prompt Component**: `packages/opencode/src/cli/cmd/tui/component/prompt/index.tsx:389-495`
- **Session Display**: `packages/opencode/src/cli/cmd/tui/component/session/index.tsx`
- **Sync Context**: `packages/opencode/src/cli/cmd/tui/component/sync.tsx:143-163`
- **ID Generation**: `packages/opencode/src/id/id.ts:52-71`

## Architecture Benefits

1. **Immediate Feedback**: Users see their messages instantly
2. **Offline Resilience**: Client-generated IDs work even with connectivity issues
3. **Consistent Ordering**: Monotonic IDs ensure proper message sequence
4. **Server Flexibility**: Server can accept client IDs or generate its own
5. **Optimistic UX**: Smooth user experience without waiting for server round-trip

This optimistic UI pattern provides excellent user experience while maintaining data consistency through server confirmation and event-driven updates.
