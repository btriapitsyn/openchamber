# Chat Placeholder & Animation Update Report (Jan 2025)

## Overview
During this session we reworked the chat scroll/animation interaction to keep animated assistant replies readable without forcing the user to stay at the bottom. The updates focused on:

1. Making the placeholder height dynamic and smaller (now 40% of viewport instead of 75%).
2. Ensuring placeholder creation/removal is tied to a deterministic lifecycle so it never lingers after short replies.
3. Restoring the original FlowToken line-by-line animation (with safeguards for short messages) after experimenting with word-level streaming.

Key files touched:
- `src/hooks/useChatScrollManager.ts`
- `src/components/chat/StreamingAnimatedText.tsx`
- `src/components/chat/ChatMessage.tsx`
- `src/components/chat/message/parts/AssistantTextPart.tsx`
- `src/components/chat/message/MessageBody.tsx`
- `src/components/chat/message/parts/ReasoningPart.tsx` / `ToolPart.tsx`

## Detailed Changes

### Placeholder & Scroll Manager (`useChatScrollManager.ts`)
- Added animation reservation state machine (`reserved` → `animating` → `completed`) with `animationSpacerHeight` exposed to `MessageList`.
- Pinned vs manual scroll states: placeholder only appears when user is at bottom; auto-scroll lock disengages after animation completes.
- Adjusted placeholder height to `viewportHeight * 0.4` (2/5) for better readability; request to shrink from the initial 0.75 → 0.5 → now 0.4.
- Added `onStreamingCandidate`, `onAnimationStart`, `onReasoningBlock`, etc., so `ChatMessage` can precisely signal when to create/cancel the spacer.

### Chat Message Wiring (`ChatMessage.tsx`)
- Tracks assistant text/tool/reasoning parts to decide whether FlowToken animation should run and whether to reserve space.
- Deduplicates `onStreamingCandidate` calls via `hasTriggeredReservationOnceRef` so placeholders aren’t recreated on every re-render.
- Handles reasoning-mode transitions: if reasoning blocks animation, we cancel the placeholder immediately via `onReasoningBlock`.

### FlowToken Rendering (`StreamingAnimatedText.tsx`)
- Reverted experiments and restored line-by-line streaming with `sep="diff"`; interval default 60 ms, fade-in 0.3 s.
- Added guard to split single-line replies into two pseudo-lines (real text + empty) so even short answers trigger the animation lifecycle, ensuring placeholder cleanup.

### Assistant Markdown Rendering (`AssistantTextPart.tsx`)
- Confirmed we still pass `createAssistantMarkdownComponents(...)` to FlowToken so headings/code blocks use our typography and copy buttons remain functional.

### Message Body & Reasoning Coordination (`MessageBody.tsx`)
- `shouldHoldForReasoning` logic: text waits for reasoning step to finish when no tools present, preventing race conditions where FlowToken tries to animate before final text arrives.
- `shouldCoordinateRendering` now uses the reasoning flag instead of `hasOpenStep` alone, matching new animation gating.

### Reasoning & Tool Components
- `ReasoningPart` and `ToolPart` invoke `onContentChange('structural')` whenever expanded, ensuring scroll manager knows when layout height changes.

## Known Behaviour
- FlowToken still shows short replies almost instantly (one line added, 0.3 s fade). Placeholder removal relies on completion + user staying pinned.
- If user scrolls away before animation finishes, placeholder remains until they return near the bottom. This ensures consistent “read from top” experience.

## Next Steps / Ideas
- Consider a custom animation layer (own renderer) if FlowToken continues to cause maintenance burden.
- Potential UX improvement: show subtle “animated message” badge when we reserve space, so users know why the chat jumped.

