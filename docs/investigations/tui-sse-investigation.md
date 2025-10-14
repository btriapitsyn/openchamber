# OpenCode TUI SSE Investigation

## Overview

This investigation examines how the OpenCode TUI handles Server-Sent Events (SSE) from the OpenCode API and manages message content recovery when streams finish without text parts.

## SSE Implementation Architecture

### 1. SSE Connection Establishment

**File**: `/packages/tui/cmd/opencode/main.go`

The TUI establishes an SSE connection using the OpenCode Go SDK:

```go
stream := httpClient.Event.ListStreaming(ctx, opencode.EventListParams{})
for stream.Next() {
    evt := stream.Current().AsUnion()
    program.Send(evt)  // Send events to TUI for processing
}
```

The SSE endpoint is `/api/event` (configured via `OPENCODE_SERVER` environment variable).

### 2. Event Subscription and Processing

**Files**:

- `/packages/tui/internal/tui/tui.go` (main event handling)
- `/packages/tui/internal/components/chat/messages.go` (message rendering)

The TUI subscribes to these message-related SSE events:

- `message.part.updated` - Updates individual message parts (text, reasoning, tools, etc.)
- `message.part.removed` - Removes message parts
- `message.updated` - Updates entire message metadata
- `message.removed` - Removes entire messages
- `step-finish` - Indicates completion of processing steps

### 3. Control Flow: Streaming to Rendering

#### Event Reception

```go
// In main.go - SSE events sent to TUI program
program.Send(evt)
```

#### Event Processing (tui.go Update method)

1. **Message Part Updates**: Events update local message state in `a.app.Messages`
2. **State Synchronization**: Message parts are added/updated/removed from the in-memory message store
3. **UI Updates**: Changes trigger re-rendering of the chat interface

#### Message State Structure

```go
type Message struct {
    Info  opencode.MessageUnion  // UserMessage or AssistantMessage
    Parts []opencode.PartUnion   // TextPart, ToolPart, ReasoningPart, etc.
}
```

### 4. Fallback Mechanism Analysis

**Question**: Does the TUI perform a REST fallback when `step-finish`/`message.updated` events arrive but no textual parts are recorded?

**Answer**: **No REST fallback implemented**

#### Evidence:

1. **No fallback API calls**: No `Session.Get()` or `Session.Messages()` calls triggered by `step-finish` events
2. **State-only updates**: `step-finish` events only update part metadata (timing), don't fetch missing content
3. **Empty message handling**: The TUI can render messages with no text parts (shows tool calls, reasoning blocks, etc.)

#### Alternative Mechanisms:

- **Tool outputs**: Tool parts contain their own content and don't require text parts
- **Reasoning blocks**: Can exist independently of main text content
- **Delayed content**: All content arrives via SSE events, no polling mechanism

### 5. Comparison with OpenChamber Implementation

**File**: `/packages/app/src/context/sync.tsx`

The OpenChamber uses identical SSE event handling patterns:

- Same event types (`message.updated`, `message.part.updated`, etc.)
- Same state management approach (local store updates)
- No REST fallback mechanism

**Key Similarity**: Both implementations rely entirely on SSE for content delivery.

### 6. Empty Assistant Message Handling

#### TUI Behavior:

- **Empty text parts**: Messages can exist with only tool calls, reasoning, or file parts
- **Rendering logic**: Checks `hasTextPart` flag but doesn't enforce text content requirement
- **User experience**: Shows "Assistant is typing..." or renders available parts (tools, files)

#### OpenChamber Behavior:

- **Identical logic**: Same handling for empty/incomplete messages
- **Progressive rendering**: Updates UI as parts arrive via SSE

### 7. Heuristics and Differences from OpenChamber

#### Role Derivation:

- **TUI**: Uses message type from SSE events (`UserMessage` vs `AssistantMessage`)
- **OpenChamber**: Same approach - no derivation needed from content

#### Message Completion Detection:

- **TUI**: Relies on `step-finish` events and part completion status
- **OpenChamber**: Same mechanism

#### Special Cases:

- **Orphaned tool calls**: Both handle tool calls that arrive without associated text parts
- **Empty assistant messages**: Both can render messages with no text content
- **Stream interruption**: Both handle gracefully without fallback mechanisms

### 8. Parallel Assistant Message Handling

**Question**: Are there mechanisms to handle multiple parallel assistant messages?

**Answer**: **No parallel assistant message support** - The system is designed for sequential processing only.

#### Sequential Processing Architecture

**Backend Constraint** (`/packages/opencode/src/session/prompt.ts`):

```typescript
async next() {
  if (assistantMsg) {
    throw new Error("end previous assistant message first")
  }
  assistantMsg = await createMessage()
  return assistantMsg
}
```

**Evidence**: The backend explicitly prevents starting a new assistant message while another is active.

#### Single SSE Event Stream

**File**: `/packages/tui/cmd/opencode/main.go`

```go
go func() {
  stream := httpClient.Event.ListStreaming(ctx, opencode.EventListParams{})
  for stream.Next() {
    evt := stream.Current().AsUnion()
    program.Send(evt)  // Sequential processing in single goroutine
  }
}()
```

**Evidence**: SSE events are processed sequentially in one goroutine, sent to TUI program one at a time.

#### Sequential Message State Management

**File**: `/packages/tui/internal/tui/tui.go`

The TUI processes message events sequentially in its main `Update()` loop:

- Each `message.updated` and `message.part.updated` event is handled one at a time
- Message IDs are unique and processed in chronological order
- No concurrent data structures for parallel message handling

#### UI Limitations for Parallel Messages

**File**: `/packages/tui/internal/components/chat/messages.go`

The TUI tracks only the "last streaming ReasoningPart" across all messages:

```go
// Find the last streaming ReasoningPart to only shimmer that one
lastStreamingReasoningID := ""
for mi := len(m.app.Messages) - 1; mi >= 0 && lastStreamingReasoningID == ""; mi-- {
  // ... finds most recent streaming part across all messages
}
```

**Evidence**: UI focuses on single-stream rendering, not parallel message display.

#### What IS Supported (Parallel Operations):

✅ **Parallel Tool Calls Within Single Response**:

- Multiple tool calls can execute concurrently within one assistant message
- Evidence: Prompt instructions encourage batching tool calls for performance

✅ **Concurrent Background Operations**:

- Clipboard operations, file I/O, and other non-message tasks run in parallel
- Evidence: Multiple goroutines for UI operations (clipboard, API logging, etc.)

#### Conclusion: Sequential-Only Design

The OpenCode TUI implements a **sequential assistant message processing model**:

- ❌ **No parallel assistant messages** - Only one assistant message active at a time
- ❌ **No concurrent message streaming** - SSE events processed sequentially
- ❌ **No UI support for multiple streaming messages** - Single-stream focus
- ✅ **Parallel tool execution** - Multiple tools within one response
- ✅ **Background operation concurrency** - Non-message operations can be parallel

This design ensures message consistency and prevents conflicts between multiple concurrent assistant responses.

## Conclusion

The OpenCode TUI implements a **stream-only architecture** for message content:

- **No REST fallback** when streams finish without text parts
- **Complete reliance** on SSE for all message content delivery
- **Identical patterns** to OpenChamber implementation
- **Robust handling** of partial/empty messages through progressive SSE updates

This design ensures real-time responsiveness while maintaining consistency with the OpenChamber experience.
