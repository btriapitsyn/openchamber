import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectLabel,
    SelectSeparator,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { AnimatedTabs } from '@/components/ui/animated-tabs';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { RiCheckboxBlankLine, RiCheckboxLine, RiDeleteBinLine } from '@remixicon/react';
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
import { checkIsGitRepository, ensureOpenChamberIgnored, getGitBranches } from '@/lib/gitApi';
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

type WorktreeBaseOption = {
    value: string;
    label: string;
    group: 'special' | 'local' | 'remote';
};

type WorktreeCreateMode = 'new' | 'existing';

type DeleteDialogState = {
    sessions: Session[];
    dateLabel?: string;
    mode: 'session' | 'worktree';
    worktree?: WorktreeMetadata | null;
};

export const SessionDialogs: React.FC = () => {
    const [isDirectoryDialogOpen, setIsDirectoryDialogOpen] = React.useState(false);
    const [hasShownInitialDirectoryPrompt, setHasShownInitialDirectoryPrompt] = React.useState(false);
    const [worktreeCreateMode, setWorktreeCreateMode] = React.useState<WorktreeCreateMode>('new');
    const [branchName, setBranchName] = React.useState<string>('');
    const [existingWorktreeBranch, setExistingWorktreeBranch] = React.useState<string>('');
    const [worktreeBaseBranch, setWorktreeBaseBranch] = React.useState<string>('HEAD');
    const [availableWorktreeBaseBranches, setAvailableWorktreeBaseBranches] = React.useState<WorktreeBaseOption[]>([
        { value: 'HEAD', label: 'Current (HEAD)', group: 'special' },
    ]);
    const [isLoadingWorktreeBaseBranches, setIsLoadingWorktreeBaseBranches] = React.useState(false);
    const [availableWorktrees, setAvailableWorktrees] = React.useState<WorktreeMetadata[]>([]);
    const [isLoadingWorktrees, setIsLoadingWorktrees] = React.useState(false);
    const [worktreeError, setWorktreeError] = React.useState<string | null>(null);
    const [isCheckingGitRepository, setIsCheckingGitRepository] = React.useState(false);
    const [isGitRepository, setIsGitRepository] = React.useState<boolean | null>(null);
    const [isCreatingWorktree, setIsCreatingWorktree] = React.useState(false);
    const ensuredIgnoreDirectories = React.useRef<Set<string>>(new Set());
    const [deleteDialog, setDeleteDialog] = React.useState<DeleteDialogState | null>(null);
    const [deleteDialogSummaries, setDeleteDialogSummaries] = React.useState<Array<{ session: Session; metadata: WorktreeMetadata }>>([]);
    const [deleteDialogShouldRemoveRemote, setDeleteDialogShouldRemoveRemote] = React.useState(false);
    const [isProcessingDelete, setIsProcessingDelete] = React.useState(false);

    const {
        sessions,
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
    const sanitizedNewBranchName = React.useMemo(() => sanitizeBranchNameInput(branchName), [branchName]);
    const worktreeTargetBranch = React.useMemo(
        () => (worktreeCreateMode === 'existing' ? existingWorktreeBranch.trim() : sanitizedNewBranchName),
        [existingWorktreeBranch, sanitizedNewBranchName, worktreeCreateMode],
    );
    const sanitizedWorktreeSlug = React.useMemo(() => sanitizeWorktreeSlug(worktreeTargetBranch), [worktreeTargetBranch]);
    const worktreePreviewPath = React.useMemo(() => {
        if (!projectDirectory || !sanitizedWorktreeSlug) {
            return '';
        }
        return joinWorktreePath(projectDirectory, sanitizedWorktreeSlug);
    }, [projectDirectory, sanitizedWorktreeSlug]);
    const isGitRepo = isGitRepository === true;
    const selectedWorktreeBaseLabel = React.useMemo(() => {
        const match = availableWorktreeBaseBranches.find((option) => option.value === worktreeBaseBranch);
        if (match) {
            return match.label;
        }
        if (worktreeBaseBranch === 'HEAD') {
            return 'Current (HEAD)';
        }
        return worktreeBaseBranch;
    }, [availableWorktreeBaseBranches, worktreeBaseBranch]);
    const hasDirtyWorktrees = React.useMemo(
        () =>
            (deleteDialog?.worktree?.status?.isDirty ?? false) ||
            deleteDialogSummaries.some((entry) => entry.metadata.status?.isDirty),
        [deleteDialog?.worktree?.status?.isDirty, deleteDialogSummaries],
    );
    const canRemoveRemoteBranches = React.useMemo(
        () => {
            const targetWorktree = deleteDialog?.worktree;
            if (targetWorktree && typeof targetWorktree.branch === 'string' && targetWorktree.branch.trim().length > 0) {
                return true;
            }
            return (
                deleteDialogSummaries.length > 0 &&
                deleteDialogSummaries.every(({ metadata }) => typeof metadata.branch === 'string' && metadata.branch.trim().length > 0)
            );
        },
        [deleteDialog?.worktree, deleteDialogSummaries],
    );
    const isWorktreeDelete = deleteDialog?.mode === 'worktree';
    const shouldArchiveWorktree = isWorktreeDelete;
    const removeRemoteOptionDisabled =
        isProcessingDelete || !isWorktreeDelete || !canRemoveRemoteBranches;

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
            setWorktreeCreateMode('new');
            setBranchName('');
            setExistingWorktreeBranch('');
            setWorktreeBaseBranch('HEAD');
            setAvailableWorktreeBaseBranches([{ value: 'HEAD', label: 'Current (HEAD)', group: 'special' }]);
            setIsLoadingWorktreeBaseBranches(false);
            setAvailableWorktrees([]);
            setWorktreeError(null);
            setIsLoadingWorktrees(false);
            setIsCheckingGitRepository(false);
            setIsGitRepository(null);
            setIsCreatingWorktree(false);
            return;
        }

        if (!projectDirectory) {
            setWorktreeCreateMode('new');
            setExistingWorktreeBranch('');
            setAvailableWorktreeBaseBranches([{ value: 'HEAD', label: 'Current (HEAD)', group: 'special' }]);
            setWorktreeBaseBranch('HEAD');
            setAvailableWorktrees([]);
            setIsGitRepository(null);
            setIsCheckingGitRepository(false);
            return;
        }

        let cancelled = false;
        setIsLoadingWorktrees(true);
        setIsLoadingWorktreeBaseBranches(true);
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
                    setWorktreeCreateMode('new');
                    setExistingWorktreeBranch('');
                    setAvailableWorktreeBaseBranches([{ value: 'HEAD', label: 'Current (HEAD)', group: 'special' }]);
                    setWorktreeBaseBranch('HEAD');
                    setAvailableWorktrees([]);
                    setWorktreeError(null);
                } else {
                    const [worktrees, branches] = await Promise.all([
                        listGitWorktrees(projectDirectory),
                        getGitBranches(projectDirectory).catch(() => null),
                    ]);
                    if (cancelled) {
                        return;
                    }

                    const worktreeBaseOptions: WorktreeBaseOption[] = [];
                    const headLabel = branches?.current
                        ? `Current (HEAD: ${branches.current})`
                        : 'Current (HEAD)';
                    worktreeBaseOptions.push({ value: 'HEAD', label: headLabel, group: 'special' });

                    if (branches) {
                        const localBranches = branches.all
                            .filter((name) => !name.startsWith('remotes/'))
                            .sort((a, b) => a.localeCompare(b));
                        const defaultExistingBranch = branches.current && !branches.current.startsWith('remotes/')
                            ? branches.current
                            : (localBranches[0] ?? '');
                        setExistingWorktreeBranch((previous) => {
                            const trimmed = previous.trim();
                            if (trimmed && localBranches.includes(trimmed)) {
                                return trimmed;
                            }
                            return defaultExistingBranch;
                        });

                        localBranches.forEach((name) => {
                            worktreeBaseOptions.push({ value: name, label: name, group: 'local' });
                        });

                        const remoteBranches = branches.all
                            .filter((name) => name.startsWith('remotes/'))
                            .map((name) => name.replace(/^remotes\//, ''))
                            .sort((a, b) => a.localeCompare(b));
                        remoteBranches.forEach((name) => {
                            worktreeBaseOptions.push({ value: name, label: name, group: 'remote' });
                        });
                    }

                    setAvailableWorktreeBaseBranches(worktreeBaseOptions);
                    setWorktreeBaseBranch((previous) =>
                        worktreeBaseOptions.some((option) => option.value === previous) ? previous : 'HEAD'
                    );

                    const mapped = worktrees.map((info) => mapWorktreeToMetadata(projectDirectory, info));
                    const worktreeRoot = joinWorktreePath(projectDirectory, '');
                    const worktreePrefix = `${worktreeRoot}/`;
                    const filtered = mapped.filter((item) => item.path.startsWith(worktreePrefix));
                    setAvailableWorktrees(filtered);
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
                    setIsLoadingWorktreeBaseBranches(false);
                    setIsCheckingGitRepository(false);
                }
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [isSessionCreateDialogOpen, projectDirectory]);

    const openDeleteDialog = React.useCallback((payload: { sessions: Session[]; dateLabel?: string; mode?: 'session' | 'worktree'; worktree?: WorktreeMetadata | null }) => {
        setDeleteDialog({
            sessions: payload.sessions,
            dateLabel: payload.dateLabel,
            mode: payload.mode ?? 'session',
            worktree: payload.worktree ?? null,
        });
    }, []);

    const closeDeleteDialog = React.useCallback(() => {
        setDeleteDialog(null);
        setDeleteDialogSummaries([]);
        setDeleteDialogShouldRemoveRemote(false);
        setIsProcessingDelete(false);
    }, []);

    React.useEffect(() => {
        return sessionEvents.onDeleteRequest((payload) => {
            openDeleteDialog(payload);
        });
    }, [openDeleteDialog]);

    React.useEffect(() => {
        return sessionEvents.onDirectoryRequest(() => {
            setIsDirectoryDialogOpen(true);
        });
    }, []);

    React.useEffect(() => {
        return sessionEvents.onCreateRequest(() => {
            setWorktreeCreateMode('new');
            setBranchName('');
            setExistingWorktreeBranch('');
            setWorktreeBaseBranch('HEAD');
            setWorktreeError(null);
            setSessionCreateDialogOpen(true);
        });
    }, [setSessionCreateDialogOpen]);

    React.useEffect(() => {
        if (!deleteDialog) {
            setDeleteDialogSummaries([]);
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
        setDeleteDialogShouldRemoveRemote(false);

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
        if (!canRemoveRemoteBranches) {
            setDeleteDialogShouldRemoveRemote(false);
        }
    }, [canRemoveRemoteBranches]);

    const handleBranchInputChange = React.useCallback((value: string) => {
        setBranchName(value);
        setWorktreeError(null);
    }, []);

    const refreshWorktrees = React.useCallback(async () => {
        if (!projectDirectory || !isGitRepository) {
            return;
        }
        try {
            const worktrees = await listGitWorktrees(projectDirectory);
            const mapped = worktrees.map((info) => mapWorktreeToMetadata(projectDirectory, info));
            const worktreeRoot = joinWorktreePath(projectDirectory, '');
            const worktreePrefix = `${worktreeRoot}/`;
            const filtered = mapped.filter((item) => item.path.startsWith(worktreePrefix));
            setAvailableWorktrees(filtered);
        } catch { /* ignored */ }
    }, [projectDirectory, isGitRepository]);

    const prevDeleteDialogRef = React.useRef<DeleteDialogState | null>(null);
    React.useEffect(() => {

        if (prevDeleteDialogRef.current?.mode === 'worktree' && !deleteDialog) {
            refreshWorktrees();
        }
        prevDeleteDialogRef.current = deleteDialog;
    }, [deleteDialog, refreshWorktrees]);

    const validateWorktreeCreation = React.useCallback((): boolean => {
        if (!projectDirectory) {
            const message = 'Select a project directory first.';
            setWorktreeError(message);
            toast.error(message);
            return false;
        }

        const normalizedBranch = worktreeTargetBranch;
        const slugValue = sanitizedWorktreeSlug;
        if (!normalizedBranch) {
            const message =
                worktreeCreateMode === 'existing'
                    ? 'Select an existing branch for the new worktree.'
                    : 'Provide a branch name for the new worktree.';
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

        setWorktreeError(null);
        return true;
    }, [projectDirectory, worktreeCreateMode, worktreeTargetBranch, sanitizedWorktreeSlug, availableWorktrees]);

    const handleCreateWorktree = async () => {
        if (isCreatingWorktree || isLoading) {
            return;
        }

        if (!validateWorktreeCreation()) {
            return;
        }

        setIsCreatingWorktree(true);
        setWorktreeError(null);

        let cleanupMetadata: WorktreeMetadata | null = null;

        try {
            const normalizedBranch = worktreeTargetBranch;
            const slugValue = sanitizedWorktreeSlug;
            const shouldCreateBranch = worktreeCreateMode === 'new';
            const startPoint = shouldCreateBranch && worktreeBaseBranch && worktreeBaseBranch !== 'HEAD'
                ? worktreeBaseBranch
                : undefined;
            const metadata = await createWorktree({
                projectDirectory,
                worktreeSlug: slugValue,
                branch: normalizedBranch,
                createBranch: shouldCreateBranch,
                startPoint,
            });
            cleanupMetadata = metadata;
            const status = await getWorktreeStatus(metadata.path).catch(() => undefined);
            const createdMetadata = status ? { ...metadata, status } : metadata;

            const session = await createSession(undefined, metadata.path);
            if (!session) {
                await removeWorktree({ projectDirectory, path: metadata.path, force: true }).catch(() => undefined);
                const message = 'Failed to create session for worktree';
                setWorktreeError(message);
                toast.error(message);
                return;
            }

            initializeNewOpenChamberSession(session.id, agents);
            setSessionDirectory(session.id, metadata.path);
            setWorktreeMetadata(session.id, createdMetadata);

            await refreshWorktrees();
            setBranchName('');
            setExistingWorktreeBranch('');
            toast.success('Worktree created');
        } catch (error) {
            if (cleanupMetadata) {
                await removeWorktree({ projectDirectory, path: cleanupMetadata.path, force: true }).catch(() => undefined);
            }
            const message = error instanceof Error ? error.message : 'Failed to create worktree';
            setWorktreeError(message);
            toast.error(message);
        } finally {
            setIsCreatingWorktree(false);
        }
    };

    const handleDeleteWorktree = React.useCallback((worktree: WorktreeMetadata) => {

        const worktreeSessions = sessions.filter((session) => {
            const metadata = getWorktreeMetadata(session.id);
            return metadata?.path === worktree.path;
        });

        sessionEvents.requestDelete({
            sessions: worktreeSessions,
            mode: 'worktree',
            worktree,
        });
    }, [sessions, getWorktreeMetadata]);

    const handleConfirmDelete = React.useCallback(async () => {
        if (!deleteDialog) {
            return;
        }
        setIsProcessingDelete(true);

        try {
            const archiveWorktree = shouldArchiveWorktree;
            const removeRemoteBranch = archiveWorktree && deleteDialogShouldRemoveRemote;

            if (deleteDialog.sessions.length === 1) {
                const target = deleteDialog.sessions[0];
                const success = await deleteSession(target.id, {
                    archiveWorktree,
                    deleteRemoteBranch: removeRemoteBranch,
                });
                if (!success) {
                    toast.error('Failed to delete session');
                    setIsProcessingDelete(false);
                    return;
                }
                const archiveNote = archiveWorktree
                    ? removeRemoteBranch
                        ? 'Worktree and remote branch removed.'
                        : 'Attached worktree archived.'
                    : undefined;
                toast.success('Session deleted', {
                    description: renderToastDescription(archiveNote),
                });
            } else {
                const ids = deleteDialog.sessions.map((session) => session.id);
                const { deletedIds, failedIds } = await deleteSessions(ids, {
                    archiveWorktree,
                    deleteRemoteBranch: removeRemoteBranch,
                });

                if (deletedIds.length > 0) {
                    const archiveNote = archiveWorktree
                        ? removeRemoteBranch
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
    }, [deleteDialog, deleteDialogShouldRemoveRemote, deleteSession, deleteSessions, closeDeleteDialog, shouldArchiveWorktree]);

    const worktreeManagerBody = (
        <div className="space-y-4 w-full min-w-0">
            {}
            <div className="space-y-3 rounded-xl border border-border/40 bg-sidebar/60 p-3">
                <div className="space-y-1">
                    <p className="typography-ui-label font-medium text-foreground">Create worktree</p>
                    <p className="typography-meta text-muted-foreground/80">
                        Branch-specific directory under <code className="font-mono text-xs text-muted-foreground">{WORKTREE_ROOT}</code>.
                    </p>
                </div>

                <div className="space-y-2">
                    <AnimatedTabs
                        tabs={[
                            { value: 'new', label: 'New branch' },
                            { value: 'existing', label: 'Existing branch' },
                        ]}
                        value={worktreeCreateMode}
                        onValueChange={(value) => {
                            setWorktreeCreateMode(value);
                            setWorktreeError(null);

                            if (value === 'existing' && !existingWorktreeBranch) {
                                const firstLocal = availableWorktreeBaseBranches.find((option) => option.group === 'local')?.value ?? '';
                                if (firstLocal) {
                                    setExistingWorktreeBranch(firstLocal);
                                }
                            }
                        }}
                        animate={false}
                    />

                    {worktreeCreateMode === 'new' ? (
                        <>
                            <label className="typography-meta font-medium text-foreground" htmlFor="worktree-base-branch-select">
                                Base branch
                            </label>
                            <Select
                                value={worktreeBaseBranch}
                                onValueChange={setWorktreeBaseBranch}
                                disabled={!isGitRepo || isCheckingGitRepository || isLoadingWorktreeBaseBranches}
                            >
                                <SelectTrigger
                                    id="worktree-base-branch-select"
                                    size="lg"
                                    className="w-full typography-meta text-foreground"
                                >
                                    <SelectValue placeholder={isLoadingWorktreeBaseBranches ? 'Loading branches…' : 'Select a branch'} />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectGroup>
                                        <SelectLabel>Default</SelectLabel>
                                        {availableWorktreeBaseBranches
                                            .filter((option) => option.group === 'special')
                                            .map((option) => (
                                                <SelectItem key={option.value} value={option.value}>
                                                    {option.label}
                                                </SelectItem>
                                            ))}
                                    </SelectGroup>

                                    {availableWorktreeBaseBranches.some((option) => option.group === 'local') && (
                                        <>
                                            <SelectSeparator />
                                            <SelectGroup>
                                                <SelectLabel>Local branches</SelectLabel>
                                                {availableWorktreeBaseBranches
                                                    .filter((option) => option.group === 'local')
                                                    .map((option) => (
                                                        <SelectItem key={option.value} value={option.value}>
                                                            {option.label}
                                                        </SelectItem>
                                                    ))}
                                            </SelectGroup>
                                        </>
                                    )}

                                    {availableWorktreeBaseBranches.some((option) => option.group === 'remote') && (
                                        <>
                                            <SelectSeparator />
                                            <SelectGroup>
                                                <SelectLabel>Remote branches</SelectLabel>
                                                {availableWorktreeBaseBranches
                                                    .filter((option) => option.group === 'remote')
                                                    .map((option) => (
                                                        <SelectItem key={option.value} value={option.value}>
                                                            {option.label}
                                                        </SelectItem>
                                                    ))}
                                            </SelectGroup>
                                        </>
                                    )}
                                </SelectContent>
                            </Select>

                            <label className="typography-meta font-medium text-foreground" htmlFor="worktree-branch-input">
                                New branch name
                            </label>
                            <div className="flex gap-2">
                                <Input
                                    id="worktree-branch-input"
                                    value={branchName}
                                    onChange={(e) => handleBranchInputChange(e.target.value)}
                                    placeholder="feature/new-branch"
                                    className="h-8 flex-1 typography-meta text-foreground placeholder:text-muted-foreground/70"
                                    disabled={!isGitRepo || isCheckingGitRepository}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !isCreatingWorktree) {
                                            handleCreateWorktree();
                                        }
                                    }}
                                />
                                <Button
                                    onClick={handleCreateWorktree}
                                    disabled={isCreatingWorktree || isLoading || !isGitRepo || !worktreeTargetBranch}
                                    className="h-8"
                                >
                                    {isCreatingWorktree ? 'Creating…' : 'Create'}
                                </Button>
                            </div>
                        </>
                    ) : (
                        <>
                            <label className="typography-meta font-medium text-foreground" htmlFor="worktree-existing-branch-select">
                                Existing branch
                            </label>
                            <div className="flex gap-2">
                                <Select
                                    value={existingWorktreeBranch}
                                    onValueChange={(value) => {
                                        setExistingWorktreeBranch(value);
                                        setWorktreeError(null);
                                    }}
                                    disabled={
                                        !isGitRepo
                                        || isCheckingGitRepository
                                        || isLoadingWorktreeBaseBranches
                                        || !availableWorktreeBaseBranches.some((option) => option.group === 'local')
                                    }
                                >
                                    <SelectTrigger
                                        id="worktree-existing-branch-select"
                                        size="lg"
                                        className="flex-1 typography-meta text-foreground"
                                    >
                                        <SelectValue placeholder={isLoadingWorktreeBaseBranches ? 'Loading branches…' : 'Select a branch'} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectGroup>
                                            <SelectLabel>Local branches</SelectLabel>
                                            {availableWorktreeBaseBranches
                                                .filter((option) => option.group === 'local')
                                                .map((option) => (
                                                    <SelectItem key={option.value} value={option.value}>
                                                        {option.label}
                                                    </SelectItem>
                                                ))}
                                        </SelectGroup>
                                    </SelectContent>
                                </Select>
                                <Button
                                    onClick={handleCreateWorktree}
                                    disabled={isCreatingWorktree || isLoading || !isGitRepo || !worktreeTargetBranch}
                                    className="h-8"
                                >
                                    {isCreatingWorktree ? 'Creating…' : 'Create'}
                                </Button>
                            </div>
                            {!isLoadingWorktreeBaseBranches && !availableWorktreeBaseBranches.some((option) => option.group === 'local') ? (
                                <p className="typography-micro text-muted-foreground/70">
                                    No local branches found. Fetch or create a branch first.
                                </p>
                            ) : null}
                        </>
                    )}

                    {worktreeTargetBranch ? (
                        <p className="typography-micro text-muted-foreground/70">
                            {worktreeCreateMode === 'existing' ? (
                                <>
                                    Uses branch{' '}
                                    <code className="font-mono text-xs text-muted-foreground">{worktreeTargetBranch}</code>
                                    {' '}at{' '}
                                    <code className="font-mono text-xs text-muted-foreground break-all">
                                        {formatPathForDisplay(worktreePreviewPath, homeDirectory)}
                                    </code>
                                </>
                            ) : (
                                <>
                                    Creates branch{' '}
                                    <code className="font-mono text-xs text-muted-foreground">{worktreeTargetBranch}</code>
                                    {' '}from{' '}
                                    <code className="font-mono text-xs text-muted-foreground">{selectedWorktreeBaseLabel}</code>
                                    {' '}at{' '}
                                    <code className="font-mono text-xs text-muted-foreground break-all">
                                        {formatPathForDisplay(worktreePreviewPath, homeDirectory)}
                                    </code>
                                </>
                            )}
                        </p>
                    ) : null}
                </div>

                {worktreeError && <p className="typography-meta text-destructive">{worktreeError}</p>}
                {!isGitRepo && !isCheckingGitRepository && (
                    <p className="typography-meta text-muted-foreground/70">
                        Current directory is not a Git repository.
                    </p>
                )}
            </div>

            {}
            <div className="space-y-3 rounded-xl border border-border/40 bg-sidebar/60 p-3 overflow-hidden min-w-0">
                <div className="space-y-1">
                    <p className="typography-ui-label font-medium text-foreground">Existing worktrees</p>
                </div>

                {isLoadingWorktrees ? (
                    <p className="typography-meta text-muted-foreground/70">Loading worktrees…</p>
                ) : availableWorktrees.length === 0 ? (
                    <p className="typography-meta text-muted-foreground/70">
                        No worktrees found under <code className="font-mono text-xs text-muted-foreground">{WORKTREE_ROOT}</code>.
                    </p>
                ) : (
                    <div className="space-y-1.5 min-w-0">
                        {availableWorktrees.map((worktree) => {

                            const relativePath = worktree.relativePath
                                || (worktree.path.startsWith(projectDirectory + '/')
                                    ? worktree.path.slice(projectDirectory.length + 1)
                                    : worktree.path);
                            return (
                                <div
                                    key={worktree.path}
                                    className="flex items-center gap-2 rounded-lg border border-border/30 bg-sidebar-accent/20 px-3 py-2 min-w-0"
                                >
                                    <div className="flex-1 min-w-0">
                                        <p className="typography-meta font-medium text-foreground">
                                            {worktree.label || worktree.branch || 'Detached HEAD'}
                                        </p>
                                        <p className="typography-micro text-muted-foreground/70 break-all">
                                            {relativePath}
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => handleDeleteWorktree(worktree)}
                                        className="flex-shrink-0 flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                                        aria-label={`Delete worktree ${worktree.branch || worktree.label}`}
                                    >
                                        <RiDeleteBinLine className="h-4 w-4" />
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );

    const worktreeManagerActions = (
        <Button
            variant="ghost"
            onClick={() => setSessionCreateDialogOpen(false)}
            disabled={isCreatingWorktree}
        >
            Close
        </Button>
    );

    const targetWorktree = deleteDialog?.worktree ?? deleteDialogSummaries[0]?.metadata ?? null;
    const deleteDialogDescription = deleteDialog
        ? deleteDialog.mode === 'worktree'
            ? `This removes the selected worktree and ${deleteDialog.sessions.length === 1 ? '1 linked session' : `${deleteDialog.sessions.length} linked sessions`}.`
            : `This action permanently removes ${deleteDialog.sessions.length === 1 ? '1 session' : `${deleteDialog.sessions.length} sessions`}${deleteDialog.dateLabel ? ` from ${deleteDialog.dateLabel}` : ''
            }.`
        : '';

    const deleteDialogBody = deleteDialog ? (
        <div className="space-y-2">
            <div className="space-y-1.5 rounded-xl border border-border/40 bg-sidebar/60 p-3">
                <ul className="space-y-0.5">
                    {deleteDialog.sessions.slice(0, 3).map((session) => (
                        <li key={session.id} className="typography-micro text-muted-foreground/80">
                            {session.title || 'Untitled Session'}
                        </li>
                    ))}
                    {deleteDialog.sessions.length > 3 && (
                        <li className="typography-micro text-muted-foreground/70">
                            +{deleteDialog.sessions.length - 3} more
                        </li>
                    )}
                </ul>
            </div>

            {isWorktreeDelete ? (
                <div className="space-y-2 rounded-xl border border-border/40 bg-sidebar/60 p-3">
                    <div className="flex items-center gap-2">
                        <span className="typography-meta font-medium text-foreground">Worktree</span>
                        {targetWorktree?.label ? (
                            <span className="typography-micro text-muted-foreground/70">{targetWorktree.label}</span>
                        ) : null}
                    </div>
                    <p className="typography-micro text-muted-foreground/80 break-all">
                        {targetWorktree ? formatPathForDisplay(targetWorktree.path, homeDirectory) : 'Worktree path unavailable.'}
                    </p>
                    {hasDirtyWorktrees && (
                        <p className="typography-micro text-warning">Uncommitted changes will be discarded.</p>
                    )}

                    {canRemoveRemoteBranches ? (
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
                                'flex w-full items-start gap-3 rounded-xl border border-border/40 bg-sidebar/70 px-3 py-2 text-left',
                                removeRemoteOptionDisabled
                                    ? 'cursor-not-allowed opacity-60'
                                    : 'hover:bg-sidebar/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'
                            )}
                        >
                            <span className="mt-0.5 flex size-5 items-center justify-center text-muted-foreground">
                                {deleteDialogShouldRemoveRemote ? (
                                    <RiCheckboxLine className="size-4 text-primary" />
                                ) : (
                                    <RiCheckboxBlankLine className="size-4" />
                                )}
                            </span>
                            <div className="flex-1 space-y-1">
                                <span className="typography-meta font-medium text-foreground">Delete remote branch</span>
                                <p className="typography-micro text-muted-foreground/70">
                                    {deleteDialogShouldRemoveRemote
                                        ? 'Remote branch on origin will also be removed.'
                                        : 'Keep the remote branch intact.'}
                                </p>
                            </div>
                        </button>
                    ) : (
                        <p className="typography-micro text-muted-foreground/70">
                            Remote branch information unavailable for this worktree.
                        </p>
                    )}
                </div>
            ) : (
                <div className="rounded-xl border border-border/40 bg-sidebar/60 p-3">
                    <p className="typography-meta text-muted-foreground/80">
                        Worktree directories stay intact. Subsessions linked to the selected sessions will also be removed.
                    </p>
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
                {isProcessingDelete
                    ? 'Deleting…'
                    : isWorktreeDelete
                        ? 'Delete worktree'
                        : deleteDialog?.sessions.length === 1
                            ? 'Delete session'
                            : 'Delete sessions'}
            </Button>
        </>
    );

    return (
        <>
            {useMobileOverlay ? (
                <MobileOverlayPanel
                    open={isSessionCreateDialogOpen}
                    onClose={() => setSessionCreateDialogOpen(false)}
                    title="Worktree Manager"
                    footer={<div className="flex justify-end gap-2">{worktreeManagerActions}</div>}
                >
                    <div className="space-y-2 pb-2">
                        {worktreeManagerBody}
                    </div>
                </MobileOverlayPanel>
            ) : (
                <Dialog open={isSessionCreateDialogOpen} onOpenChange={setSessionCreateDialogOpen}>
                    <DialogContent className="max-w-[min(520px,100vw-2rem)] space-y-2 pb-2 overflow-hidden">
                        <DialogHeader>
                            <DialogTitle>Worktree Manager</DialogTitle>
                        </DialogHeader>
                        {worktreeManagerBody}
                        <DialogFooter className="mt-2 gap-2 pt-1 pb-1">{worktreeManagerActions}</DialogFooter>
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
