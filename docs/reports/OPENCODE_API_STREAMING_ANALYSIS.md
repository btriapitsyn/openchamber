# OpenCode API Streaming Analysis Report

## Overview

This document provides a comprehensive analysis of the OpenCode API streaming architecture, focusing on how assistant messages are received and processed in real-time. Understanding this mechanism is crucial for building robust UI components that handle various message streaming patterns from different AI models.

## API Architecture

### Core Endpoints

- **EventSource Stream**: `GET /event` with `text/event-stream` content type
- **Message Creation**: `POST /session/{id}/message`
- **Message Retrieval**: `GET /session/{id}/message`

### Real-time Communication

The OpenCode API uses Server-Sent Events (SSE) for real-time updates, providing a unidirectional stream of events from the server to the client.

## Message Structure

### AssistantMessage Schema

```typescript
interface AssistantMessage {
  id: string;
  sessionID: string;
  role: "assistant";
  time: {
    created: number;
    completed?: number; // Present when message is fully generated
  };
  error?: ProviderAuthError | UnknownError | MessageOutputLengthError | MessageAbortedError;
  system: string[];
  modelID: string;
  providerID: string;
  mode: string;
  path: { cwd: string; root: string };
  summary: boolean;
  cost: number;
  tokens: {
    input: number;
    output: number;
    reasoning: number;
    cache: { read: number; write: number };
  };
}
```

### Message Parts System

Each message consists of multiple parts that can be updated independently:

```typescript
type Part =
  | TextPart        // Main response content
  | ReasoningPart   // Internal thinking/reasoning
  | ToolPart        // Tool execution
  | FilePart        // File operations
  | StepStartPart   // Process step initiation
  | StepFinishPart  // Process step completion
  | SnapshotPart    // State snapshots
  | PatchPart       // Code changes
  | AgentPart;      // Agent interactions
```

#### TextPart Structure

```typescript
interface TextPart {
  id: string;
  sessionID: string;
  messageID: string;
  type: "text";
  text: string;           // Full accumulated text content
  synthetic?: boolean;
  time: {
    start: number;
    end?: number;         // null during streaming, set when complete
  };
  metadata?: Record<string, any>;
}
```

#### ToolPart Structure

```typescript
interface ToolPart {
  id: string;
  sessionID: string;
  messageID: string;
  type: "tool";
  callID: string;
  tool: string;
  state: ToolState;
  metadata?: Record<string, any>;
}

type ToolState =
  | ToolStatePending
  | ToolStateRunning
  | ToolStateCompleted
  | ToolStateError;
```

## Streaming Event Types

### Critical Events for Message Handling

1. **`message.updated`** - Message metadata updates
   ```typescript
   {
     type: "message.updated",
     properties: {
       info: AssistantMessage
     }
   }
   ```

2. **`message.part.updated`** - **Primary streaming event**
   ```typescript
   {
     type: "message.part.updated",
     properties: {
       part: Part
     }
   }
   ```

3. **`message.part.removed`** - Part deletion
   ```typescript
   {
     type: "message.part.removed",
     properties: {
       part: Part
     }
   }
   ```

## Streaming Patterns by Model Type

### Fast Models (e.g., Claude Haiku)
- **Behavior**: Large text chunks per update
- **Pattern**: Fewer `message.part.updated` events with substantial content
- **UI Impact**: Less frequent re-renders, smoother perceived performance

### Slow Models (e.g., GPT-4)
- **Behavior**: Token-by-token or word-by-word streaming
- **Pattern**: High frequency of `message.part.updated` events with incremental text
- **UI Impact**: More frequent re-renders, requires debouncing for performance

### Reasoning-Enabled Models
- **Behavior**: Two-phase generation
- **Pattern**:
  1. `ReasoningPart` updates (internal thinking)
  2. `TextPart` updates (final response)
- **UI Impact**: Need to handle reasoning display separately from main content

### Complex Multi-Tool Responses
- **Behavior**: Parallel part generation
- **Pattern**: Multiple concurrent `ToolPart` and `TextPart` updates
- **UI Impact**: Requires independent part state management

## Tool Execution Lifecycle

Tools follow a predictable state progression:

```
ToolStatePending → ToolStateRunning → ToolStateCompleted/ToolStateError
```

### ToolStateCompleted Structure
```typescript
interface ToolStateCompleted {
  status: "completed";
  input: Record<string, any>;    // Tool parameters
  output: string;                // Tool execution result
  title: string;                 // Display title
  metadata: Record<string, any>;
  time: {
    start: number;
    end: number;
    compacted?: number;
  };
}
```

## Critical Implementation Considerations

### 1. Event Deduplication
- Events may be received multiple times
- Use `part.id` for deduplication
- Implement idempotent update logic

### 2. Content Accumulation
- `TextPart.text` contains full accumulated content, not deltas
- Replace entire text content on each update
- Preserve cursor position during updates for UX

### 3. Completion Detection
- Message is complete when `time.completed` is present in `message.updated`
- Individual parts complete when `time.end` is set
- Tool completion is indicated by `ToolStateCompleted` or `ToolStateError`

### 4. Part Ordering
- Parts maintain insertion order within a message
- UI must preserve this order for coherent display
- Use stable sorting by part creation time

### 5. Optimistic Updates
- User messages are added optimistically to UI
- Assistant responses arrive through EventSource
- Handle potential race conditions between optimistic updates and server events

### 6. Error Handling
- Network disconnections require EventSource reconnection
- Handle partial message states gracefully
- Display appropriate loading states during reconnection

## Performance Optimization Strategies

### 1. Debouncing
- Debounce rapid `TextPart` updates for slow-streaming models
- Batch multiple part updates within a short time window
- Balance responsiveness with performance

### 2. Virtual Scrolling
- Implement for long conversations with many messages
- Maintain scroll position during streaming updates
- Handle dynamic content height changes

### 3. Memory Management
- Clean up completed tool states
- Implement message pagination for long sessions
- Consider part compaction for old messages

## UI/UX Recommendations

### 1. Progressive Disclosure
- Show reasoning parts in expandable sections
- Highlight active streaming parts
- Use subtle animations for new content

### 2. Tool Visualization
- Display tool execution progress
- Show tool inputs and outputs clearly
- Indicate tool completion status

### 3. Message State Indicators
- Show message generation progress
- Indicate completion status
- Handle error states gracefully

### 4. Accessibility
- Announce new content to screen readers
- Maintain focus management during updates
- Provide text alternatives for visual indicators

## Common Edge Cases

1. **Empty Parts**: Handle parts with empty content gracefully
2. **Rapid Updates**: Prevent UI thrashing with high-frequency updates
3. **Network Issues**: Graceful degradation when EventSource fails
4. **Large Content**: Handle very long text parts efficiently
5. **Concurrent Tools**: Multiple tools executing simultaneously
6. **Part Reordering**: Handle rare cases where part order changes

## Conclusion

The OpenCode API provides a sophisticated streaming architecture that supports various AI model behaviors. Successful implementation requires careful attention to event handling, state management, and performance optimization. The part-based message structure enables fine-grained updates while maintaining message coherence.

Key success factors:
- Robust event deduplication
- Efficient state management
- Performance-conscious rendering
- Graceful error handling
- Accessible user experience

This architecture provides the foundation for building responsive, real-time AI chat interfaces that can adapt to different model streaming patterns and provide excellent user experience across various usage scenarios.