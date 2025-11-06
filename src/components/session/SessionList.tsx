import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Plus,
  ChatCircleText as MessagesSquare,
  DotsThreeVertical as MoreVertical,
  Trash as Trash2,
  PencilSimple as Edit2,
  Check,
  X,
  WarningCircle as AlertTriangle,
  Circle,
  Export as Share2,
  Copy,
  LinkBreak as Link2Off,
  GitFork,
  CheckSquare,
  Square,
} from '@phosphor-icons/react';
import { useSessionStore } from '@/stores/useSessionStore';
import { useDirectoryStore } from '@/stores/useDirectoryStore';
import { useConfigStore } from '@/stores/useConfigStore';
import { useUIStore } from '@/stores/useUIStore';
import { useDeviceInfo } from '@/lib/device';
import { DirectoryExplorerDialog } from './DirectoryExplorerDialog';
import { cn, formatDirectoryName, formatPathForDisplay } from '@/lib/utils';
import type { Session } from '@opencode-ai/sdk';
import type { WorktreeMetadata } from '@/types/worktree';
import {
  createWorktree,
  getWorktreeStatus,
  listWorktrees as listGitWorktrees,
  mapWorktreeToMetadata,
  removeWorktree,
} from '@/lib/git/worktreeService';
import { ensureOpenChamberIgnored, gitPush } from '@/lib/gitApi';
import { MobileOverlayPanel } from '@/components/ui/MobileOverlayPanel';

const WORKTREE_ROOT = '.openchamber';

const renderToastDescription = (text?: string) => (
  text ? <span className="text-foreground/80 dark:text-foreground/70">{text}</span> : undefined
);

const sanitizeBranchNameInput = (value: string): string => {
  return value
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^A-Za-z0-9._/-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/\/{2,}/g, '/')
    .replace(/\/-+/g, '/')
    .replace(/-+\//g, '/')
    .replace(/^[-/]+/, '')
    .replace(/[-/]+$/, '');
};

const sanitizeWorktreeSlug = (value: string): string => {
  return value
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '')
    .slice(0, 120);
};

const normalizeProjectDirectory = (path: string | null | undefined): string => {
  if (!path) {
    return '';
  }
  const replaced = path.replace(/\\/g, '/');
  if (replaced === '/') {
    return '/';
  }
  return replaced.replace(/\/+$/, '');
};

const joinWorktreePath = (projectDirectory: string, slug: string): string => {
  const normalizedProject = normalizeProjectDirectory(projectDirectory);
  const cleanSlug = sanitizeWorktreeSlug(slug);
  const base =
    !normalizedProject || normalizedProject === '/'
      ? `/${WORKTREE_ROOT}`
      : `${normalizedProject}/${WORKTREE_ROOT}`;
  return cleanSlug ? `${base}/${cleanSlug}` : base;
};

