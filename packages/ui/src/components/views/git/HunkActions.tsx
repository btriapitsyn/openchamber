import React, { useMemo } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Icon } from '@/components/icon/Icon';
import { Button } from '@/components/ui/button';
import { dropdownTriggerVariants } from '@/components/ui/dropdown-trigger';
import { useI18n } from '@/lib/i18n';
import { splitPatchIntoHunks } from '@/lib/diff/patchFileDiff';

export type HunkDiffAction = 'stage' | 'unstage' | 'discard';

export type HunkBusyState = {
  index: number;
  action: HunkDiffAction;
} | null;

interface HunkActionsProps {
  filePath: string;
  patch: string;
  staged: boolean;
  busyHunk: HunkBusyState;
  disabled: boolean;
  onAction: (hunkIndex: number, action: HunkDiffAction) => void;
}

interface HunkSummary {
  insertions: number;
  deletions: number;
}

const summarizeHunks = (patch: string): HunkSummary[] =>
  splitPatchIntoHunks(patch).map((hunkPatch) => {
    let insertions = 0;
    let deletions = 0;
    let inBody = false;
    for (const line of hunkPatch.split('\n')) {
      if (line.startsWith('@@ ')) { inBody = true; continue; }
      if (!inBody) continue;
      if (line.startsWith('+')) insertions += 1;
      else if (line.startsWith('-')) deletions += 1;
    }
    return { insertions, deletions };
  });

const HunkCounts = React.memo<{ insertions: number; deletions: number }>(function HunkCounts({
  insertions,
  deletions,
}) {
  if (insertions === 0 && deletions === 0) return null;
  return (
    <span className="ml-auto pl-3 typography-micro">
      {insertions > 0 ? (
        <span style={{ color: 'var(--status-success)' }}>+{insertions}</span>
      ) : null}
      {insertions > 0 && deletions > 0 ? (
        <span className="mx-0.5 text-muted-foreground">/</span>
      ) : null}
      {deletions > 0 ? (
        <span style={{ color: 'var(--status-error)' }}>-{deletions}</span>
      ) : null}
    </span>
  );
});

export const HunkActions = React.memo<HunkActionsProps>(function HunkActions({
  filePath,
  patch,
  staged,
  busyHunk,
  disabled,
  onAction,
}) {
  const { t } = useI18n();
  const hunks = useMemo(() => summarizeHunks(patch), [patch]);

  if (hunks.length < 2) {
    return null;
  }

  const primaryAction: HunkDiffAction = staged ? 'unstage' : 'stage';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="xs"
          disabled={disabled}
          className={dropdownTriggerVariants({ size: 'sm' })}
          aria-label={t('diffView.hunk.label')}
          title={t('diffView.hunk.label')}
        >
          <Icon name="stack" className="size-3.5" />
          <span>{t('diffView.hunk.label')} · {hunks.length}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={6} className="w-64 max-h-[min(24rem,var(--available-height))] overflow-y-auto">
        <DropdownMenuLabel className="max-w-full truncate" title={filePath}>
          {t('diffView.hunk.label')} · {filePath}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {hunks.map((hunk, index) => {
          const displayIndex = index + 1;
          const busyPrimary = busyHunk?.index === index && busyHunk.action === primaryAction;
          const busyDiscard = busyHunk?.index === index && busyHunk.action === 'discard';
          const primaryTitle = staged
            ? t('diffView.hunk.unstageTitle', { index: displayIndex })
            : t('diffView.hunk.stageTitle', { index: displayIndex });
          const discardTitle = t('diffView.hunk.discardTitle', { index: displayIndex });
          return (
            <React.Fragment key={index}>
              {index > 0 ? <DropdownMenuSeparator /> : null}
              <DropdownMenuItem
                disabled={disabled || busyDiscard}
                onSelect={() => onAction(index, primaryAction)}
                aria-label={primaryTitle}
                title={primaryTitle}
              >
                {busyPrimary ? (
                  <Icon name="loader-4" className="size-3.5 animate-spin" />
                ) : (
                  <Icon name={staged ? 'arrow-go-back' : 'add'} className="size-3.5" />
                )}
                <span className="min-w-0 flex-1 truncate">{primaryTitle}</span>
                <HunkCounts insertions={hunk.insertions} deletions={hunk.deletions} />
              </DropdownMenuItem>
              {!staged ? (
                <DropdownMenuItem
                  variant="destructive"
                  disabled={disabled || busyPrimary}
                  onSelect={() => onAction(index, 'discard')}
                  aria-label={discardTitle}
                  title={discardTitle}
                >
                  {busyDiscard ? (
                    <Icon name="loader-4" className="size-3.5 animate-spin" />
                  ) : (
                    <Icon name="arrow-go-back" className="size-3.5" />
                  )}
                  <span className="min-w-0 flex-1 truncate">{discardTitle}</span>
                </DropdownMenuItem>
              ) : null}
            </React.Fragment>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
});
