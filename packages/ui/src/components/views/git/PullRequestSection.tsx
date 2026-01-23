import React from 'react';
import {
  RiAiGenerate2,
  RiCheckboxBlankLine,
  RiCheckboxLine,
  RiExternalLinkLine,
  RiGitPullRequestLine,
  RiLoader4Line,
} from '@remixicon/react';
import { toast } from '@/components/ui';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { generatePullRequestDescription } from '@/lib/gitApi';
import { useRuntimeAPIs } from '@/hooks/useRuntimeAPIs';
import type {
  GitHubPullRequest,
  GitHubPullRequestStatus,
} from '@/lib/api/types';

type MergeMethod = 'merge' | 'squash' | 'rebase';

const statusColor = (state: string | undefined | null): string => {
  switch (state) {
    case 'success':
      return 'bg-[color:var(--status-success)]';
    case 'failure':
      return 'bg-[color:var(--status-error)]';
    case 'pending':
      return 'bg-[color:var(--status-warning)]';
    default:
      return 'bg-muted-foreground/40';
  }
};

const branchToTitle = (branch: string): string => {
  return branch
    .replace(/^refs\/heads\//, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
};

const openExternal = async (url: string) => {
  if (typeof window === 'undefined') return;
  const desktop = (window as typeof window & { opencodeDesktop?: { openExternal?: (url: string) => Promise<unknown> } }).opencodeDesktop;
  if (desktop?.openExternal) {
    try {
      await desktop.openExternal(url);
      return;
    } catch {
      // fall through
    }
  }
  try {
    window.open(url, '_blank', 'noopener,noreferrer');
  } catch {
    // ignore
  }
};

export const PullRequestSection: React.FC<{
  directory: string;
  branch: string;
  baseBranch: string;
}> = ({ directory, branch, baseBranch }) => {
  const { github } = useRuntimeAPIs();

  const [isOpen, setIsOpen] = React.useState(true);
  const [isLoading, setIsLoading] = React.useState(false);
  const [status, setStatus] = React.useState<GitHubPullRequestStatus | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const [title, setTitle] = React.useState(() => branchToTitle(branch));
  const [body, setBody] = React.useState('');
  const [draft, setDraft] = React.useState(false);
  const [mergeMethod, setMergeMethod] = React.useState<MergeMethod>('squash');

  const [isGenerating, setIsGenerating] = React.useState(false);
  const [isCreating, setIsCreating] = React.useState(false);
  const [isMerging, setIsMerging] = React.useState(false);
  const [isMarkingReady, setIsMarkingReady] = React.useState(false);

  const canShow = Boolean(directory && branch && baseBranch && branch !== baseBranch);

  const refresh = React.useCallback(async () => {
    if (!canShow) return;
    if (!github?.prStatus) {
      setStatus(null);
      setError('GitHub runtime API unavailable');
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const next = await github.prStatus(directory, branch);
      setStatus(next);
      if (next.connected === false) {
        setError(null);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message || 'Failed to load PR status');
    } finally {
      setIsLoading(false);
    }
  }, [branch, canShow, directory, github]);

  React.useEffect(() => {
    setTitle(branchToTitle(branch));
    setBody('');
    setDraft(false);
    void refresh();
  }, [branch, refresh]);

  const generateDescription = React.useCallback(async () => {
    if (isGenerating) return;
    if (!directory) return;
    setIsGenerating(true);
    try {
      const generated = await generatePullRequestDescription(directory, {
        base: baseBranch,
        head: branch,
      });

      if (generated.title?.trim()) {
        setTitle(generated.title.trim());
      }
      if (generated.body?.trim()) {
        setBody(generated.body.trim());
      }
      toast.success('PR description generated');
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      toast.error('Failed to generate description', { description: message });
    } finally {
      setIsGenerating(false);
    }
  }, [baseBranch, branch, directory, isGenerating]);

  const createPr = React.useCallback(async () => {
    if (!github?.prCreate) {
      toast.error('GitHub runtime API unavailable');
      return;
    }
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      toast.error('Title is required');
      return;
    }

    setIsCreating(true);
    try {
      const pr = await github.prCreate({
        directory,
        title: trimmedTitle,
        head: branch,
        base: baseBranch,
        ...(body.trim() ? { body } : {}),
        draft,
      });
      toast.success('PR created');
      setStatus((prev) => (prev ? { ...prev, pr } : prev));
      await refresh();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      toast.error('Failed to create PR', { description: message });
    } finally {
      setIsCreating(false);
    }
  }, [baseBranch, body, branch, directory, draft, github, refresh, title]);

  const mergePr = React.useCallback(async (pr: GitHubPullRequest) => {
    if (!github?.prMerge) {
      toast.error('GitHub runtime API unavailable');
      return;
    }
    setIsMerging(true);
    try {
      const result = await github.prMerge({ directory, number: pr.number, method: mergeMethod });
      if (result.merged) {
        toast.success('PR merged');
      } else {
        toast.message('PR not merged', { description: result.message || 'Not mergeable' });
      }
      await refresh();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      toast.error('Merge failed', { description: message });
      if (pr.url) {
        void openExternal(pr.url);
      }
    } finally {
      setIsMerging(false);
    }
  }, [directory, github, mergeMethod, refresh]);

  const markReady = React.useCallback(async (pr: GitHubPullRequest) => {
    if (!github?.prReady) {
      toast.error('GitHub runtime API unavailable');
      return;
    }
    setIsMarkingReady(true);
    try {
      await github.prReady({ directory, number: pr.number });
      toast.success('Marked ready for review');
      await refresh();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      toast.error('Failed to mark ready', { description: message });
      if (pr.url) {
        void openExternal(pr.url);
      }
    } finally {
      setIsMarkingReady(false);
    }
  }, [directory, github, refresh]);

  if (!canShow) {
    return null;
  }

  const pr = status?.pr ?? null;
  const repoUrl = status?.repo?.url || null;
  const checks = status?.checks ?? null;
  const canMerge = Boolean(status?.canMerge);
  const isConnected = Boolean(status?.connected);

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={setIsOpen}
      className="rounded-xl border border-border/60 bg-background/70 overflow-hidden"
    >
      <CollapsibleTrigger className="flex w-full items-center justify-between px-3 h-10 hover:bg-transparent">
        <div className="flex items-center gap-2 min-w-0">
          <RiGitPullRequestLine className="size-4 text-muted-foreground" />
          <h3 className="typography-ui-header font-semibold text-foreground truncate">Pull Request</h3>
          {pr ? (
            <span className="typography-meta text-muted-foreground truncate">#{pr.number}</span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {isLoading ? <RiLoader4Line className="size-4 animate-spin text-muted-foreground" /> : null}
          {checks ? (
            <span className="inline-flex items-center gap-2 typography-micro text-muted-foreground">
              <span className={`h-2 w-2 rounded-full ${statusColor(checks.state)}`} />
              {checks.total > 0 ? `${checks.success}/${checks.total} checks` : `${checks.state} checks`}
            </span>
          ) : null}
        </div>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="border-t border-border/40">
          <div className="flex flex-col gap-3 p-3">
            {!isConnected ? (
              <div className="typography-meta text-muted-foreground">
                GitHub not connected. Connect in Settings to create and merge PRs.
              </div>
            ) : null}

            {error ? (
              <div className="space-y-2">
                <div className="typography-ui-label text-foreground">PR status unavailable</div>
                <div className="typography-meta text-muted-foreground break-words">{error}</div>
                {repoUrl ? (
                  <Button variant="outline" size="sm" asChild className="w-fit">
                    <a href={repoUrl} target="_blank" rel="noopener noreferrer">
                      <RiExternalLinkLine className="size-4" />
                      Open Repo
                    </a>
                  </Button>
                ) : null}
              </div>
            ) : null}

            {pr ? (
              <div className="flex flex-col gap-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="typography-ui-label text-foreground truncate">{pr.title}</div>
                    <div className="typography-micro text-muted-foreground truncate">
                      {pr.state}{pr.draft ? ' (draft)' : ''}
                      {pr.mergeable === false ? ' · not mergeable' : ''}
                      {typeof pr.mergeableState === 'string' && pr.mergeableState ? ` · ${pr.mergeableState}` : ''}
                    </div>
                    {canMerge && pr.draft ? (
                      <div className="typography-micro text-muted-foreground">
                        Draft PRs must be marked ready before merge.
                      </div>
                    ) : null}
                    {!canMerge ? (
                      <div className="typography-micro text-muted-foreground">No merge permission; use Open in GitHub.</div>
                    ) : null}
                  </div>

                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" asChild>
                      <a href={pr.url} target="_blank" rel="noopener noreferrer">
                        <RiExternalLinkLine className="size-4" />
                        Open
                      </a>
                    </Button>
                    {canMerge && pr.draft && pr.state === 'open' ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => markReady(pr)}
                        disabled={isMarkingReady || isMerging}
                      >
                        {isMarkingReady ? <RiLoader4Line className="size-4 animate-spin" /> : null}
                        Ready
                      </Button>
                    ) : null}
                    {canMerge ? (
                      <>
                        <select
                          className="h-8 rounded-md border border-border bg-background px-2 typography-meta"
                          value={mergeMethod}
                          onChange={(e) => setMergeMethod(e.target.value as MergeMethod)}
                          disabled={isMerging || pr.state !== 'open'}
                        >
                          <option value="squash">Squash</option>
                          <option value="merge">Merge</option>
                          <option value="rebase">Rebase</option>
                        </select>
                        <Button
                          size="sm"
                          onClick={() => mergePr(pr)}
                          disabled={isMerging || isMarkingReady || pr.state !== 'open' || pr.draft}
                        >
                          {isMerging ? <RiLoader4Line className="size-4 animate-spin" /> : null}
                          Merge
                        </Button>
                      </>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="typography-ui-label text-foreground">Create PR</div>
                    <div className="typography-micro text-muted-foreground truncate">
                      {branch} → {baseBranch}
                    </div>
                  </div>
                  {repoUrl ? (
                    <Button variant="outline" size="sm" asChild>
                      <a href={repoUrl} target="_blank" rel="noopener noreferrer">
                        <RiExternalLinkLine className="size-4" />
                        Repo
                      </a>
                    </Button>
                  ) : null}
                </div>

                <label className="space-y-1">
                  <div className="typography-micro text-muted-foreground">Title</div>
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="PR title"
                  />
                </label>

                <label className="space-y-1">
                  <div className="typography-micro text-muted-foreground">Description</div>
                  <Textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    className="min-h-[110px] bg-background/80"
                    placeholder="What changed and why"
                  />
                </label>

                <div
                  className="flex items-center gap-2 cursor-pointer"
                  role="button"
                  tabIndex={0}
                  aria-pressed={draft}
                  onClick={() => setDraft((v) => !v)}
                  onKeyDown={(e) => {
                    if (e.key === ' ' || e.key === 'Enter') {
                      e.preventDefault();
                      setDraft((v) => !v);
                    }
                  }}
                >
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setDraft((v) => !v);
                    }}
                    aria-label="Toggle draft PR"
                    className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    {draft ? (
                      <RiCheckboxLine className="size-4 text-primary" />
                    ) : (
                      <RiCheckboxBlankLine className="size-4" />
                    )}
                  </button>
                  <span className="typography-ui-label text-foreground select-none">Draft</span>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={generateDescription}
                    disabled={isGenerating || isCreating}
                  >
                    {isGenerating ? <RiLoader4Line className="size-4 animate-spin" /> : <RiAiGenerate2 className="size-4 text-primary" />}
                    Generate
                  </Button>
                  <div className="flex-1" />
                  <Button size="sm" onClick={createPr} disabled={isCreating || !isConnected}>
                    {isCreating ? <RiLoader4Line className="size-4 animate-spin" /> : null}
                    Create PR
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};
