import React from 'react';
import { Database as PieChart } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';

interface ContextUsageDisplayProps {
  totalTokens: number;
  percentage: number;
  contextLimit: number;
  size?: 'default' | 'compact';
}

export const ContextUsageDisplay: React.FC<ContextUsageDisplayProps> = ({
  totalTokens,
  percentage,
  contextLimit,
  size = 'default',
}) => {
  const formatTokens = (tokens: number) => {
    if (tokens >= 1000000) {
      return `${(tokens / 1000000).toFixed(1)}M`;
    } else if (tokens >= 1000) {
      return `${(tokens / 1000).toFixed(1)}K`;
    }
    return tokens.toString();
  };

  const getPercentageColor = (percentage: number) => {
    if (percentage >= 90) return 'text-status-error';
    if (percentage >= 75) return 'text-status-warning';
    return 'text-status-success';
  };

  return (
    <div
      className={cn(
        'flex items-center gap-1.5 text-muted-foreground/60',
        size === 'compact' ? 'typography-micro' : 'typography-meta'
      )}
    >
      <PieChart className="h-4 w-4 flex-shrink-0" />
      <span className={getPercentageColor(percentage)}>
        {formatTokens(totalTokens)}/{formatTokens(contextLimit)} ({percentage.toFixed(1)}%)
      </span>
    </div>
  );
};
