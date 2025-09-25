 import React from 'react';
 import { PieChart } from 'lucide-react';

interface ContextUsageDisplayProps {
  totalTokens: number;
  percentage: number;
  contextLimit: number;
}

export const ContextUsageDisplay: React.FC<ContextUsageDisplayProps> = ({
  totalTokens,
  percentage,
  contextLimit,
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
     <div className="flex items-center gap-2 typography-meta text-muted-foreground/60">
       <PieChart className="h-4 w-4" />
       <span className={getPercentageColor(percentage)}>
         {formatTokens(totalTokens)}/{formatTokens(contextLimit)} ({percentage.toFixed(1)}%)
       </span>
     </div>
  );
};