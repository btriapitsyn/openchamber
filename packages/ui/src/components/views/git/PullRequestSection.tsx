import React from 'react';
import {
  RiAiGenerate2,
  RiCheckboxBlankLine,
  RiCheckboxLine,
  RiExternalLinkLine,
  RiGitClosePullRequestLine,
  RiGitMergeLine,
  RiGitPrDraftLine,
  RiGitPullRequestLine,
  RiLoader4Line,
} from '@remixicon/react';
import { toast } from '@/components/ui';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { generatePullRequestDescription } from '@/lib/gitApi';
import { useRuntimeAPIs } from '@/hooks/useRuntimeAPIs';
import { useDeviceInfo } from '@/lib/device';
import { MobileOverlayPanel } from '@/components/ui/MobileOverlayPanel';
import { useUIStore } from '@/stores/useUIStore';
import { useMessageStore } from '@/stores/messageStore';
import { useSessionStore } from '@/stores/useSessionStore';
import { useConfigStore } from '@/stores/useConfigStore';
import { useGitHubAuthStore } from '@/stores/useGitHubAuthStore';
import type {
  GitHubPullRequest,
  GitHubCheckRun,
  GitHubPullRequestContextResult,
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

const getPrVisualState = (status: GitHubPullRequestStatus | null): 'draft' | 'open' | 'blocked' | 'merged' | 'closed' | null => {
  const pr = status?.pr;
  if (!pr) {
    return null;
  }
  if (pr.state === 'merged') {
    return 'merged';
  }
  if (pr.state === 'closed') {
    return 'closed';
  }
  if (pr.draft) {
    return 'draft';
  }
  const checksFailed = status?.checks?.state === 'failure';
  const notMergeable = status?.canMerge === false || pr.mergeable === false;
  if (checksFailed || notMergeable) {
    return 'blocked';
  }
  return 'open';
};

const branchToTitle = (branch: string): string => {
  return branch
    .replace(/^refs\/heads\//, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
};

type PullRequestDraftSnapshot = {
  title: string;
  body: string;
  draft: boolean;
  additionalContext: string;
};

const pullRequestDraftSnapshots = new Map<string, PullRequestDraftSnapshot>();

type TauriShell = {
  shell?: {
    open?: (url: string) => Promise<unknown>;
  };
};

const openExternal = async (url: string) => {
  if (typeof window === 'undefined') return;

  const tauri = (window as unknown as { __TAURI__?: TauriShell }).__TAURI__;
  if (tauri?.shell?.open) {
    try {
      await tauri.shell.open(url);
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
  variant?: 'framed' | 'plain';
}> = ({ directory, branch, baseBranch, variant = 'framed' }) => {
  const { github } = useRuntimeAPIs();
  const githubAuthStatus = useGitHubAuthStore((state) => state.status);
  const githubAuthChecked = useGitHubAuthStore((state) => state.hasChecked);
  const setSettingsDialogOpen = useUIStore((state) => state.setSettingsDialogOpen);
  const setSidebarSection = useUIStore((state) => state.setSidebarSection);
  const setActiveMainTab = useUIStore((state) => state.setActiveMainTab);
  const currentSessionId = useSessionStore((state) => state.currentSessionId);
  const { isMobile } = useDeviceInfo();

  const openGitHubSettings = React.useCallback(() => {
    setSidebarSection('settings');
    setSettingsDialogOpen(true);
  }, [setSettingsDialogOpen, setSidebarSection]);

  const snapshotKey = React.useMemo(() => `${directory}::${branch}`, [directory, branch]);
  const initialSnapshot = React.useMemo(
    () => pullRequestDraftSnapshots.get(snapshotKey) ?? null,
    [snapshotKey]
  );

  const [isLoading, setIsLoading] = React.useState(false);
  const [status, setStatus] = React.useState<GitHubPullRequestStatus | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const [title, setTitle] = React.useState(() => initialSnapshot?.title ?? branchToTitle(branch));
  const [body, setBody] = React.useState(() => initialSnapshot?.body ?? '');
  const [draft, setDraft] = React.useState(() => initialSnapshot?.draft ?? false);
  const [additionalContext, setAdditionalContext] = React.useState(() => initialSnapshot?.additionalContext ?? '');
  const [mergeMethod, setMergeMethod] = React.useState<MergeMethod>('squash');

  const [isGenerating, setIsGenerating] = React.useState(false);
  const [isCreating, setIsCreating] = React.useState(false);
  const [isMerging, setIsMerging] = React.useState(false);
  const [isMarkingReady, setIsMarkingReady] = React.useState(false);

  const [isContextOpen, setIsContextOpen] = React.useState(false);
  const [isContextSheetOpen, setIsContextSheetOpen] = React.useState(false);

  const [checksDialogOpen, setChecksDialogOpen] = React.useState(false);
  const [checkDetails, setCheckDetails] = React.useState<GitHubPullRequestContextResult | null>(null);
  const [isLoadingCheckDetails, setIsLoadingCheckDetails] = React.useState(false);

  const canShow = Boolean(directory && branch && baseBranch && branch !== baseBranch);

  const pr = status?.pr ?? null;

  const openChecksDialog = React.useCallback(async () => {
    if (!github?.prContext) {
      toast.error('GitHub runtime API unavailable');
      return;
    }
    if (!pr) return;

    setChecksDialogOpen(true);
    setIsLoadingCheckDetails(true);
    try {
      const ctx = await github.prContext(directory, pr.number, {
        includeDiff: false,
        includeCheckDetails: true,
      });
      setCheckDetails(ctx);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      toast.error('Failed to load check details', { description: message });
    } finally {
      setIsLoadingCheckDetails(false);
    }
  }, [directory, github, pr]);

  const renderCheckRunSummary = React.useCallback((run: GitHubCheckRun) => {
    const status = run.status || 'unknown';
    const conclusion = run.conclusion ?? undefined;
    const statusText = conclusion ? `${status} / ${conclusion}` : status;
    const appName = run.app?.name || run.app?.slug;
    return (
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="typography-ui-label text-foreground truncate">{run.name}</div>
          <div className="typography-micro text-muted-foreground truncate">
            {appName ? `${appName} · ${statusText}` : statusText}
          </div>
          {run.output?.summary ? (
            <div className="typography-micro text-muted-foreground whitespace-pre-wrap line-clamp-4 mt-2">
              {run.output.summary}
            </div>
          ) : null}
          {run.job?.steps && run.job.steps.length > 0 ? (
            <div className="mt-2 space-y-1">
              <div className="typography-micro text-muted-foreground">Steps</div>
              <div className="space-y-1">
                {run.job.steps.map((step, idx) => {
                  const c = (step.conclusion || '').toLowerCase();
                  const isFail = c && !['success', 'neutral', 'skipped'].includes(c);
                  return (
                    <div
                      key={`${step.name}-${idx}`}
                      className={
                        'typography-micro flex items-center gap-2 rounded px-2 py-1 ' +
                        (isFail ? 'bg-destructive/10 text-destructive' : 'text-muted-foreground')
                      }
                    >
                      <span className="truncate">{step.name}</span>
                      {step.conclusion ? <span className="ml-auto flex-shrink-0">{step.conclusion}</span> : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>

        {run.detailsUrl ? (
          <Button variant="outline" size="sm" asChild className="flex-shrink-0">
            <a href={run.detailsUrl} target="_blank" rel="noopener noreferrer">
              <RiExternalLinkLine className="size-4" />
              Open
            </a>
          </Button>
        ) : null}
      </div>
    );
  }, []);

  const sendFailedChecksToChat = React.useCallback(async () => {
    setActiveMainTab('chat');

    if (!github?.prContext) {
      toast.error('GitHub runtime API unavailable');
      return;
    }
    if (!directory || !pr) return;
    if (!currentSessionId) {
      toast.error('No active session', { description: 'Open a chat session first.' });
      return;
    }

    const { currentProviderId, currentModelId, currentAgentName, currentVariant } = useConfigStore.getState();
    const lastUsedProvider = useMessageStore.getState().lastUsedProvider;
    const providerID = currentProviderId || lastUsedProvider?.providerID;
    const modelID = currentModelId || lastUsedProvider?.modelID;
    if (!providerID || !modelID) {
      toast.error('No model selected');
      return;
    }

    try {
      const context = await github.prContext(directory, pr.number, { includeDiff: false, includeCheckDetails: true });
      const runs = context.checkRuns ?? [];
      const failed = runs.filter((r) => {
        const conclusion = typeof r.conclusion === 'string' ? r.conclusion.toLowerCase() : '';
        if (!conclusion) return false;
        return !['success', 'neutral', 'skipped'].includes(conclusion);
      });

      if (failed.length === 0) {
        toast.message('No failed checks');
        return;
      }

      const visibleText = 'Review these PR failed checks and propose likely fixes. Do not implement until I confirm.';
      const instructionsText = `Use the attached checks payload.
- Summarize what is failing.
- Identify likely root cause(s).
- Propose a minimal fix plan and verification steps.
- No speculation: ask for missing info if needed.`;
      const payloadText = `GitHub PR failed checks (JSON)\n${JSON.stringify({
        repo: context.repo ?? null,
        pr: context.pr ?? null,
        failedChecks: failed,
      }, null, 2)}`;

      void useMessageStore.getState().sendMessage(
        visibleText,
        providerID,
        modelID,
        currentAgentName ?? undefined,
        currentSessionId,
        undefined,
        null,
        [
          { text: instructionsText, synthetic: true },
          { text: payloadText, synthetic: true },
        ],
        currentVariant
      ).catch((e) => {
        const message = e instanceof Error ? e.message : String(e);
        toast.error('Failed to send message', { description: message });
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      toast.error('Failed to load checks', { description: message });
    }
  }, [currentSessionId, directory, github, pr, setActiveMainTab]);

  const sendCommentsToChat = React.useCallback(async () => {
    setActiveMainTab('chat');

    if (!github?.prContext) {
      toast.error('GitHub runtime API unavailable');
      return;
    }
    if (!directory || !pr) return;
    if (!currentSessionId) {
      toast.error('No active session', { description: 'Open a chat session first.' });
      return;
    }

    const { currentProviderId, currentModelId, currentAgentName, currentVariant } = useConfigStore.getState();
    const lastUsedProvider = useMessageStore.getState().lastUsedProvider;
    const providerID = currentProviderId || lastUsedProvider?.providerID;
    const modelID = currentModelId || lastUsedProvider?.modelID;
    if (!providerID || !modelID) {
      toast.error('No model selected');
      return;
    }

    try {
      const context = await github.prContext(directory, pr.number, { includeDiff: false, includeCheckDetails: false });
      const issueComments = context.issueComments ?? [];
      const reviewComments = context.reviewComments ?? [];
      const total = issueComments.length + reviewComments.length;
      if (total === 0) {
        toast.message('No PR comments');
        return;
      }

      const visibleText = 'Review these PR comments and propose the required changes and next actions. Do not implement until I confirm.';
      const instructionsText = `Use the attached comments payload.
- Identify required vs optional changes.
- Call out intent/implementation mismatch if present.
- Propose a minimal plan and verification steps.
- No speculation: ask for missing info if needed.`;
      const payloadText = `GitHub PR comments (JSON)\n${JSON.stringify({
        repo: context.repo ?? null,
        pr: context.pr ?? null,
        issueComments,
        reviewComments,
      }, null, 2)}`;

      void useMessageStore.getState().sendMessage(
        visibleText,
        providerID,
        modelID,
        currentAgentName ?? undefined,
        currentSessionId,
        undefined,
        null,
        [
          { text: instructionsText, synthetic: true },
          { text: payloadText, synthetic: true },
        ],
        currentVariant
      ).catch((e) => {
        const message = e instanceof Error ? e.message : String(e);
        toast.error('Failed to send message', { description: message });
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      toast.error('Failed to load PR comments', { description: message });
    }
  }, [currentSessionId, directory, github, pr, setActiveMainTab]);

  const refresh = React.useCallback(async () => {
    if (!canShow) return;
    if (githubAuthChecked && githubAuthStatus?.connected === false) {
      setStatus({ connected: false });
      setError(null);
      setIsLoading(false);
      return;
    }
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
  }, [branch, canShow, directory, github, githubAuthChecked, githubAuthStatus]);

  React.useEffect(() => {
    const snapshot = pullRequestDraftSnapshots.get(snapshotKey) ?? null;
    setTitle(snapshot?.title ?? branchToTitle(branch));
    setBody(snapshot?.body ?? '');
    setDraft(snapshot?.draft ?? false);
    void refresh();
  }, [branch, refresh, snapshotKey]);

  React.useEffect(() => {
    if (githubAuthChecked && githubAuthStatus?.connected === false) {
      setStatus({ connected: false });
      setError(null);
    }
  }, [githubAuthChecked, githubAuthStatus]);

  React.useEffect(() => {
    if (!directory || !branch) {
      return;
    }
    pullRequestDraftSnapshots.set(snapshotKey, {
      title,
      body,
      draft,
      additionalContext,
    });
  }, [snapshotKey, title, body, draft, additionalContext, directory, branch]);

  const generateDescription = React.useCallback(async () => {
    if (isGenerating) return;
    if (!directory) return;
    setIsGenerating(true);
    try {
      const generated = await generatePullRequestDescription(directory, {
        base: baseBranch,
        head: branch,
        context: additionalContext,
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
  }, [baseBranch, branch, directory, isGenerating, additionalContext]);

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

  const repoUrl = status?.repo?.url || null;
  const checks = status?.checks ?? null;
  const canMerge = Boolean(status?.canMerge);
  const isConnected = Boolean(status?.connected);
  const shouldShowConnectionNotice = githubAuthChecked && status?.connected === false;
  const prVisualState = getPrVisualState(status);
  const prColorVar = prVisualState ? `var(--pr-${prVisualState})` : 'var(--status-info)';
  const PrStateIcon = prVisualState === 'draft'
    ? RiGitPrDraftLine
    : prVisualState === 'merged'
      ? RiGitMergeLine
      : prVisualState === 'closed'
        ? RiGitClosePullRequestLine
        : RiGitPullRequestLine;

  const containerClassName =
    variant === 'framed'
      ? 'rounded-xl border border-border/60 bg-background/70 overflow-hidden'
      : 'border-0 bg-transparent rounded-none';
  const headerClassName =
    variant === 'framed'
      ? 'px-3 py-2 border-b border-border/40 flex items-center justify-between gap-2'
      : 'px-0 py-3 border-b border-border/40 flex items-center justify-between gap-2';
  const bodyClassName = variant === 'framed' ? 'flex flex-col gap-3 p-3' : 'flex flex-col gap-3 py-3';

  return (
    <section className={containerClassName}>
      <div className={headerClassName}>
        <div className="flex items-center gap-2 min-w-0">
          <PrStateIcon className="size-4 shrink-0" style={{ color: pr ? prColorVar : 'var(--surface-muted-foreground)' }} />
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
      </div>

      <div className={bodyClassName}>
        {shouldShowConnectionNotice ? (
          <div className="space-y-2">
            <div className="typography-meta text-muted-foreground">
              GitHub not connected. Connect your GitHub account in settings.
            </div>
                <Button variant="outline" size="sm" onClick={openGitHubSettings} className="w-fit">
                  Open settings
                </Button>
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
                      <span style={{ color: prColorVar }}>
                        {pr.state}{pr.draft ? ' (draft)' : ''}
                      </span>
                      {pr.mergeable === false ? ' · not mergeable' : ''}
                      {pr.state === 'open' && typeof pr.mergeableState === 'string' && pr.mergeableState && pr.mergeableState !== 'unknown'
                        ? ` · ${pr.mergeableState}`
                        : ''}
                    </div>
                    <div className="mt-2 space-y-2">
                      <div className="flex flex-col sm:flex-row items-stretch gap-2">
                        {checks ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={openChecksDialog}
                            disabled={isLoadingCheckDetails}
                            className="justify-center sm:flex-1"
                          >
                            {isLoadingCheckDetails ? <RiLoader4Line className="size-4 animate-spin" /> : null}
                            Check details
                          </Button>
                        ) : null}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={sendCommentsToChat}
                          className={checks ? 'justify-center sm:flex-1' : 'justify-center'}
                        >
                          Send PR comments to chat
                        </Button>
                      </div>

                      {checks?.failure ? (
                        <Button variant="outline" size="sm" onClick={sendFailedChecksToChat} className="w-full justify-center">
                          Send failed checks to chat
                        </Button>
                      ) : null}
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

                {/* Additional Context Section */}
                {isMobile ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="typography-micro text-muted-foreground">
                        Additional context (optional)
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setIsContextSheetOpen(true)}
                      >
                        {additionalContext.trim() ? 'Edit' : 'Add'}
                      </Button>
                    </div>
                    {additionalContext.trim() && (
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center rounded-full bg-[var(--interactive-selection)] px-2 py-0.5 text-xs text-[var(--interactive-selection-foreground)]">
                          Context added
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <Collapsible open={isContextOpen} onOpenChange={setIsContextOpen}>
                    <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg border border-[var(--interactive-border)] bg-[var(--surface-elevated)] px-3 py-2 hover:bg-[var(--interactive-hover)]">
                      <span className="typography-micro text-muted-foreground">
                        Additional context (optional)
                      </span>
                      <span className="typography-micro text-[var(--primary-base)]">
                        {isContextOpen ? 'Hide' : additionalContext.trim() ? 'Edit' : 'Add'}
                      </span>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="mt-2 space-y-2 rounded-lg border border-[var(--interactive-border)] bg-[var(--surface-elevated)] p-3">
                        <Textarea
                          value={additionalContext}
                          onChange={(e) => setAdditionalContext(e.target.value)}
                          className="min-h-[100px] bg-transparent"
                          placeholder="Explain why this change is needed...&#10;Mention how to test (commands / steps)...&#10;Call out risks / rollout plan..."
                        />
                        <p className="typography-micro text-muted-foreground">
                          This text is only used to guide PR generation.
                        </p>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                )}

                {/* Mobile Sheet for Context */}
                <MobileOverlayPanel
                  open={isContextSheetOpen}
                  onClose={() => setIsContextSheetOpen(false)}
                  title="Additional context"
                  footer={
                    <Button
                      size="sm"
                      onClick={() => setIsContextSheetOpen(false)}
                      className="w-full"
                    >
                      Done
                    </Button>
                  }
                >
                  <div className="space-y-3">
                    <Textarea
                      value={additionalContext}
                      onChange={(e) => setAdditionalContext(e.target.value)}
                      className="min-h-[200px] bg-transparent"
                      placeholder="Explain why this change is needed...&#10;Mention how to test (commands / steps)...&#10;Call out risks / rollout plan..."
                      autoFocus
                    />
                    <p className="typography-micro text-muted-foreground">
                      This text is only used to guide PR generation.
                    </p>
                  </div>
                </MobileOverlayPanel>

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

      <Dialog open={checksDialogOpen} onOpenChange={setChecksDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[70vh] flex flex-col min-h-0">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RiGitPullRequestLine className="h-5 w-5" />
              Check Details
            </DialogTitle>
            <DialogDescription>
              {pr ? `PR #${pr.number}` : 'Pull request'}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto mt-2">
            {isLoadingCheckDetails ? (
              <div className="text-center text-muted-foreground py-8 flex items-center justify-center gap-2">
                <RiLoader4Line className="h-4 w-4 animate-spin" />
                Loading...
              </div>
            ) : null}

            {!isLoadingCheckDetails ? (
              <div className="space-y-3">
                {Array.isArray(checkDetails?.checkRuns) && checkDetails?.checkRuns.length > 0 ? (
                  checkDetails.checkRuns.map((run, idx) => (
                    <div key={`${run.name}-${idx}`} className="rounded-md border border-border/60 p-3">
                      {renderCheckRunSummary(run)}
                    </div>
                  ))
                ) : (
                  <div className="text-center text-muted-foreground py-8">No check details available.</div>
                )}
              </div>
            ) : null}
          </div>

          <div className="flex items-center gap-2 mt-3">
            <div className="flex-1" />
            <Button variant="outline" onClick={() => setChecksDialogOpen(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
};
