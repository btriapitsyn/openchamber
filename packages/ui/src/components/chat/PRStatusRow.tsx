import React from 'react';
import {
  RiExternalLinkLine,
  RiGitPullRequestLine,
  RiCheckLine,
  RiCloseLine,
  RiLoader4Line,
  RiGitMergeLine,
  RiRefreshLine,
  RiChat1Line,
  RiErrorWarningLine,
  RiArrowDownSLine,
  RiArrowUpSLine,
} from '@remixicon/react';
import { cn } from '@/lib/utils';
import { usePRStore, usePRInfo, useHasPR, usePRLoading } from '@/stores/usePRStore';
import { useDirectoryStore } from '@/stores/useDirectoryStore';
import { useSessionStore } from '@/stores/useSessionStore';
import { toast } from 'sonner';
import type { GitHubPRInfo, GitHubPRCheck, GitHubPRComment, GitHubMergeStrategy } from '@/lib/api/types';

interface PRStatusRowProps {
  onAddToContext?: (content: string) => void;
}

const getChecksStatusIcon = (checksStatus: GitHubPRInfo['checksStatus']) => {
  if (checksStatus.pending > 0) {
    return <RiLoader4Line className="h-3.5 w-3.5 animate-spin text-yellow-500" />;
  }
  if (checksStatus.failed > 0) {
    return <RiCloseLine className="h-3.5 w-3.5 text-red-500" />;
  }
  if (checksStatus.passed === checksStatus.total && checksStatus.total > 0) {
    return <RiCheckLine className="h-3.5 w-3.5 text-green-500" />;
  }
  return <RiLoader4Line className="h-3.5 w-3.5 text-muted-foreground" />;
};

const formatCheckOutput = (check: GitHubPRCheck): string => {
  const lines: string[] = [];
  lines.push(`## ${check.name}`);
  lines.push(`Status: ${check.status} | Conclusion: ${check.conclusion ?? 'pending'}`);

  if (check.output?.title) {
    lines.push(`### ${check.output.title}`);
  }
  if (check.output?.summary) {
    lines.push(check.output.summary);
  }
  if (check.output?.text) {
    lines.push('```');
    lines.push(check.output.text);
    lines.push('```');
  }
  if (check.detailsUrl) {
    lines.push(`[View Details](${check.detailsUrl})`);
  }

  return lines.join('\n');
};

const formatComments = (comments: GitHubPRComment[]): string => {
  if (comments.length === 0) return 'No comments on this PR.';

  return comments.map((comment) => {
    const lines: string[] = [];
    lines.push(`### Comment by @${comment.user.login}`);
    if (comment.path) {
      lines.push(`File: \`${comment.path}\`${comment.line ? ` (line ${comment.line})` : ''}`);
    }
    lines.push('');
    lines.push(comment.body);
    if (comment.diffHunk) {
      lines.push('');
      lines.push('```diff');
      lines.push(comment.diffHunk);
      lines.push('```');
    }
    return lines.join('\n');
  }).join('\n\n---\n\n');
};

