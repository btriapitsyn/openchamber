import React from 'react';
import { useSessionStore } from '@/stores/useSessionStore';
import { useFireworksCelebration } from '@/contexts/FireworksContext';
import type { GitIdentityProfile, CommitFileEntry } from '@/lib/api/types';
import { useGitIdentitiesStore } from '@/stores/useGitIdentitiesStore';
import { useDirectoryStore } from '@/stores/useDirectoryStore';
import {
  useGitStore,
  useGitStatus,
  useGitBranches,
  useGitLog,
  useGitIdentity,
  useIsGitRepo,
} from '@/stores/useGitStore';
import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';
import { RiGitBranchLine, RiLoader4Line } from '@remixicon/react';
import { toast } from 'sonner';
import type { Session } from '@opencode-ai/sdk/v2';
import { useRuntimeAPIs } from '@/hooks/useRuntimeAPIs';
import { useUIStore } from '@/stores/useUIStore';

import { GitHeader } from './git/GitHeader';
import { GitEmptyState } from './git/GitEmptyState';
import { ChangesSection } from './git/ChangesSection';
import { CommitSection } from './git/CommitSection';
import { HistorySection } from './git/HistorySection';

type SyncAction = 'fetch' | 'pull' | 'push' | null;
type CommitAction = 'commit' | 'commitAndPush' | null;

type GitViewSnapshot = {
  directory?: string;
  selectedPaths: string[];
  commitMessage: string;
};

let gitViewSnapshot: GitViewSnapshot | null = null;

const useEffectiveDirectory = () => {
  const { currentSessionId, sessions, worktreeMetadata: worktreeMap } = useSessionStore();
  const { currentDirectory: fallbackDirectory } = useDirectoryStore();

  const worktreeMetadata = currentSessionId
    ? worktreeMap.get(currentSessionId) ?? undefined
    : undefined;
  const currentSession = sessions.find((session) => session.id === currentSessionId);
  type SessionWithDirectory = Session & { directory?: string };
  const sessionDirectory: string | undefined = (
    currentSession as SessionWithDirectory | undefined
  )?.directory;

  return worktreeMetadata?.path ?? sessionDirectory ?? fallbackDirectory ?? undefined;
};

