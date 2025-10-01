# Assistant Message Streaming Stabilization Plan (Revised)

## Purpose
Provide an implementation guide for transitioning the chat UI from token-by-token FlowToken rendering to a buffered, part-complete presentation. The goal is to eliminate markdown jitter and animation artifacts while still giving users clear insight into what the assistant is doing.

**Key Principle (CRITICAL):** Never render partial content. Show animated placeholders while parts stream, then render complete finalized content **once** with FlowToken `sep="word"` for smooth word-by-word animation.

## Lessons Learned from Failed Attempt

### ❌ What Went Wrong
1. **Overcomplicated store buffering** - Added dual `streamingParts`/`finalParts` structure that interfered with existing `addStreamingPart` logic
2. **CSS stagger hacks** - Tried to force animation with `nth-child` selectors instead of letting FlowToken handle it
3. **Incremental updates still happening** - Parts were being updated incrementally through old store mechanism, defeating the purpose
4. **Missing the obvious solution** - FlowToken with `sep="word"` on complete text does exactly what we need!

### ✅ Correct Approach (Simplified)
**Do NOT modify `useSessionStore` or `addStreamingPart`!** The existing store works fine. Just change rendering layer:

1. **In `AssistantTextPart.tsx`** - Check if part is finalized before rendering
2. **If `part.time.end === undefined`** → Render placeholder component (animated icon + "Thinking...")
3. **If `part.time.end` exists** → Pass **complete text** to FlowToken with `sep="word"`
4. **FlowToken handles word-by-word animation automatically** - no CSS hacks needed!

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

## Simplified Implementation (Rendering Layer Only)

### 1. Create Placeholder Component (`src/components/chat/message/StreamingPlaceholder.tsx`)
Simple animated indicators for pending parts:

```typescript
interface StreamingPlaceholderProps {
    partType: 'text' | 'reasoning' | 'tool';
    toolName?: string;
}

export function StreamingPlaceholder({ partType, toolName }: StreamingPlaceholderProps) {
    if (partType === 'reasoning') {
        return (
            <div className="flex items-center gap-2 text-muted-foreground">
                <Brain className="w-4 h-4 animate-pulse" />
                <span>Reasoning...</span>
            </div>
        );
    }

    if (partType === 'tool') {
        return (
            <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{toolName || 'Tool'} running...</span>
            </div>
        );
    }

    // text type - rare, text parts finalize quickly
    return (
        <div className="flex items-center gap-2 text-muted-foreground">
            <span className="animate-pulse">Typing...</span>
        </div>
    );
}
```

### 2. Update `AssistantTextPart.tsx` (MAIN CHANGE)
Replace incremental rendering with finalization check:

```typescript
const AssistantTextPart: React.FC<AssistantTextPartProps> = ({ part, ...props }) => {
    const rawText = (part as any).text;
    const textContent = typeof rawText === 'string' ? rawText : '';

    // Check if part is finalized
    const time = (part as any).time;
    const isFinalized = time && typeof time.end !== 'undefined';

    // Show placeholder while streaming
    if (!isFinalized) {
        return <StreamingPlaceholder partType="text" />;
    }

    // Part is finalized - render complete text with word-by-word animation
    return (
        <div className="break-words" key={part.id}>
            <StreamingAnimatedText
                content={textContent}
                phase="completed" // Always completed when we render
                markdownComponents={markdownComponents}
                part={part}
            />
        </div>
    );
};
```

### 3. Update `ReasoningPart.tsx` (Similar Pattern)
```typescript
const ReasoningPart: React.FC<ReasoningPartProps> = ({ part, ...props }) => {
    const time = (part as any).time;
    const isFinalized = time && typeof time.end !== 'undefined';

    if (!isFinalized) {
        return <StreamingPlaceholder partType="reasoning" />;
    }

    // Render finalized reasoning with collapsible UI
    return <CollapsibleReasoningBlock content={(part as any).text} />;
};
```

### 4. Update `ToolPart.tsx` (Status-based)
```typescript
const ToolPart: React.FC<ToolPartProps> = ({ part, ...props }) => {
    const state = (part as any).state;
    const isFinalized = state && (state.status === 'completed' || state.status === 'error');

    if (!isFinalized) {
        return <StreamingPlaceholder partType="tool" toolName={(part as any).tool} />;
    }

    // Render finalized tool result card
    return <ToolResultCard part={part} {...props} />;
};
```

### 5. Update `StreamingAnimatedText.tsx` (Simplification)
Remove incremental diff tracking, use `sep="word"` for finalized content:

