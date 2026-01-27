import React from 'react';
import { useSessionStore } from '@/stores/useSessionStore';
import { useConfigStore } from '@/stores/useConfigStore';
import { useFireworksCelebration } from '@/contexts/FireworksContext';
import type { GitIdentityProfile, CommitFileEntry } from '@/lib/api/types';
import { useGitIdentitiesStore } from '@/stores/useGitIdentitiesStore';
import { useProjectsStore } from '@/stores/useProjectsStore';
import { useEffectiveDirectory } from '@/hooks/useEffectiveDirectory';
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
import { toast } from '@/components/ui';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';

import { useRuntimeAPIs } from '@/hooks/useRuntimeAPIs';
import { useUIStore } from '@/stores/useUIStore';

import { GitHeader } from './git/GitHeader';
import { GitEmptyState } from './git/GitEmptyState';
import { ChangesSection } from './git/ChangesSection';
import { CommitSection } from './git/CommitSection';
import { HistorySection } from './git/HistorySection';
import { PullRequestSection } from './git/PullRequestSection';

type SyncAction = 'fetch' | 'pull' | 'push' | null;
type CommitAction = 'commit' | 'commitAndPush' | null;

type GitViewSnapshot = {
  directory?: string;
  selectedPaths: string[];
  commitMessage: string;
  generatedHighlights: string[];
};

type GitmojiEntry = {
  emoji: string;
  code: string;
  description: string;
};

type GitmojiCachePayload = {
  gitmojis: GitmojiEntry[];
  fetchedAt: number;
  version: string;
};

const GITMOJI_CACHE_KEY = 'gitmojiCache';
const GITMOJI_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const GITMOJI_CACHE_VERSION = '1';
const GITMOJI_SOURCE_URL =
  'https://raw.githubusercontent.com/carloscuesta/gitmoji/master/packages/gitmojis/src/gitmojis.json';

const KEYWORD_MAP: Record<string, string> = {
  'feat': ':sparkles:',
  'feature': ':sparkles:',
  'fix': ':bug:',
  'bug': ':bug:',
  'hotfix': ':ambulance:',
  'docs': ':memo:',
  'documentation': ':memo:',
  'style': ':lipstick:',
  'refactor': ':recycle:',
  'perf': ':zap:',
  'performance': ':zap:',
  'test': ':white_check_mark:',
  'tests': ':white_check_mark:',
  'build': ':construction_worker:',
  'ci': ':green_heart:',
  'chore': ':wrench:',
  'revert': ':rewind:',
  'wip': ':construction:',
  'security': ':lock:',
  'release': ':bookmark:',
  'merge': ':twisted_rightwards_arrows:',
  'mv': ':truck:',
  'move': ':truck:',
  'rename': ':truck:',
  'remove': ':fire:',
  'delete': ':fire:',
  'add': ':sparkles:',
  'create': ':sparkles:',
  'implement': ':sparkles:',
  'update': ':recycle:',
  'improve': ':zap:',
  'optimize': ':zap:',
  'upgrade': ':arrow_up:',
  'downgrade': ':arrow_down:',
  'deploy': ':rocket:',
  'init': ':tada:',
  'initial': ':tada:',
};

const isGitmojiEntry = (value: unknown): value is GitmojiEntry => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.emoji === 'string' &&
    typeof candidate.code === 'string' &&
    typeof candidate.description === 'string'
  );
};

const readGitmojiCache = (): GitmojiCachePayload | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(GITMOJI_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<GitmojiCachePayload>;
    if (!parsed || parsed.version !== GITMOJI_CACHE_VERSION || typeof parsed.fetchedAt !== 'number') {
      return null;
    }
    if (!Array.isArray(parsed.gitmojis)) return null;
    const gitmojis = parsed.gitmojis.filter(isGitmojiEntry);
    return { gitmojis, fetchedAt: parsed.fetchedAt, version: parsed.version };
  } catch {
    return null;
  }
};

