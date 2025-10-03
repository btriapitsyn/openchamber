# Smooth Scroll During Text Animation

## Intent

Create an organic, visually pleasing scroll experience as assistant message text appears line-by-line during streaming. The scroll should feel natural and unobtrusive, allowing users to follow new content without jarring jumps.

## Key Constraints

### Animation Timing
- New lines appear every **100ms** during text streaming
- FlowToken animation uses **blurAndSharpen** effect with **0.25s** duration and **ease-in-out** timing
- Each line triggers content height changes that require scroll adjustment

### Auto-scroll Behavior
- Auto-scroll activates when user is near bottom (within 30-50px)
- Auto-scroll pauses when user manually scrolls up (more than 50-100px from bottom)
- Scroll position must update continuously as content grows

### User Experience Goals
- **Organic flow**: Scroll should move smoothly as text appears, not in discrete jumps
- **No interruption**: Avoid breaking ongoing scroll animations with new scroll commands
- **Readability**: Keep newly appearing text visible without overshooting or undershooting
- **Performance**: Maintain smooth 60fps even during rapid content updates

## Technical Considerations

### Current Implementation
- Direct `scrollTop` assignment happens in `useChatScrollManager.ts`
- Scroll updates triggered by multiple sources:
  - New message detection
  - Content growth detection (100ms intervals)
  - Streaming state changes
  - Manual user scroll events

### Challenge
Standard CSS `scroll-behavior: smooth` creates conflicts when scroll commands fire every 100ms:
- Animations interrupt each other before completing
- Cumulative lag builds up between actual position and target position
- Visual stutter or slow-drift effect instead of smooth flow

## Desired Outcome

A scroll mechanism that:
1. Moves incrementally as each line appears (every 100ms)
2. Feels continuous and wave-like, not stepwise
3. Tracks content growth without lag accumulation
4. Respects user scroll state (auto-scroll vs manual scroll mode)
5. Works seamlessly with FlowToken's text animation timing
