import React from 'react';
import { useSessionStore } from '@/stores/useSessionStore';
import { useFireworksCelebration } from '@/contexts/FireworksContext';
import type {
  GitStatus,
  GitBranch,
  GitLogResponse,
  GitIdentitySummary,
  GitIdentityProfile,
  GitLogEntry,
} from '@/lib/api/types';
import { useGitIdentitiesStore } from '@/stores/useGitIdentitiesStore';
import { useDirectoryStore } from '@/stores/useDirectoryStore';
import { Button } from '@/components/ui/button';
import { ButtonLarge } from '@/components/ui/button-large';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { RiAddLine, RiAiGenerate2, RiArrowDownLine, RiArrowDownSLine, RiArrowUpLine, RiBriefcaseLine, RiCheckboxBlankLine, RiCheckboxLine, RiCodeLine, RiGitBranchLine, RiGitCommitLine, RiGraduationCapLine, RiHeartLine, RiHomeLine, RiLoader4Line, RiRefreshLine, RiUser3Line } from '@remixicon/react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { Session } from '@opencode-ai/sdk';
import { useRuntimeAPIs } from '@/hooks/useRuntimeAPIs';

type SyncAction = 'fetch' | 'pull' | 'push' | null;
type CommitAction = 'commit' | 'commitAndPush' | null;

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

const renderToastDescription = (text?: string) =>
  text ? <span className="text-foreground/80 dark:text-foreground/70">{text}</span> : undefined;

const LOG_SIZE_OPTIONS = [
  { label: '25 commits', value: 25 },
  { label: '50 commits', value: 50 },
  { label: '100 commits', value: 100 },
];

type GitTabSnapshot = {
  directory?: string;
  isGitRepo: boolean | null;
  status: GitStatus | null;
  selectedPaths: string[];
  commitMessage: string;
};

let gitTabSnapshot: GitTabSnapshot | null = null;