const writeGitmojiCache = (gitmojis: GitmojiEntry[]) => {
  if (typeof window === 'undefined') return;
  try {
    const payload: GitmojiCachePayload = {
      gitmojis,
      fetchedAt: Date.now(),
      version: GITMOJI_CACHE_VERSION,
    };
    localStorage.setItem(GITMOJI_CACHE_KEY, JSON.stringify(payload));
  } catch {
    return;
  }
};

const isGitmojiCacheFresh = (payload: GitmojiCachePayload) =>
  Date.now() - payload.fetchedAt < GITMOJI_CACHE_TTL_MS;

const matchGitmojiFromSubject = (subject: string, gitmojis: GitmojiEntry[]): GitmojiEntry | null => {
  const lowerSubject = subject.toLowerCase();

  // 1. Check for conventional commit prefix (e.g. "feat:", "fix(scope):")
  const conventionalRegex = /^([a-z]+)(?:\(.*\))?!?:/;
  const match = lowerSubject.match(conventionalRegex);

  if (match) {
    const type = match[1];
    // Map common types to gitmoji codes
    const mappedCode = KEYWORD_MAP[type];
    if (mappedCode) {
      return gitmojis.find((g) => g.code === mappedCode) || null;
    }
  }

  // 2. Check for starting words (e.g. "Add", "Fix")
  const firstWord = lowerSubject.split(' ')[0];
  const mappedCode = KEYWORD_MAP[firstWord];
  if (mappedCode) {
    return gitmojis.find((g) => g.code === mappedCode) || null;
  }

  return null;
};

const gitViewSnapshots = new Map<string, GitViewSnapshot>();

