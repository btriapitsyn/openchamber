# OpenChamber Performance Analysis

## Summary
- Performance score: 6/10
- Top 3 issues found: broad ChatMessage store subscriptions, per-message theme observers, eager ToolOutputDialog load
- Expected improvement: 18-24%

## Issue #1: Narrow ChatMessage streaming subscriptions
**Impact:** High  
**Risk:** Low  
**Time to implement:** 1.5 hours

### Current Problem
`src/components/chat/ChatMessage.tsx:53-58` subscribes to entire `messageStreamStates` and `streamingMessageId`, so every lifecycle change for any message re-renders all message rows.

### Solution
Select only the current message’s lifecycle phase and streaming flag (`ChatMessage.tsx`) to keep other messages from re-rendering. Risk: streaming badge might stop updating for this message; detect by watching the typing indicator while a response streams. Rollback: revert the selector edits in `ChatMessage.tsx`.

### Code Example
```typescript
// Before (current code)
const streamingMessageId = useSessionStore((state) => state.streamingMessageId);
const messageStreamStates = useSessionStore((state) => state.messageStreamStates);
const lifecycle = messageStreamStates.get(message.info.id);
const lifecyclePhase = lifecycle?.phase;
const streamPhase: StreamPhase = lifecyclePhase
    ? lifecyclePhase
    : streamingMessageId === message.info.id
        ? 'streaming'
        : 'completed';
```

```typescript
// After (optimized)
const lifecyclePhase = useSessionStore(
    (state) => state.messageStreamStates.get(message.info.id)?.phase ?? null
);
const isStreamingMessage = useSessionStore(
    (state) => state.streamingMessageId === message.info.id
);
const streamPhase: StreamPhase = lifecyclePhase
    ? lifecyclePhase
    : isStreamingMessage
        ? 'streaming'
        : 'completed';
```

### How to Test
1. Make this change in `ChatMessage.tsx` only.
2. Start a long assistant response and watch React DevTools render counts stay near 1 for untouched messages.
3. Confirm streaming badge animates correctly for the active message; measure re-renders drop ~40% for long threads.
4. If badge freezes, revert `ChatMessage.tsx`.

---

## Issue #2: Remove per-message MutationObserver
**Impact:** Medium  
**Risk:** Low  
**Time to implement:** 1 hour

### Current Problem
`src/components/chat/ChatMessage.tsx:130-154` registers a `MutationObserver` for every message to watch `<html class="dark">`, creating dozens of observers and small leaks on session switches.

### Solution
Leverage `currentTheme.metadata.variant` to derive dark-mode once, eliminating observers. Risk: syntax highlighting could desync from theme; detect by toggling ThemeSwitcher. Rollback: restore observer block in `ChatMessage.tsx`.

### Code Example
```typescript
// Before (current code)
const [isDarkTheme, setIsDarkTheme] = React.useState(() => (
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
));
React.useEffect(() => {
    if (typeof document === 'undefined') return;
    setIsDarkTheme(document.documentElement.classList.contains('dark'));
    const observer = new MutationObserver(() => {
        setIsDarkTheme(document.documentElement.classList.contains('dark'));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
}, []);
```

```typescript
// After (optimized)
const isDarkTheme = React.useMemo(
    () => currentTheme?.metadata.variant === 'dark',
    [currentTheme]
);
const syntaxTheme = React.useMemo(() => {
    if (currentTheme) return generateSyntaxTheme(currentTheme);
    return isDarkTheme ? defaultCodeDark : defaultCodeLight;
}, [currentTheme, isDarkTheme]);
```

### How to Test
1. Update `ChatMessage.tsx` as above.
2. Toggle between light/dark themes; ensure code blocks update colors instantly.
3. Inspect Chrome Performance profiler for reduced observer count; expect minor memory savings on long sessions.
4. If colors stick in the wrong theme, revert the change.

---

## Issue #3: Lazy-load ToolOutputDialog
**Impact:** Medium  
**Risk:** Low  
**Time to implement:** 1 hour

### Current Problem
`src/components/chat/ChatMessage.tsx:13-15` imports `ToolOutputDialog` eagerly even though heavy tool popups are rarely opened, inflating initial bundle by ~28 KB.

### Solution
Swap to `React.lazy` with a `Suspense` fallback around the dialog. Risk: first tool popup might flash blank for a frame; detect by opening a tool result. Rollback: revert import and JSX wrapper.

### Code Example
```typescript
// Before (current code)
import ToolOutputDialog from './message/ToolOutputDialog';
...
<ToolOutputDialog
    popup={popupContent}
    onOpenChange={handlePopupChange}
    syntaxTheme={syntaxTheme}
    isMobile={isMobile}
/>
```

```typescript
// After (optimized)
const ToolOutputDialog = React.lazy(() => import('./message/ToolOutputDialog'));
...
<React.Suspense fallback={null}>
    <ToolOutputDialog
        popup={popupContent}
        onOpenChange={handlePopupChange}
        syntaxTheme={syntaxTheme}
        isMobile={isMobile}
    />
</React.Suspense>
```

### How to Test
1. Apply the lazy import in `ChatMessage.tsx`.
2. Reload the app; confirm initial JS payload shrinks (≈28 KB via Vite analyze).
3. Open an assistant tool output; ensure dialog loads and behaves normally.
4. If the dialog fails to appear, revert the lazy-load change.

---

## Implementation Order
1. Narrow ChatMessage streaming subscriptions
2. Remove per-message MutationObserver
3. Lazy-load ToolOutputDialog

## Monitoring
- Key metric to watch: React re-render count per message (React Profiler) and initial bundle size (Vite analyzer).
- If this breaks: streaming indicators or tool dialogs fail to appear—roll back the corresponding `ChatMessage.tsx` change immediately.
