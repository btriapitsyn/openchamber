import React from 'react';
import { Button } from '@/components/ui/button';
import { ScrollShadow } from '@/components/ui/ScrollShadow';
import { OverlayScrollbar } from '@/components/ui/OverlayScrollbar';
import { ChangeRow } from './ChangeRow';
import type { GitStatus } from '@/lib/api/types';
import { cn } from '@/lib/utils';

interface ChangesSectionProps {
  changeEntries: GitStatus['files'];
  selectedPaths: Set<string>;
  diffStats: Record<string, { insertions: number; deletions: number }> | undefined;
  revertingPaths: Set<string>;
  onToggleFile: (path: string) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onViewDiff: (path: string) => void;
  onRevertFile: (path: string) => void;
  variant?: 'framed' | 'plain';
  maxListHeightClassName?: string;
}

export const ChangesSection: React.FC<ChangesSectionProps> = ({
  changeEntries,
  selectedPaths,
  diffStats,
  revertingPaths,
  onToggleFile,
  onSelectAll,
  onClearSelection,
  onViewDiff,
  onRevertFile,
  variant = 'framed',
  maxListHeightClassName,
}) => {
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const selectedCount = selectedPaths.size;
  const totalCount = changeEntries.length;

  const containerClassName =
    variant === 'framed'
      ? 'flex flex-col rounded-xl border border-border/60 bg-background/70'
      : 'flex flex-col flex-1 min-h-0';
  const headerClassName =
    variant === 'framed'
      ? 'flex items-center justify-between gap-2 px-3 py-2 border-b border-border/40'
      : 'flex items-center justify-between gap-2 px-4 py-3 border-b border-border/40';
  const scrollOuterClassName =
    variant === 'framed'
      ? 'flex-1 min-h-0 max-h-[30vh]'
      : `flex-1 min-h-0 ${maxListHeightClassName ?? ''}`.trim();

  return (
    <section className={containerClassName}>
      <header className={headerClassName}>
        <h3 className="typography-ui-header font-semibold text-foreground">Changes</h3>
        <div className="flex items-center gap-2">
          <span className="typography-meta text-muted-foreground">
            {selectedCount}/{totalCount}
          </span>
          {totalCount > 0 && (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={onSelectAll}
              >
                All
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={onClearSelection}
                disabled={selectedCount === 0}
              >
                None
              </Button>
            </>
          )}
        </div>
      </header>
      <div className={cn('relative flex flex-col min-h-0 w-full overflow-hidden', scrollOuterClassName)}>
        <ScrollShadow
          ref={scrollRef}
          className="overlay-scrollbar-target overlay-scrollbar-container flex-1 min-h-0 w-full overflow-y-auto overflow-x-hidden"
        >
          <ul className="divide-y divide-border/60">
            {changeEntries.map((file) => (
              <ChangeRow
                key={file.path}
                file={file}
                checked={selectedPaths.has(file.path)}
                stats={diffStats?.[file.path]}
                onToggle={() => onToggleFile(file.path)}
                onViewDiff={() => onViewDiff(file.path)}
                onRevert={() => onRevertFile(file.path)}
                isReverting={revertingPaths.has(file.path)}
              />
            ))}
          </ul>
        </ScrollShadow>
        <OverlayScrollbar containerRef={scrollRef} disableHorizontal />
      </div>
    </section>
  );
};
