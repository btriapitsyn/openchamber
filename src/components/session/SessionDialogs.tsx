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
import { CheckSquare, Square } from '@phosphor-icons/react';
import { MobileOverlayPanel } from '@/components/ui/MobileOverlayPanel';
import { DirectoryExplorerDialog } from './DirectoryExplorerDialog';
import { cn, formatPathForDisplay } from '@/lib/utils';
import type { Session } from '@opencode-ai/sdk';
import type { WorktreeMetadata } from '@/types/worktree';
import {
  createWorktree,
  getWorktreeStatus,
  listWorktrees as listGitWorktrees,
  mapWorktreeToMetadata,
  removeWorktree,
} from '@/lib/git/worktreeService';
import { checkIsGitRepository, ensureOpenChamberIgnored, gitPush } from '@/lib/gitApi';
import { useSessionStore } from '@/stores/useSessionStore';
import { useDirectoryStore } from '@/stores/useDirectoryStore';
import { useConfigStore } from '@/stores/useConfigStore';
import { useUIStore } from '@/stores/useUIStore';
import { useDeviceInfo } from '@/lib/device';
import { sessionEvents } from '@/lib/sessionEvents';

const WORKTREE_ROOT = '.openchamber';

const renderToastDescription = (text?: string) =>
  text ? <span className="text-foreground/80 dark:text-foreground/70">{text}</span> : undefined;

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