export const GitView: React.FC = () => {
  const { git } = useRuntimeAPIs();
  const currentDirectory = useEffectiveDirectory();
  const { currentSessionId, worktreeMetadata: worktreeMap } = useSessionStore();
  const worktreeMetadata = currentSessionId
    ? worktreeMap.get(currentSessionId) ?? undefined
    : undefined;

  const { profiles, globalIdentity, defaultGitIdentityId, loadProfiles, loadGlobalIdentity, loadDefaultGitIdentityId } =
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
    if (!currentDirectory) return null;
    return gitViewSnapshots.get(currentDirectory) ?? null;
  }, [currentDirectory]);

  const settingsGitmojiEnabled = useConfigStore((state) => state.settingsGitmojiEnabled);

  const activeProject = useProjectsStore((state) => state.getActiveProject());
  const baseBranch = React.useMemo(() => {
    const fromProject = activeProject?.worktreeDefaults?.baseBranch;
    if (typeof fromProject === 'string' && fromProject.trim().length > 0) {
      return fromProject.trim();
    }
    return 'main';
  }, [activeProject?.worktreeDefaults?.baseBranch]);

  const [commitMessage, setCommitMessage] = React.useState(
    initialSnapshot?.commitMessage ?? ''
  );
  const [isGitmojiPickerOpen, setIsGitmojiPickerOpen] = React.useState(false);
  const [syncAction, setSyncAction] = React.useState<SyncAction>(null);
  const [commitAction, setCommitAction] = React.useState<CommitAction>(null);
  const [logMaxCountLocal, setLogMaxCountLocal] = React.useState<number>(25);
  const [isSettingIdentity, setIsSettingIdentity] = React.useState(false);
  const { triggerFireworks } = useFireworksCelebration();

  const autoAppliedDefaultRef = React.useRef<Map<string, string>>(new Map());
  const identityApplyCountRef = React.useRef(0);

  const beginIdentityApply = React.useCallback(() => {
    identityApplyCountRef.current += 1;
    setIsSettingIdentity(true);
  }, []);

  const endIdentityApply = React.useCallback(() => {
    identityApplyCountRef.current = Math.max(0, identityApplyCountRef.current - 1);
    if (identityApplyCountRef.current === 0) {
      setIsSettingIdentity(false);
    }
  }, []);

  const [selectedPaths, setSelectedPaths] = React.useState<Set<string>>(
    () => new Set(initialSnapshot?.selectedPaths ?? [])
  );
  const [hasUserAdjustedSelection, setHasUserAdjustedSelection] = React.useState(false);
  const [revertingPaths, setRevertingPaths] = React.useState<Set<string>>(new Set());
  const [isGeneratingMessage, setIsGeneratingMessage] = React.useState(false);
  const [generatedHighlights, setGeneratedHighlights] = React.useState<string[]>(
    initialSnapshot?.generatedHighlights ?? []
  );
  const clearGeneratedHighlights = React.useCallback(() => {
    setGeneratedHighlights([]);
  }, []);
  const [expandedCommitHashes, setExpandedCommitHashes] = React.useState<Set<string>>(new Set());
  const [commitFilesMap, setCommitFilesMap] = React.useState<Map<string, CommitFileEntry[]>>(new Map());
  const [loadingCommitHashes, setLoadingCommitHashes] = React.useState<Set<string>>(new Set());
  const [remoteUrl, setRemoteUrl] = React.useState<string | null>(null);
  const [gitmojiEmojis, setGitmojiEmojis] = React.useState<GitmojiEntry[]>([]);
  const [gitmojiSearch, setGitmojiSearch] = React.useState('');

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
      for (const hash of hashesToLoad) {
        next.add(hash);
      }
      return next;
    });

    for (const hash of hashesToLoad) {
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
    }
  }, [expandedCommitHashes, currentDirectory, git, commitFilesMap, loadingCommitHashes]);

  React.useEffect(() => {
    if (!currentDirectory) return;
    gitViewSnapshots.set(currentDirectory, {
      directory: currentDirectory,
      selectedPaths: Array.from(selectedPaths),
      commitMessage,
      generatedHighlights,
    });
  }, [commitMessage, currentDirectory, selectedPaths, generatedHighlights]);

  React.useEffect(() => {
    loadProfiles();
    loadGlobalIdentity();
    loadDefaultGitIdentityId();
  }, [loadProfiles, loadGlobalIdentity, loadDefaultGitIdentityId]);

  React.useEffect(() => {
    if (!currentDirectory || !git?.getRemoteUrl) {
      setRemoteUrl(null);
      return;
    }
    git.getRemoteUrl(currentDirectory).then(setRemoteUrl).catch(() => setRemoteUrl(null));
  }, [currentDirectory, git]);

  React.useEffect(() => {
    if (!settingsGitmojiEnabled) {
      setGitmojiEmojis([]);
      return;
    }

    let cancelled = false;

    const cached = readGitmojiCache();
    if (cached) {
      setGitmojiEmojis(cached.gitmojis);
      if (isGitmojiCacheFresh(cached)) {
        return () => {
          cancelled = true;
        };
      }
    }

    const loadGitmojis = async () => {
      try {
        const response = await fetch(GITMOJI_SOURCE_URL);
        if (!response.ok) {
          throw new Error(`Failed to load gitmojis: ${response.statusText}`);
        }
        const payload = (await response.json()) as { gitmojis?: GitmojiEntry[] };
        const gitmojis = Array.isArray(payload.gitmojis) ? payload.gitmojis.filter(isGitmojiEntry) : [];
        if (!cancelled) {
          setGitmojiEmojis(gitmojis);
          writeGitmojiCache(gitmojis);
        }
      } catch (error) {
        if (!cancelled) {
          console.warn('Failed to load gitmoji list:', error);
        }
      }
    };

    void loadGitmojis();

    return () => {
      cancelled = true;
    };
  }, [settingsGitmojiEnabled]);

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

  React.useEffect(() => {
    if (!currentDirectory) return;
    if (!git?.hasLocalIdentity) return;
    if (isGitRepo !== true) return;

    const defaultId = typeof defaultGitIdentityId === 'string' ? defaultGitIdentityId.trim() : '';
    if (!defaultId || defaultId === 'global') return;

    const previousAttempt = autoAppliedDefaultRef.current.get(currentDirectory);
    if (previousAttempt === defaultId) return;

    let cancelled = false;

    const run = async () => {
      try {
        const hasLocal = await git.hasLocalIdentity?.(currentDirectory);
        if (cancelled) return;
        if (hasLocal === true) return;

        beginIdentityApply();
        await git.setGitIdentity(currentDirectory, defaultId);
        autoAppliedDefaultRef.current.set(currentDirectory, defaultId);
        await refreshIdentity();
      } catch (error) {
        console.warn('Failed to auto-apply default git identity:', error);
      } finally {
        if (!cancelled) {
          endIdentityApply();
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [beginIdentityApply, currentDirectory, defaultGitIdentityId, endIdentityApply, git, isGitRepo, refreshIdentity]);

    const changeEntries = React.useMemo(() => {
    if (!status) return [];
    const files = status.files ?? [];
    const unique = new Map<string, (typeof files)[number]>();

    for (const file of files) {
      unique.set(file.path, file);
    }

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

      for (const file of changeEntries) {
        if (previousSet.has(file.path)) {
          next.add(file.path);
        } else if (!hasUserAdjustedSelection) {
          next.add(file.path);
        }
      }

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
        let finalSubject = subject;
        if (settingsGitmojiEnabled && gitmojiEmojis.length > 0) {
          const match = matchGitmojiFromSubject(subject, gitmojiEmojis);
          if (match) {
            const { code, emoji } = match;
            if (!subject.startsWith(code) && !subject.startsWith(emoji)) {
              finalSubject = `${code} ${subject}`;
            }
          }
        }
        setCommitMessage(finalSubject);
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
  }, [currentDirectory, selectedPaths, git, settingsGitmojiEnabled, gitmojiEmojis]);

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
    beginIdentityApply();

    try {
      await git.setGitIdentity(currentDirectory, profile.id);
      toast.success(`Applied "${profile.name}" to repository`);
      await refreshIdentity();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to apply git identity';
      toast.error(message);
    } finally {
      endIdentityApply();
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
          normalized = `https://${normalized.slice(4).replace(':', '/')}`;
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

  const handleSelectGitmoji = React.useCallback((emoji: string, code: string) => {
    const token = code || emoji;
    setCommitMessage((current) => {
      const trimmed = current.trimStart();
      if (trimmed.startsWith(emoji) || (code && trimmed.startsWith(code))) {
        return current;
      }
      const prefix = token.endsWith(' ') ? token : `${token} `;
      return `${prefix}${current}`.trimStart();
    });
    setGitmojiSearch('');
    setIsGitmojiPickerOpen(false);
  }, []);

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
                  gitmojiEnabled={settingsGitmojiEnabled}
                  onOpenGitmojiPicker={() => setIsGitmojiPickerOpen(true)}
                />
              )}
            </div>

            {currentDirectory && status?.current ? (
              <PullRequestSection
                directory={currentDirectory}
                branch={status.current}
                baseBranch={baseBranch}
              />
            ) : null}

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

        <Dialog open={isGitmojiPickerOpen} onOpenChange={setIsGitmojiPickerOpen}>
          <DialogContent className="max-w-md p-0 overflow-hidden">
            <DialogHeader className="px-4 pt-4">
              <DialogTitle>Pick a gitmoji</DialogTitle>
            </DialogHeader>
            <Command className="h-[420px]">
              <CommandInput
                placeholder="Search gitmojis..."
                value={gitmojiSearch}
                onValueChange={setGitmojiSearch}
              />
              <CommandList>
                <CommandEmpty>No gitmojis found.</CommandEmpty>
                <CommandGroup>
                  {(gitmojiEmojis.length === 0
                    ? []
                    : gitmojiEmojis.filter((entry) => {
                        const term = gitmojiSearch.trim().toLowerCase();
                        if (!term) return true;
                        return (
                          entry.emoji.includes(term) ||
                          entry.code.toLowerCase().includes(term) ||
                          entry.description.toLowerCase().includes(term)
                        );
                      })
                  ).map((entry) => (
                    <CommandItem
                      key={entry.code}
                      onSelect={() => handleSelectGitmoji(entry.emoji, entry.code)}
                    >
                      <span className="text-lg">{entry.emoji}</span>
                      <span className="typography-ui-label text-foreground">{entry.code}</span>
                      <span className="typography-meta text-muted-foreground">{entry.description}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </DialogContent>
        </Dialog>

    </div>
  );
};
