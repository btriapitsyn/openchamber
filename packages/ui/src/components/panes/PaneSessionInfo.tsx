import React from 'react';
import { RiAlertLine, RiGitBranchLine } from '@remixicon/react';
import { cn } from '@/lib/utils';
import { useSessions } from '@/sync/sync-context';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { useSessionWorktreeStore } from '@/sync/session-worktree-store';
import { formatSessionWorktreeBadge } from '@/sync/session-worktree-contract';
import { useGitBranchLabel } from '@/stores/useGitStore';
import { useProjectsStore } from '@/stores/useProjectsStore';
import { resolveProjectForSessionDirectory } from '@/lib/projectResolution';
import { resolveSessionDiffStats } from '@/components/session/sidebar/utils';

const normalize = (value: string | null | undefined): string => {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  const replaced = trimmed.replace(/\\/g, '/');
  if (replaced === '/') return '/';
  return replaced.length > 1 ? replaced.replace(/\/+$/, '') : replaced;
};

type Props = {
  sessionId: string | null;
  className?: string;
};

export const PaneSessionInfo: React.FC<Props> = ({ sessionId, className }) => {
  const sessions = useSessions();
  const session = React.useMemo(
    () => (sessionId ? sessions.find((s) => s.id === sessionId) ?? null : null),
    [sessions, sessionId],
  );

  const projects = useProjectsStore((s) => s.projects);
  const availableWorktreesByProject = useSessionUIStore((s) => s.availableWorktreesByProject);

  const worktreeMetaPath = useSessionUIStore((s) =>
    sessionId ? s.worktreeMetadata.get(sessionId)?.path ?? '' : '',
  );
  const worktreeMetaBranch = useSessionUIStore((s) =>
    sessionId ? s.worktreeMetadata.get(sessionId)?.branch?.trim() ?? null : null,
  );
  const worktreeAttachment = useSessionWorktreeStore((s) =>
    sessionId ? s.getAttachment(sessionId) : undefined,
  );

  const sessionDir = normalize(typeof session?.directory === 'string' ? session.directory : '');
  const worktreeDir = normalize(worktreeMetaPath);
  const openDirectory = worktreeDir || sessionDir;

  const project = React.useMemo(
    () => resolveProjectForSessionDirectory(projects, availableWorktreesByProject, openDirectory || null),
    [projects, availableWorktreesByProject, openDirectory],
  );
  const projectLabel = React.useMemo(() => {
    if (!project) return null;
    const label = project.label?.trim();
    if (label) return label;
    const segments = (project.path ?? '').split(/[\\/]/).filter(Boolean);
    return segments[segments.length - 1] ?? project.path ?? null;
  }, [project]);

  // Catalog branch fallback — scan worktrees for a match on the pane's directory.
  const catalogWorktreeBranch = React.useMemo(() => {
    const candidate = normalize(worktreeDir || sessionDir);
    if (!candidate) return null;
    for (const worktrees of availableWorktreesByProject.values()) {
      const match = worktrees.find((w) => normalize(w.path) === candidate);
      const branch = match?.branch?.trim();
      if (branch) return branch;
    }
    return null;
  }, [availableWorktreesByProject, worktreeDir, sessionDir]);

  const gitBranchForDirectory = useGitBranchLabel(openDirectory || null);
  const branchLabel = gitBranchForDirectory || worktreeMetaBranch || catalogWorktreeBranch;

  const diffStats = React.useMemo(
    () =>
      resolveSessionDiffStats(
        session?.summary as Parameters<typeof resolveSessionDiffStats>[0],
      ) ?? { additions: 0, deletions: 0 },
    [session?.summary],
  );
  const hasDiff = diffStats.additions > 0 || diffStats.deletions > 0;

  const worktreeBadge = React.useMemo(
    () => (worktreeAttachment ? formatSessionWorktreeBadge(worktreeAttachment) : null),
    [worktreeAttachment],
  );
  const worktreeBadgeKind = React.useMemo(() => {
    if (!worktreeAttachment) return null;
    if (worktreeAttachment.legacy) return 'legacy';
    if (worktreeAttachment.degraded) return 'degraded';
    if (worktreeAttachment.worktreeStatus === 'missing') return 'missing';
    if (worktreeAttachment.worktreeStatus === 'invalid') return 'invalid';
    if (worktreeAttachment.attentionReason) return 'attention';
    return null;
  }, [worktreeAttachment]);

  if (!projectLabel && !branchLabel && !hasDiff && !worktreeBadge) {
    return null;
  }

  return (
    <div
      className={cn(
        'flex min-w-0 items-center gap-1.5 truncate typography-micro text-[10.5px] font-normal leading-tight text-muted-foreground/75',
        className,
      )}
    >
      {projectLabel ? <span className="truncate">{projectLabel}</span> : null}
      {branchLabel ? (
        <span className="inline-flex min-w-0 items-center gap-0.5">
          <RiGitBranchLine className="h-3 w-3 flex-shrink-0 text-muted-foreground/70" />
          <span className="truncate">{branchLabel}</span>
        </span>
      ) : null}
      {hasDiff ? (
        <span className="inline-flex flex-shrink-0 items-center gap-0 text-[0.92em]">
          <span className="text-status-success/80">+{diffStats.additions}</span>
          <span className="text-muted-foreground/60">/</span>
          <span className="text-status-error/65">-{diffStats.deletions}</span>
        </span>
      ) : null}
      {worktreeBadgeKind ? (
        <span
          className={cn(
            'inline-flex min-w-0 items-center gap-0.5',
            worktreeBadgeKind === 'attention' || worktreeBadgeKind === 'invalid' || worktreeBadgeKind === 'missing'
              ? 'text-status-warning'
              : 'text-muted-foreground/60',
          )}
        >
          <RiAlertLine className="h-3 w-3 flex-shrink-0" />
          <span className="truncate">{worktreeBadge}</span>
        </span>
      ) : null}
    </div>
  );
};
