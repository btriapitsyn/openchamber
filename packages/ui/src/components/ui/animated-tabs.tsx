import React from 'react';
import { cn } from '@/lib/utils';

export type AnimatedTabOption<T extends string> = {
  value: T;
  label: string;
  icon?: React.ComponentType<{ className?: string; size?: number | string }>;
};

interface AnimatedTabsProps<T extends string> {
  tabs: AnimatedTabOption<T>[];
  value: T;
  onValueChange: (value: T) => void;
  className?: string;
  isInteractive?: boolean;
  animate?: boolean;
  collapseLabelsOnSmall?: boolean;
}

export function AnimatedTabs<T extends string>({
  tabs,
  value,
  onValueChange,
  className,
  isInteractive = true,
  animate = true,
  collapseLabelsOnSmall = false,
}: AnimatedTabsProps<T>) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const activeTabRef = React.useRef<HTMLButtonElement>(null);

  const updateClipPath = React.useCallback(() => {
    const container = containerRef.current;
    const activeTab = activeTabRef.current;

    if (!container || !activeTab) return;

    const containerWidth = container.offsetWidth;
    if (!containerWidth) return;

    const { offsetLeft, offsetWidth } = activeTab;
    const leftPercent = Math.max(0, Math.min(100, (offsetLeft / containerWidth) * 100));
    const rightPercent = Math.max(0, Math.min(100, ((offsetLeft + offsetWidth) / containerWidth) * 100));

    container.style.clipPath = `inset(0 ${Number(100 - rightPercent).toFixed(2)}% 0 ${Number(leftPercent).toFixed(2)}% round 8px)`;
  }, []);

  React.useLayoutEffect(() => {
    updateClipPath();
  }, [updateClipPath, value, tabs.length]);

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(() => updateClipPath());
    observer.observe(container);

    return () => observer.disconnect();
  }, [updateClipPath]);

  return (
    <div className={cn('relative isolate w-full', className)}>
      <div
        ref={containerRef}
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-0 z-10 overflow-hidden rounded-lg [clip-path:inset(0_75%_0_0_round_8px)]',
          animate ? '[transition:clip-path_200ms_ease]' : null
        )}
      >
        <div className="flex h-9 items-center gap-1 rounded-lg bg-interactive-selection px-1.5 text-interactive-selection-foreground">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <div
                key={tab.value}
                className={cn(
                  'flex h-7 flex-1 items-center justify-center rounded-lg px-2.5 text-sm font-semibold',
                  collapseLabelsOnSmall ? 'gap-0 sm:gap-1.25' : 'gap-1.25'
                )}
              >
                {Icon ? <Icon className="h-4 w-4" /> : null}
                <span className={cn('truncate', collapseLabelsOnSmall ? 'hidden sm:inline' : null)}>
                  {tab.label}
                </span>
              </div>

            );
          })}
        </div>
      </div>

      <div className="relative z-20 flex h-9 items-center gap-1 rounded-lg bg-muted/20 px-1.5">
        {tabs.map((tab) => {
          const isActive = value === tab.value;
          const Icon = tab.icon;

          return (
            <button
              key={tab.value}
              ref={isActive ? activeTabRef : null}
              type="button"
              onClick={() => {
                if (!isInteractive) return;
                onValueChange(tab.value);
              }}
              className={cn(
                'flex h-7 flex-1 items-center justify-center rounded-lg px-2.5 text-sm font-semibold transition-colors duration-150',
                collapseLabelsOnSmall ? 'gap-0 sm:gap-1.25' : 'gap-1.25',
                isActive ? 'text-accent-foreground' : 'text-muted-foreground',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--interactive-focus-ring)] focus-visible:ring-offset-1 focus-visible:ring-offset-background'
              )}
              aria-pressed={isActive}
              aria-label={tab.label}
              aria-disabled={!isInteractive}
              tabIndex={isInteractive ? 0 : -1}
            >
                {Icon ? (
                  <Icon
                    className={cn('h-4 w-4', isActive ? 'text-accent-foreground' : 'text-muted-foreground')}
                  />
                ) : null}
              <span className={cn('truncate', collapseLabelsOnSmall ? 'hidden sm:inline' : null)}>
                {tab.label}
              </span>

            </button>
          );
        })}
      </div>
    </div>
  );
}
