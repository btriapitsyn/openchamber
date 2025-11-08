# Assistant Final Summary Scroll Experience Plan

## 1. Background & Rationale
- Current behavior keeps the chat pinned to the bottom while the assistant streams, forcing the user to scroll upward to read the beginning of the final response.
- Goal: when the assistant finishes tool activity and starts the synthesized summary, reposition the viewport so the response begins ~75% up the message viewport, disable forced auto-scroll, and let the user read top-to-bottom without interference.
- Scope: applies only to animated assistant text messages that represent the final summary of a tool run. Tool status messages and intermediate updates retain existing auto-scroll behavior.

## 2. Success Criteria
1. The moment a "final" assistant text message begins streaming, the chat scrolls exactly once so its first line is visible in the upper section of the viewport (target: 75% of the visible message height above the composer).
2. Auto-scroll remains disabled during the entire summary animation unless the user manually scrolls to the bottom afterwards or a non-summary message arrives.
3. Tool outputs, user messages, and other real-time updates continue to auto-scroll as they do today.
4. No layout thrash: the scroll offset adjustment should feel instantaneous and stable even while text animates or the viewport resizes.

## 3. UX Flow Overview
1. Assistant completes tool work and emits a metadata flag (or message type) marking the next assistant message as `finalSummary`.
2. When the first chunk of that summary renders:
   - Measure the current visible height of the message list (excluding header/composer).
   - Compute a target offset so 75% of that height sits above the bottom of the scroll container.
   - Scroll the container to that offset once.
3. While the summary animates, the user can manually scroll; no automatic adjustments fire.
4. After the summary finishes (or when the user scrolls to the bottom), auto-scroll returns to normal for subsequent events.

## 4. Technical Approach
### 4.1 Detecting Final Summary State
- Reuse the existing animation predicate (`MessageFreshnessDetector.shouldAnimateMessage`) so the same signal that triggers streaming animation also primes the final-summary scroll mode.
- Expose that flag via `useChatScrollManager.getAnimationHandlers(messageId, { isFinalSummaryCandidate: true })`, allowing both message rendering and scroll coordination to share identical triggers without new metadata fields.

### 4.2 Scroll Manager Enhancements
- Introduce explicit scroll states (e.g., `"pinned"`, `"manual"`, `"finalSummary"`).
- Transition to `finalSummary` when:
  1. Auto-scroll is currently pinned to bottom, and
  2. The next arriving assistant message has `isFinalSummary`.
- In `finalSummary` state:
  - Perform a single `scrollTo` using the reserved offset (see §4.3).
  - Suppress subsequent auto-scroll ticks until the state leaves `finalSummary`.
  - Exit the state when the user scrolls near the bottom (within threshold) or when a non-summary message arrives.

### 4.3 Viewport Measurement & Offset Calculation
- Attach a ref to the scrollable message container (already present for auto-scroll logic).
- Use `ResizeObserver` + `visualViewport` listeners (mobile) to keep the visible height measurement fresh.
- Compute `visibleHeight = min(intersectionRect.height, containerRect.height)` to account for partial visibility.
- Target scroll offset: `target = Math.max(0, scrollHeight - visibleHeight + visibleHeight * 0.25)`.
- Use `element.scrollTo({ top: target, behavior: 'auto' })` to avoid smooth-scroll race conditions with the animation.

### 4.4 Animation Friendly Rendering
- Ensure `StreamingAnimatedText` can render within a pre-sized area without wrapping glitches. Consider adding `min-height` to the message bubble to reduce layout jank during the initial scroll.
- Guard against virtualization: if message virtualization is introduced later, the plan should work with sentinel items; for now, list is fully rendered.

### 4.5 Composer & Header Exclusion
- The measurement needs the actual visible viewport of the message list only. Ensure container height already excludes header/composer (flex layout). If not, adjust layout to provide a dedicated wrapper for measurement with predictable padding.

## 5. Data & State Changes
- `Message` type: add `isFinalSummary?: boolean`.
- `useChatScrollManager` state machine additions: `mode` enum + `finalSummaryTarget?: number`.
- Optional: `useAssistantStatus` may expose a `finalSummaryPending` status to signal UI components.

## 6. Edge Cases & Mitigations
| Scenario | Mitigation |
| --- | --- |
| Summary shorter than 75% buffer | Clamp scroll target to avoid overshooting (already handled via `Math.max`). |
| User scrolls upward before summary ends | Stay in `finalSummary` (no new auto-scroll). Provide "Jump to latest" affordance if necessary. |
| Mobile keyboard shows/hides mid-summary | Listen to `visualViewport` resize; recompute target only if still in `finalSummary` state and user has not scrolled manually. |
| Follow-up tool message arrives before summary completes | Immediately exit `finalSummary` and resume pinned auto-scroll to keep tool output visible. |
| Accessibility | Scroll jump should be announced (e.g., aria-live message) or minimized; ensure focus remains on chat container. |

## 7. Implementation Stages
1. **Instrumentation**: propagate `isFinalSummary` through stores and rendering without behavioral change.
2. **Scroll Manager Refactor**: introduce new state machine, unit-test transitions where possible.
3. **Viewport Measurement Hook**: encapsulate measurement logic in `useMessageViewportSize` (ResizeObserver + IntersectionObserver) to keep `useChatScrollManager` lean.
4. **Final Summary Positioning**: integrate scroll target computation and single-shot `scrollTo`.
5. **Re-enable Auto-scroll Logic**: add listeners for user scroll + new messages to exit `finalSummary` state.
6. **QA & Tuning**: simulate long/short summaries, tool interleaving, window resize, and mobile viewport changes.

## 8. Validation Checklist
- Desktop / mobile browsers: final summary starts high in viewport, no forced scroll to bottom.
- Tool streaming unaffected.
- Manual scroll up during summary does not snap back.
- After summary completes, sending a user message re-pins to bottom.
- No console warnings from observers or scroll operations.

## 9. Follow-up / Telemetry Ideas
- Instrument a lightweight metric: time spent in `finalSummary` mode, or whether users scroll upward/downward during summaries, to validate UX impact.
- Consider a feature flag to gate rollout if needed.