export const SessionDialogs: React.FC = () => {
  const [newSessionTitle, setNewSessionTitle] = React.useState('');
  const [isDirectoryDialogOpen, setIsDirectoryDialogOpen] = React.useState(false);
  const [hasShownInitialDirectoryPrompt, setHasShownInitialDirectoryPrompt] = React.useState(false);
  const [worktreeMode, setWorktreeMode] = React.useState<'none' | 'create' | 'reuse'>('none');
  const [branchName, setBranchName] = React.useState<string>('');
  const [reuseSelection, setReuseSelection] = React.useState<string | null>(null);
  const [availableWorktrees, setAvailableWorktrees] = React.useState<WorktreeMetadata[]>([]);
  const [isLoadingWorktrees, setIsLoadingWorktrees] = React.useState(false);
  const [worktreeError, setWorktreeError] = React.useState<string | null>(null);
  const [isCheckingGitRepository, setIsCheckingGitRepository] = React.useState(false);
  const [isGitRepository, setIsGitRepository] = React.useState<boolean | null>(null);
  const [isCreatingSession, setIsCreatingSession] = React.useState(false);
  const ensuredIgnoreDirectories = React.useRef<Set<string>>(new Set());
  const [deleteDialog, setDeleteDialog] = React.useState<{ sessions: Session[]; dateLabel?: string } | null>(null);
  const [deleteDialogSummaries, setDeleteDialogSummaries] = React.useState<Array<{ session: Session; metadata: WorktreeMetadata }>>([]);
  const [deleteDialogShouldArchive, setDeleteDialogShouldArchive] = React.useState(false);
  const [deleteDialogShouldRemoveRemote, setDeleteDialogShouldRemoveRemote] = React.useState(false);
  const [isProcessingDelete, setIsProcessingDelete] = React.useState(false);

  const {
    createSession,
    deleteSession,
    deleteSessions,
    loadSessions,
    initializeNewOpenChamberSession,
    setWorktreeMetadata,
    setSessionDirectory,
    getWorktreeMetadata,
    isLoading,
  } = useSessionStore();
  const { currentDirectory, homeDirectory, hasPersistedDirectory, isHomeReady } = useDirectoryStore();
  const { agents } = useConfigStore();
  const { isSessionCreateDialogOpen, setSessionCreateDialogOpen } = useUIStore();
  const { isMobile, isTablet, hasTouchInput } = useDeviceInfo();
  const useMobileOverlay = isMobile || isTablet || hasTouchInput;

  const projectDirectory = React.useMemo(() => normalizeProjectDirectory(currentDirectory), [currentDirectory]);
  const sanitizedBranchName = React.useMemo(() => sanitizeBranchNameInput(branchName), [branchName]);
  const sanitizedWorktreeSlug = React.useMemo(() => sanitizeWorktreeSlug(sanitizedBranchName), [sanitizedBranchName]);
  const selectedReuseWorktree = React.useMemo(
    () => availableWorktrees.find((worktree) => worktree.path === reuseSelection) ?? null,
    [availableWorktrees, reuseSelection],
  );
  const worktreePreviewPath = React.useMemo(() => {
    if (!projectDirectory || !sanitizedWorktreeSlug) {
      return '';
    }
    return joinWorktreePath(projectDirectory, sanitizedWorktreeSlug);
  }, [projectDirectory, sanitizedWorktreeSlug]);
  const isProjectDirectoryReady = Boolean(projectDirectory);
  const worktreeControlsDisabled = !projectDirectory || isGitRepository === false || isCheckingGitRepository;
  const worktreeStatusMessage = React.useMemo(() => {
    if (!projectDirectory) {
      return null;
    }
    if (isGitRepository === false) {
      return 'Current directory is not a Git repository. Worktree options are disabled.';
    }
    return null;
  }, [projectDirectory, isGitRepository]);
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
    if (!projectDirectory) {
      return;
    }
    if (ensuredIgnoreDirectories.current.has(projectDirectory)) {
      return;
    }
    ensureOpenChamberIgnored(projectDirectory)
      .then(() => ensuredIgnoreDirectories.current.add(projectDirectory))
      .catch((error) => {
        console.warn('Failed to ensure .openchamber directory is ignored:', error);
        ensuredIgnoreDirectories.current.delete(projectDirectory);
      });
  }, [projectDirectory]);

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
    if (!isSessionCreateDialogOpen) {
      setBranchName('');
      setReuseSelection(null);
      setAvailableWorktrees([]);
      setWorktreeError(null);
      setIsLoadingWorktrees(false);
      setIsCheckingGitRepository(false);
      setIsGitRepository(null);
      setIsCreatingSession(false);
      return;
    }

    if (!projectDirectory) {
      setAvailableWorktrees([]);
      setReuseSelection(null);
      setIsGitRepository(null);
      setIsCheckingGitRepository(false);
      return;
    }

    let cancelled = false;
    setIsLoadingWorktrees(true);
    setIsCheckingGitRepository(true);
    setWorktreeError(null);

    (async () => {
      try {
        const repoStatus = await checkIsGitRepository(projectDirectory);
        if (cancelled) {
          return;
        }
        setIsGitRepository(repoStatus);

        if (!repoStatus) {
          setAvailableWorktrees([]);
          setReuseSelection(null);
          setWorktreeError(null);
        } else {
          const worktrees = await listGitWorktrees(projectDirectory);
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
        }
      } catch (error) {
        if (cancelled) {
          return;
        }
        const message = error instanceof Error ? error.message : 'Failed to load worktrees';
        setWorktreeError(message);
      } finally {
        if (!cancelled) {
          setIsLoadingWorktrees(false);
          setIsCheckingGitRepository(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isSessionCreateDialogOpen, projectDirectory]);

  React.useEffect(() => {
    if (isGitRepository === false && worktreeMode !== 'none') {
      setWorktreeMode('none');
      setBranchName('');
    }
  }, [isGitRepository, worktreeMode]);

  React.useEffect(() => {
    setWorktreeError(null);
    if (worktreeMode === 'reuse' && availableWorktrees.length > 0 && !reuseSelection) {
      setReuseSelection(availableWorktrees[0].path);
    }
  }, [worktreeMode, availableWorktrees, reuseSelection]);

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

  React.useEffect(() => {
    return sessionEvents.onDeleteRequest((payload) => {
      openDeleteDialog(payload.sessions, payload.dateLabel);
    });
  }, [openDeleteDialog]);

  React.useEffect(() => {
    return sessionEvents.onDirectoryRequest(() => {
      setIsDirectoryDialogOpen(true);
    });
  }, []);

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
      setSessionCreateDialogOpen(false);
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
              'h-7 rounded-lg px-3 typography-meta transition-colors disabled:pointer-events-none disabled:opacity-50',
              worktreeMode === 'none'
                ? 'text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
            disabled={worktreeControlsDisabled}
            onClick={() => handleSelectWorktreeMode('none')}
          >
            No worktree
          </Button>
          <Button
            type="button"
            variant={worktreeMode === 'create' ? 'default' : 'outline'}
            className={cn(
              'h-7 rounded-lg px-3 typography-meta transition-colors disabled:pointer-events-none disabled:opacity-50',
              worktreeMode === 'create'
                ? 'text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
            disabled={worktreeControlsDisabled}
            onClick={() => handleSelectWorktreeMode('create')}
          >
            Create new
          </Button>
          <Button
            type="button"
            variant={worktreeMode === 'reuse' ? 'default' : 'outline'}
            className={cn(
              'h-7 rounded-lg px-3 typography-meta transition-colors disabled:pointer-events-none disabled:opacity-50',
              worktreeMode === 'reuse'
                ? 'text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
            disabled={worktreeControlsDisabled}
            onClick={() => handleSelectWorktreeMode('reuse')}
          >
            Reuse existing
          </Button>
        </div>

        {worktreeStatusMessage && (
          <p className="typography-meta text-muted-foreground/80">
            {worktreeStatusMessage}
          </p>
        )}

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
                disabled={worktreeControlsDisabled || isLoadingWorktrees || availableWorktrees.length === 0}
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
        onClick={() => setSessionCreateDialogOpen(false)}
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

  const deleteDialogDescription = deleteDialog
    ? `This action permanently removes ${deleteDialog.sessions.length === 1 ? '1 session' : `${deleteDialog.sessions.length} sessions`}${
        deleteDialog.dateLabel ? ` from ${deleteDialog.dateLabel}` : ''
      }.`
    : '';

  const deleteDialogBody = deleteDialog ? (
    <div className="space-y-2">
      <div className="space-y-1.5 rounded-xl border border-border/40 bg-sidebar/60 p-3">
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

  return (
    <>
      {useMobileOverlay ? (
        <MobileOverlayPanel
          open={isSessionCreateDialogOpen}
          onClose={() => setSessionCreateDialogOpen(false)}
          title="Create session"
          footer={<div className="flex justify-end gap-2">{createDialogActions}</div>}
        >
          <div className="space-y-2 pb-2">
            {createDialogBody}
          </div>
        </MobileOverlayPanel>
      ) : (
        <Dialog open={isSessionCreateDialogOpen} onOpenChange={setSessionCreateDialogOpen}>
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
            {deleteDialogDescription && (
              <p className="typography-meta text-muted-foreground/80">{deleteDialogDescription}</p>
            )}
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
              {deleteDialogDescription && <DialogDescription>{deleteDialogDescription}</DialogDescription>}
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