```typescript
export const StreamingAnimatedText: React.FC<StreamingAnimatedTextProps> = ({
    content,
    markdownComponents,
    part,
}) => {
    // No phase tracking needed - we only render finalized content
    // Key based on part.id ensures animation plays once
    const componentKey = useMemo(() =>
        part?.id ? `flow-${part.id}` : 'flow-default',
        [part?.id]
    );

    return (
        <div className="break-words flowtoken-animated">
            <AnimatedMarkdown
                key={componentKey}
                content={content}
                sep="word"  // Word-by-word animation
                animation="fadeIn"
                animationDuration="0.2s"
                animationTimingFunction="ease-out"
                customComponents={markdownComponents}
            />
        </div>
    );
};
```

**Key changes:**
- Removed `prevContentRef`, `hasPendingAnimation`, `cleanedContent` - no longer needed
- Always animate with `sep="word"` - FlowToken splits by whitespace and animates each word
- Single render with complete content - no re-renders, no jitter

## How FlowToken `sep="word"` Works

From FlowToken source code analysis (`references/flowtoken/src/components/SplitText.tsx`):

```typescript
// Line 68-76: Word splitting logic
if (sep === 'word') {
    splitRegex = /(\s+)/;  // Split on whitespace
}
return input.split(splitRegex).filter(token => token.length > 0);

// Each token becomes a span with animation
<span style={{
    animationName: animation,
    animationDuration,
    animationTimingFunction,
    // ...
}}>
    {text}
</span>
```

**Result:** When we pass complete text with `sep="word"`:
1. FlowToken splits: `"Hello world"` → `["Hello", " ", "world"]`
2. Each word gets wrapped in animated span
3. Browser renders all spans simultaneously, CSS animations start
4. With `animationDuration="0.2s"`, each word fades in over 200ms
5. **Natural stagger from DOM rendering order** - no manual delay needed!

## API Guarantees (OpenCode Backend)

Verified from OpenCode API spec (http://127.0.0.1:52847/doc):

### TextPart Structure
```json
{
  "id": "part-abc123",
  "type": "text",
  "text": "Full message content here",
  "time": {
    "start": 1234567890,
    "end": 1234567895  // undefined while streaming, set when complete
  }
}
```

### ReasoningPart Structure
```json
{
  "id": "part-def456",
  "type": "reasoning",
  "text": "Thinking process...",
  "time": {
    "start": 1234567890,
    "end": 1234567900  // undefined while streaming
  }
}
```

### ToolPart Structure
```json
{
  "id": "part-ghi789",
  "type": "tool",
  "tool": "Read",
  "state": {
    "status": "pending" | "running" | "completed" | "error"
  },
  "result": "..." // only present when completed
}
```

**Finalization Detection:**
- `TextPart`/`ReasoningPart`: `typeof part.time.end !== 'undefined'`
- `ToolPart`: `part.state.status === 'completed' || part.state.status === 'error'`

## Implementation Roadmap (Simplified)

1. **Create StreamingPlaceholder.tsx** (~30 lines)
   - Simple functional component with 3 variants (text, reasoning, tool)
   - Uses Lucide icons (Brain, Loader2) with Tailwind animations

2. **Update AssistantTextPart.tsx** (~10 lines changed)
   - Add finalization check: `typeof part.time.end !== 'undefined'`
   - Render placeholder if not finalized
   - Pass complete text to StreamingAnimatedText if finalized

3. **Update StreamingAnimatedText.tsx** (~50 lines removed, ~20 added)
   - Delete: `prevContentRef`, `hasPendingAnimation`, `cleanedContent`, phase logic
   - Change: `sep="diff"` → `sep="word"`
   - Simplify: Single render path, no state management

4. **Update ReasoningPart.tsx** (~5 lines changed)
   - Add same finalization check
   - Render placeholder if not finalized

5. **Update ToolPart.tsx** (~5 lines changed)
   - Check `state.status` instead of `time.end`
   - Render placeholder if status is pending/running

## Expected UX Flow

### Text Response
```
[Typing...] → [Word1 fadeIn] [Word2 fadeIn] [Word3 fadeIn] ...
     ↑              ↑
  placeholder   finalized (0.2s per word)
```

### Reasoning
```
[Brain pulse "Reasoning..."] → [Complete reasoning text with word-by-word fadeIn]
         ↑                                   ↑
    streaming                           finalized
```

### Tool Execution
```
[Spinner "Read running..."] → [Tool result card appears]
         ↑                            ↑
    pending/running                completed
```

## Why This Works

1. **No store changes** - Existing `addStreamingPart` mechanism untouched
2. **Simple conditional rendering** - Check one field, show placeholder or content
3. **FlowToken does the heavy lifting** - `sep="word"` splits and animates automatically
4. **Single source of truth** - Part finalization state from backend (`time.end` / `state.status`)
5. **No CSS hacks** - FlowToken's built-in animation system handles stagger naturally

## Testing Checklist
- [ ] Fast models (Haiku) - immediate finalization
- [ ] Reasoning mode - placeholder shows, then reasoning block appears with animation
- [ ] Tool execution - spinner during run, result card after completion
- [ ] Network interruption - placeholder stays until part finalizes
- [ ] Multiple parts - each animates independently when finalized

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