export const GitTab: React.FC = () => {
  const { git } = useRuntimeAPIs();
  const { currentSessionId, sessions, worktreeMetadata: worktreeMap } = useSessionStore();
  const currentSession = sessions.find((session) => session.id === currentSessionId);
  type SessionWithDirectory = Session & { directory?: string };
  const worktreeMetadata = currentSessionId ? worktreeMap.get(currentSessionId) ?? undefined : undefined;
  const sessionDirectory: string | undefined = (currentSession as SessionWithDirectory | undefined)?.directory;
  const { currentDirectory: fallbackDirectory } = useDirectoryStore();
  const currentDirectory: string | undefined =
    worktreeMetadata?.path ?? sessionDirectory ?? fallbackDirectory ?? undefined;

  const { profiles, globalIdentity, loadProfiles, loadGlobalIdentity } = useGitIdentitiesStore();

  const initialSnapshot = React.useMemo(() => {
    if (!gitTabSnapshot) return null;
    if (gitTabSnapshot.directory !== currentDirectory) return null;
    return gitTabSnapshot;
  }, [currentDirectory]);

  const [isGitRepo, setIsGitRepo] = React.useState<boolean | null>(initialSnapshot?.isGitRepo ?? null);
  const [status, setStatus] = React.useState<GitStatus | null>(initialSnapshot?.status ?? null);
  const [branches, setBranches] = React.useState<GitBranch | null>(null);
  const [log, setLog] = React.useState<GitLogResponse | null>(null);
  const [currentIdentity, setCurrentIdentity] = React.useState<GitIdentitySummary | null>(null);
  const [commitMessage, setCommitMessage] = React.useState(initialSnapshot?.commitMessage ?? '');
  const [newBranchName, setNewBranchName] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(false);
  const sanitizedNewBranch = React.useMemo(
    () => sanitizeBranchNameInput(newBranchName),
    [newBranchName]
  );
  const [isLogLoading, setIsLogLoading] = React.useState(false);
  const [syncAction, setSyncAction] = React.useState<SyncAction>(null);
  const [commitAction, setCommitAction] = React.useState<CommitAction>(null);
  const [creatingBranch, setCreatingBranch] = React.useState(false);
  const [lastSyncMessage, setLastSyncMessage] = React.useState<string | null>(null);
  const [logMaxCount, setLogMaxCount] = React.useState<number>(25);
  const [isSettingIdentity, setIsSettingIdentity] = React.useState(false);
  const [branchPickerOpen, setBranchPickerOpen] = React.useState(false);
  const [branchSearch, setBranchSearch] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const { triggerFireworks } = useFireworksCelebration();

  const [selectedPaths, setSelectedPaths] = React.useState<Set<string>>(
    () => new Set(initialSnapshot?.selectedPaths ?? [])
  );
  const [hasUserAdjustedSelection, setHasUserAdjustedSelection] = React.useState(false);
  const [revertingPaths, setRevertingPaths] = React.useState<Set<string>>(new Set());
  const [isGeneratingMessage, setIsGeneratingMessage] = React.useState(false);
  const [generatedHighlights, setGeneratedHighlights] = React.useState<string[]>([]);
  const clearGeneratedHighlights = React.useCallback(() => {
    setGeneratedHighlights([]);
  }, []);

  React.useEffect(() => {
    return () => {
      if (!currentDirectory) {
        gitTabSnapshot = null;
        return;
      }

      gitTabSnapshot = {
        directory: currentDirectory,
        isGitRepo,
        status,
        selectedPaths: Array.from(selectedPaths),
        commitMessage,
      };
    };
  }, [commitMessage, currentDirectory, isGitRepo, selectedPaths, status]);

  React.useEffect(() => {
    loadProfiles();
    loadGlobalIdentity();
  }, [loadProfiles, loadGlobalIdentity]);

  const refreshStatusAndBranches = React.useCallback(
    async (showErrors = true) => {
      if (!currentDirectory) return;

      try {
        const [statusData, branchesData] = await Promise.all([
          git.getGitStatus(currentDirectory),
          git.getGitBranches(currentDirectory),
        ]);
        setStatus(statusData);
        setBranches(branchesData);
      } catch (err) {
        if (showErrors) {
          const message =
            err instanceof Error ? err.message : 'Failed to refresh repository state';
          toast.error(message);
        }
      }
    },
    [currentDirectory, git]
  );

  const refreshLog = React.useCallback(async () => {
    if (!currentDirectory) return;

    setIsLogLoading(true);
    try {
      const logData = await git.getGitLog(currentDirectory, { maxCount: logMaxCount });
      setLog(logData);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load commit log';
      toast.error(message);
    } finally {
      setIsLogLoading(false);
    }
  }, [currentDirectory, git, logMaxCount]);

  const refreshIdentity = React.useCallback(async () => {
    if (!currentDirectory) {
      setCurrentIdentity(null);
      return;
    }

    try {
      const identity = await git.getCurrentGitIdentity(currentDirectory);
      setCurrentIdentity(identity);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load git identity';
      toast.error(message);
      setCurrentIdentity(null);
    }
  }, [currentDirectory, git]);

  const loadAllData = React.useCallback(async () => {
    if (!currentDirectory) {
      setIsGitRepo(null);
      setStatus(null);
      setBranches(null);
      setLog(null);
      setCurrentIdentity(null);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const repo = await git.checkIsGitRepository(currentDirectory);
      setIsGitRepo(repo);

      if (!repo) {
        setStatus(null);
        setBranches(null);
        setLog(null);
        setCurrentIdentity(null);
        return;
      }

      const [statusData, branchesData, logData, identityData] = await Promise.all([
        git.getGitStatus(currentDirectory),
        git.getGitBranches(currentDirectory),
        git.getGitLog(currentDirectory, { maxCount: logMaxCount }).catch(() => null),
        git.getCurrentGitIdentity(currentDirectory).catch(() => null),
      ]);

      setStatus(statusData);
      setBranches(branchesData);
      setLog(logData);
      setCurrentIdentity(identityData);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load git data';
      setError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }, [currentDirectory, logMaxCount, git]);

  React.useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  React.useEffect(() => {
    refreshIdentity();
  }, [refreshIdentity]);

  const changeEntries = React.useMemo(() => {
    if (!status) return [];
    const files = status.files ?? [];
    const unique = new Map<string, GitStatus['files'][number]>();

    files.forEach((file) => {
      unique.set(file.path, file);
    });

    return Array.from(unique.values()).sort((a, b) => a.path.localeCompare(b.path));
  }, [status]);

  React.useEffect(() => {
    if (!status || changeEntries.length === 0) {
      setSelectedPaths(new Set());
      setHasUserAdjustedSelection(false);
      return;
    }

    setSelectedPaths((previous) => {
      const next = new Set<string>();
      const previousSet = previous ?? new Set<string>();

      changeEntries.forEach((file) => {
        if (previousSet.has(file.path)) {
          next.add(file.path);
        } else if (!hasUserAdjustedSelection) {
          next.add(file.path);
        }
      });

      return next;
    });
  }, [status, changeEntries, hasUserAdjustedSelection]);

  const handleSyncAction = async (action: Exclude<SyncAction, null>) => {
    if (!currentDirectory) return;
    setSyncAction(action);

    try {
      if (action === 'fetch') {
        await git.gitFetch(currentDirectory);
        toast.success('Fetched latest updates');
      } else if (action === 'pull') {
        const result = await git.gitPull(currentDirectory);
        toast.success(`Pulled ${result.files.length} file${result.files.length === 1 ? '' : 's'}`);
      } else if (action === 'push') {
        await git.gitPush(currentDirectory);
        toast.success('Pushed to remote');
      }

      setLastSyncMessage(`${action.toUpperCase()} completed at ${new Date().toLocaleTimeString()}`);
      await refreshStatusAndBranches(false);
      await refreshLog();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : `Failed to ${action === 'pull' ? 'pull' : action}`;
      toast.error(message);
    } finally {
      setSyncAction(null);
    }
  };

  const handleCommit = async (options: { pushAfter?: boolean } = {}) => {
    if (!currentDirectory) return;
    if (!commitMessage.trim()) {
      toast.error('Please enter a commit message');
      return;
    }

    const filesToCommit = Array.from(selectedPaths).sort();
    if (filesToCommit.length === 0) {
      toast.error('Select at least one file to commit');
      return;
    }

    const action: CommitAction = options.pushAfter ? 'commitAndPush' : 'commit';
    setCommitAction(action);

    try {
      await git.createGitCommit(currentDirectory, commitMessage.trim(), {
        files: filesToCommit,
      });
      toast.success('Commit created successfully');
      setCommitMessage('');
      setSelectedPaths(new Set());
      setHasUserAdjustedSelection(false);

      await refreshStatusAndBranches();

      if (options.pushAfter) {
        await git.gitPush(currentDirectory);
        toast.success('Pushed to remote');
        triggerFireworks();
        await refreshStatusAndBranches(false);
      } else {
        await refreshStatusAndBranches(false);
      }

      await refreshLog();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create commit';
      toast.error(message);
    } finally {
      setCommitAction(null);
    }
  };

  const handleGenerateCommitMessage = React.useCallback(async () => {
    if (!currentDirectory) return;
    if (selectedPaths.size === 0) {
      toast.error('Select at least one file to describe');
      return;
    }

    setIsGeneratingMessage(true);
    try {
      const { message } = await git.generateCommitMessage(currentDirectory, Array.from(selectedPaths));
      const subject = message.subject?.trim() ?? '';
      const highlights = Array.isArray(message.highlights) ? message.highlights : [];

      if (subject) {
        setCommitMessage(subject);
      }
      setGeneratedHighlights(highlights);

      toast.success('Commit message generated');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to generate commit message';
      toast.error(message);
    } finally {
      setIsGeneratingMessage(false);
    }
  }, [currentDirectory, selectedPaths, git]);

  const handleCreateBranch = async () => {
    if (!currentDirectory || !status) return;
    const finalName = sanitizedNewBranch;
    if (!finalName) {
      toast.error('Provide a branch name using letters, numbers, ".", "_", "-" or "/".');
      return;
    }
    const checkoutBase = status.current ?? null;

    setCreatingBranch(true);
    try {
      await git.createBranch(currentDirectory, finalName, checkoutBase ?? 'HEAD');
      toast.success(`Created branch ${finalName}`);

      let pushSucceeded = false;
      try {
        await git.checkoutBranch(currentDirectory, finalName);
        await git.gitPush(currentDirectory, {
          remote: 'origin',
          branch: finalName,
          options: ['--set-upstream'],
        });
        pushSucceeded = true;
      } catch (pushError) {
        const message =
          pushError instanceof Error ? pushError.message : 'Unable to push new branch to origin.';
        toast.warning('Branch created locally', {
          description: renderToastDescription(`Upstream setup failed: ${message}`),
        });
      } finally {
        if (checkoutBase) {
          try {
            await git.checkoutBranch(currentDirectory, checkoutBase);
          } catch (restoreError) {
            console.warn('Failed to restore original branch after creation:', restoreError);
          }
        }
      }

      setNewBranchName('');
      await refreshStatusAndBranches();
      await refreshLog();

      if (pushSucceeded) {
        toast.success(`Upstream set for ${finalName}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create branch';
      toast.error(message);
    } finally {
      setCreatingBranch(false);
    }
  };

  const handleCheckoutBranch = async (branch: string) => {
    if (!currentDirectory) return;
    const normalized = branch.replace(/^remotes\//, '');

    if (status?.current === normalized) {
      setBranchPickerOpen(false);
      return;
    }

    try {
      await git.checkoutBranch(currentDirectory, normalized);
      toast.success(`Checked out ${normalized}`);
      setBranchPickerOpen(false);
      setBranchSearch('');
      await refreshStatusAndBranches();
      const activeBranch = status?.current;
      if (activeBranch) {
        await git.checkoutBranch(currentDirectory, activeBranch);
        toast.success(`Checked out ${activeBranch}`);
      }
      await refreshLog();
    } catch (err) {
      const message = err instanceof Error ? err.message : `Failed to checkout ${normalized}`;
      toast.error(message);
    }
  };

  const handleApplyIdentity = async (profile: GitIdentityProfile) => {
    if (!currentDirectory) return;
    setIsSettingIdentity(true);

    try {
      await git.setGitIdentity(currentDirectory, profile.id);
      toast.success(`Applied "${profile.name}" to repository`);
      await refreshIdentity();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to apply git identity';
      toast.error(message);
    } finally {
      setIsSettingIdentity(false);
    }
  };

  const localBranches = React.useMemo(() => {
    if (!branches?.all) return [];
    return branches.all.filter((branchName: string) => !branchName.startsWith('remotes/')).sort();
  }, [branches]);

  const remoteBranches = React.useMemo(() => {
    if (!branches?.all) return [];
    return branches.all
      .filter((branchName: string) => branchName.startsWith('remotes/'))
      .map((branchName: string) => branchName.replace(/^remotes\//, ''))
      .sort();
  }, [branches]);

  const branchOptions = React.useMemo(() => {
    const search = branchSearch.trim().toLowerCase();
    if (!search) {
      return {
        locals: localBranches,
        remotes: remoteBranches,
      };
    }

    return {
      locals: localBranches.filter((branch: string) => branch.toLowerCase().includes(search)),
      remotes: remoteBranches.filter((branch: string) => branch.toLowerCase().includes(search)),
    };
  }, [branchSearch, localBranches, remoteBranches]);

  React.useEffect(() => {
    if (!branchPickerOpen) {
      setBranchSearch('');
    }
  }, [branchPickerOpen]);

  const availableIdentities = React.useMemo(() => {
    const unique = new Map<string, GitIdentityProfile>();
    if (globalIdentity) {
      unique.set(globalIdentity.id, globalIdentity);
    }
    for (const profile of profiles) {
      unique.set(profile.id, profile);
    }
    return Array.from(unique.values());
  }, [profiles, globalIdentity]);

  const activeIdentityProfile = React.useMemo((): GitIdentityProfile | null => {
    if (currentIdentity?.userName && currentIdentity?.userEmail) {
      const match = profiles.find(
        (profile) =>
          profile.userName === currentIdentity.userName &&
          profile.userEmail === currentIdentity.userEmail
      );

      if (match) {
        return match;
      }

      if (
        globalIdentity &&
        globalIdentity.userName === currentIdentity.userName &&
        globalIdentity.userEmail === currentIdentity.userEmail
      ) {
        return globalIdentity;
      }

      return {
        id: 'local-config',
        name: currentIdentity.userName,
        userName: currentIdentity.userName,
        userEmail: currentIdentity.userEmail,
        sshKey: currentIdentity.sshCommand?.replace('ssh -i ', '') ?? null,
        color: 'info',
        icon: 'user',
      };
    }

    return globalIdentity ?? null;
  }, [currentIdentity, profiles, globalIdentity]);

  const uniqueChangeCount = changeEntries.length;
  const selectedCount = selectedPaths.size;
  const isBusy = isLoading || syncAction !== null || commitAction !== null;

  const toggleFileSelection = (path: string) => {
    setSelectedPaths((previous) => {
      const next = new Set(previous);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
    setHasUserAdjustedSelection(true);
  };

  const selectAll = () => {
    const next = new Set(changeEntries.map((file) => file.path));
    setSelectedPaths(next);
    setHasUserAdjustedSelection(true);
  };

  const clearSelection = () => {
    setSelectedPaths(new Set());
    setHasUserAdjustedSelection(true);
  };

  const handleRevertFile = React.useCallback(
    async (filePath: string) => {
      if (!currentDirectory) return;

      setRevertingPaths((previous) => {
        const next = new Set(previous);
        next.add(filePath);
        return next;
      });

      try {
        await git.revertGitFile(currentDirectory, filePath);
        toast.success(`Reverted ${filePath}`);
        await refreshStatusAndBranches(false);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to revert changes';
        toast.error(message);
      } finally {
        setRevertingPaths((previous) => {
          const next = new Set(previous);
          next.delete(filePath);
          return next;
        });
      }
    },
    [currentDirectory, refreshStatusAndBranches, git]
  );

  if (!currentDirectory) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-center">
        <p className="typography-ui-label text-muted-foreground">
          Select a session or directory to view repository details.
        </p>
      </div>
    );
  }

  if (isLoading && isGitRepo === null) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex items-center gap-2 text-muted-foreground">
          <RiLoader4Line className="size-4 animate-spin" />
          <span className="typography-ui-label">Checking repository…</span>
        </div>
      </div>
    );
  }

  if (isGitRepo === false) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-4 text-center">
        <RiGitBranchLine className="mb-3 size-6 text-muted-foreground" />
        <p className="typography-ui-label font-semibold text-foreground">Not a Git repository</p>
        <p className="typography-meta mt-1 text-muted-foreground">
          Choose a different directory or initialize Git to use this workspace.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden" style={{ backgroundColor: 'var(--syntax-background)' }}>
      <div className="flex items-center gap-1.5 px-3 py-2" style={{ backgroundColor: 'var(--syntax-background)' }}>
        <ButtonLarge
          variant="default"
          onClick={() => handleSyncAction('fetch')}
          disabled={syncAction !== null || !status}
        >
          {syncAction === 'fetch' ? (
            <RiLoader4Line size={16} className="animate-spin" />
          ) : (
            <RiRefreshLine size={16} />
          )}
          Fetch
        </ButtonLarge>
        <ButtonLarge
          variant="default"
          onClick={() => handleSyncAction('pull')}
          disabled={syncAction !== null || !status}
        >
          {syncAction === 'pull' ? (
            <RiLoader4Line size={16} className="animate-spin" />
          ) : (
            <RiArrowDownLine size={16} />
          )}
          Pull
        </ButtonLarge>
        <ButtonLarge
          variant="default"
          onClick={() => handleSyncAction('push')}
          disabled={syncAction !== null || !status}
        >
          {syncAction === 'push' ? (
            <RiLoader4Line size={16} className="animate-spin" />
          ) : (
            <RiArrowUpLine size={16} />
          )}
          Push
        </ButtonLarge>
        <div className="flex-1" />
        <ButtonLarge
          variant="default"
          onClick={async () => {
            await Promise.allSettled([loadProfiles(), loadGlobalIdentity()]);
            await loadAllData();
          }}
          disabled={isBusy}
        >
          <RiRefreshLine size={16} className={cn(isBusy && 'animate-spin')} />
          Refresh
        </ButtonLarge>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3">
        {error && (
          <div className="mb-3 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2">
            <p className="typography-ui-label text-destructive">{error}</p>
            <p className="typography-meta text-destructive/80">
              Try refreshing or confirm the repository is accessible.
            </p>
          </div>
        )}

        <div className="space-y-4">
          {status && (
            <section className="space-y-2 rounded-2xl border border-border/60 bg-background/70 px-3 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <RiGitBranchLine className="size-4 text-primary" />
                  <span className="typography-ui-header font-semibold text-foreground">
                    {status.current || 'Detached HEAD'}
                  </span>
                  {status.tracking ? (
                    <span className="typography-meta text-muted-foreground">
                      Tracking {status.tracking}
                    </span>
                  ) : (
                    <span className="typography-meta text-muted-foreground">No upstream</span>
                  )}
                </div>
                <IdentityDropdown
                  activeProfile={activeIdentityProfile}
                  identities={availableIdentities}
                  onSelect={handleApplyIdentity}
                  isApplying={isSettingIdentity}
                />
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 typography-meta text-muted-foreground">
                <span>
                  Ahead:{' '}
                  <span className="font-semibold text-foreground">{status.ahead}</span>
                </span>
                <span>
                  Behind:{' '}
                  <span className="font-semibold text-foreground">{status.behind}</span>
                </span>
                <span>
                  Changes:{' '}
                  <span className="font-semibold text-foreground">{status.files.length}</span>
                </span>
              </div>
              {lastSyncMessage && (
                <p className="typography-micro text-muted-foreground">{lastSyncMessage}</p>
              )}
            </section>
          )}

          {!worktreeMetadata && (
          <section className="rounded-2xl border border-border/60 bg-background/70 px-3 py-3">
            <header className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-col">
                <h3 className="typography-ui-header font-semibold text-foreground">Branches</h3>
                <span className="typography-meta text-muted-foreground">
                  {localBranches.length} local · {remoteBranches.length} remote
                </span>
              </div>
              <DropdownMenu open={branchPickerOpen} onOpenChange={setBranchPickerOpen}>
                <Tooltip delayDuration={1000}>
                  <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="gap-2 px-3 py-1">
                        <RiGitBranchLine className="size-4" />
                        <span className="max-w-[160px] truncate">
                          {status?.current || 'Select branch'}
                        </span>
                        <RiArrowDownSLine className="size-4 opacity-60" />
                      </Button>
                    </DropdownMenuTrigger>
                  </TooltipTrigger>
                  <TooltipContent sideOffset={8}>
                    Switch the current working branch
                  </TooltipContent>
                </Tooltip>
                <DropdownMenuContent align="end" className="w-72 p-0">
                  <Command>
                    <CommandInput
                      placeholder="Search branches…"
                      value={branchSearch}
                      onValueChange={setBranchSearch}
                    />
                    <CommandList>
                      <CommandEmpty>No branches found.</CommandEmpty>
                      <CommandGroup heading="Local branches">
                        {branchOptions.locals.map((branchName: string) => (
                          <CommandItem
                            key={`local-${branchName}`}
                            onSelect={() => handleCheckoutBranch(branchName)}
                          >
                            <span className="flex flex-1 flex-col">
                              <span className="typography-ui-label text-foreground">
                                {branchName}
                              </span>
                              {branches?.branches?.[branchName]?.ahead ||
                              branches?.branches?.[branchName]?.behind ? (
                                <span className="typography-micro text-muted-foreground">
                                  {branches.branches[branchName].ahead || 0} ahead ·{' '}
                                  {branches.branches[branchName].behind || 0} behind
                                </span>
                              ) : null}
                            </span>
                            {status?.current === branchName && (
                              <span className="typography-micro text-primary">Current</span>
                            )}
                          </CommandItem>
                        ))}
                        {branchOptions.locals.length === 0 && (
                          <CommandItem disabled className="justify-center">
                            <span className="typography-meta text-muted-foreground">
                              No local branches
                            </span>
                          </CommandItem>
                        )}
                      </CommandGroup>
                      <CommandSeparator />
                      <CommandGroup heading="Remote branches">
                        {branchOptions.remotes.map((branchName: string) => (
                          <CommandItem
                            key={`remote-${branchName}`}
                            onSelect={() => handleCheckoutBranch(branchName)}
                          >
                            <span className="typography-ui-label text-foreground">{branchName}</span>
                          </CommandItem>
                        ))}
                        {branchOptions.remotes.length === 0 && (
                          <CommandItem disabled className="justify-center">
                            <span className="typography-meta text-muted-foreground">
                              No remote branches
                            </span>
                          </CommandItem>
                        )}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </DropdownMenuContent>
              </DropdownMenu>
            </header>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Input
                placeholder="New branch name"
                value={newBranchName}
                onChange={(event) => setNewBranchName(event.target.value)}
                className="h-8 flex-1 min-w-[200px] rounded-lg bg-background/80"
              />
              <span className="typography-micro text-muted-foreground/70 basis-full sm:basis-auto">
                Will create branch <code className="font-mono text-xs text-muted-foreground">{sanitizedNewBranch || 'session-branch'}</code>
              </span>
              <ButtonLarge
                variant="default"
                onClick={handleCreateBranch}
                disabled={creatingBranch || !sanitizedNewBranch}
              >
                {creatingBranch ? (
                  <>
                    <RiLoader4Line className="size-4 animate-spin" />
                    Creating…
                  </>
                ) : (
                  <>
                    <RiAddLine className="size-4" />
                    Create
                  </>
                )}
              </ButtonLarge>
            </div>
          </section>
          )}

          {status && (
            <section className="rounded-2xl border border-border/60 bg-background px-3 py-3">
              <header className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="typography-ui-header font-semibold text-foreground">Changes</h3>
                <span className="typography-meta text-muted-foreground">
                  Selected {selectedCount} of {uniqueChangeCount}
                </span>
              </header>
              {uniqueChangeCount > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={selectAll}>
                    Select all
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearSelection}
                    disabled={selectedCount === 0}
                  >
                    Clear
                  </Button>
                </div>
              )}

              {status.isClean || uniqueChangeCount === 0 ? (
                <div className="mt-4 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2">
                  <p className="typography-ui-label" style={{ color: 'var(--status-success)' }}>
                    Working tree clean — nothing to commit.
                  </p>
                </div>
              ) : (
                <>
                  <div className="mt-4 rounded-2xl border border-border/60 bg-background/80">
                    <ul className="divide-y divide-border/60">
                      {changeEntries.map((file) => (
                        <ChangeRow
                          key={file.path}
                          file={file}
                          checked={selectedPaths.has(file.path)}
                          stats={status.diffStats?.[file.path]}
                          onToggle={() => toggleFileSelection(file.path)}
                          onRevert={() => handleRevertFile(file.path)}
                          isReverting={revertingPaths.has(file.path)}
                        />
                      ))}
                    </ul>
                  </div>

                  <div className="mt-4 space-y-3 rounded-2xl border border-border/60 bg-background/80 px-3 py-3">
                    {generatedHighlights.length > 0 && (
                      <div className="space-y-2 rounded-xl border border-border/60 bg-background/60 px-3 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <p className="typography-micro text-muted-foreground">AI highlights</p>
                          <Tooltip delayDuration={1000}>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-6"
                                onClick={() => {
                                  if (generatedHighlights.length === 0) return;
                                  const normalizedHighlights = generatedHighlights
                                    .map((text) => text.trim())
                                    .filter(Boolean);
                                  if (normalizedHighlights.length === 0) {
                                    clearGeneratedHighlights();
                                    return;
                                  }
                                  setCommitMessage((current) => {
                                    const base = current.trim();
                                    const separator = base.length > 0 ? '\n\n' : '';
                                    return `${base}${separator}${normalizedHighlights.join('\n')}`.trim();
                                  });
                                  clearGeneratedHighlights();
                                }}
                                aria-label="Insert highlights into commit message"
                              >
                                <RiArrowDownLine className="size-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent sideOffset={8}>Append highlights to commit message</TooltipContent>
                          </Tooltip>
                        </div>
                        <ul className="space-y-1">
                          {generatedHighlights.map((highlight, index) => (
                            <li key={index} className="typography-meta text-foreground">
                              {highlight}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <Textarea
                      value={commitMessage}
                      onChange={(event) => setCommitMessage(event.target.value)}
                      placeholder="Commit message"
                      rows={3}
                      disabled={commitAction !== null}
                      className="rounded-lg bg-background/80"
                    />
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
                      <Tooltip delayDuration={1000}>
                        <TooltipTrigger asChild>
                          <ButtonLarge
                            variant="ghost"
                            onClick={handleGenerateCommitMessage}
                            disabled={
                              isGeneratingMessage ||
                              commitAction !== null ||
                              selectedCount === 0 ||
                              isBusy
                            }
                            className="px-3"
                            aria-label="Generate commit message"
                          >
                                {isGeneratingMessage ? (
                              <RiLoader4Line className="size-4 animate-spin" />
                            ) : (
                              <RiAiGenerate2 className="size-4 text-primary" />
                            )}
                          </ButtonLarge>
                        </TooltipTrigger>
                        <TooltipContent sideOffset={8}>Generate commit message with AI</TooltipContent>
                      </Tooltip>
                      <ButtonLarge
                        variant="outline"
                        onClick={() => {
                          clearGeneratedHighlights();
                          handleCommit({ pushAfter: false });
                        }}
                        disabled={
                          commitAction !== null ||
                          !commitMessage.trim() ||
                          selectedCount === 0 ||
                          isGeneratingMessage
                        }
                      >
                        {commitAction === 'commit' ? (
                          <>
                            <RiLoader4Line className="size-4 animate-spin" />
                            Committing…
                          </>
                        ) : (
                          <>
                            <RiGitCommitLine className="size-4" />
                            Commit
                          </>
                        )}
                      </ButtonLarge>
                      <ButtonLarge
                        variant="default"
                        onClick={() => {
                          clearGeneratedHighlights();
                          handleCommit({ pushAfter: true });
                        }}
                        disabled={
                          commitAction !== null ||
                          !commitMessage.trim() ||
                          selectedCount === 0 ||
                          isGeneratingMessage
                        }
                      >
                        {commitAction === 'commitAndPush' ? (
                          <>
                            <RiLoader4Line className="size-4 animate-spin" />
                            Commit &amp; Push
                          </>
                        ) : (
                          <>
                            <RiArrowUpLine className="size-4" />
                            Commit &amp; Push
                          </>
                        )}
                      </ButtonLarge>
                    </div>
                  </div>
                </>
              )}
            </section>
          )}

          {log && (
            <section className="space-y-3 rounded-2xl border border-border/60 bg-background/70 px-3 py-3">
              <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="typography-ui-header font-semibold text-foreground">
                    Recent commits
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  <Select
                    value={String(logMaxCount)}
                    onValueChange={(value) => setLogMaxCount(Number(value))}
                    disabled={isLogLoading}
                  >
                    <SelectTrigger
                      size="sm"
                      className="data-[size=sm]:h-auto h-7 min-h-7 w-auto justify-between px-2 py-0"
                      disabled={isLogLoading}
                    >
                      <SelectValue placeholder="Commits" />
                    </SelectTrigger>
                    <SelectContent>
                      {LOG_SIZE_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={String(option.value)}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
        <Button
          variant="default"
          size="sm"
          className="h-7 px-2 py-0"
                    onClick={refreshLog}
                    disabled={isLogLoading}
                  >
                    {isLogLoading ? (
                      <RiLoader4Line className="size-4 animate-spin" />
                    ) : (
                      <RiRefreshLine className="size-4" />
                    )}
                    Reload
                  </Button>
                </div>
              </header>

              {log.all.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border/60 px-3 py-4 text-center">
                  <p className="typography-ui-label text-muted-foreground">
                    No recent commits found. Try expanding the range.
                  </p>
                </div>
              ) : (
                <div className="max-h-96 overflow-y-auto rounded-xl border border-border/60 bg-background/70">
                  <ul className="divide-y divide-border/60">
                    {log.all.map((entry) => (
                      <CommitRow key={entry.hash} entry={entry} />
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}

        </div>
      </div>
    </div>
  );
};

interface ChangeRowProps {
  file: GitStatus['files'][number];
  checked: boolean;
  onToggle: () => void;
  onRevert: () => void;
  isReverting: boolean;
  stats?: { insertions: number; deletions: number };
}

const ChangeRow: React.FC<ChangeRowProps> = ({ file, checked, onToggle, onRevert, isReverting, stats }) => {
  const descriptor = React.useMemo(() => describeChange(file), [file]);
  const indicatorLabel = descriptor.description ?? descriptor.code;
  const insertions = stats?.insertions ?? 0;
  const deletions = stats?.deletions ?? 0;

  return (
    <li>
      <div
        className="flex items-center gap-3 px-3 py-2 transition-colors hover:bg-sidebar/40"
        role="checkbox"
        aria-checked={checked}
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(event) => {
          if (event.key === ' ' || event.key === 'Enter') {
            event.preventDefault();
            onToggle();
          }
        }}
      >
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onToggle();
          }}
          aria-pressed={checked}
          aria-label={`Select ${file.path}`}
          className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {checked ? (
            <RiCheckboxLine className="size-4 text-primary" />
          ) : (
            <RiCheckboxBlankLine className="size-4" />
          )}
        </button>
        <span
          className="typography-micro font-semibold uppercase tracking-wide"
          style={{ color: descriptor.color }}
          title={indicatorLabel}
          aria-label={indicatorLabel}
        >
          {descriptor.code}
        </span>
        <span
          className="flex-1 min-w-0 break-words typography-ui-label text-foreground"
          title={file.path}
        >
          {file.path}
        </span>
        <span className="shrink-0 typography-micro font-semibold">
          <span style={{ color: 'var(--status-success)' }}>+{insertions}</span>
          <span className="mx-0.5 text-muted-foreground">/</span>
          <span style={{ color: 'var(--status-error)' }}>-{deletions}</span>
        </span>
        <Tooltip delayDuration={200}>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onRevert();
              }}
              disabled={isReverting}
              className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
              aria-label={`Revert changes for ${file.path}`}
            >
              {isReverting ? (
                <RiLoader4Line className="size-4 animate-spin" />
              ) : (
                <RiRefreshLine className="size-4" />
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent sideOffset={8}>Revert changes</TooltipContent>
        </Tooltip>
      </div>
    </li>
  );
};

interface CommitRowProps {
  entry: GitLogEntry;
}

const CommitRow: React.FC<CommitRowProps> = ({ entry }) => {
  return (
    <li className="flex items-start gap-3 px-3 py-2">
      <div className="h-2 w-2 translate-y-2 rounded-full" style={{ backgroundColor: 'var(--status-success)' }} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="typography-ui-label font-medium text-foreground">{entry.message}</p>
        <p className="typography-meta text-muted-foreground">
          {entry.author_name} · {formatCommitDate(entry.date)}
        </p>
        {(entry.filesChanged > 0 || entry.insertions > 0 || entry.deletions > 0) && (
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="typography-micro text-muted-foreground">
              {entry.filesChanged} file{entry.filesChanged === 1 ? '' : 's'}
            </span>
            <span className="typography-micro font-semibold" style={{ color: 'var(--status-success)' }}>
              +{entry.insertions}
            </span>
            <span className="typography-micro font-semibold" style={{ color: 'var(--status-error)' }}>
              -{entry.deletions}
            </span>
          </div>
        )}
        <p className="typography-micro text-muted-foreground">{entry.hash.slice(0, 10)}</p>
      </div>
    </li>
  );
};

interface IdentityDropdownProps {
  activeProfile: GitIdentityProfile | null;
  identities: GitIdentityProfile[];
  onSelect: (profile: GitIdentityProfile) => void;
  isApplying: boolean;
}

const IdentityDropdown: React.FC<IdentityDropdownProps> = ({
  activeProfile,
  identities,
  onSelect,
  isApplying,
}) => {
  const isDisabled = isApplying || identities.length === 0;

  return (
    <DropdownMenu>
      <Tooltip delayDuration={1000}>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="gap-2 px-3 py-1 typography-ui-label"
              style={{ color: getIdentityColor(activeProfile?.color) }}
              disabled={isDisabled}
            >
              {isApplying ? (
                <RiLoader4Line className="size-4 animate-spin" />
              ) : (
                <IdentityIcon
                  icon={activeProfile?.icon}
                  colorToken={activeProfile?.color}
                  className="size-4"
                />
              )}
              <span className="max-w-[180px] truncate">
              {activeProfile?.name || 'No identity'}
            </span>
            <RiArrowDownSLine className="size-4 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent sideOffset={8} className="space-y-1">
          <p className="typography-ui-label text-foreground">
            {activeProfile?.userName || 'Unknown user'}
          </p>
          <p className="typography-meta text-muted-foreground">
            {activeProfile?.userEmail || 'No email configured'}
          </p>
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-64">
        {identities.length === 0 ? (
          <div className="px-2 py-1.5">
            <p className="typography-meta text-muted-foreground">
              No profiles available to apply.
            </p>
          </div>
        ) : (
          identities.map((profile) => (
            <DropdownMenuItem
              key={profile.id}
              onSelect={() => onSelect(profile)}
            >
              <span className="flex items-center gap-2">
                <IdentityIcon
                  icon={profile.icon}
                  colorToken={profile.color}
                  className="size-4"
                />
                <span className="flex flex-col">
                  <span className="typography-ui-label text-foreground">{profile.name}</span>
                  <span className="typography-meta text-muted-foreground">
                    {profile.userEmail}
                  </span>
                </span>
              </span>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

function describeChange(file: GitStatus['files'][number]) {
  const rawCode =
    file.index && file.index.trim() && file.index.trim() !== '?'
      ? file.index.trim()
      : file.working_dir && file.working_dir.trim()
      ? file.working_dir.trim()
      : file.index || file.working_dir || ' ';

  const symbol = rawCode.trim().charAt(0) || rawCode.trim() || '·';

  switch (symbol) {
    case '?':
      return { code: '?', color: 'var(--status-info)', description: 'Untracked file' };
    case 'A':
      return { code: 'A', color: 'var(--status-success)', description: 'New file' };
    case 'D':
      return { code: 'D', color: 'var(--status-error)', description: 'Deleted file' };
    case 'R':
      return { code: 'R', color: 'var(--status-info)', description: 'Renamed file' };
    case 'C':
      return { code: 'C', color: 'var(--status-info)', description: 'Copied file' };
    default:
      return { code: 'M', color: 'var(--status-warning)', description: 'Modified file' };
  }
}

interface IdentityIconProps {
  icon?: string | null;
  className?: string;
  colorToken?: string | null;
}

const IDENTITY_ICON_MAP: Record<string, React.ComponentType<React.ComponentProps<typeof RiGitBranchLine>>> = {
  branch: RiGitBranchLine,
  briefcase: RiBriefcaseLine,
  house: RiHomeLine,
  graduation: RiGraduationCapLine,
  code: RiCodeLine,
  heart: RiHeartLine,
  user: RiUser3Line,
};

const IDENTITY_COLOR_MAP: Record<string, string> = {
  keyword: 'var(--syntax-keyword)',
  error: 'var(--status-error)',
  string: 'var(--syntax-string)',
  function: 'var(--syntax-function)',
  type: 'var(--syntax-type)',
  // Back-compat values from earlier builds
  success: 'var(--status-success)',
  info: 'var(--status-info)',
  warning: 'var(--status-warning)',
};

function getIdentityColor(token?: string | null) {
  if (!token) {
    return 'var(--primary)';
  }
  return IDENTITY_COLOR_MAP[token] || 'var(--primary)';
}

const IdentityIcon: React.FC<IdentityIconProps> = ({ icon, className, colorToken }) => {
  const IconComponent = IDENTITY_ICON_MAP[icon ?? 'branch'] ?? RiUser3Line;
  return (
    <IconComponent
      className={className}
      style={{ color: getIdentityColor(colorToken) }}
    />
  );
};

function formatCommitDate(date: string) {
  const value = new Date(date);
  if (Number.isNaN(value.getTime())) {
    return date;
  }

  return value.toLocaleString(undefined, {
    hour12: false,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