export const GitView: React.FC = () => {
  const { git } = useRuntimeAPIs();
  const currentDirectory = useEffectiveDirectory();
  const { currentSessionId, worktreeMetadata: worktreeMap } = useSessionStore();
  const worktreeMetadata = currentSessionId
    ? worktreeMap.get(currentSessionId) ?? undefined
    : undefined;

  const { profiles, globalIdentity, loadProfiles, loadGlobalIdentity } =
    useGitIdentitiesStore();

  const isGitRepo = useIsGitRepo(currentDirectory ?? null);
  const status = useGitStatus(currentDirectory ?? null);
  const branches = useGitBranches(currentDirectory ?? null);
  const log = useGitLog(currentDirectory ?? null);
  const currentIdentity = useGitIdentity(currentDirectory ?? null);
  const isLoading = useGitStore((state) => state.isLoadingStatus);
  const isLogLoading = useGitStore((state) => state.isLoadingLog);
  const {
    setActiveDirectory,
    fetchAll,
    fetchStatus,
    fetchBranches,
    fetchLog,
    fetchIdentity,
    setLogMaxCount,
  } = useGitStore();

  const initialSnapshot = React.useMemo(() => {
    if (!gitViewSnapshot) return null;
    if (gitViewSnapshot.directory !== currentDirectory) return null;
    return gitViewSnapshot;
  }, [currentDirectory]);

  const [commitMessage, setCommitMessage] = React.useState(
    initialSnapshot?.commitMessage ?? ''
  );
  const [syncAction, setSyncAction] = React.useState<SyncAction>(null);
  const [commitAction, setCommitAction] = React.useState<CommitAction>(null);
  const [logMaxCountLocal, setLogMaxCountLocal] = React.useState<number>(25);
  const [isSettingIdentity, setIsSettingIdentity] = React.useState(false);
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
  const [expandedCommitHashes, setExpandedCommitHashes] = React.useState<Set<string>>(new Set());
  const [commitFilesMap, setCommitFilesMap] = React.useState<Map<string, CommitFileEntry[]>>(new Map());
  const [loadingCommitHashes, setLoadingCommitHashes] = React.useState<Set<string>>(new Set());
  const [remoteUrl, setRemoteUrl] = React.useState<string | null>(null);

  const handleCopyCommitHash = React.useCallback((hash: string) => {
    navigator.clipboard
      .writeText(hash)
      .then(() => {
        toast.success('Commit hash copied');
      })
      .catch(() => {
        toast.error('Failed to copy');
      });
  }, []);

  const handleToggleCommit = React.useCallback((hash: string) => {
    setExpandedCommitHashes((prev) => {
      const next = new Set(prev);
      if (next.has(hash)) {
        next.delete(hash);
      } else {
        next.add(hash);
      }
      return next;
    });
  }, []);

  React.useEffect(() => {
    if (!currentDirectory || !git) return;

    // Find hashes that are expanded but not yet loaded or loading
    const hashesToLoad = Array.from(expandedCommitHashes).filter(
      (hash) => !commitFilesMap.has(hash) && !loadingCommitHashes.has(hash)
    );

    if (hashesToLoad.length === 0) return;

    setLoadingCommitHashes((prev) => {
      const next = new Set(prev);
      hashesToLoad.forEach((h) => next.add(h));
      return next;
    });

    hashesToLoad.forEach((hash) => {
      git
        .getCommitFiles(currentDirectory, hash)
        .then((response) => {
          setCommitFilesMap((prev) => new Map(prev).set(hash, response.files));
        })
        .catch((error) => {
          console.error('Failed to fetch commit files:', error);
          setCommitFilesMap((prev) => new Map(prev).set(hash, []));
        })
        .finally(() => {
          setLoadingCommitHashes((prev) => {
            const next = new Set(prev);
            next.delete(hash);
            return next;
          });
        });
    });
  }, [expandedCommitHashes, currentDirectory, git, commitFilesMap, loadingCommitHashes]);

  React.useEffect(() => {
    return () => {
      if (!currentDirectory) {
        gitViewSnapshot = null;
        return;
      }

      gitViewSnapshot = {
        directory: currentDirectory,
        selectedPaths: Array.from(selectedPaths),
        commitMessage,
      };
    };
  }, [commitMessage, currentDirectory, selectedPaths]);

  React.useEffect(() => {
    loadProfiles();
    loadGlobalIdentity();
  }, [loadProfiles, loadGlobalIdentity]);

  React.useEffect(() => {
    if (!currentDirectory || !git?.getRemoteUrl) {
      setRemoteUrl(null);
      return;
    }
    git.getRemoteUrl(currentDirectory).then(setRemoteUrl).catch(() => setRemoteUrl(null));
  }, [currentDirectory, git]);

  React.useEffect(() => {
    if (currentDirectory) {
      setActiveDirectory(currentDirectory);

      const dirState = useGitStore.getState().directories.get(currentDirectory);
      if (!dirState?.status) {
        fetchAll(currentDirectory, git, { force: true });
      }
    }
  }, [currentDirectory, setActiveDirectory, fetchAll, git]);

  const refreshStatusAndBranches = React.useCallback(
    async (showErrors = true) => {
      if (!currentDirectory) return;

      try {
        await Promise.all([
          fetchStatus(currentDirectory, git),
          fetchBranches(currentDirectory, git),
        ]);
      } catch (err) {
        if (showErrors) {
          const message =
            err instanceof Error ? err.message : 'Failed to refresh repository state';
          toast.error(message);
        }
      }
    },
    [currentDirectory, git, fetchStatus, fetchBranches]
  );

  const refreshLog = React.useCallback(async () => {
    if (!currentDirectory) return;
    await fetchLog(currentDirectory, git, logMaxCountLocal);
  }, [currentDirectory, git, fetchLog, logMaxCountLocal]);

  const refreshIdentity = React.useCallback(async () => {
    if (!currentDirectory) return;
    await fetchIdentity(currentDirectory, git);
  }, [currentDirectory, git, fetchIdentity]);

  const changeEntries = React.useMemo(() => {
    if (!status) return [];
    const files = status.files ?? [];
    const unique = new Map<string, (typeof files)[number]>();

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
        toast.success(
          `Pulled ${result.files.length} file${result.files.length === 1 ? '' : 's'}`
        );
      } else if (action === 'push') {
        await git.gitPush(currentDirectory);
        toast.success('Pushed to remote');
      }

      await refreshStatusAndBranches(false);
      await refreshLog();
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : `Failed to ${action === 'pull' ? 'pull' : action}`;
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
      clearGeneratedHighlights();

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
      const { message } = await git.generateCommitMessage(
        currentDirectory,
        Array.from(selectedPaths)
      );
      const subject = message.subject?.trim() ?? '';
      const highlights = Array.isArray(message.highlights) ? message.highlights : [];

      if (subject) {
        setCommitMessage(subject);
      }
      setGeneratedHighlights(highlights);

      toast.success('Commit message generated');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to generate commit message';
      toast.error(message);
    } finally {
      setIsGeneratingMessage(false);
    }
  }, [currentDirectory, selectedPaths, git]);

  const handleCreateBranch = async (branchName: string) => {
    if (!currentDirectory || !status) return;
    const checkoutBase = status.current ?? null;

    try {
      await git.createBranch(currentDirectory, branchName, checkoutBase ?? 'HEAD');
      toast.success(`Created branch ${branchName}`);

      let pushSucceeded = false;
      try {
        await git.checkoutBranch(currentDirectory, branchName);
        await git.gitPush(currentDirectory, {
          remote: 'origin',
          branch: branchName,
          options: ['--set-upstream'],
        });
        pushSucceeded = true;
      } catch (pushError) {
        const message =
          pushError instanceof Error
            ? pushError.message
            : 'Unable to push new branch to origin.';
        toast.warning('Branch created locally', {
          description: (
            <span className="text-foreground/80 dark:text-foreground/70">
              Upstream setup failed: {message}
            </span>
          ),
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

      await refreshStatusAndBranches();
      await refreshLog();

      if (pushSucceeded) {
        toast.success(`Upstream set for ${branchName}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create branch';
      toast.error(message);
      throw err;
    }
  };

  const handleRenameBranch = async (oldName: string, newName: string) => {
    if (!currentDirectory) return;

    try {
      await git.renameBranch(currentDirectory, oldName, newName);
      toast.success(`Renamed branch ${oldName} to ${newName}`);
      await refreshStatusAndBranches();
      await refreshLog();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : `Failed to rename branch ${oldName} to ${newName}`;
      toast.error(message);
    }
  };

  const handleCheckoutBranch = async (branch: string) => {
    if (!currentDirectory) return;
    const normalized = branch.replace(/^remotes\//, '');

    if (status?.current === normalized) {
      return;
    }

    try {
      await git.checkoutBranch(currentDirectory, normalized);
      toast.success(`Checked out ${normalized}`);
      await refreshStatusAndBranches();
      await refreshLog();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : `Failed to checkout ${normalized}`;
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
    return branches.all
      .filter((branchName: string) => !branchName.startsWith('remotes/'))
      .sort();
  }, [branches]);

  const remoteBranches = React.useMemo(() => {
    if (!branches?.all) return [];
    return branches.all
      .filter((branchName: string) => branchName.startsWith('remotes/'))
      .map((branchName: string) => branchName.replace(/^remotes\//, ''))
      .sort();
  }, [branches]);

  const availableIdentities = React.useMemo(() => {
    const unique = new Map<string, GitIdentityProfile>();
    if (globalIdentity) {
      unique.set(globalIdentity.id, globalIdentity);
    }

    let repoHostPath: string | null = null;
    if (remoteUrl) {
      try {
        let normalized = remoteUrl.trim();
        if (normalized.startsWith('git@')) {
          normalized = 'https://' + normalized.slice(4).replace(':', '/');
        }
        if (normalized.endsWith('.git')) {
          normalized = normalized.slice(0, -4);
        }
        const url = new URL(normalized);
        repoHostPath = url.hostname + url.pathname;
      } catch { /* ignore */ }
    }

    for (const profile of profiles) {
      if (profile.authType !== 'token') {
        unique.set(profile.id, profile);
        continue;
      }

      const profileHost = profile.host;
      if (!profileHost) {
        unique.set(profile.id, profile);
        continue;
      }

      if (!profileHost.includes('/')) {
        unique.set(profile.id, profile);
        continue;
      }

      if (repoHostPath && repoHostPath === profileHost) {
        unique.set(profile.id, profile);
      }
    }
    return Array.from(unique.values());
  }, [profiles, globalIdentity, remoteUrl]);

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
  const hasChanges = uniqueChangeCount > 0;

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

  const handleInsertHighlights = React.useCallback(() => {
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
  }, [generatedHighlights, clearGeneratedHighlights]);

  const handleLogMaxCountChange = React.useCallback(
    (count: number) => {
      setLogMaxCountLocal(count);
      if (currentDirectory) {
        setLogMaxCount(currentDirectory, count);
        fetchLog(currentDirectory, git, count);
      }
    },
    [currentDirectory, setLogMaxCount, fetchLog, git]
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
          <span className="typography-ui-label">Checking repository...</span>
        </div>
      </div>
    );
  }

  if (isGitRepo === false) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-4 text-center">
        <RiGitBranchLine className="mb-3 size-6 text-muted-foreground" />
        <p className="typography-ui-label font-semibold text-foreground">
          Not a Git repository
        </p>
        <p className="typography-meta mt-1 text-muted-foreground">
          Choose a different directory or initialize Git to use this workspace.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background" data-keyboard-avoid="true">
      <GitHeader
        status={status}
        localBranches={localBranches}
        remoteBranches={remoteBranches}
        branchInfo={branches?.branches}
        syncAction={syncAction}
        onFetch={() => handleSyncAction('fetch')}
        onPull={() => handleSyncAction('pull')}
        onPush={() => handleSyncAction('push')}
        onCheckoutBranch={handleCheckoutBranch}
        onCreateBranch={handleCreateBranch}
        onRenameBranch={handleRenameBranch}
        activeIdentityProfile={activeIdentityProfile}
        availableIdentities={availableIdentities}
        onSelectIdentity={handleApplyIdentity}
        isApplyingIdentity={isSettingIdentity}
        isWorktreeMode={!!worktreeMetadata}
      />

      <ScrollableOverlay outerClassName="flex-1 min-h-0" className="p-3">
        <div className="flex flex-col gap-3">
          {/* Two-column layout on large screens: Changes + Commit */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {hasChanges ? (
              <ChangesSection
                changeEntries={changeEntries}
                selectedPaths={selectedPaths}
                diffStats={status?.diffStats}
                revertingPaths={revertingPaths}
                onToggleFile={toggleFileSelection}
                onSelectAll={selectAll}
                onClearSelection={clearSelection}
                onViewDiff={(path) => useUIStore.getState().navigateToDiff(path)}
                onRevertFile={handleRevertFile}
              />
            ) : (
              <div className="lg:col-span-2 flex justify-center">
                <GitEmptyState
                  behind={status?.behind ?? 0}
                  onPull={() => handleSyncAction('pull')}
                  isPulling={syncAction === 'pull'}
                />
              </div>
            )}

            {changeEntries.length > 0 && (
              <CommitSection
                selectedCount={selectedCount}
                commitMessage={commitMessage}
                onCommitMessageChange={setCommitMessage}
                generatedHighlights={generatedHighlights}
                onInsertHighlights={handleInsertHighlights}
                onClearHighlights={clearGeneratedHighlights}
                onGenerateMessage={handleGenerateCommitMessage}
                isGeneratingMessage={isGeneratingMessage}
                onCommit={() => handleCommit({ pushAfter: false })}
                onCommitAndPush={() => handleCommit({ pushAfter: true })}
                commitAction={commitAction}
                isBusy={isBusy}
              />
            )}
          </div>

          {/* History below, constrained width */}
          <HistorySection
            log={log}
            isLogLoading={isLogLoading}
            logMaxCount={logMaxCountLocal}
            onLogMaxCountChange={handleLogMaxCountChange}
            expandedCommitHashes={expandedCommitHashes}
            onToggleCommit={handleToggleCommit}
            commitFilesMap={commitFilesMap}
            loadingCommitHashes={loadingCommitHashes}
            onCopyHash={handleCopyCommitHash}
          />
        </div>
      </ScrollableOverlay>
    </div>
  );
};
