---
title: Code Examples
---

# Theme Usage Examples

## Input Area (ChatInput)

```tsx
import { useThemeSystem } from '@/contexts/useThemeSystem';

export const ChatInput: React.FC = () => {
  const { currentTheme } = useThemeSystem();
  
  return (
    <div
      style={{
        backgroundColor: currentTheme?.colors?.surface?.elevated,
        borderColor: 'var(--interactive-border)',
      }}
      className="rounded-lg border"
    >
      <textarea className="bg-transparent w-full" />
      <div className="bg-transparent flex justify-between">
        {/* Controls - transparent footer */}
      </div>
    </div>
  );
};
```

## Active/Selected Tabs

```tsx
<button
  className={cn(
    'px-3 py-2 rounded-md',
    isActive 
      ? 'bg-interactive-selection text-interactive-selection-foreground'
      : 'hover:bg-interactive-hover/50'
  )}
>
  Tab Label
</button>
```

## Error Message

```tsx
<div
  style={{
    color: currentTheme?.colors?.status?.error,
    backgroundColor: currentTheme?.colors?.status?.errorBackground,
    borderColor: currentTheme?.colors?.status?.errorBorder,
  }}
  className="rounded-md border px-3 py-2"
>
  Error: Something went wrong
</div>
```

## Primary Button

```tsx
<button
  style={{
    backgroundColor: currentTheme?.colors?.primary?.base,
    color: currentTheme?.colors?.primary?.foreground,
  }}
  className="rounded-md px-4 py-2 hover:opacity-90"
>
  Submit
</button>
```

## Card with Muted Text

```tsx
<div
  style={{ backgroundColor: currentTheme?.colors?.surface?.elevated }}
  className="rounded-lg p-4"
>
  <h3 style={{ color: currentTheme?.colors?.surface?.foreground }}>
    Title
  </h3>
  <p style={{ color: currentTheme?.colors?.surface?.mutedForeground }}>
    Description
  </p>
</div>
```

## Code Block (Syntax)

```tsx
<pre
  style={{
    backgroundColor: currentTheme?.colors?.syntax?.base?.background,
    color: currentTheme?.colors?.syntax?.base?.foreground,
  }}
>
  <code>{code}</code>
</pre>
```
