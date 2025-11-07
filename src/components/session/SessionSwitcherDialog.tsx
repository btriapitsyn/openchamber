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
import {
  CommandDialog,
  CommandInput,
} from '@/components/ui/command';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
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
  CheckSquare,
  Square,
  CaretDown,
  CaretRight,
  GitFork,
  MagnifyingGlass as SearchIcon,
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
import { checkIsGitRepository, ensureOpenChamberIgnored, gitPush } from '@/lib/gitApi';
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

export const SessionSwitcherDialog: React.FC = () => {
  const [newSessionTitle, setNewSessionTitle] = React.useState('');
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editTitle, setEditTitle] = React.useState('');
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
  const {
    isSessionCreateDialogOpen,
    setSessionCreateDialogOpen,
    isSessionSwitcherOpen,
    setSessionSwitcherOpen,
  } = useUIStore();
  const { isMobile, isTablet, hasTouchInput } = useDeviceInfo();
  const shouldAlwaysShowGroupDelete = isMobile || isTablet || hasTouchInput;
  const shouldAlwaysShowSessionActions = shouldAlwaysShowGroupDelete;
  const useMobileOverlay = isMobile || isTablet || hasTouchInput;
  const [searchQuery, setSearchQuery] = React.useState('');
  const [expandedGroups, setExpandedGroups] = React.useState<Record<string, boolean>>({});
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
    const targetDate = new Date(dateString);
    const today = new Date();

    const isSameDay = (a: Date, b: Date) =>
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate();

    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    if (isSameDay(targetDate, today)) {
      return 'Today';
    }

    if (isSameDay(targetDate, yesterday)) {
      return 'Yesterday';
    }

    const formatted = targetDate.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
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

  const normalizedQuery = searchQuery.trim().toLowerCase();

  const filteredGroups = React.useMemo(() => {
    if (!normalizedQuery) {
      return groupedSessions;
    }

    return groupedSessions
      .map(([label, sessions]) => {
        const filtered = sessions.filter((session) => {
          const worktree = getWorktreeMetadata(session.id);
          const metadataText = [
            session.title || 'Untitled Session',
            worktree?.label,
            worktree?.branch,
            session.share?.url,
            formatDateFull(session.time?.created || Date.now()),
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
          return metadataText.includes(normalizedQuery);
        });
        return [label, filtered] as [string, Session[]];
      })
      .filter(([, sessions]) => sessions.length > 0);
  }, [groupedSessions, normalizedQuery, getWorktreeMetadata]);

  React.useEffect(() => {
    setExpandedGroups((prev) => {
      const next: Record<string, boolean> = {};
      filteredGroups.forEach(([label], index) => {
        if (normalizedQuery.length > 0) {
          next[label] = true;
        } else if (Object.prototype.hasOwnProperty.call(prev, label)) {
          next[label] = prev[label];
        } else {
          next[label] = index < 5;
        }
      });
      return next;
    });
  }, [filteredGroups, normalizedQuery]);

  const handleGroupToggle = React.useCallback((label: string, open: boolean) => {
    setExpandedGroups((prev) => ({ ...prev, [label]: open }));
  }, []);

  const displayDirectory = React.useMemo(() => {
    return formatDirectoryName(currentDirectory, homeDirectory);
  }, [currentDirectory, homeDirectory]);
  const directoryTooltip = React.useMemo(() => {
    return formatPathForDisplay(currentDirectory, homeDirectory);
  }, [currentDirectory, homeDirectory]);

  const handleCloseSwitcher = React.useCallback(() => {
    setSessionSwitcherOpen(false);
    setSearchQuery('');
    setEditingId(null);
  }, [setSessionSwitcherOpen]);

  const handleSessionSelect = React.useCallback((sessionId: string) => {
    setCurrentSession(sessionId);
    handleCloseSwitcher();
  }, [handleCloseSwitcher, setCurrentSession]);

  const handleDialogOpenChange = React.useCallback(
    (open: boolean) => {
      if (open) {
        setSessionSwitcherOpen(true);
      } else {
        handleCloseSwitcher();
      }
    },
    [handleCloseSwitcher, setSessionSwitcherOpen]
  );

  const isSearchActive = normalizedQuery.length > 0;

  const handleOpenCreateSession = React.useCallback(() => {
    setSessionCreateDialogOpen(true);
    setSessionSwitcherOpen(false);
  }, [setSessionCreateDialogOpen, setSessionSwitcherOpen]);

  const renderDirectoryAndAction = () => (
    <div
      className={cn(
        'flex w-full gap-2',
        useMobileOverlay ? 'items-stretch' : 'items-center'
      )}
    >
      <button
        type="button"
        onClick={() => setIsDirectoryDialogOpen(true)}
        className={cn(
          'flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-border/40 bg-card/40 px-3 py-2 text-left transition-colors hover:border-border/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
          useMobileOverlay && 'h-11'
        )}
      >
        <span className={cn('flex min-w-0 flex-1 items-center gap-2 truncate typography-ui-label font-semibold text-foreground', useMobileOverlay ? '' : '')}>
          {!useMobileOverlay && (
            <span className="typography-micro text-muted-foreground">Project directory:</span>
          )}
          <span className="truncate" title={directoryTooltip || currentDirectory || '/'}>
            {displayDirectory || '/'}
          </span>
        </span>
        <span className="typography-meta text-muted-foreground whitespace-nowrap">
          {directorySessions.length} sessions
        </span>
      </button>
      {useMobileOverlay ? (
        <button
          type="button"
          onClick={handleOpenCreateSession}
          className="flex h-11 w-11 flex-none items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-none transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-label="Create new session"
        >
          <Plus className="h-5 w-5" weight="bold" />
        </button>
      ) : (
        <Button
          type="button"
          onClick={handleOpenCreateSession}
          className="gap-2 whitespace-nowrap rounded-lg px-3"
          aria-label="Create new session"
        >
          <Plus className="h-5 w-5" weight="bold" />
          <span>New session</span>
        </Button>
      )}
    </div>
  );

  const renderSessionRow = (session: Session) => {
    const worktree = getWorktreeMetadata(session.id);
    const worktreeBadgeLabel = worktree?.label || worktree?.branch || null;
    const memoryState = sessionMemoryState.get(session.id);
    const isActive = currentSessionId === session.id;

    if (editingId === session.id) {
      return (
        <div key={session.id} className="flex items-center gap-2 rounded-lg border border-border/60 bg-background px-2 py-1.5">
          <Input
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSaveEdit();
              if (e.key === 'Escape') handleCancelEdit();
            }}
            className="h-8 typography-meta"
            autoFocus
          />
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 flex-shrink-0"
            onClick={handleSaveEdit}
          >
            <Check className="h-4 w-4" weight="bold" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 flex-shrink-0"
            onClick={handleCancelEdit}
          >
            <X className="h-4 w-4" weight="bold" />
          </Button>
        </div>
      );
    }

    const streamingIndicator = (() => {
      if (!memoryState) return null;

      if (memoryState.isZombie) {
        return (
          <div className="flex items-center" title="Stream timeout - message may be incomplete">
            <AlertTriangle className="h-4 w-4 text-warning" />
          </div>
        );
      }

      if (memoryState.isStreaming && session.id !== currentSessionId) {
        return (
          <div className="flex items-center gap-1" title="Assistant is responding in this session">
            <Circle className="h-2.5 w-2.5 animate-pulse text-primary" weight="fill" />
            {memoryState.backgroundMessageCount > 0 && (
              <span className="typography-micro rounded-full bg-primary/15 px-1.5 py-0.5 text-primary">
                {memoryState.backgroundMessageCount}
              </span>
            )}
          </div>
        );
      }

      return null;
    })();

  return (
    <div
      key={session.id}
      className={cn(
        'group/session rounded-lg px-2 py-0.5 transition-colors',
        isActive && 'text-primary'
      )}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => handleSessionSelect(session.id)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        >
          <span
            className={cn(
              'typography-ui-label font-semibold text-foreground truncate',
              isActive && 'text-primary'
            )}
          >
            {session.title || 'Untitled Session'}
          </span>
        </button>

        <div className="flex items-center gap-1 whitespace-nowrap">
          {worktree && (
            <span
              className="inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs font-semibold"
              style={{
                color: 'var(--status-success)',
                backgroundColor: 'var(--status-success-background)',
                borderColor: 'var(--status-success-border)'
              }}
              title={worktreeBadgeLabel || worktree.path}
            >
              <GitFork className="h-3.5 w-3.5" weight="regular" style={{ color: 'var(--status-success)' }} />
              <span className="text-xs">{worktreeBadgeLabel || worktree.path}</span>
            </span>
          )}
          {session.share && (
            <span
              className="inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs font-semibold"
              style={{
                color: 'var(--status-info)',
                backgroundColor: 'var(--status-info-background)',
                borderColor: 'var(--status-info-border)'
              }}
            >
              <Share2 className="h-3.5 w-3.5" style={{ color: 'var(--status-info)' }} />
              Shared
            </span>
          )}
          {streamingIndicator}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      'inline-flex h-7 items-center justify-center rounded-md px-1 text-muted-foreground transition-opacity hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
                      shouldAlwaysShowSessionActions
                        ? 'opacity-100'
                        : 'opacity-0 group-hover/session:opacity-100 focus-visible:opacity-100'
                    )}
                  >
                    <MoreVertical weight="regular" className="h-4 w-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingId(session.id);
                      setEditTitle(session.title || '');
                    }}
                  >
                    <Edit2 className="h-4 w-4 mr-px" />
                    Rename
                  </DropdownMenuItem>
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
                          Copy link
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
      </div>
    );
  };

  const renderSessionSections = () => {
    if (filteredGroups.length === 0) {
      return (
        <div className="py-12 px-4 text-center text-muted-foreground">
          <MessagesSquare className="mx-auto mb-3 h-10 w-10 opacity-50" />
          <p className="typography-ui-label font-medium">No sessions found</p>
          <p className="typography-meta mt-1 opacity-75">
            {directorySessions.length === 0 ? 'Create your first session' : 'Try a different search term'}
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-0.5">
        {filteredGroups.map(([dateLabel, sessions], groupIndex) => {
          const isExpanded = isSearchActive ? true : expandedGroups[dateLabel] ?? groupIndex < 5;
          const sessionCountLabel = sessions.length === 1 ? '1 session' : `${sessions.length} sessions`;
          const groupLabel = `${dateLabel} (${sessionCountLabel})`;

          return (
            <section key={dateLabel} className="rounded-xl bg-card/20 px-1 py-0.5 transition-none">
              <Collapsible
                open={isExpanded}
                onOpenChange={(open) => handleGroupToggle(dateLabel, open)}
              >
                <CollapsibleTrigger asChild className="justify-start px-0 py-0">
                  <div className="group/date flex items-center gap-2 rounded-md px-1 py-0.5 text-left transition-none hover:bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60">
                    {isExpanded ? (
                      <CaretDown className="h-4 w-4 text-muted-foreground" weight="regular" />
                    ) : (
                      <CaretRight className="h-4 w-4 text-muted-foreground" weight="regular" />
                    )}
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleDeleteSessionGroup(dateLabel, sessions);
                      }}
                      disabled={isLoading}
                      className="inline-flex h-6 px-1 items-center justify-center rounded-md text-muted-foreground hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:pointer-events-none disabled:opacity-50"
                      aria-label={`Delete all sessions from ${dateLabel}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                    <span className="typography-meta font-semibold text-muted-foreground/90">
                      {groupLabel}
                    </span>
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="space-y-1 pb-2">
                    {sessions.map((session) => renderSessionRow(session))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </section>
          );
        })}
      </div>
    );
  };

  return (
    <>
      {useMobileOverlay ? (
        <MobileOverlayPanel
          open={isSessionSwitcherOpen}
          onClose={handleCloseSwitcher}
          title="Sessions"
        >
          <div className="space-y-3 pb-2">
            <div className="flex h-11 items-center gap-2 rounded-lg border border-border/50 bg-background px-3">
              <SearchIcon className="h-4 w-4 text-muted-foreground" />
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search sessions..."
                className="flex-1 bg-transparent text-foreground outline-none placeholder:text-muted-foreground typography-meta"
              />
            </div>
            {renderDirectoryAndAction()}
            {renderSessionSections()}
          </div>
        </MobileOverlayPanel>
      ) : (
        <CommandDialog
          open={isSessionSwitcherOpen}
          onOpenChange={handleDialogOpenChange}
          title="Session switcher"
          description="Select a session to continue"
          className="max-w-[720px]"
        >
          <CommandInput
            placeholder="Search sessions..."
            value={searchQuery}
            onValueChange={setSearchQuery}
          />
          <div className="border-b border-border/60 px-3 py-3 space-y-3">
            {renderDirectoryAndAction()}
          </div>
          <div className="max-h-[min(70vh,600px)] overflow-y-auto px-2 py-3">
            {renderSessionSections()}
          </div>
        </CommandDialog>
      )}
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
