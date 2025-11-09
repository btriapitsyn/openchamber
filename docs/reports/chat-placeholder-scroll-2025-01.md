# Chat Scroll & Animation Update Report (Jan 2025)

## Overview
We refactored the animated-assistant experience to keep responses readable without relying on placeholder spacers. The new flow continuously keeps the viewport pinned during animation and then pauses auto-scroll exactly once when the message becomes tall enough for comfortable reading.

Key files touched:
- `src/hooks/useChatScrollManager.ts`
- `src/components/chat/ChatMessage.tsx`
- `src/components/chat/MessageList.tsx`
- `src/components/chat/StreamingAnimatedText.tsx`
- `src/components/chat/message/parts/AssistantTextPart.tsx`
- `src/components/chat/message/MessageBody.tsx`

## Detailed Changes

### Scroll Manager (`useChatScrollManager.ts`)
- Removed the spacer-based reservation system (`animationSpacerHeight`) in favor of a height-based “hold” state that simply stops issuing auto-scroll commands once an animated reply reaches ~40 % of the viewport.
- While FlowToken streams new lines we explicitly call `flushToBottom()` so the user always sees the newest line until the hold triggers; after that we never touch scroll again until the user returns to the bottom or sends a new message.
- Added lightweight bookkeeping (`animationHold`, `holdManualReturnRef`) to detect when the user scrolls away and when they come back, ensuring auto-scroll resumes only on deliberate actions.

### Chat Message Wiring (`ChatMessage.tsx`)
- Keeps forwarding FlowToken lifecycle signals (`onStreamingCandidate`, `onAnimatedHeightChange`, `onReasoningBlock`, etc.) so the scroll manager knows when to start tracking a message, how tall it is, and when to release the hold.
- Still deduplicates reservation/animation events to avoid redundant notifications.

### FlowToken / Markdown Rendering
- Streaming logic remains line-by-line (`StreamingAnimatedText.tsx`); no behavioural changes, just ensures `onChunk` fires consistently so the scroll manager can flush while pinned.
- Markdown/assistant part components continue to report structural changes; no spacer-specific logic remains.

## Behaviour Notes
- Short replies never hit the 40 % threshold, so auto-scroll stays pinned from start to finish.
- Long replies trigger a single viewport jump when the hold engages; after that the UI stays frozen until the user scrolls down or sends a message, preventing the “snap back to bottom” we had before.
- No placeholder artifacts, height animations, or lingering spacers remain.

## Next Steps / Ideas
- Consider telemetry on how often users scroll back to the bottom vs. send a follow-up to fine-tune the 40 % threshold.
- If FlowToken latency ever diverges from DOM paint timing, we could tap IntersectionObserver to confirm actual visibility instead of relying solely on measured heights.
