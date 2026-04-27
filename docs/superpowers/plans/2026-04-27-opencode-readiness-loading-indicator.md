# OpenCode Readiness Loading Indicator — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a spinner + "Loading..." text in model and agent selectors while OpenCode is initializing, so users understand the server is starting up.

**Architecture:** A new `useOpenCodeReadiness` hook wraps existing `useConfigStore.isInitialized` into a clean readiness signal. Three selector components consume it and conditionally render loading indicators in their trigger buttons.

**Tech Stack:** React, TypeScript, Tailwind v4, `@remixicon/react` (`RiLoader4Line`), existing `useConfigStore`

---

## File Structure

| File | Responsibility |
|------|---------------|
| `packages/ui/src/hooks/useOpenCodeReadiness.ts` | **New.** Hook exposing `{ isReady }` from `useConfigStore.isInitialized` |
| `packages/ui/src/lib/i18n/messages/en.ts` | Add `'common.loading': 'Loading...'` i18n key |
| `packages/ui/src/lib/i18n/messages/zh-CN.ts` | Add Chinese translation |
| `packages/ui/src/lib/i18n/messages/uk.ts` | Add Ukrainian translation |
| `packages/ui/src/lib/i18n/messages/pt-BR.ts` | Add Brazilian Portuguese translation |
| `packages/ui/src/lib/i18n/messages/ko.ts` | Add Korean translation |
| `packages/ui/src/lib/i18n/messages/es.ts` | Add Spanish translation |
| `packages/ui/src/components/sections/agents/ModelSelector.tsx` | Add loading state to desktop + mobile triggers |
| `packages/ui/src/components/sections/commands/AgentSelector.tsx` | Add loading state to desktop + mobile triggers |
| `packages/ui/src/components/chat/ModelControls.tsx` | Add loading state to model + agent triggers in chat input |

---

### Task 1: Create `useOpenCodeReadiness` hook

**Files:**
- Create: `packages/ui/src/hooks/useOpenCodeReadiness.ts`

- [ ] **Step 1: Create the hook file**

```ts
import { useConfigStore } from '@/stores/useConfigStore';

export function useOpenCodeReadiness() {
  const isInitialized = useConfigStore((s) => s.isInitialized);
  const connectionPhase = useConfigStore((s) => s.connectionPhase);

  return {
    isReady: isInitialized,
    connectionPhase,
  };
}
```

- [ ] **Step 2: Verify types compile**

