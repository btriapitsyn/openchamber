import React from 'react';
import type { UsageWindow } from '@/types';
import { formatPercent, formatWindowLabel, calculatePace, calculateExpectedUsagePercent } from '@/lib/quota';
import { UsageProgressBar } from './UsageProgressBar';
import { PaceIndicator } from './PaceIndicator';
import { useQuotaStore } from '@/stores/useQuotaStore';
import { Switch } from '@/components/ui/switch';

interface UsageCardProps {
  title: string;
  window: UsageWindow;
  subtitle?: string | null;
  showToggle?: boolean;
  toggleEnabled?: boolean;
  onToggle?: (enabled: boolean) => void;
}

export const UsageCard: React.FC<UsageCardProps> = ({
  title,
  window,
  subtitle,
  showToggle = false,
  toggleEnabled = false,
  onToggle,
}) => {
  const displayMode = useQuotaStore((state) => state.displayMode);
  const displayPercent = displayMode === 'remaining' ? window.remainingPercent : window.usedPercent;
  const barLabel = displayMode === 'remaining' ? 'remaining' : 'used';
  const percentLabel = window.valueLabel ?? formatPercent(displayPercent);
  const resetLabel = window.resetAfterFormatted ?? window.resetAtFormatted ?? '';
  const windowLabel = formatWindowLabel(title);

  // Calculate pace info for the usage window
  // Pass the title (window label) to infer windowSeconds when not provided by the API
  const paceInfo = React.useMemo(() => {
    return calculatePace(window.usedPercent, window.resetAt, window.windowSeconds, title);
  }, [window.usedPercent, window.resetAt, window.windowSeconds, title]);

  // Calculate expected marker position for weekly/monthly quotas
  const expectedMarkerPercent = React.useMemo(() => {
    if (!paceInfo || paceInfo.dailyAllocationPercent === null) {
      return null;
    }
    // Show marker based on elapsed time ratio
    const expectedUsed = calculateExpectedUsagePercent(paceInfo.elapsedRatio);
    // If displaying remaining, invert the marker position
    return displayMode === 'remaining' ? 100 - expectedUsed : expectedUsed;
  }, [paceInfo, displayMode]);

  return (
    <div className="rounded-xl border border-[var(--interactive-border)] bg-[var(--surface-elevated)]/60 p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="typography-ui-label text-foreground truncate">{windowLabel}</div>
          {subtitle && (
            <div className="typography-micro text-muted-foreground truncate">{subtitle}</div>
          )}
        </div>
        {showToggle ? (
          <Switch
            checked={toggleEnabled}
            onCheckedChange={onToggle}
            aria-label="Show in dropdown"
          />
        ) : (
          <div className="typography-ui-label text-foreground tabular-nums">
            {percentLabel === '-' ? '' : percentLabel}
          </div>
        )}
      </div>

      <div className="mt-3">
        <UsageProgressBar
          percent={displayPercent}
          tonePercent={window.usedPercent}
          expectedMarkerPercent={expectedMarkerPercent}
        />
        <div className="mt-1 text-right typography-micro text-muted-foreground text-[10px]">
          {barLabel}
        </div>
      </div>

      {/* Pace indicator - only shown when we have pace info */}
      {paceInfo && (
        <div className="mt-2">
          <PaceIndicator paceInfo={paceInfo} />
        </div>
      )}

      <div className="mt-3 flex items-center justify-between text-muted-foreground">
        <span className="typography-micro">Resets</span>
        <span className="typography-micro tabular-nums">{resetLabel}</span>
      </div>
    </div>
  );
};
