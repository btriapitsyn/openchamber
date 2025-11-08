# Assistant Final Summary Scroll Experience Plan

## 1. Background & Rationale
- Current behavior keeps the chat pinned to the bottom during auto-scroll, forcing the user to scroll upward to read animated assistant messages from the beginning.
- Goal: when an animated assistant message begins rendering, reposition the viewport so the response begins ~75% up the message viewport, disable forced auto-scroll, and let the user read top-to-bottom without interference.
- Scope: applies to any assistant message that triggers animation (detected via existing `MessageFreshnessDetector.shouldAnimateMessage`). Non-animated messages retain existing auto-scroll behavior.

## 2. Success Criteria
1. The moment an animated assistant message begins rendering, the chat scrolls exactly once so its first line is visible in the upper section of the viewport (target: 75% of the visible message height above the composer).
2. Auto-scroll remains disabled during the entire animation unless the user manually scrolls to the bottom afterwards or a new message arrives.
3. Non-animated messages (user messages, old assistant messages) continue to auto-scroll as they do today.
4. No layout thrash: the scroll offset adjustment should feel instantaneous and stable even while text animates or the viewport resizes.

## 3. UX Flow Overview
1. `MessageFreshnessDetector.shouldAnimateMessage()` returns `true` for a new assistant message (created within 5 seconds, not seen before).
2. When animation begins (`allowAnimation === true`):
   - Measure the current visible height of the message list (excluding header/composer).
   - Compute a target offset so 75% of that height sits above the bottom of the scroll container.
   - Scroll the container to that offset once.
3. While the message animates, the user can manually scroll; no automatic adjustments fire.
4. After animation finishes (or when the user scrolls to the bottom), auto-scroll returns to normal for subsequent events.

## 4. Technical Approach
### 4.1 Detecting Animation Trigger
- Use existing `MessageFreshnessDetector.shouldAnimateMessage()` result (already computed in `ChatMessage.tsx:272-276`).
- This returns `true` for assistant messages created within 5 seconds that haven't been seen before.
- The same `allowAnimation` flag that enables line-by-line animation also triggers the scroll behavior.

### 4.2 Scroll Manager Enhancements
- Introduce explicit scroll states (e.g., `"pinned"`, `"manual"`, `"animating"`).
- Transition to `animating` when:
  1. Auto-scroll is currently pinned to bottom, and
  2. A message with `allowAnimation === true` begins rendering.
- In `animating` state:
  - Perform a single `scrollTo` using the reserved offset (see §4.3).
  - Suppress subsequent auto-scroll ticks until the state leaves `animating`.
  - Exit the state when the user scrolls near the bottom (within threshold) or when animation completes.

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
- No new message metadata required (reuse existing `allowAnimation` flag from `ChatMessage.tsx`).
- `useChatScrollManager` state machine additions: `mode` enum (`"pinned" | "manual" | "animating"`) + `animationScrollTarget?: number`.
- Pass `allowAnimation` flag to scroll manager via animation handlers or context to trigger mode transition.

## 6. Edge Cases & Mitigations
| Scenario | Mitigation |
| --- | --- |
| Message shorter than 75% buffer | Clamp scroll target to avoid overshooting (already handled via `Math.max`). |
| User scrolls upward before animation ends | Stay in `animating` (no new auto-scroll). Provide "Jump to latest" affordance if necessary. |
| Mobile keyboard shows/hides mid-animation | Listen to `visualViewport` resize; recompute target only if still in `animating` state and user has not scrolled manually. |
| New message arrives before animation completes | Immediately exit `animating` and resume pinned auto-scroll to keep new content visible. |
| Accessibility | Scroll jump should be announced (e.g., aria-live message) or minimized; ensure focus remains on chat container. |

## 7. Implementation Stages
1. **Scroll Manager Refactor**: introduce new state machine with `"pinned"`, `"manual"`, and `"animating"` modes.
2. **Viewport Measurement Hook**: encapsulate measurement logic in `useMessageViewportSize` (ResizeObserver + IntersectionObserver) to keep `useChatScrollManager` lean.
3. **Animation Trigger Integration**: pass `allowAnimation` flag from `ChatMessage` to scroll manager via animation handlers.
4. **Animated Message Positioning**: integrate scroll target computation and single-shot `scrollTo` when entering `animating` mode.
5. **State Transition Logic**: add listeners for user scroll + new messages to exit `animating` state and resume normal auto-scroll.
6. **QA & Tuning**: simulate long/short animated messages, window resize, and mobile viewport changes.

## 8. Validation Checklist
- Desktop / mobile browsers: animated assistant messages start high in viewport (~75% up), no forced scroll to bottom.
- Non-animated messages auto-scroll normally.
- Manual scroll up during animation does not snap back.
- After animation completes, sending a new message re-pins to bottom.
- No console warnings from observers or scroll operations.

## 9. Follow-up / Telemetry Ideas
- Instrument a lightweight metric: time spent in `animating` mode, or whether users scroll upward/downward during animations, to validate UX impact.
- Consider a feature flag to gate rollout if needed.
