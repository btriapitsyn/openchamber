import React, { useEffect, useState, useCallback } from 'react';
import { RiGitPullRequestLine, RiRefreshLine, RiExternalLinkLine, RiLoader4Line, RiRobot2Line } from '@remixicon/react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { getPrStatus } from '@/lib/gitApi';
import { PrChecksSection } from './PrChecksSection';
import { PrReviewSection } from './PrReviewSection';
import { useAutoReviewStore, usePendingCount } from '@/stores/useAutoReviewStore';
import { useAutoReviewDispatch } from '@/hooks/useAutoReviewDispatch';
import type { PrStatus } from '@/lib/api/types';

interface PrChecksPanelProps {
  directory: string | undefined;
}

interface PrHeaderProps {
  pr: PrStatus;
  onRefresh: () => void;
  isRefreshing: boolean;
  directory: string;
}

const PrHeader: React.FC<PrHeaderProps> = ({ 
  pr, 
  onRefresh, 
  isRefreshing,
  directory,
}) => {
  const isDraft = pr.isDraft;
  const state = pr.state?.toLowerCase();
  
  const autoReviewEnabled = useAutoReviewStore((s) => s.enabled);
  const activeDirectory = useAutoReviewStore((s) => s.activeDirectory);
  const toggle = useAutoReviewStore((s) => s.toggle);
  const pendingCount = usePendingCount();
  
  const isActiveForThisDir = autoReviewEnabled && activeDirectory === directory;
  
  let stateColor = 'text-muted-foreground';
  if (state === 'open') stateColor = 'text-green-500';
  else if (state === 'merged') stateColor = 'text-purple-500';
  else if (state === 'closed') stateColor = 'text-red-500';

  const handleToggleAutoReview = () => {
    toggle(directory);
  };

  return (
    <div className="flex flex-col gap-2 p-3 border-b border-border/40">
      <div className="flex items-start gap-3">
        <RiGitPullRequestLine className={`w-5 h-5 mt-0.5 flex-shrink-0 ${stateColor}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="typography-ui-header font-semibold text-foreground">
              #{pr.number}
            </span>
            {isDraft && (
              <span className="px-1.5 py-0.5 text-xs rounded bg-muted text-muted-foreground">
                Draft
              </span>
            )}
            <span className={`text-xs ${stateColor}`}>
              {state}
            </span>
          </div>
          <div className="typography-small text-foreground mt-0.5 truncate">
            {pr.title}
          </div>
          <div className="typography-meta text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
            <span>{pr.headRefName} → {pr.baseRefName}</span>
            {(pr.additions !== undefined || pr.deletions !== undefined) && (
              <span>
                <span className="text-green-500">+{pr.additions || 0}</span>
                {' '}
                <span className="text-red-500">-{pr.deletions || 0}</span>
              </span>
            )}
            {pr.changedFiles !== undefined && (
              <span>{pr.changedFiles} files</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={onRefresh}
            disabled={isRefreshing}
          >
            <RiRefreshLine className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </Button>
          {pr.url && (
            <a
              href={pr.url}
              target="_blank"
              rel="noopener noreferrer"
              className="h-7 w-7 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
            >
              <RiExternalLinkLine className="w-4 h-4" />
            </a>
          )}
        </div>
      </div>
      
      <div className="flex items-center justify-between gap-2 px-0.5">
        <div className="flex items-center gap-2">
          <RiRobot2Line className={`w-4 h-4 ${isActiveForThisDir ? 'text-green-500' : 'text-muted-foreground'}`} />
          <span className="typography-small text-foreground">Auto Review</span>
          {isActiveForThisDir && pendingCount.total > 0 && (
            <span className="px-1.5 py-0.5 text-xs rounded bg-yellow-500/20 text-yellow-600">
              {pendingCount.total} pending
            </span>
          )}
        </div>
        <Switch
          checked={isActiveForThisDir}
          onCheckedChange={handleToggleAutoReview}
          className="scale-90"
        />
      </div>
    </div>
  );
};

export const PrChecksPanel: React.FC<PrChecksPanelProps> = ({ directory }) => {
  const [pr, setPr] = useState<PrStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const updatePrStatus = useAutoReviewStore((s) => s.updatePrStatus);
  
  useAutoReviewDispatch();

  const fetchPrStatus = useCallback(async () => {
    if (!directory) {
      setPr(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await getPrStatus(directory);
      if (result.success) {
        setPr(result.pr ?? null);
        updatePrStatus(result.pr ?? null);
      } else {
        setError(result.error || 'Failed to fetch PR status');
        setPr(null);
        updatePrStatus(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch PR status');
      setPr(null);
      updatePrStatus(null);
    } finally {
      setIsLoading(false);
    }
  }, [directory, updatePrStatus]);

  useEffect(() => {
    fetchPrStatus();
  }, [fetchPrStatus]);

  if (!directory) {
    return null;
  }

  if (isLoading && !pr) {
    return (
      <section className="flex flex-col rounded-xl border border-border/60 bg-background/70">
        <div className="flex items-center justify-center gap-2 p-4 text-muted-foreground">
          <RiLoader4Line className="w-4 h-4 animate-spin" />
          <span className="typography-small">Loading PR status...</span>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="flex flex-col rounded-xl border border-border/60 bg-background/70">
        <div className="flex items-center justify-between gap-2 p-3">
          <span className="typography-small text-muted-foreground">{error}</span>
          <Button variant="ghost" size="sm" onClick={fetchPrStatus}>
            <RiRefreshLine className="w-4 h-4 mr-1" />
            Retry
          </Button>
        </div>
      </section>
    );
  }

  if (!pr) {
    return (
      <section className="flex flex-col rounded-xl border border-border/60 bg-background/70">
        <div className="flex items-center justify-between gap-2 p-3">
          <div className="flex items-center gap-2">
            <RiGitPullRequestLine className="w-4 h-4 text-muted-foreground" />
            <span className="typography-small text-muted-foreground">No PR found for this branch</span>
          </div>
          <Button variant="ghost" size="sm" onClick={fetchPrStatus}>
            <RiRefreshLine className="w-4 h-4" />
          </Button>
        </div>
      </section>
    );
  }

  const checks = pr.statusCheckRollup || [];
  const threads = pr.reviewThreads || [];

  return (
    <section className="flex flex-col rounded-xl border border-border/60 bg-background/70 overflow-hidden">
      <PrHeader pr={pr} onRefresh={fetchPrStatus} isRefreshing={isLoading} directory={directory} />
      <div className="flex flex-col gap-3 p-3">
        {checks.length > 0 && <PrChecksSection checks={checks} />}
        {threads.length > 0 && (
          <PrReviewSection 
            threads={threads} 
            onRefresh={fetchPrStatus} 
            isRefreshing={isLoading} 
          />
        )}
        {checks.length === 0 && threads.length === 0 && (
          <div className="text-center py-4 text-muted-foreground typography-small">
            No checks or review comments
          </div>
        )}
      </div>
    </section>
  );
};
