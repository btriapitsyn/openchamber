# Assistant Stream Autoscroll Plan

## Goal
Render assistant text blocks only after the message completes, and trigger a one-time viewport scroll (to ~45% height) when the user was pinned during the stream. Remove incremental FlowToken-style animation entirely while keeping existing tool/reasoning timing.

## Constraints
- No partial text rendering for assistant replies. Only final Markdown snapshot after `message.updated` reports `completed`.
- Desktop and web should share the same behavior; FlowToken remains only as a static markdown renderer.
- Soft-scroll occurs only when the user was pinned and has not manually overridden the scroll state.
- Historical messages or messages loaded during sync should never trigger auto-scroll.

## Implementation Steps
1. **Store-level streaming markers**
   - Extend `messageStreamStates` entries with a `completedAt` timestamp when phase switches to `completed`.
   - Track the `streamingMessageId` transitions so we can differentiate “freshly completed” messages from historical ones (e.g., by comparing `completedAt` vs. `Date.now()` and ignoring if more than a small threshold, e.g., 4s).

2. **Scroll manager changes (`useChatScrollManager`)**
   - Replace the current anchor/animation-hold logic with a simple `pendingReveal` ref containing `{messageId, preparedAt, shouldScroll}`.
   - Add `prepareMessageReveal(messageId)` so the UI can capture pinned state *before* the completed message renders.
   - Expose a helper that scrolls the container to `elementTop - viewport*0.45` via `requestAnimationFrame`, only when `pendingReveal` matches and isn’t stale.

3. **Message rendering pipeline**
   - In `ChatMessage`, when an assistant message transitions to `phase: completed`, call `prepareMessageReveal(messageId)` before triggering `onContentChange`.
   - Update `MessageBody`/`AssistantTextPart` to skip rendering assistant text unless the message is completed (or reasoning block requires it). Existing reasoning/tool coordination stays the same.

4. **StreamingAnimatedText simplification**
   - Keep it as a direct `AnimatedMarkdown` wrapper (no timers). Ensure `onContentChange` fires once so the scroll manager receives the DOM update signal.

5. **Event wiring**
   - When `AssistantTextPart` renders, trigger `onContentChange('text', messageId)` so `useChatScrollManager` can compare with `pendingReveal` and run the soft scroll.
   - Remove unused animation handler wiring throughout `ChatMessage`, `MessageList`, and `useChatScrollManager` once the new approach works.

6. **Telemetry / debugging hooks**
   - Add optional `console.debug` statements (guarded by `window.__opencodeDebug`) during development to verify state transitions: when `prepareMessageReveal` is called, when `handleMessageContentChange` processes the message, and whether the scroll actually runs.

7. **Documentation**
   - Update `docs/reports/desktop_ui_truncation.md` after implementation to reflect the new “render-once + soft-scroll” strategy.

## Validation
- Send multiple long assistant replies while pinned: viewport should jump once to keep the start of each reply in view.
- Scroll manually before completion: auto-scroll should not trigger.
- Load historical conversations or sync older messages: no auto-scroll should occur.
- Verify both desktop and web builds behave identically.
