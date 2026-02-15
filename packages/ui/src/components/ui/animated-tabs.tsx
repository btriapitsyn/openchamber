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
  collapseLabelsOnNarrow?: boolean;
  size?: 'default' | 'sm';
}

export function AnimatedTabs<T extends string>({
  tabs,
  value,
  onValueChange,
  className,
  isInteractive = true,
  animate = true,
  collapseLabelsOnSmall = false,
  collapseLabelsOnNarrow = false,
  size = 'default',
}: AnimatedTabsProps<T>) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const indicatorRef = React.useRef<HTMLDivElement>(null);
  const tabRefs = React.useRef<Map<string, HTMLButtonElement>>(new Map());
  const [isReadyToAnimate, setIsReadyToAnimate] = React.useState(false);

  const updateIndicator = React.useCallback(() => {
    const container = containerRef.current;
    const indicator = indicatorRef.current;
    const activeTab = tabRefs.current.get(value);

    if (!container || !indicator || !activeTab) return;

    const containerRect = container.getBoundingClientRect();
    const tabRect = activeTab.getBoundingClientRect();

    const left = tabRect.left - containerRect.left;
    const width = tabRect.width;

    indicator.style.transform = `translateX(${left}px)`;
    indicator.style.width = `${width}px`;
  }, [value]);

  React.useLayoutEffect(() => {
    updateIndicator();
    if (!isReadyToAnimate) {
      setIsReadyToAnimate(true);
    }
  }, [isReadyToAnimate, updateIndicator, value, tabs.length]);

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(() => updateIndicator());
    observer.observe(container);

    return () => observer.disconnect();
  }, [updateIndicator]);

  const setTabRef = React.useCallback((el: HTMLButtonElement | null, tabValue: string) => {
    if (el) {
      tabRefs.current.set(tabValue, el);
    } else {
      tabRefs.current.delete(tabValue);
    }
  }, []);

  return (
    <div className={cn('relative w-full', collapseLabelsOnNarrow && '@container/animated-tabs', className)}>
      <div
        ref={containerRef}
        className={cn(
          'relative flex items-center overflow-hidden bg-[var(--surface-muted)]/50',
          size === 'sm'
            ? 'h-8 rounded-lg py-0.5 px-px gap-0.5'
            : 'h-10 rounded-lg py-0.5 px-px gap-0.5'
        )}
      >
        {/* Sliding indicator */}
        <div
          ref={indicatorRef}
          className={cn(
            'absolute top-0.5 bottom-0.5 rounded-lg border border-[var(--interactive-border)] bg-[var(--surface-elevated)] shadow-sm',
            animate && isReadyToAnimate ? 'transition-[transform,width] duration-200 ease-out' : null
          )}
          style={{ width: 0, transform: 'translateX(0)' }}
        />

        {tabs.map((tab) => {
          const isActive = value === tab.value;
          const Icon = tab.icon;

          return (
            <button
              key={tab.value}
              ref={(el) => setTabRef(el, tab.value)}
              type="button"
              onClick={() => {
                if (!isInteractive) return;
                onValueChange(tab.value);
              }}
              className={cn(
                'animated-tabs__button relative z-10 flex flex-1 items-center justify-center font-medium transition-colors duration-150',
                size === 'sm' ? 'h-6 rounded-lg px-2.5 text-sm' : 'h-7 rounded-lg px-3 text-sm',
                collapseLabelsOnSmall ? 'gap-0 sm:gap-1.5' : 'gap-1.5',
                isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--interactive-focus-ring)] focus-visible:ring-offset-1 focus-visible:ring-offset-background'
              )}
              aria-pressed={isActive}
              aria-label={tab.label}
              aria-disabled={!isInteractive}
              tabIndex={isInteractive ? 0 : -1}
            >
              {Icon ? (
                <Icon
                  className={cn(
                    size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4',
                    isActive ? 'text-foreground' : 'text-muted-foreground'
                  )}
                />
              ) : null}
              <span className={cn('animated-tabs__label truncate', collapseLabelsOnSmall ? 'hidden sm:inline' : null)}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