export const SessionList: React.FC = () => {
  const [newSessionTitle, setNewSessionTitle] = React.useState('');
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editTitle, setEditTitle] = React.useState('');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = React.useState(false);
  const [isDirectoryDialogOpen, setIsDirectoryDialogOpen] = React.useState(false);
  const [hasShownInitialDirectoryPrompt, setHasShownInitialDirectoryPrompt] = React.useState(false);
  const [copiedSessionId, setCopiedSessionId] = React.useState<string | null>(null);
  const timeoutRef = React.useRef<number | null>(null);
  const [worktreeMode, setWorktreeMode] = React.useState<'none' | 'create' | 'reuse'>('none');
  const [branchName, setBranchName] = React.useState<string>('');
  const [reuseSelection, setReuseSelection] = React.useState<string | null>(null);
  const [availableWorktrees, setAvailableWorktrees] = React.useState<WorktreeMetadata[]>([]);
  const [isLoadingWorktrees, setIsLoadingWorktrees] = React.useState(false);
  const [worktreeError, setWorktreeError] = React.useState<string | null>(null);
  const [isCreatingSession, setIsCreatingSession] = React.useState(false);
  const ensuredIgnoreDirectories = React.useRef<Set<string>>(new Set());
  const [deleteDialog, setDeleteDialog] = React.useState<{ sessions: Session[]; dateLabel?: string } | null>(null);
  const [deleteDialogSummaries, setDeleteDialogSummaries] = React.useState<Array<{ session: Session; metadata: WorktreeMetadata }>>([]);
  const [deleteDialogShouldArchive, setDeleteDialogShouldArchive] = React.useState(false);
  const [deleteDialogShouldRemoveRemote, setDeleteDialogShouldRemoveRemote] = React.useState(false);
  const [isProcessingDelete, setIsProcessingDelete] = React.useState(false);

  const {
    currentSessionId,
    createSession,
    deleteSession,
    deleteSessions,
    setCurrentSession,
    updateSessionTitle,
    shareSession,
    unshareSession,
    loadSessions,
    getSessionsByDirectory,
    sessionMemoryState,
    initializeNewOpenChamberSession,
    setWorktreeMetadata,
    setSessionDirectory,
    getWorktreeMetadata,
    isLoading
  } = useSessionStore();

  const { currentDirectory, homeDirectory, hasPersistedDirectory, isHomeReady } = useDirectoryStore();
  const { agents } = useConfigStore();
  const { setSidebarOpen } = useUIStore();
  const { isMobile, isTablet, hasTouchInput } = useDeviceInfo();
  const shouldAlwaysShowGroupDelete = isMobile || isTablet || hasTouchInput;
  const shouldAlwaysShowSessionActions = shouldAlwaysShowGroupDelete;
  const useMobileOverlay = isMobile || isTablet;
  const projectDirectory = React.useMemo(() => normalizeProjectDirectory(currentDirectory), [currentDirectory]);
  const sanitizedBranchName = React.useMemo(
    () => sanitizeBranchNameInput(branchName),
    [branchName]
  );
  const sanitizedWorktreeSlug = React.useMemo(
    () => sanitizeWorktreeSlug(sanitizedBranchName),
    [sanitizedBranchName]
  );
  const selectedReuseWorktree = React.useMemo(
    () => availableWorktrees.find((worktree) => worktree.path === reuseSelection) ?? null,
    [availableWorktrees, reuseSelection],
  );
  const worktreePreviewPath = React.useMemo(() => {
    if (!projectDirectory) {
      return '';
    }
    if (!sanitizedWorktreeSlug) {
      return '';
    }
    return joinWorktreePath(projectDirectory, sanitizedWorktreeSlug);
  }, [projectDirectory, sanitizedWorktreeSlug]);
  const isProjectDirectoryReady = Boolean(projectDirectory);
  const hasDirtyWorktrees = React.useMemo(
    () => deleteDialogSummaries.some((entry) => entry.metadata.status?.isDirty),
    [deleteDialogSummaries],
  );
  const canRemoveRemoteBranches = React.useMemo(
    () =>
      deleteDialogSummaries.length > 0 &&
      deleteDialogSummaries.every(({ metadata }) => typeof metadata.branch === 'string' && metadata.branch.trim().length > 0),
    [deleteDialogSummaries],
  );
  const archiveOptionDisabled = isProcessingDelete;
  const removeRemoteOptionDisabled =
    isProcessingDelete || !deleteDialogShouldArchive || !canRemoveRemoteBranches;


  React.useEffect(() => {
    if (!isProjectDirectoryReady || !projectDirectory) {
      return;
    }

    if (ensuredIgnoreDirectories.current.has(projectDirectory)) {
      return;
    }

    ensureOpenChamberIgnored(projectDirectory)
      .then(() => {
        ensuredIgnoreDirectories.current.add(projectDirectory);
      })
      .catch((error) => {
        console.warn('Failed to ensure .openchamber directory is ignored:', error);
        ensuredIgnoreDirectories.current.delete(projectDirectory);
      });
  }, [isProjectDirectoryReady, projectDirectory]);

  // Load sessions on mount and when directory changes
  React.useEffect(() => {
    loadSessions();
  }, [loadSessions, currentDirectory]);

  React.useEffect(() => {
    if (!hasShownInitialDirectoryPrompt && isHomeReady && !hasPersistedDirectory) {
      setIsDirectoryDialogOpen(true);
      setHasShownInitialDirectoryPrompt(true);
    }
  }, [hasPersistedDirectory, hasShownInitialDirectoryPrompt, isHomeReady]);

  React.useEffect(() => {
    if (!isCreateDialogOpen) {
      setBranchName('');
      setReuseSelection(null);
      setAvailableWorktrees([]);
      setWorktreeError(null);
      setIsLoadingWorktrees(false);
      setIsCreatingSession(false);
      return;
    }

    if (!projectDirectory) {
      setAvailableWorktrees([]);
      setReuseSelection(null);
      return;
    }

    let cancelled = false;
    setIsLoadingWorktrees(true);
    setWorktreeError(null);

    listGitWorktrees(projectDirectory)
      .then((worktrees) => {
        if (cancelled) {
          return;
        }
        const mapped = worktrees.map((info) => mapWorktreeToMetadata(projectDirectory, info));
        const worktreeRoot = joinWorktreePath(projectDirectory, '');
        const worktreePrefix = `${worktreeRoot}/`;
        const filtered = mapped.filter((item) => item.path.startsWith(worktreePrefix));
        setAvailableWorktrees(filtered);
        if (filtered.length > 0) {
          setReuseSelection((prev) => (prev && filtered.some((item) => item.path === prev) ? prev : filtered[0].path));
        } else {
          setReuseSelection(null);
        }
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        const message = error instanceof Error ? error.message : 'Failed to load worktrees';
        setWorktreeError(message);
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingWorktrees(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isCreateDialogOpen, projectDirectory]);

  React.useEffect(() => {
    setWorktreeError(null);
    if (worktreeMode === 'reuse' && availableWorktrees.length > 0 && !reuseSelection) {
      setReuseSelection(availableWorktrees[0].path);
    }
  }, [worktreeMode, availableWorktrees, reuseSelection]);

  React.useEffect(() => {
    if (!deleteDialog) {
      setDeleteDialogSummaries([]);
      setDeleteDialogShouldArchive(false);
      setDeleteDialogShouldRemoveRemote(false);
      return;
    }

    const summaries = deleteDialog.sessions
      .map((session) => {
        const metadata = getWorktreeMetadata(session.id);
        return metadata ? { session, metadata } : null;
      })
      .filter((entry): entry is { session: Session; metadata: WorktreeMetadata } => Boolean(entry));

    setDeleteDialogSummaries(summaries);
    setDeleteDialogShouldArchive(summaries.length > 0);

    if (summaries.length === 0) {
      return;
    }

    let cancelled = false;

    (async () => {
      const statuses = await Promise.all(
        summaries.map(async ({ metadata }) => {
          if (metadata.status && typeof metadata.status.isDirty === 'boolean') {
            return metadata.status;
          }
          try {
            return await getWorktreeStatus(metadata.path);
          } catch {
            return metadata.status;
          }
        })
      ).catch((error) => {
        console.warn('Failed to inspect worktree status before deletion:', error);
        return summaries.map(({ metadata }) => metadata.status);
      });

      if (cancelled || !Array.isArray(statuses)) {
        return;
      }

      setDeleteDialogSummaries((prev) =>
        prev.map((entry, index) => ({
          session: entry.session,
          metadata: { ...entry.metadata, status: statuses[index] ?? entry.metadata.status },
        }))
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [deleteDialog, getWorktreeMetadata]);

  React.useEffect(() => {
    if (!deleteDialogShouldArchive) {
      setDeleteDialogShouldRemoveRemote(false);
    }
  }, [deleteDialogShouldArchive]);

  React.useEffect(() => {
    if (!canRemoveRemoteBranches) {
      setDeleteDialogShouldRemoveRemote(false);
    }
  }, [canRemoveRemoteBranches]);

  const handleSelectWorktreeMode = React.useCallback((mode: 'none' | 'create' | 'reuse') => {
    setWorktreeMode(mode);
    setWorktreeError(null);
    if (mode !== 'create') {
      setBranchName('');
    }
  }, []);

  const handleBranchInputChange = React.useCallback((value: string) => {
    setBranchName(value);
  }, []);

  const validateWorktreeSelection = React.useCallback((): boolean => {
    if (worktreeMode === 'create') {
      const normalizedBranch = sanitizedBranchName;
      const slugValue = sanitizedWorktreeSlug;
      if (!normalizedBranch) {
        const message = 'Provide a branch name for the new worktree.';
        setWorktreeError(message);
        toast.error(message);
        return false;
      }
      if (!slugValue) {
        const message = 'Provide a branch name that can be used as a folder.';
        setWorktreeError(message);
        toast.error(message);
        return false;
      }
      const prospectivePath = joinWorktreePath(projectDirectory, slugValue);
      if (availableWorktrees.some((worktree) => worktree.path === prospectivePath)) {
        const message = 'A worktree with this folder already exists.';
        setWorktreeError(message);
        toast.error(message);
        return false;
      }
    }

    if (worktreeMode === 'reuse') {
      if (!reuseSelection) {
        const message = 'Select a worktree to reuse.';
        setWorktreeError(message);
        toast.error(message);
        return false;
      }
    }

    setWorktreeError(null);
    return true;
  }, [worktreeMode, sanitizedBranchName, sanitizedWorktreeSlug, availableWorktrees, reuseSelection, projectDirectory]);

  const handleCreateSession = async () => {
    if (isCreatingSession || isLoading) {
      return;
    }

    if (!isProjectDirectoryReady) {
      toast.error('Select a project directory before creating a session worktree.');
      return;
    }

    if (!validateWorktreeSelection()) {
      return;
    }

    setIsCreatingSession(true);
    setWorktreeError(null);

    let createdMetadata: WorktreeMetadata | null = null;
    let cleanupMetadata: WorktreeMetadata | null = null;
    let directoryOverride: string | null = null;

    try {
      if (worktreeMode === 'create') {
        const normalizedBranch = sanitizedBranchName;
        const slugValue = sanitizedWorktreeSlug;
        const metadata = await createWorktree({
          projectDirectory,
          worktreeSlug: slugValue,
          branch: normalizedBranch,
          createBranch: true,
        });
        cleanupMetadata = metadata;
        let status = await getWorktreeStatus(metadata.path).catch(() => undefined);
        try {
          await gitPush(metadata.path, {
            remote: 'origin',
            branch: normalizedBranch,
            options: ['--set-upstream'],
          });
          status = await getWorktreeStatus(metadata.path).catch(() => status);
          toast.success(`Configured upstream for ${normalizedBranch}`);
        } catch (pushError) {
          const message =
            pushError instanceof Error ? pushError.message : 'Unable to push new worktree branch.';
          toast.warning('Worktree created locally', {
          description: renderToastDescription(`Upstream setup failed: ${message}`),
        });
        }
        createdMetadata = status ? { ...metadata, status } : metadata;
        directoryOverride = metadata.path;
      } else if (worktreeMode === 'reuse' && selectedReuseWorktree) {
        const status = await getWorktreeStatus(selectedReuseWorktree.path).catch(() => selectedReuseWorktree.status);
        createdMetadata = status ? { ...selectedReuseWorktree, status } : selectedReuseWorktree;
        directoryOverride = selectedReuseWorktree.path;
      }

      const normalizedTitle = newSessionTitle.trim();
      const session = await createSession(
        normalizedTitle.length > 0 ? normalizedTitle : undefined,
        directoryOverride
      );
      if (!session) {
        if (cleanupMetadata) {
          await removeWorktree({ projectDirectory, path: cleanupMetadata.path, force: true }).catch(() => undefined);
        }
        const message = 'Failed to create session';
        setWorktreeError(message);
        toast.error(message);
        return;
      }

      initializeNewOpenChamberSession(session.id, agents);

      const resolvedSessionDirectory =
        typeof directoryOverride === 'string' && directoryOverride.length > 0
          ? directoryOverride
          : projectDirectory && projectDirectory.length > 0
            ? projectDirectory
            : null;

      setSessionDirectory(session.id, resolvedSessionDirectory);

      if (createdMetadata) {
        setWorktreeMetadata(session.id, createdMetadata);
      } else {
        setWorktreeMetadata(session.id, null);
      }

      setNewSessionTitle('');
      setIsCreateDialogOpen(false);
    } catch (error) {
      if (cleanupMetadata) {
        await removeWorktree({ projectDirectory, path: cleanupMetadata.path, force: true }).catch(() => undefined);
      }
      const message = error instanceof Error ? error.message : 'Failed to create session';
      setWorktreeError(message);
      toast.error(message);
    } finally {
      setIsCreatingSession(false);
    }
  };

  const openDeleteDialog = React.useCallback((sessions: Session[], dateLabel?: string) => {
    setDeleteDialog({ sessions, dateLabel });
  }, []);

  const closeDeleteDialog = React.useCallback(() => {
    setDeleteDialog(null);
    setDeleteDialogSummaries([]);
    setDeleteDialogShouldArchive(false);
    setDeleteDialogShouldRemoveRemote(false);
    setIsProcessingDelete(false);
  }, []);

  const handleConfirmDelete = React.useCallback(async () => {
    if (!deleteDialog) {
      return;
    }
    setIsProcessingDelete(true);

    try {
      if (deleteDialog.sessions.length === 1) {
        const target = deleteDialog.sessions[0];
        const success = await deleteSession(target.id, {
          archiveWorktree: deleteDialogShouldArchive,
          deleteRemoteBranch: deleteDialogShouldArchive && deleteDialogShouldRemoveRemote,
        });
        if (!success) {
          toast.error('Failed to delete session');
          setIsProcessingDelete(false);
          return;
        }
        const archiveNote = deleteDialogShouldArchive && deleteDialogSummaries.length > 0
          ? deleteDialogShouldRemoveRemote
            ? 'Worktree and remote branch removed.'
            : 'Attached worktree archived.'
          : undefined;
        toast.success('Session deleted', {
          description: renderToastDescription(archiveNote),
        });
      } else {
        const ids = deleteDialog.sessions.map((session) => session.id);
        const { deletedIds, failedIds } = await deleteSessions(ids, {
          archiveWorktree: deleteDialogShouldArchive,
          deleteRemoteBranch: deleteDialogShouldArchive && deleteDialogShouldRemoveRemote,
        });

        if (deletedIds.length > 0) {
          const archiveNote = deleteDialogShouldArchive
            ? deleteDialogShouldRemoveRemote
              ? 'Archived worktrees and removed remote branches.'
              : 'Attached worktrees archived.'
            : undefined;
          const successDescription =
            failedIds.length > 0
              ? `${failedIds.length} session${failedIds.length === 1 ? '' : 's'} could not be deleted.`
              : deleteDialog.dateLabel
                ? `Removed all sessions from ${deleteDialog.dateLabel}.`
                : undefined;
          const combinedDescription = [successDescription, archiveNote].filter(Boolean).join(' ');
          toast.success(`Deleted ${deletedIds.length} session${deletedIds.length === 1 ? '' : 's'}`, {
            description: renderToastDescription(combinedDescription || undefined),
          });
        }

        if (failedIds.length > 0) {
          toast.error(`Failed to delete ${failedIds.length} session${failedIds.length === 1 ? '' : 's'}`, {
            description: renderToastDescription('Please try again in a moment.'),
          });
          if (deletedIds.length === 0) {
            setIsProcessingDelete(false);
            return;
          }
        }
      }

      closeDeleteDialog();
    } finally {
      setIsProcessingDelete(false);
    }
  }, [deleteDialog, deleteDialogShouldArchive, deleteDialogShouldRemoveRemote, deleteDialogSummaries, deleteSession, deleteSessions, closeDeleteDialog]);

  const createDialogBody = (
    <div className="space-y-3">
      <div className="space-y-2">
        <label className="typography-ui-label font-medium text-foreground" htmlFor="session-title-input">
          Session title
        </label>
        <Input
          id="session-title-input"
          value={newSessionTitle}
          onChange={(e) => setNewSessionTitle(e.target.value)}
          placeholder="Session title…"
          className="h-8 typography-meta text-foreground placeholder:text-muted-foreground/70"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !isCreatingSession) {
              handleCreateSession();
            }
          }}
        />
      </div>

      <div className="space-y-3 rounded-xl border border-border/40 bg-sidebar/60 p-3">
        <div className="space-y-1">
          <p className="typography-ui-label font-medium text-foreground">Git worktree</p>
          <p className="typography-meta text-muted-foreground/80">
            Create or reuse a branch-specific directory under <code className="font-mono text-xs text-muted-foreground">{WORKTREE_ROOT}</code>.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant={worktreeMode === 'none' ? 'default' : 'outline'}
            className={cn(
              'h-7 rounded-lg px-3 typography-meta transition-colors',
              worktreeMode === 'none'
                ? 'text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
            onClick={() => handleSelectWorktreeMode('none')}
          >
            No worktree
          </Button>
          <Button
            type="button"
            variant={worktreeMode === 'create' ? 'default' : 'outline'}
            className={cn(
              'h-7 rounded-lg px-3 typography-meta transition-colors',
              worktreeMode === 'create'
                ? 'text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
            onClick={() => handleSelectWorktreeMode('create')}
          >
            Create new
          </Button>
          <Button
            type="button"
            variant={worktreeMode === 'reuse' ? 'default' : 'outline'}
            className={cn(
              'h-7 rounded-lg px-3 typography-meta transition-colors',
              worktreeMode === 'reuse'
                ? 'text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
            onClick={() => handleSelectWorktreeMode('reuse')}
          >
            Reuse existing
          </Button>
        </div>

        {worktreeMode === 'create' && (
          <div className="space-y-2 rounded-lg border border-border/30 bg-sidebar-accent/20 p-3">
            <label className="typography-meta font-medium text-foreground" htmlFor="worktree-branch-input">
              Branch name
            </label>
            <Input
              id="worktree-branch-input"
              value={branchName}
              onChange={(e) => handleBranchInputChange(e.target.value)}
              placeholder="feature/session-branch"
              className="h-8 typography-meta text-foreground placeholder:text-muted-foreground/70"
            />
            <p className="typography-micro text-muted-foreground/70">
              A new branch is created from the current HEAD as{' '}
              <code className="font-mono text-xs text-muted-foreground">
                {sanitizedBranchName || 'session-branch'}
              </code>. The worktree folder mirrors this name:{' '}
              <code className="font-mono text-xs text-muted-foreground">
                {sanitizedWorktreeSlug || 'session-branch'}
              </code>.
            </p>
            <p className="rounded-lg bg-sidebar/70 px-3 py-1.5 typography-meta text-muted-foreground/85 break-all">
              {isProjectDirectoryReady && worktreePreviewPath
                ? formatPathForDisplay(worktreePreviewPath, homeDirectory)
                : 'Select a project directory to preview the destination path.'}
            </p>
          </div>
        )}

        {worktreeMode === 'reuse' && (
          <div className="space-y-2 rounded-lg border border-border/30 bg-sidebar-accent/20 p-3">
            <div className="space-y-2">
              <label className="typography-meta font-medium text-foreground">
                Select existing worktree
              </label>
              <Select
                value={reuseSelection ?? ''}
                onValueChange={(value) => setReuseSelection(value)}
                disabled={isLoadingWorktrees || availableWorktrees.length === 0}
              >
                <SelectTrigger className="h-8 w-full rounded-lg typography-meta text-foreground">
                  <SelectValue placeholder={isLoadingWorktrees ? 'Loading worktrees…' : 'Choose worktree'} />
                </SelectTrigger>
                <SelectContent>
                  {availableWorktrees.map((worktree) => (
                    <SelectItem key={worktree.path} value={worktree.path}>
                      <span className="typography-meta font-medium">
                        {worktree.label || worktree.branch || 'Detached HEAD'}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {isLoadingWorktrees ? (
              <p className="typography-meta text-muted-foreground/70">Loading worktrees…</p>
            ) : availableWorktrees.length === 0 ? (
              <p className="typography-meta text-muted-foreground/70">
                No worktrees detected under <code className="font-mono text-xs text-muted-foreground">{WORKTREE_ROOT}</code>.
              </p>
            ) : (
              <div className="space-y-1">
                <div className="typography-meta text-muted-foreground/80">
                  {selectedReuseWorktree?.label || selectedReuseWorktree?.branch || 'Detached HEAD'}
                </div>
                <div className="rounded-lg bg-sidebar/70 px-3 py-1.5 typography-meta text-muted-foreground/85 break-all">
                  {formatPathForDisplay(selectedReuseWorktree?.path ?? '', homeDirectory)}
                </div>
              </div>
            )}
          </div>
        )}

        {worktreeError && <p className="typography-meta text-destructive">{worktreeError}</p>}
        {!isProjectDirectoryReady && (
          <p className="typography-meta text-warning">
            Select a project directory before enabling worktree support.
          </p>
        )}
      </div>
    </div>
  );

  const createDialogActions = (
    <>
      <Button
        variant="ghost"
        onClick={() => setIsCreateDialogOpen(false)}
        disabled={isCreatingSession}
      >
        Cancel
      </Button>
      <Button
        onClick={handleCreateSession}
        disabled={
          isCreatingSession ||
          isLoading ||
          (worktreeMode === 'reuse' && availableWorktrees.length === 0) ||
          !isProjectDirectoryReady
        }
      >
        {isCreatingSession ? 'Creating…' : 'Create'}
      </Button>
    </>
  );

  const deleteDialogBody = deleteDialog ? (
    <div className="space-y-2">
      <div className="space-y-1.5 rounded-xl border border-border/40 bg-sidebar/60 p-3">
        <p className="typography-meta text-muted-foreground/80">
          {deleteDialog.sessions.length === 1
            ? `Deleting “${deleteDialog.sessions[0].title || 'Untitled Session'}”.`
            : `Deleting ${deleteDialog.sessions.length} session${deleteDialog.sessions.length === 1 ? '' : 's'}.`}
        </p>
        <ul className="space-y-0.5">
          {deleteDialog.sessions.slice(0, 3).map((session) => (
            <li key={session.id} className="typography-micro text-muted-foreground/80">
              • {session.title || 'Untitled Session'}
            </li>
          ))}
          {deleteDialog.sessions.length > 3 && (
            <li className="typography-micro text-muted-foreground/70">
              +{deleteDialog.sessions.length - 3} more
            </li>
          )}
        </ul>
      </div>

      {deleteDialogSummaries.length > 0 && (
        <div className="space-y-2 rounded-xl border border-border/40 bg-sidebar/60 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="typography-meta font-medium text-foreground">Attached worktrees</span>
            <span className="typography-micro text-muted-foreground">{deleteDialogSummaries.length}</span>
          </div>
          <div className="space-y-1.5">
            {deleteDialogSummaries.map(({ session, metadata }) => (
              <div key={session.id} className="rounded-lg border border-border/30 bg-sidebar/70 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="typography-meta font-medium text-foreground">
                    {metadata.label || metadata.branch || 'Worktree'}
                  </span>
                  {metadata.status?.isDirty && (
                    <span className="typography-micro text-warning">Uncommitted changes</span>
                  )}
                </div>
                <p className="typography-micro text-muted-foreground/80 break-all">
                  {formatPathForDisplay(metadata.path, homeDirectory)}
                </p>
                <p className="typography-micro text-muted-foreground/70">
                  Session: {session.title || 'Untitled Session'}
                </p>
              </div>
            ))}
          </div>
          <div className="space-y-2 pt-1">
            <button
              type="button"
              onClick={() => {
                if (archiveOptionDisabled) {
                  return;
                }
                setDeleteDialogShouldArchive((prev) => !prev);
              }}
              disabled={archiveOptionDisabled}
              className={cn(
                'flex w-full items-start gap-3 rounded-xl border border-border/40 bg-sidebar/70 px-3 py-2 text-left transition-colors',
                archiveOptionDisabled
                  ? 'cursor-not-allowed opacity-60'
                  : 'hover:bg-sidebar/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'
              )}
            >
              <span className="mt-0.5 flex size-5 items-center justify-center text-muted-foreground">
                {deleteDialogShouldArchive ? (
                  <CheckSquare className="size-4 text-primary" weight="fill" />
                ) : (
                  <Square className="size-4" />
                )}
              </span>
              <div className="flex-1 space-y-1">
                <span className="typography-meta font-medium text-foreground">Archive attached worktrees</span>
                <p className="typography-micro text-muted-foreground/70">
                  {deleteDialogShouldArchive
                    ? 'Worktrees will be removed from disk.'
                    : 'Worktrees remain on disk.'}
                </p>
                {deleteDialogShouldArchive && hasDirtyWorktrees && (
                  <p className="typography-micro text-warning">Uncommitted changes will be discarded.</p>
                )}
              </div>
            </button>
            <button
              type="button"
              onClick={() => {
                if (removeRemoteOptionDisabled) {
                  return;
                }
                setDeleteDialogShouldRemoveRemote((prev) => !prev);
              }}
              disabled={removeRemoteOptionDisabled}
              className={cn(
                'flex w-full items-start gap-3 rounded-xl border border-border/40 bg-sidebar/70 px-3 py-2 text-left transition-colors',
                removeRemoteOptionDisabled
                  ? 'cursor-not-allowed opacity-60'
                  : 'hover:bg-sidebar/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'
              )}
            >
              <span className="mt-0.5 flex size-5 items-center justify-center text-muted-foreground">
                {deleteDialogShouldRemoveRemote ? (
                  <CheckSquare className="size-4 text-primary" weight="fill" />
                ) : (
                  <Square className="size-4" />
                )}
              </span>
              <div className="flex-1 space-y-1">
                <span className="typography-meta font-medium text-foreground">Delete remote branches</span>
                <p className="typography-micro text-muted-foreground/70">
                  {deleteDialogShouldRemoveRemote
                    ? 'Remote branches on origin will also be removed.'
                    : 'Keep remote branches on origin.'}
                </p>
                {!deleteDialogShouldArchive && (
                  <p className="typography-micro text-muted-foreground/60">
                    Enable archiving to delete remote branches.
                  </p>
                )}
                {deleteDialogShouldArchive && !canRemoveRemoteBranches && (
                  <p className="typography-micro text-muted-foreground/60">
                    Remote branch reference unavailable for one or more worktrees.
                  </p>
                )}
              </div>
            </button>
          </div>
        </div>
      )}
    </div>
  ) : null;

  const deleteDialogActions = (
    <>
      <Button variant="ghost" onClick={closeDeleteDialog} disabled={isProcessingDelete}>
        Cancel
      </Button>
      <Button variant="destructive" onClick={handleConfirmDelete} disabled={isProcessingDelete}>
        {isProcessingDelete ? 'Deleting…' : deleteDialog?.sessions.length === 1 ? 'Delete session' : 'Delete sessions'}
      </Button>
    </>
  );

  const handleDeleteSessionGroup = (dateLabel: string, sessionsToDelete: Session[]) => {
    if (sessionsToDelete.length === 0) {
      return;
    }

    openDeleteDialog(sessionsToDelete, dateLabel);
  };

  const handleDeleteSession = (id: string) => {
    const target = directorySessions.find((session) => session.id === id);
    if (!target) {
      toast.error('Session not found');
      return;
    }

    openDeleteDialog([target]);
  };

  const handleEditSession = (session: Session) => {
    setEditingId(session.id);
    setEditTitle(session.title || '');
  };

  const handleSaveEdit = async () => {
    if (editingId && editTitle.trim()) {
      await updateSessionTitle(editingId, editTitle.trim());
      setEditingId(null);
      setEditTitle('');
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditTitle('');
  };

  const handleShareSession = async (session: Session) => {
    const result = await shareSession(session.id);
    if (result && result.share?.url) {
      toast.success('Session shared successfully', {
        description: renderToastDescription('Share URL has been generated and can be copied from the menu.'),
      });
    } else {
      toast.error('Failed to share session');
    }
  };

  const handleCopyShareUrl = (url: string, sessionId: string) => {
    navigator.clipboard.writeText(url).then(() => {
      setCopiedSessionId(sessionId);

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = window.setTimeout(() => {
        setCopiedSessionId(null);
        timeoutRef.current = null;
      }, 2000);
    }).catch(() => {
      toast.error('Failed to copy URL to clipboard');
    });
  };

  React.useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const handleUnshareSession = async (sessionId: string) => {
    const result = await unshareSession(sessionId);
    if (result) {
      toast.success('Session unshared', {
        description: renderToastDescription('The share link is no longer active.'),
      });
    } else {
      toast.error('Failed to unshare session');
    }
  };

  const formatDateFull = (dateString: string | number) => {
    const date = new Date(dateString);
    const formatted = date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
    // Remove comma after day
    return formatted.replace(',', '');
  };

  // Filter sessions by current directory
  const directorySessions = getSessionsByDirectory(currentDirectory);

  // Group sessions by date
  const groupedSessions = React.useMemo(() => {
    const groups = new Map<string, Session[]>();

    directorySessions.forEach((session) => {
      const dateKey = formatDateFull(session.time?.created || Date.now());
      if (!groups.has(dateKey)) {
        groups.set(dateKey, []);
      }
      groups.get(dateKey)!.push(session);
    });

    // Sort groups by date (newest first) and convert to array
    return Array.from(groups.entries())
      .sort((a, b) => {
        const dateA = new Date(a[1][0].time?.created || 0);
        const dateB = new Date(b[1][0].time?.created || 0);
        return dateB.getTime() - dateA.getTime();
      });
  }, [directorySessions]);

  const displayDirectory = React.useMemo(() => {
    return formatDirectoryName(currentDirectory, homeDirectory);
  }, [currentDirectory, homeDirectory]);
  const directoryTooltip = React.useMemo(() => {
    return formatPathForDisplay(currentDirectory, homeDirectory);
  }, [currentDirectory, homeDirectory]);

  return (
    <>
      <div className="flex h-full flex-col bg-sidebar">
        <div className={cn('border-b border-border/40 px-3 dark:border-white/10', isMobile ? 'mt-2 py-3' : 'py-3')}>
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h2 className="typography-ui-label font-semibold text-foreground">Sessions</h2>
                <span className="typography-meta text-muted-foreground">
                  {directorySessions.length} total
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setIsCreateDialogOpen(true)}
                  className="flex h-6 w-6 items-center justify-center text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  aria-label="Create new session"
                >
                  <Plus className="h-4 w-4" weight="bold" />
                </button>
                {isMobile && (
                  <button
                    type="button"
                    onClick={() => setSidebarOpen(false)}
                    className="flex h-6 w-6 items-center justify-center text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    aria-label="Close navigation panel"
                  >
                    <X className="h-4 w-4" weight="bold" />
                  </button>
                )}
              </div>
            </div>
          <div className="rounded-xl border border-border/40 bg-sidebar/60">
            <button
              type="button"
              onClick={() => setIsDirectoryDialogOpen(true)}
              className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-sidebar-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <div className="flex flex-1 min-w-0 flex-col">
                <span className="typography-micro text-muted-foreground">Project directory</span>
                <span
                  className="typography-ui-label font-medium text-foreground truncate"
                  title={directoryTooltip || currentDirectory || '/'}
                >
                  {displayDirectory || '/'}
                </span>
              </div>
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="space-y-1 px-3 py-2">
          {directorySessions.length === 0 ? (
              <div className="py-12 px-4 text-center text-muted-foreground">
                <MessagesSquare className="mx-auto mb-3 h-10 w-10 opacity-50" />
                <p className="typography-ui-label font-medium">No sessions in this directory</p>
                <p className="typography-meta mt-1 opacity-75">Start one to begin working here</p>
              </div>
            ) : (
              <>
                {groupedSessions.map(([dateLabel, sessions], groupIndex) => (
                  <section key={dateLabel}>
                    <header className={cn(
                      "group/date flex items-center gap-1.5 px-2 pb-1 text-muted-foreground typography-micro transition-colors",
                      groupIndex === 0 ? "pt-2" : "pt-3"
                    )}>
                      <span className="font-medium text-muted-foreground group-hover/date:text-foreground">
                        {dateLabel}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDeleteSessionGroup(dateLabel, sessions)}
                        disabled={isLoading}
                        className={cn(
                          "inline-flex h-6 items-center justify-center rounded-md px-1.5 text-muted-foreground transition-opacity duration-150",
                          "hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
                          isLoading ? "pointer-events-none opacity-50" : "",
                          shouldAlwaysShowGroupDelete
                            ? ""
                            : "opacity-0 pointer-events-none group-hover/date:opacity-100 group-hover/date:pointer-events-auto focus-visible:opacity-100 focus-visible:pointer-events-auto"
                        )}
                        aria-label={`Delete all sessions from ${dateLabel}`}
                        title="Delete all sessions for this date"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </header>

                    {/* Sessions in this date group */}
                    {sessions.map((session) => {
                      const worktree = getWorktreeMetadata(session.id);
                      const worktreeBadgeLabel = worktree?.label || worktree?.branch || null;
                      const worktreeTooltipPath = worktree ? formatPathForDisplay(worktree.path, homeDirectory) : null;
                      return (
                        <div
                          key={session.id}
                          className="group/session transition-all duration-200"
                        >
                          {editingId === session.id ? (
                          <div className="flex items-center gap-1 py-1.5 px-2">
                            <Input
                              value={editTitle}
                              onChange={(e) => setEditTitle(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveEdit();
                                if (e.key === 'Escape') handleCancelEdit();
                              }}
                              className="h-6 typography-meta"
                              autoFocus
                            />
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6 flex-shrink-0"
                              onClick={handleSaveEdit}
                            >
                              <Check className="h-3.5 w-3.5" weight="bold" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6 flex-shrink-0"
                              onClick={handleCancelEdit}
                            >
                              <X className="h-3.5 w-3.5" weight="bold" />
                            </Button>
                          </div>
                          ) : (
                          <div className="relative">
                            <div className="w-full flex items-center justify-between py-1.5 px-2 pr-1">
                              <button
                                onClick={() => {
                                  setCurrentSession(session.id);
                                  // Auto-hide sidebar on mobile after session selection
                                  if (isMobile) {
                                    setSidebarOpen(false);
                                  }
                                }}
                                className="flex-1 text-left overflow-hidden"
                                inputMode="none"
                                tabIndex={0}
                              >
                                <div className="flex items-center gap-2">
                                  <div className="flex min-w-0 flex-1 items-center gap-2">
                                    <div
                                      className={cn(
                                        "typography-ui-label font-medium truncate flex-1 transition-colors",
                                        currentSessionId === session.id
                                          ? "text-primary"
                                          : "text-foreground hover:text-primary/80"
                                      )}
                                    >
                                      {session.title || 'Untitled Session'}
                                    </div>
                                    {worktreeTooltipPath && (
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <span className="typography-micro whitespace-nowrap rounded-full bg-primary/15 px-1.5 py-0.5 text-primary">
                                            <GitFork className="h-3 w-3" weight="bold" />
                                          </span>
                                        </TooltipTrigger>
                                        <TooltipContent align="start" className="space-y-1">
                                          {worktreeBadgeLabel && (
                                            <p className="typography-micro font-semibold text-muted-foreground/80">
                                              {worktreeBadgeLabel}
                                            </p>
                                          )}
                                          <p className="typography-micro text-muted-foreground/80">
                                            {worktreeTooltipPath}
                                          </p>
                                          {worktree?.status?.isDirty && (
                                            <p className="typography-micro text-muted-foreground/80">
                                              Uncommitted changes present
                                            </p>
                                          )}
                                          {typeof worktree?.status?.ahead === 'number' || typeof worktree?.status?.behind === 'number' ? (
                                            <p className="typography-micro text-muted-foreground/80">
                                              {(worktree?.status?.ahead ?? 0) > 0 ? `${worktree?.status?.ahead} ahead` : ''}
                                              {(worktree?.status?.ahead ?? 0) > 0 && (worktree?.status?.behind ?? 0) > 0 ? ' · ' : ''}
                                              {(worktree?.status?.behind ?? 0) > 0 ? `${worktree?.status?.behind} behind` : ''}
                                            </p>
                                          ) : null}
                                        </TooltipContent>
                                      </Tooltip>
                                    )}
                                  </div>

                                  {/* Share indicator */}
                                  {session.share && (
                                    <div className="flex items-center" title="Session is shared">
                                      <Share2 className="h-3 w-3 text-blue-500" />
                                    </div>
                                  )}

                                  {/* Streaming and memory state indicators */}
                                  {(() => {
                                    const memoryState = sessionMemoryState.get(session.id);
                                    if (!memoryState) return null;

                                    // Show zombie warning
                                    if (memoryState.isZombie) {
                                      return (
                                        <div className="flex items-center gap-1" title="Stream timeout - may be incomplete">
                                          <AlertTriangle className="h-3 w-3 text-warning" />
                                        </div>
                                      );
                                    }

                                    // Show streaming indicator for background sessions
                                    if (memoryState.isStreaming && session.id !== currentSessionId) {
                                      return (
                                        <div className="flex items-center gap-1">
                                          <Circle className="h-2 w-2 fill-primary text-primary animate-pulse" weight="regular" />
                                          {memoryState.backgroundMessageCount > 0 && (
                                            <span className="typography-micro bg-primary/20 text-primary px-1.5 py-0.5 rounded-full font-medium">
                                              {memoryState.backgroundMessageCount}
                                            </span>
                                          )}
                                        </div>
                                      );
                                    }

                                    return null;
                                  })()}
                                </div>
                              </button>

                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className={cn(
                                      "h-6 w-6 flex-shrink-0 -mr-1 transition-opacity",
                                      shouldAlwaysShowSessionActions
                                        ? "opacity-100"
                                        : "opacity-0 group-hover/session:opacity-100 focus-visible:opacity-100"
                                    )}
                                  >
                                    <MoreVertical weight="regular" className="h-3.5 w-3.5" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-fit min-w-20">
                                  <div className="px-2 py-1.5 typography-meta text-muted-foreground border-b border-border mb-1 text-center">
                                    {formatDateFull(session.time?.created || Date.now())}
                                  </div>
                                  <DropdownMenuItem
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleEditSession(session);
                                    }}
                                  >
                                    <Edit2 className="h-4 w-4 mr-px" />
                                    Rename
                                  </DropdownMenuItem>

                                  {/* Share options */}
                                  {!session.share ? (
                                    <DropdownMenuItem
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleShareSession(session);
                                      }}
                                    >
                                      <Share2 className="h-4 w-4 mr-px" />
                                      Share
                                    </DropdownMenuItem>
                                  ) : (
                                    <>
                                      <DropdownMenuItem
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          if (session.share?.url) {
                                            handleCopyShareUrl(session.share.url, session.id);
                                          }
                                        }}
                                      >
                                        {copiedSessionId === session.id ? (
                                          <>
                                            <Check className="h-4 w-4 mr-px" style={{ color: 'var(--status-success)' }} weight="bold" />
                                            Copied
                                          </>
                                        ) : (
                                          <>
                                            <Copy className="h-4 w-4 mr-px" />
                                            Copy Share URL
                                          </>
                                        )}
                                      </DropdownMenuItem>
                                      <DropdownMenuItem
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleUnshareSession(session.id);
                                        }}
                                      >
                                        <Link2Off className="h-4 w-4 mr-px" />
                                        Unshare
                                      </DropdownMenuItem>
                                    </>
                                  )}

                                  <DropdownMenuItem
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDeleteSession(session.id);
                                    }}
                                    className="text-destructive focus:text-destructive"
                                  >
                                    <Trash2 className="h-4 w-4 mr-px" />
                                    Delete
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </div>
                        )}
                        </div>
                      );
                    })}
                  </section>
                ))}
              </>
            )}
          </div>
        </div>
      </div>
      {useMobileOverlay ? (
        <MobileOverlayPanel
          open={isCreateDialogOpen}
          onClose={() => setIsCreateDialogOpen(false)}
          title="Create session"
          footer={<div className="flex justify-end gap-2">{createDialogActions}</div>}
        >
          <div className="space-y-2 pb-2">
            {createDialogBody}
          </div>
        </MobileOverlayPanel>
      ) : (
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogContent className="max-w-[min(520px,100vw-2rem)] space-y-2 pb-2">
            {createDialogBody}
            <DialogFooter className="mt-2 gap-2 pt-1 pb-1">{createDialogActions}</DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      {useMobileOverlay ? (
        <MobileOverlayPanel
          open={Boolean(deleteDialog)}
          onClose={() => {
            if (isProcessingDelete) {
              return;
            }
            closeDeleteDialog();
          }}
          title={deleteDialog?.sessions.length === 1 ? 'Delete session' : 'Delete sessions'}
          footer={<div className="flex justify-end gap-2">{deleteDialogActions}</div>}
        >
          <div className="space-y-2 pb-2">
            <p className="typography-meta text-muted-foreground/80">
              This action permanently removes the selected session
              {deleteDialog && deleteDialog.sessions.length > 1 ? 's' : ''}
              {deleteDialog?.dateLabel ? ` · Sessions from ${deleteDialog.dateLabel} will be removed.` : ''}
            </p>
            {deleteDialogBody}
          </div>
        </MobileOverlayPanel>
      ) : (
        <Dialog
          open={Boolean(deleteDialog)}
          onOpenChange={(open) => {
            if (!open) {
              if (isProcessingDelete) {
                return;
              }
              closeDeleteDialog();
            }
          }}
        >
          <DialogContent className="max-w-[min(520px,100vw-2rem)] space-y-2 pb-2">
            <DialogHeader>
              <DialogTitle>{deleteDialog?.sessions.length === 1 ? 'Delete session' : 'Delete sessions'}</DialogTitle>
              <DialogDescription>
                This action permanently removes the selected session
                {deleteDialog && deleteDialog.sessions.length > 1 ? 's' : ''}
                {deleteDialog?.dateLabel ? ` · Sessions from ${deleteDialog.dateLabel} will be removed.` : ''}
              </DialogDescription>
            </DialogHeader>
            {deleteDialogBody}
            <DialogFooter className="mt-2 gap-2 pt-1 pb-1">{deleteDialogActions}</DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      <DirectoryExplorerDialog
        open={isDirectoryDialogOpen}
        onOpenChange={setIsDirectoryDialogOpen}
      />
    </>
  );
};

// Custom comparison function for SessionList memoization
const areSessionListPropsEqual = () => {
  // SessionList doesn't receive direct props - it uses store hooks internally
  // The memoization will prevent re-renders when parent component updates
  // but the actual data hasn't changed due to store state stability
  return true;
};

export const MemoizedSessionList = React.memo(SessionList, areSessionListPropsEqual);
