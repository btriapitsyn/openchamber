# Chat Scroll Engine Refactor Plan (Feb 2025)

## Goal

Streamline the chat scrolling subsystem by removing legacy auto-scroll machinery, consolidating manual override detection, and delegating history pagination to explicit UI controls. The end state should be a minimal, predictable API between `useScrollEngine` and `useChatScrollManager`, improving maintainability and reducing unexpected scroll jumps.

## Scope

1. **Simplify `useScrollEngine`**
   - Remove the double-RAF + fallback timeout scheduling chain and unused `pendingFinalFlushRef`.
   - Keep only: `flushToBottom`, `scrollToBottom`, `handleScroll`, pinned state, and the scroll button flag.
   - Ensure auto-scroll timing still feels smooth by leaning on `useSmoothAutoScroll` directly.

2. **Consolidate manual override detection**
   - Move wheel/touch/manual override tracking into `useScrollEngine` so there is a single truth for "user scrolled manually".
   - Expose a simple boolean (e.g., `manualOverrideRef`) or helper to `useChatScrollManager` instead of the current duplicate refs.

3. **Remove redundant DOM writes**
   - Delete `forceScrollToBottom` in `useChatScrollManager`; use `scrollEngine.scrollToBottom()` everywhere.
   - Audit for any remaining direct `container.scrollTop` mutations (besides history restore) and replace with engine helpers where possible.

4. **History loading**
   - Confirm the explicit "Load older messages" control covers all cases; remove leftover load-more refs from the hook and stores.
   - Keep the scroll-offset restoration logic in `ChatContainer` as-is unless the store ends up handling it centrally.

## Validation Checklist

- `pnpm run build` (tsc + vite)
- Manual sanity check:
  - Short + long assistant replies (hold engages, button shows, no snap to bottom unless user requests).
  - Manual scroll up/down shows/hides the button correctly.
  - "Load older messages" fetches history once per click, restores scroll offset.

## Notes

- Current state already removes spacer logic and uses explicit load-older control; this refactor focuses purely on engine simplification.
- Keep the 40% animation hold behavior intact while trimming unused engine paths.