Run: `bun run type-check`
Expected: PASS (no errors related to new file)

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/hooks/useOpenCodeReadiness.ts
git commit -m "feat: add useOpenCodeReadiness hook"
```

---

### Task 2: Add i18n keys for loading state

**Files:**
- Modify: `packages/ui/src/lib/i18n/messages/en.ts`
- Modify: `packages/ui/src/lib/i18n/messages/zh-CN.ts`
- Modify: `packages/ui/src/lib/i18n/messages/uk.ts`
- Modify: `packages/ui/src/lib/i18n/messages/pt-BR.ts`
- Modify: `packages/ui/src/lib/i18n/messages/ko.ts`
- Modify: `packages/ui/src/lib/i18n/messages/es.ts`

- [ ] **Step 1: Add English i18n key**

In `packages/ui/src/lib/i18n/messages/en.ts`, add after line 3 (`export const dict = {`):

```ts
  'common.loading': 'Loading...',
```

- [ ] **Step 2: Add Chinese translation**

In `packages/ui/src/lib/i18n/messages/zh-CN.ts`, add in the `dict` object:

```ts
  'common.loading': '加载中...',
```

- [ ] **Step 3: Add Ukrainian translation**

In `packages/ui/src/lib/i18n/messages/uk.ts`, add in the `dict` object:

```ts
  'common.loading': 'Завантаження...',
```

- [ ] **Step 4: Add Brazilian Portuguese translation**

In `packages/ui/src/lib/i18n/messages/pt-BR.ts`, add in the `dict` object:

```ts
  'common.loading': 'Carregando...',
```

- [ ] **Step 5: Add Korean translation**

In `packages/ui/src/lib/i18n/messages/ko.ts`, add in the `dict` object:

```ts
  'common.loading': '로딩 중...',
```

- [ ] **Step 6: Add Spanish translation**

In `packages/ui/src/lib/i18n/messages/es.ts`, add in the `dict` object:

```ts
  'common.loading': 'Cargando...',
```

- [ ] **Step 7: Verify types compile**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add packages/ui/src/lib/i18n/messages/
git commit -m "feat: add i18n keys for common.loading"
```

---

### Task 3: Add loading state to `ModelSelector.tsx`

**Files:**
- Modify: `packages/ui/src/components/sections/agents/ModelSelector.tsx`

- [ ] **Step 1: Import hook and spinner icon**

At line 14, add `RiLoader4Line` to the existing remixicon import:

```ts
import { RiArrowDownSLine, RiArrowRightSLine, RiCheckLine, RiCloseLine, RiLoader4Line, RiPencilAiLine, RiSearchLine, RiStarFill, RiStarLine, RiTimeLine } from '@remixicon/react';
```

After line 21 (`import { useI18n } from '@/lib/i18n';`), add:

```ts
import { useOpenCodeReadiness } from '@/hooks/useOpenCodeReadiness';
```

- [ ] **Step 2: Consume hook in component**

After line 60 (`const { t } = useI18n();`), add:

```ts
    const { isReady } = useOpenCodeReadiness();
```

- [ ] **Step 3: Add loading state to mobile trigger**

Replace the mobile trigger button content (lines 504-516) with:

```tsx
                    <div className="flex items-center gap-2">
                        {!isReady ? (
                            <>
                                <RiLoader4Line className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                                <span className="typography-meta text-muted-foreground">{t('common.loading')}</span>
                            </>
                        ) : providerId ? (
                            <ProviderLogo
                                providerId={providerId}
                                className="h-3.5 w-3.5"
                            />
                        ) : (
                            <RiPencilAiLine className="h-3 w-3 text-muted-foreground" />
                        )}
                        {isReady && (
                            <span className="typography-meta font-medium text-foreground">
                                {providerId && modelId ? `${providerId}/${modelId}` : (placeholder || t('settings.agents.modelSelector.selectPlaceholder'))}
                            </span>
                        )}
                    </div>
```

- [ ] **Step 4: Add loading state to desktop trigger**

Replace the desktop trigger content (lines 526-540) with:

```tsx
                            {!isReady ? (
                                <>
                                    <RiLoader4Line className="h-3.5 w-3.5 animate-spin text-muted-foreground flex-shrink-0" />
                                    <span className="typography-ui-label font-normal whitespace-nowrap text-muted-foreground">
                                        {t('common.loading')}
                                    </span>
                                </>
                            ) : (
                                <>
                                    {providerId ? (
                                        <>
                                            <ProviderLogo
                                                providerId={providerId}
                                                className="h-3.5 w-3.5 flex-shrink-0"
                                            />
                                            <RiPencilAiLine className="h-3 w-3 text-primary/60 hidden" />
                                        </>
                                    ) : (
                                        <RiPencilAiLine className="h-3.5 w-3.5 text-muted-foreground" />
                                    )}
                                    <span className="typography-ui-label font-normal whitespace-nowrap text-foreground">
                                        {providerId && modelId ? `${providerId}/${modelId}` : (placeholder || t('settings.agents.modelSelector.notSelected'))}
                                    </span>
                                </>
                            )}
```

- [ ] **Step 5: Disable dropdown when not ready**

On line 520, change the `DropdownMenu` to disable opening when not ready:

```tsx
                <DropdownMenu open={isReady && isDropdownOpen} onOpenChange={isReady ? setIsDropdownOpen : undefined}>
```

- [ ] **Step 6: Verify types compile**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/ui/src/components/sections/agents/ModelSelector.tsx
git commit -m "feat: add loading state to ModelSelector"
```

---

### Task 4: Add loading state to `AgentSelector.tsx`

**Files:**
- Modify: `packages/ui/src/components/sections/commands/AgentSelector.tsx`

- [ ] **Step 1: Import hook and spinner icon**

At line 13, add `RiLoader4Line` to the existing remixicon import:

```ts
import { RiArrowDownSLine, RiLoader4Line, RiRobot2Line } from '@remixicon/react';
```

After line 16 (`import { useI18n } from '@/lib/i18n';`), add:

```ts
import { useOpenCodeReadiness } from '@/hooks/useOpenCodeReadiness';
```

- [ ] **Step 2: Consume hook in component**

After line 31 (`const { t } = useI18n();`), add:

```ts
    const { isReady } = useOpenCodeReadiness();
```

- [ ] **Step 3: Add loading state to mobile trigger**

Replace the mobile trigger button content (lines 134-139) with:

```tsx
                    <div className="flex items-center gap-2">
                        {!isReady ? (
                            <>
                                <RiLoader4Line className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                                <span className="typography-meta text-muted-foreground">{t('common.loading')}</span>
                            </>
                        ) : (
                            <>
                                <RiRobot2Line className="h-3.5 w-3.5 text-muted-foreground" />
                                <span className="typography-meta font-medium text-foreground">
                                    {agentName || t('settings.commands.agentSelector.selectAgentPlaceholder')}
                                </span>
                            </>
                        )}
                    </div>
```

- [ ] **Step 4: Add loading state to desktop trigger**

Replace the desktop trigger content (lines 149-153) with:

```tsx
                            {!isReady ? (
                                <>
                                    <RiLoader4Line className="h-3 w-3 animate-spin text-muted-foreground flex-shrink-0" />
                                    <span className="typography-micro font-medium whitespace-nowrap text-muted-foreground">
                                        {t('common.loading')}
                                    </span>
                                </>
                            ) : (
                                <>
                                    <RiRobot2Line className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                                    <span className="typography-micro font-medium whitespace-nowrap">
                                        {agentName || t('settings.commands.agentSelector.notSelected')}
                                    </span>
                                </>
                            )}
```

- [ ] **Step 5: Disable dropdown when not ready**

On line 143, change the `DropdownMenu` to disable opening when not ready:

```tsx
                <DropdownMenu open={isReady ? undefined : false}>
```

Note: `DropdownMenu` from Radix doesn't accept `open={undefined}` cleanly. Instead, wrap the trigger to prevent interaction:

On line 144, change the `DropdownMenuTrigger` to add `disabled` behavior:

```tsx
                    <DropdownMenuTrigger asChild disabled={!isReady}>
```

If `disabled` prop isn't supported on `DropdownMenuTrigger`, instead wrap the entire `DropdownMenu` in a conditional:

```tsx
                {!isReady ? (
                    <div className={cn(
                        'flex items-center gap-2 px-2 rounded-lg bg-interactive-selection/20 border border-border/20 h-6 w-fit opacity-60',
                        className
                    )}>
                        <RiLoader4Line className="h-3 w-3 animate-spin text-muted-foreground flex-shrink-0" />
                        <span className="typography-micro font-medium whitespace-nowrap text-muted-foreground">
                            {t('common.loading')}
                        </span>
                    </div>
                ) : (
                    <DropdownMenu>
                        {/* existing trigger and content */}
                    </DropdownMenu>
                )}
```

- [ ] **Step 6: Verify types compile**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/ui/src/components/sections/commands/AgentSelector.tsx
git commit -m "feat: add loading state to AgentSelector"
```

---

### Task 5: Add loading state to `ModelControls.tsx`

**Files:**
- Modify: `packages/ui/src/components/chat/ModelControls.tsx`

- [ ] **Step 1: Import hook and spinner icon**

Add `RiLoader4Line` to the existing remixicon import at line 14:

```ts
import {
    RiAddLine,
    RiAiAgentLine,
    RiArrowDownSLine,
    RiArrowGoBackLine,
    RiArrowRightSLine,
    RiBrainAi3Line,
    RiCheckLine,
    RiCheckboxCircleLine,
    RiCloseCircleLine,
    RiDraggable,
    RiFileImageLine,
    RiFileMusicLine,
    RiFilePdfLine,
    RiFileVideoLine,
    RiLoader4Line,
    RiPencilAiLine,
    RiQuestionLine,
    RiSearchLine,
    RiStarFill,
    RiStarLine,
    RiText,
    RiTimeLine,
    RiToolsLine,
} from '@remixicon/react';
```

After line 69 (`import { useI18n } from '@/lib/i18n';`), add:

```ts
import { useOpenCodeReadiness } from '@/hooks/useOpenCodeReadiness';
```

- [ ] **Step 2: Consume hook in component**

After line 343 (`const { t } = useI18n();`), add:

```ts
    const { isReady } = useOpenCodeReadiness();
```

- [ ] **Step 3: Add loading state to desktop model selector trigger**

In `renderModelSelector()`, replace the trigger content (lines 2664-2688) with:

```tsx
                                    {!isReady ? (
                                        <>
                                            <RiLoader4Line className={cn(controlIconSize, 'animate-spin text-muted-foreground flex-shrink-0')} />
                                            <span className={cn(
                                                'model-controls__model-label',
                                                controlTextSize,
                                                'font-medium whitespace-nowrap text-muted-foreground min-w-0'
                                            )}>
                                                {t('common.loading')}
                                            </span>
                                        </>
                                    ) : (
                                        <>
                                            {currentProviderId ? (
                                                <>
                                                    <ProviderLogo
                                                        providerId={currentProviderId}
                                                        className={cn(controlIconSize, 'flex-shrink-0')}
                                                    />
                                                    <RiPencilAiLine className={cn(controlIconSize, 'text-primary/60 hidden')} />
                                                </>
                                            ) : (
                                                <RiPencilAiLine className={cn(controlIconSize, 'text-muted-foreground')} />
                                            )}
                                            <span
                                                ref={modelLabelRef}
                                                key={`${currentProviderId}-${currentModelId}`}
                                                className={cn(
                                                    'model-controls__model-label overflow-hidden',
                                                    controlTextSize,
                                                    'font-medium whitespace-nowrap text-foreground min-w-0',
                                                    'max-w-[260px]'
                                                )}
                                            >
                                                <span className={cn('marquee-text', isModelLabelTruncated && 'marquee-text--active')}>
                                                    {currentModelDisplayName}
                                                </span>
                                            </span>
                                        </>
                                    )}
```

- [ ] **Step 4: Disable model dropdown when not ready**

On line 2655, change the `DropdownMenu` open state:

```tsx
                    <DropdownMenu open={isReady && agentMenuOpen} onOpenChange={isReady ? handleModelMenuOpenChange : undefined}>
```

- [ ] **Step 5: Add loading state to desktop agent selector trigger**

In `renderAgentSelector()`, replace the trigger content (lines 3164-3182) with:

```tsx
                                        {!isReady ? (
                                            <>
                                                <RiLoader4Line
                                                    className={cn(
                                                        controlIconSize,
                                                        'flex-shrink-0 animate-spin text-muted-foreground'
                                                    )}
                                                />
                                                <span
                                                    className={cn(
                                                        'model-controls__agent-label',
                                                        controlTextSize,
                                                        'font-medium min-w-0 truncate text-muted-foreground'
                                                    )}
                                                >
                                                    {t('common.loading')}
                                                </span>
                                            </>
                                        ) : (
                                            <>
                                                <RiAiAgentLine
                                                    className={cn(
                                                        controlIconSize,
                                                        'flex-shrink-0',
                                                        uiAgentName ? '' : 'text-muted-foreground'
                                                    )}
                                                    style={uiAgentName ? { color: `var(${getAgentColor(uiAgentName).var})` } : undefined}
                                                />
                                                <span
                                                    className={cn(
                                                        'model-controls__agent-label',
                                                        controlTextSize,
                                                        'font-medium min-w-0 truncate',
                                                        isDesktop ? 'max-w-[220px]' : undefined
                                                    )}
                                                    style={uiAgentName ? { color: `var(${getAgentColor(uiAgentName).var})` } : undefined}
                                                >
                                                    {getAgentDisplayName()}
                                                </span>
                                            </>
                                        )}
```

- [ ] **Step 6: Disable agent dropdown when not ready**

On line 3157, change the `DropdownMenu`:

```tsx
                        <DropdownMenu open={isReady && isAgentSelectorOpen} onOpenChange={isReady ? setIsAgentSelectorOpen : undefined}>
```

- [ ] **Step 7: Add loading state to compact (mobile) model trigger**

Find the compact/mobile model selector trigger in `renderModelSelector()` (the `isCompact` branch). Apply the same pattern: when `!isReady`, show spinner + "Loading..." instead of model name.

- [ ] **Step 8: Add loading state to compact (mobile) agent trigger**

In the compact branch of `renderAgentSelector()` (lines 3257-3290), replace the trigger content:

```tsx
                {!isReady ? (
                    <>
                        <RiLoader4Line
                            className={cn(
                                controlIconSize,
                                'flex-shrink-0 animate-spin text-muted-foreground'
                            )}
                        />
                        <span
                            className={cn(
                                'model-controls__agent-label',
                                controlTextSize,
                                'font-medium truncate min-w-0 text-muted-foreground'
                            )}
                        >
                            {t('common.loading')}
                        </span>
                    </>
                ) : (
                    <>
                        <RiAiAgentLine
                            className={cn(
                                controlIconSize,
                                'flex-shrink-0',
                                uiAgentName ? '' : 'text-muted-foreground'
                            )}
                            style={uiAgentName ? { color: `var(${getAgentColor(uiAgentName).var})` } : undefined}
                        />
                        <span
                            className={cn(
                                'model-controls__agent-label',
                                controlTextSize,
                                'font-medium truncate min-w-0',
                                isMobile && 'max-w-[60px]'
                            )}
                            style={uiAgentName ? { color: `var(${getAgentColor(uiAgentName).var})` } : undefined}
                        >
                            {getAgentDisplayName()}
                        </span>
                    </>
                )}
```

- [ ] **Step 9: Verify types compile**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 10: Run lint**

Run: `bun run lint`
Expected: PASS

- [ ] **Step 11: Commit**

```bash
git add packages/ui/src/components/chat/ModelControls.tsx
git commit -m "feat: add loading state to ModelControls chat selectors"
```

---

### Task 6: Final verification

- [ ] **Step 1: Run type-check**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 2: Run lint**

Run: `bun run lint`
Expected: PASS

- [ ] **Step 3: Verify all changes are committed**

Run: `git status`
Expected: No uncommitted changes

- [ ] **Step 4: Review the full diff**

Run: `git log --oneline -6`
Expected: 6 commits (hook, i18n, ModelSelector, AgentSelector, ModelControls, plus the spec commit)
