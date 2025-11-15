import React from 'react';
import { RiDonutChartLine } from '@remixicon/react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface ContextUsageDisplayProps {
  totalTokens: number;
  percentage: number;
  contextLimit: number;
  outputLimit?: number;
  size?: 'default' | 'compact';
}

export const ContextUsageDisplay: React.FC<ContextUsageDisplayProps> = ({
  totalTokens,
  percentage,
  contextLimit,
  outputLimit,
  size = 'default',
}) => {
  const formatTokens = (tokens: number) => {
    if (tokens >= 1_000_000) {
      return `${(tokens / 1_000_000).toFixed(1)}M`;
    }
    if (tokens >= 1_000) {
      return `${(tokens / 1_000).toFixed(1)}K`;
    }
    return tokens.toFixed(1).replace(/\.0$/, '');
  };

  const getPercentageColor = (percentage: number) => {
    if (percentage >= 90) return 'text-status-error';
    if (percentage >= 75) return 'text-status-warning';
    return 'text-status-success';
  };

  const safeOutputLimit = typeof outputLimit === 'number' ? Math.max(outputLimit, 0) : 0;
  const tooltipLines = [
    `Used tokens: ${formatTokens(totalTokens)}`,
    `Context limit: ${formatTokens(contextLimit)}`,
    `Output limit: ${formatTokens(safeOutputLimit)}`,
  ];

  const contextElement = (
    <div
      className={cn(
        'app-region-no-drag flex items-center gap-1.5 text-muted-foreground/60 select-none',
        size === 'compact' ? 'typography-micro' : 'typography-meta',
      )}
      aria-label="Context usage"
    >
      <RiDonutChartLine className="h-4 w-4 flex-shrink-0" />
      <span className={cn(getPercentageColor(percentage), 'font-medium')}>
        {Math.min(percentage, 999).toFixed(1)}%
      </span>
    </div>
  );

  return (
    <Tooltip delayDuration={1000}>
      <TooltipTrigger asChild>{contextElement}</TooltipTrigger>
      <TooltipContent>
        <div className="space-y-0.5">
          {tooltipLines.map((line) => (
            <p key={line} className="typography-micro leading-tight">
              {line}
            </p>
          ))}
        </div>
      </TooltipContent>
    </Tooltip>
  );
};
