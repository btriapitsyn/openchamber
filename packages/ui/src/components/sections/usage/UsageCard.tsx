import React from 'react';
import type { UsageWindow } from '@/types';
import { formatPercent, formatWindowLabel } from '@/lib/quota';
import { UsageProgressBar } from './UsageProgressBar';

interface UsageCardProps {
  title: string;
  window: UsageWindow;
  subtitle?: string | null;
}

export const UsageCard: React.FC<UsageCardProps> = ({ title, window, subtitle }) => {
  const percentLabel = formatPercent(window.usedPercent);
  const resetLabel = window.resetAfterFormatted ?? window.resetAtFormatted ?? '-';
  const windowLabel = formatWindowLabel(title);

  return (
    <div className="rounded-xl border border-border/60 bg-card/40 p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="typography-ui-label text-foreground truncate">{windowLabel}</div>
          {subtitle && (
            <div className="typography-micro text-muted-foreground truncate">{subtitle}</div>
          )}
        </div>
        <div className="typography-ui-label text-foreground tabular-nums">{percentLabel}</div>
      </div>

      <div className="mt-3">
        <UsageProgressBar percent={window.usedPercent} />
      </div>

      <div className="mt-3 flex items-center justify-between text-muted-foreground">
        <span className="typography-micro">Resets in</span>
        <span className="typography-micro tabular-nums">{resetLabel}</span>
      </div>
    </div>
  );
};
