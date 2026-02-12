import React from 'react';
import { RiDonutChartLine } from '@remixicon/react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { MobileOverlayPanel } from '@/components/ui/MobileOverlayPanel';

interface ContextUsageDisplayProps {
  totalTokens: number;
  percentage: number;
  contextLimit: number;
  outputLimit?: number;
  size?: 'default' | 'compact';
  isMobile?: boolean;
  hideIcon?: boolean;
}

export const ContextUsageDisplay: React.FC<ContextUsageDisplayProps> = ({
  totalTokens,
  percentage,
  contextLimit,
  outputLimit,
  size = 'default',
  isMobile = false,
  hideIcon = false,
}) => {
  const [mobileTooltipOpen, setMobileTooltipOpen] = React.useState(false);

  const formatTokens = (tokens: number) => {
    if (tokens >= 1_000_000) {
      return `${(tokens / 1_000_000).toFixed(1)}M`;
    }
    if (tokens >= 1_000) {
      return `${(tokens / 1_000).toFixed(1)}K`;
    }
    return tokens.toFixed(1).replace(/\.0$/, '');
  };

  const getPercentageColor = (pct: number) => {
    if (pct >= 90) return 'text-status-error';
    if (pct >= 75) return 'text-status-warning';
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
      onClick={isMobile ? () => setMobileTooltipOpen(true) : undefined}
    >
      {!isMobile && !hideIcon && <RiDonutChartLine className="h-4 w-4 flex-shrink-0" />}
      <span className={cn(getPercentageColor(percentage), 'font-medium')}>
        {Math.min(percentage, 999).toFixed(1)}%
      </span>
    </div>
  );

  if (isMobile) {
    return (
      <>
        {contextElement}
        <MobileOverlayPanel
          open={mobileTooltipOpen}
          onClose={() => setMobileTooltipOpen(false)}
          title="Context Usage"
        >
          <div className="flex flex-col gap-1.5">
            <div className="rounded-xl border border-border/40 bg-sidebar/30 px-3 py-2 space-y-1">
              <div className="flex justify-between items-center">
                <span className="typography-meta text-muted-foreground">Used tokens</span>
                <span className="typography-meta text-foreground font-medium">{formatTokens(totalTokens)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="typography-meta text-muted-foreground">Context limit</span>
                <span className="typography-meta text-foreground font-medium">{formatTokens(contextLimit)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="typography-meta text-muted-foreground">Output limit</span>
                <span className="typography-meta text-foreground font-medium">{formatTokens(safeOutputLimit)}</span>
              </div>
              <div className="flex justify-between items-center pt-1 border-t border-border/40">
                <span className="typography-meta text-muted-foreground">Usage</span>
                <span className={cn('typography-meta font-semibold', getPercentageColor(percentage))}>
                  {Math.min(percentage, 999).toFixed(1)}%
                </span>
              </div>
            </div>
          </div>
        </MobileOverlayPanel>
      </>
    );
  }

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