export const PRStatusRow: React.FC<PRStatusRowProps> = ({ onAddToContext }) => {
  const [isExpanded, setIsExpanded] = React.useState(false);
  const popoverRef = React.useRef<HTMLDivElement>(null);

  const fallbackDirectory = useDirectoryStore((state) => state.currentDirectory);
  const { currentSessionId, sessions, worktreeMetadata: worktreeMap } = useSessionStore();

  const effectiveDirectory = React.useMemo(() => {
    const worktreeMetadata = currentSessionId
      ? worktreeMap.get(currentSessionId) ?? undefined
      : undefined;

    const currentSession = sessions.find((session) => session.id === currentSessionId);
    const sessionDirectory = (currentSession as { directory?: string | null } | undefined)?.directory ?? null;

    return worktreeMetadata?.path ?? sessionDirectory ?? fallbackDirectory ?? null;
  }, [currentSessionId, sessions, worktreeMap, fallbackDirectory]);

  const prInfo = usePRInfo(effectiveDirectory);
  const hasPR = useHasPR(effectiveDirectory);
  const isLoading = usePRLoading(effectiveDirectory);

  const { fetchPR, refreshChecks, mergePR, startPolling, stopPolling, setActiveDirectory } = usePRStore();

  // Close popover when clicking outside
  React.useEffect(() => {
    if (!isExpanded) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsExpanded(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isExpanded]);

  // Set active directory and start polling when directory changes
  React.useEffect(() => {
    if (effectiveDirectory) {
      setActiveDirectory(effectiveDirectory);
      startPolling();
    }
    return () => {
      stopPolling();
    };
  }, [effectiveDirectory, setActiveDirectory, startPolling, stopPolling]);

  // Fetch PR on mount and when directory changes
  React.useEffect(() => {
    if (effectiveDirectory) {
      void fetchPR(effectiveDirectory);
    }
  }, [effectiveDirectory, fetchPR]);

  const handleRefresh = React.useCallback(async () => {
    if (effectiveDirectory) {
      const result = await refreshChecks(effectiveDirectory);
      if (result?.error) {
        toast.error(`Failed to refresh: ${result.error}`);
      }
    }
  }, [effectiveDirectory, refreshChecks]);

  const handleOpenPR = React.useCallback(() => {
    if (prInfo?.htmlUrl) {
      window.open(prInfo.htmlUrl, '_blank', 'noopener,noreferrer');
    }
  }, [prInfo?.htmlUrl]);

  const handleMerge = React.useCallback(async (strategy: GitHubMergeStrategy = 'merge') => {
    if (!effectiveDirectory) return;
    const result = await mergePR(effectiveDirectory, strategy);
    if (result.success) {
      toast.success(`PR merged successfully (${strategy})`);
      setIsExpanded(false);
    } else {
      toast.error(`Failed to merge PR: ${result.error || 'Unknown error'}`);
    }
  }, [effectiveDirectory, mergePR]);

  const handleAddFailedChecksToContext = React.useCallback(() => {
    if (!prInfo || !onAddToContext) return;

    const failedChecks = prInfo.checks.filter(
      (check) => check.conclusion === 'failure' || check.conclusion === 'timed_out'
    );

    if (failedChecks.length === 0) {
      onAddToContext('All CI checks passed!');
      return;
    }

    const content = [
      `# Failed CI Checks for PR #${prInfo.number}`,
      '',
      `${failedChecks.length} check(s) failed:`,
      '',
      ...failedChecks.map(formatCheckOutput),
    ].join('\n');

    onAddToContext(content);
    setIsExpanded(false);
  }, [prInfo, onAddToContext]);

  const handleAddCommentsToContext = React.useCallback(() => {
    if (!prInfo || !onAddToContext) return;

    const allComments = [...prInfo.comments, ...prInfo.reviewComments];

    const content = [
      `# Comments on PR #${prInfo.number}: ${prInfo.title}`,
      '',
      formatComments(allComments),
    ].join('\n');

    onAddToContext(content);
    setIsExpanded(false);
  }, [prInfo, onAddToContext]);

  // Don't render if no PR exists
  if (!hasPR || !prInfo) {
    return null;
  }

  const { checksStatus } = prInfo;
  const hasFailedChecks = checksStatus.failed > 0;
  const allChecksPassed = checksStatus.passed === checksStatus.total && checksStatus.total > 0;
  const hasPendingChecks = checksStatus.pending > 0;
  const totalComments = prInfo.comments.length + prInfo.reviewComments.length;

  const canMerge = prInfo.mergeable && prInfo.mergeableState === 'clean' && allChecksPassed;

  return (
    <div className="chat-column mb-1" style={{ containerType: 'inline-size' }}>
      <div className="flex items-center justify-between pr-[2ch] py-0.5 gap-2 h-[1.2rem]">
        {/* Left: PR status indicator */}
        <div className="flex-1 flex items-center overflow-hidden min-w-0 pl-[2ch]">
          <div className="flex items-center gap-1.5 typography-ui-label text-foreground">
            <RiGitPullRequestLine className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            <span className="truncate">
              PR #{prInfo.number}
            </span>
            {getChecksStatusIcon(checksStatus)}
            <span className="text-muted-foreground typography-meta">
              {checksStatus.passed}/{checksStatus.total}
            </span>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="relative flex items-center gap-1 flex-shrink-0" ref={popoverRef}>
          {/* Refresh button */}
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isLoading}
            className={cn(
              'flex items-center justify-center h-5 w-5 rounded text-muted-foreground',
              'hover:text-foreground hover:bg-muted/50 transition-colors',
              isLoading && 'animate-spin'
            )}
            title="Refresh checks"
          >
            <RiRefreshLine className="h-3.5 w-3.5" />
          </button>

          {/* Link to PR */}
          <button
            type="button"
            onClick={handleOpenPR}
            className={cn(
              'flex items-center justify-center h-5 w-5 rounded text-muted-foreground',
              'hover:text-foreground hover:bg-muted/50 transition-colors'
            )}
            title="Open PR in browser"
          >
            <RiExternalLinkLine className="h-3.5 w-3.5" />
          </button>

          {/* Toggle expanded view */}
          <button
            type="button"
            onClick={() => setIsExpanded((prev) => !prev)}
            className={cn(
              'flex items-center gap-0.5 px-1 h-5 rounded text-muted-foreground',
              'hover:text-foreground hover:bg-muted/50 transition-colors'
            )}
          >
            <span className="typography-meta">Actions</span>
            {isExpanded ? (
              <RiArrowUpSLine className="h-3.5 w-3.5" />
            ) : (
              <RiArrowDownSLine className="h-3.5 w-3.5" />
            )}
          </button>

          {/* Popover dropdown */}
          {isExpanded && (
            <div
              style={{ maxWidth: 'calc(100cqw - 4ch)' }}
              className={cn(
                'absolute right-0 bottom-full mb-1 z-50',
                'w-max min-w-[220px]',
                'rounded-xl border border-border bg-background shadow-md',
                'animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-2',
                'duration-150'
              )}
            >
              {/* Header */}
              <div className="px-3 py-2 border-b border-border">
                <div className="typography-ui-label text-foreground truncate">
                  {prInfo.title}
                </div>
                <div className="typography-meta text-muted-foreground">
                  {prInfo.headRef} → {prInfo.baseRef}
                </div>
              </div>

              {/* Status badges */}
              <div className="px-3 py-2 border-b border-border flex flex-wrap gap-1.5">
                {prInfo.draft && (
                  <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground typography-meta">
                    Draft
                  </span>
                )}
                <span
                  className={cn(
                    'px-1.5 py-0.5 rounded typography-meta',
                    prInfo.state === 'open' && 'bg-green-500/10 text-green-600',
                    prInfo.state === 'closed' && 'bg-red-500/10 text-red-600',
                    prInfo.state === 'merged' && 'bg-purple-500/10 text-purple-600'
                  )}
                >
                  {prInfo.state.charAt(0).toUpperCase() + prInfo.state.slice(1)}
                </span>
                <span
                  className={cn(
                    'px-1.5 py-0.5 rounded typography-meta',
                    allChecksPassed && 'bg-green-500/10 text-green-600',
                    hasFailedChecks && 'bg-red-500/10 text-red-600',
                    hasPendingChecks && 'bg-yellow-500/10 text-yellow-600'
                  )}
                >
                  {checksStatus.passed}/{checksStatus.total} checks
                </span>
              </div>

              {/* Actions */}
              <div className="p-2 space-y-1">
                {/* Fix Errors - only if there are failed checks */}
                {hasFailedChecks && onAddToContext && (
                  <button
                    type="button"
                    onClick={handleAddFailedChecksToContext}
                    className={cn(
                      'w-full flex items-center gap-2 px-2 py-1.5 rounded',
                      'text-left typography-ui-label',
                      'hover:bg-muted/50 transition-colors',
                      'text-red-600'
                    )}
                  >
                    <RiErrorWarningLine className="h-4 w-4" />
                    Fix Errors ({checksStatus.failed})
                  </button>
                )}

                {/* Add Comments to Context */}
                {onAddToContext && (
                  <button
                    type="button"
                    onClick={handleAddCommentsToContext}
                    className={cn(
                      'w-full flex items-center gap-2 px-2 py-1.5 rounded',
                      'text-left typography-ui-label text-foreground',
                      'hover:bg-muted/50 transition-colors'
                    )}
                  >
                    <RiChat1Line className="h-4 w-4" />
                    Add Comments to Chat ({totalComments})
                  </button>
                )}

                {/* Merge PR options - only if mergeable */}
                {prInfo.state === 'open' && (
                  <div className="space-y-0.5">
                    <div className="px-2 py-1 typography-meta text-muted-foreground">
                      Merge Options
                    </div>
                    <button
                      type="button"
                      onClick={() => handleMerge('merge')}
                      disabled={!canMerge || isLoading}
                      className={cn(
                        'w-full flex items-center gap-2 px-2 py-1.5 rounded',
                        'text-left typography-ui-label',
                        'hover:bg-muted/50 transition-colors',
                        canMerge ? 'text-green-600' : 'text-muted-foreground opacity-50'
                      )}
                      title={!canMerge ? 'Cannot merge: checks must pass and PR must be mergeable' : undefined}
                    >
                      <RiGitMergeLine className="h-4 w-4" />
                      Merge commit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMerge('squash')}
                      disabled={!canMerge || isLoading}
                      className={cn(
                        'w-full flex items-center gap-2 px-2 py-1.5 rounded',
                        'text-left typography-ui-label',
                        'hover:bg-muted/50 transition-colors',
                        canMerge ? 'text-green-600' : 'text-muted-foreground opacity-50'
                      )}
                      title={!canMerge ? 'Cannot merge: checks must pass and PR must be mergeable' : undefined}
                    >
                      <RiGitMergeLine className="h-4 w-4" />
                      Squash and merge
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMerge('rebase')}
                      disabled={!canMerge || isLoading}
                      className={cn(
                        'w-full flex items-center gap-2 px-2 py-1.5 rounded',
                        'text-left typography-ui-label',
                        'hover:bg-muted/50 transition-colors',
                        canMerge ? 'text-green-600' : 'text-muted-foreground opacity-50'
                      )}
                      title={!canMerge ? 'Cannot merge: checks must pass and PR must be mergeable' : undefined}
                    >
                      <RiGitMergeLine className="h-4 w-4" />
                      Rebase and merge
                    </button>
                  </div>
                )}

                {/* Open in Browser */}
                <button
                  type="button"
                  onClick={handleOpenPR}
                  className={cn(
                    'w-full flex items-center gap-2 px-2 py-1.5 rounded',
                    'text-left typography-ui-label text-foreground',
                    'hover:bg-muted/50 transition-colors'
                  )}
                >
                  <RiExternalLinkLine className="h-4 w-4" />
                  Open PR in Browser
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
