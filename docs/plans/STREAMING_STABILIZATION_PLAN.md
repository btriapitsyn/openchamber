# Assistant Message Streaming Stabilization Plan

## Purpose
Provide an implementation guide for transitioning the chat UI from token-by-token FlowToken rendering to a buffered, part-complete presentation. The goal is to eliminate markdown jitter and animation artifacts while still giving users clear insight into what the assistant is doing.

## Current State Summary
- **StreamingAnimatedText** (`src/components/chat/StreamingAnimatedText.tsx`) animates raw text updates as they arrive. Partial markdown causes layout thrash, and FlowToken’s diff mode intermittently drops the first character of list items.
- **Markdown rendering** is centralized in `createAssistantMarkdownComponents` (`src/components/chat/message/markdownPresets.tsx`). Components expect an `animateText` helper and currently assume text may still mutate mid-stream.
- **Session state** lives in `useSessionStore` (`src/stores/useSessionStore.ts`). Text/Reasoning parts are merged into a single message payload immediately when SSE events land.
- **Event ingestion** happens in `useEventStream` (`src/hooks/useEventStream.ts`). Handlers call the session store to push parts as soon as `message.part.updated` arrives.

## Target Experience
1. **Buffered rendering**: Only display a section of content after the corresponding `Part.time.end` is observed.
2. **Intent-aware placeholders**: While a part is still streaming, show a lightweight status component describing the activity (reasoning, tool invocation, text generation).
3. **FlowToken post-processing**: Feed FlowToken finalized blocks, animate them once, and keep DOM stable afterward.
4. **Guaranteed completion**: Detect the end-of-message conditions using API guarantees (`part.time.end`, `message.time.completed`) and supply a timeout fallback if a part never closes.

## Architectural Changes

### 1. Session Store Enhancements (`src/stores/useSessionStore.ts`)
- Introduce a dual-structure per message:
  - `pendingParts`: Map of `partID -> { type, content, metadata, lastUpdate }` that accumulates live updates without touching the rendered tree.
  - `finalParts`: Ordered array of completed parts used for UI rendering.
- Update `ingestMessagePart(part)` to:
  1. Merge incoming text into `pendingParts`.
  2. When `part.time.end` is set, move the part (or a derived block) from `pendingParts` to `finalParts`.
- Preserve existing optimistic user messaging behavior (user messages should bypass buffering).

### 2. Event Stream Hook (`src/hooks/useEventStream.ts`)
- Ensure `message.part.updated` routes through the revised store API.
- On `message.part.removed`, clear both pending and final state for that part.
- On `message.updated` with `time.completed`, flip a per-message `isComplete` flag (useful for timeout management).

### 3. Rendering Layer Adjustments
#### Chat Container & Message Components
- Primary entry points:
  - `ChatMessage.tsx`
  - `MessageBody.tsx`
  - `AssistantTextPart.tsx`
- Replace direct rendering of `message.parts` with:
  ```ts
  const { finalParts, pendingParts } = useSessionStore(selectMessageParts(messageID));
  ```
- Render sequence:
  1. Iterate `finalParts` to display completed blocks (reasoning, text, tool results).
  2. If `pendingParts` has entries, show status placeholders by type.

#### Placeholder Components
- Create a shared module (e.g. `src/components/chat/message/StreamingPlaceholders.tsx`) containing:
  - `ReasoningPending`: Icon + “Assistant is thinking…” + optional timer.
  - `ToolPending`: Show tool name/arguments while `ToolState` is `pending` or `running`.
  - `TextPending`: Subtle skeleton or typing indicator.
- Each placeholder should accept a `startedAt` timestamp to support timeouts/elapsed time display.

### 4. FlowToken Integration (`StreamingAnimatedText.tsx`)
- Continue using FlowToken for finalized blocks only.
- Remove incremental diff tracking (`prevContentRef` / partial-tag cleanup) and treat `content` as immutable.
- Provide deterministic `key` values based on `part.id` so animation plays exactly once when the block moves from pending to finalized.
- Keep fallback (non-animated) rendering path for users who disable animations or when FlowToken fails.

### 5. Markdown Component Updates (`markdownPresets.tsx`)
- With finalized content, `animateText` involvement is optional; consider simplifying the helper to apply FlowToken only when `allowAnimation` is true and `content.length` is non-zero.
- Remove list-specific workarounds (buffer/string merging) once we feed FlowToken stable text.

## API Assumptions & Referencing
- **Stream protocol** documented in `OPENCODE_API_STREAMING_ANALYSIS.md`:
  - `TextPart` / `ReasoningPart` `time.end` signals completion.
  - `ToolPart.state.status` transitions follow pending → running → completed/error.
- Each SSE payload includes entire part contents; no diff application needed once we buffer.

## Timeout & Error Handling
- Track `pendingParts` timestamps. If `part.time.end` is absent after configurable threshold (e.g. 60s), show a fallback message: “Stream interrupted, partial response shown.”
- Provide a manual cancel path by calling the existing abort endpoint (see `src/lib/opencode/client.ts` for request helpers). If backend exposes `/session/{id}/message/{mid}/cancel`, integrate it into the store when timeout triggers.

## Optional Configuration
- Add a feature flag in `useConfigStore` (`src/stores/useConfigStore.ts`):
  ```ts
  interface UIStreamingPrefs {
    stabilizedRendering: boolean;
    animationEnabled: boolean; // already exists; ensure compatibility
  }
  ```
- Default `stabilizedRendering` to `true` for production builds. Expose a settings toggle later if we want to support “classic live streaming.”

## Implementation Roadmap
1. **Store groundwork**
   - Extend session store types and actions.
   - Update unit selectors used by message components.
2. **Hook integration**
   - Modify `useEventStream` to respect new store API.
   - Confirm fallback polling (`useMessageSync.ts`) still works when message completes after reconnect.
3. **Rendering refactor**
   - Adjust `ChatMessage` stack to consume `finalParts`.
   - Build and integrate pending placeholders.
4. **FlowToken simplification**
   - Refactor `StreamingAnimatedText` to assume immutable content.
   - Delete list/blockquote stopgaps from `markdownPresets.tsx` once confirmed unnecessary.
5. **UX polish**
   - Add timers/labels to pending components.
   - Ensure reasoning segments collapse/expand as before.
6. **Timeout & abort**
   - Implement per-part timeout handling.
   - Surface error banners when a timeout occurs.
7. **QA checklist**
   - Fast models (large chunk updates).
   - Slow token-by-token streams.
   - Reasoning-enabled runs.
   - Tool-invoking sessions.
   - Network drop/polling fallback (`useMessageSync.ts`).

## Open Questions
- Where to persist user preference for stabilized vs instant streaming (local storage vs store default)?
- Should reasoning placeholder expose partial text snippets or remain opaque until finalized?
- Do we collapse multiple finalized reasoning parts into a single block for readability?
- What timeout duration is acceptable before labeling the stream as interrupted?

## References
- `src/hooks/useEventStream.ts`
- `src/stores/useSessionStore.ts`
- `src/hooks/useMessageSync.ts`
- `src/components/chat/ChatMessage.tsx`
- `src/components/chat/message/AssistantTextPart.tsx`
- `src/components/chat/StreamingAnimatedText.tsx`
- `src/components/chat/message/markdownPresets.tsx`
- `OPENCODE_API_STREAMING_ANALYSIS.md`

This document should be the primary reference when implementing the buffered streaming refactor in future sessions.
