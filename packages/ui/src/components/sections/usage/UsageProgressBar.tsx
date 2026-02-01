import React from 'react';
import { cn } from '@/lib/utils';
import { clampPercent, resolveUsageTone } from '@/lib/quota';

interface UsageProgressBarProps {
  percent: number | null;
  className?: string;
}

export const UsageProgressBar: React.FC<UsageProgressBarProps> = ({ percent, className }) => {
  const clamped = clampPercent(percent) ?? 0;
  const tone = resolveUsageTone(percent);

  const fillClass = tone === 'critical'
    ? 'from-rose-500 to-rose-400'
    : tone === 'warn'
      ? 'from-amber-500 to-amber-400'
      : 'from-emerald-500 to-emerald-400';

  return (
    <div className={cn('h-2.5 rounded-full bg-muted/60 overflow-hidden', className)}>
      <div
        className={cn('h-full bg-gradient-to-r transition-all duration-300', fillClass)}
        style={{ width: `${clamped}%` }}
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
      />
    </div>
  );
};
