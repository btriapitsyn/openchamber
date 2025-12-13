import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type {
  GitStatus,
  GitBranch,
  GitLogResponse,
  GitIdentitySummary,
} from '@/lib/api/types';

const GIT_POLL_BASE_INTERVAL = 10000;
const GIT_POLL_MAX_INTERVAL = 20000;
const GIT_POLL_BACKOFF_STEP = 5000;
const LOG_STALE_THRESHOLD = 30000;

interface DirectoryGitState {
  isGitRepo: boolean | null;
  status: GitStatus | null;
  branches: GitBranch | null;
  log: GitLogResponse | null;
  identity: GitIdentitySummary | null;
  diffCache: Map<string, { original: string; modified: string; fetchedAt: number }>;
  lastStatusFetch: number;
  lastStatusChange: number;
  lastLogFetch: number;
  logMaxCount: number;
}

interface GitStore {

  directories: Map<string, DirectoryGitState>;

  activeDirectory: string | null;

  isLoadingStatus: boolean;
  isLoadingLog: boolean;
  isLoadingBranches: boolean;
  isLoadingIdentity: boolean;

  pollIntervalId: ReturnType<typeof setTimeout> | null;
  currentPollInterval: number;

  setActiveDirectory: (directory: string | null) => void;
  getDirectoryState: (directory: string) => DirectoryGitState | null;

  fetchStatus: (directory: string, git: GitAPI, options?: { silent?: boolean }) => Promise<boolean>;
  fetchBranches: (directory: string, git: GitAPI) => Promise<void>;
  fetchLog: (directory: string, git: GitAPI, maxCount?: number) => Promise<void>;
  fetchIdentity: (directory: string, git: GitAPI) => Promise<void>;
  fetchAll: (directory: string, git: GitAPI, options?: { force?: boolean }) => Promise<void>;

  getDiff: (directory: string, filePath: string) => { original: string; modified: string; fetchedAt: number } | null;
  setDiff: (directory: string, filePath: string, diff: { original: string; modified: string }) => void;
  clearDiffCache: (directory: string) => void;

  setLogMaxCount: (directory: string, maxCount: number) => void;

  startPolling: (git: GitAPI) => void;
  stopPolling: () => void;

  refresh: (git: GitAPI, options?: { force?: boolean }) => Promise<void>;
}

interface GitAPI {
  checkIsGitRepository: (directory: string) => Promise<boolean>;
  getGitStatus: (directory: string) => Promise<GitStatus>;
  getGitBranches: (directory: string) => Promise<GitBranch>;
  getGitLog: (directory: string, options?: { maxCount?: number }) => Promise<GitLogResponse>;
  getCurrentGitIdentity: (directory: string) => Promise<GitIdentitySummary | null>;
}

const createEmptyDirectoryState = (): DirectoryGitState => ({
  isGitRepo: null,
  status: null,
  branches: null,
  log: null,
  identity: null,
  diffCache: new Map(),
  lastStatusFetch: 0,
  lastStatusChange: 0,
  lastLogFetch: 0,
  logMaxCount: 25,
});

const haveDiffStatsChanged = (
  previous?: GitStatus['diffStats'],
  next?: GitStatus['diffStats']
): boolean => {
  if (!previous && !next) return false;
  if (!previous || !next) return true;

  const paths = new Set([...Object.keys(previous), ...Object.keys(next)]);
  for (const path of paths) {
    const prevEntry = previous[path];
    const nextEntry = next[path];

    if (!prevEntry && !nextEntry) continue;
    if (!prevEntry || !nextEntry) return true;
    if (
      prevEntry.insertions !== nextEntry.insertions ||
      prevEntry.deletions !== nextEntry.deletions
    ) {
      return true;
    }
  }

  return false;
};

const hasStatusChanged = (oldStatus: GitStatus | null, newStatus: GitStatus | null): boolean => {
  if (!oldStatus && !newStatus) return false;
  if (!oldStatus || !newStatus) return true;

  const oldFiles = oldStatus.files ?? [];
  const newFiles = newStatus.files ?? [];

  if (oldFiles.length !== newFiles.length) return true;
  if (oldStatus.ahead !== newStatus.ahead) return true;
  if (oldStatus.behind !== newStatus.behind) return true;
  if (oldStatus.current !== newStatus.current) return true;
  if (oldStatus.tracking !== newStatus.tracking) return true;
  if (oldStatus.isClean !== newStatus.isClean) return true;

  const oldPaths = new Set(oldFiles.map(f => `${f.path}:${f.index}:${f.working_dir}`));
  for (const file of newFiles) {
    if (!oldPaths.has(`${file.path}:${file.index}:${file.working_dir}`)) {
      return true;
    }
  }

  if (haveDiffStatsChanged(oldStatus.diffStats, newStatus.diffStats)) return true;

  return false;
};

export const useGitStore = create<GitStore>()(
  devtools(
    (set, get) => ({
      directories: new Map(),
      activeDirectory: null,
      isLoadingStatus: false,
      isLoadingLog: false,
      isLoadingBranches: false,
      isLoadingIdentity: false,
      pollIntervalId: null,
      currentPollInterval: GIT_POLL_BASE_INTERVAL,

      setActiveDirectory: (directory) => {
        const { activeDirectory, directories } = get();
        if (activeDirectory === directory) return;

        if (directory && !directories.has(directory)) {
          const newDirectories = new Map(directories);
          newDirectories.set(directory, createEmptyDirectoryState());
          set({ activeDirectory: directory, directories: newDirectories });
        } else {
          set({ activeDirectory: directory });
        }
      },

      getDirectoryState: (directory) => {
        return get().directories.get(directory) ?? null;
      },

      fetchStatus: async (directory, git, options = {}) => {
        const { silent = false } = options;
        const { directories } = get();
        let dirState = directories.get(directory);

        if (!dirState) {
          dirState = createEmptyDirectoryState();
        }

        if (!silent) {
          set({ isLoadingStatus: true });
        }

        let statusChanged = false;

        try {
          const isRepo = await git.checkIsGitRepository(directory);

          if (!isRepo) {
            const newDirectories = new Map(directories);
            newDirectories.set(directory, {
              ...dirState,
              isGitRepo: false,
              status: null,
              lastStatusFetch: Date.now(),
            });
            set({ directories: newDirectories, isLoadingStatus: false });
            return false;
          }

          const newStatus = await git.getGitStatus(directory);

          if (hasStatusChanged(dirState.status, newStatus)) {
            statusChanged = true;
            const newDirectories = new Map(get().directories);
            const currentDirState = newDirectories.get(directory) ?? createEmptyDirectoryState();

            newDirectories.set(directory, {
              ...currentDirState,
              isGitRepo: true,
              status: newStatus,
              diffCache: new Map(),
              lastStatusFetch: Date.now(),
              lastStatusChange: Date.now(),
            });
            set({ directories: newDirectories });
          } else {

            const newDirectories = new Map(get().directories);
            const currentDirState = newDirectories.get(directory) ?? createEmptyDirectoryState();
            newDirectories.set(directory, {
              ...currentDirState,
              isGitRepo: true,
              lastStatusFetch: Date.now(),
              lastStatusChange: currentDirState.lastStatusChange,
            });
            set({ directories: newDirectories });
          }
        } catch (error) {
          console.error('Failed to fetch git status:', error);
        } finally {
          if (!silent) {
            set({ isLoadingStatus: false });
          }
        }

        return statusChanged;
      },

      fetchBranches: async (directory, git) => {
        set({ isLoadingBranches: true });

        try {
          const branches = await git.getGitBranches(directory);
          const newDirectories = new Map(get().directories);
          const dirState = newDirectories.get(directory) ?? createEmptyDirectoryState();
          newDirectories.set(directory, { ...dirState, branches });
          set({ directories: newDirectories });
        } catch (error) {
          console.error('Failed to fetch git branches:', error);
        } finally {
          set({ isLoadingBranches: false });
        }
      },

      fetchLog: async (directory, git, maxCount) => {
        const { directories } = get();
        const dirState = directories.get(directory);
        const effectiveMaxCount = maxCount ?? dirState?.logMaxCount ?? 25;

        set({ isLoadingLog: true });

        try {
          const log = await git.getGitLog(directory, { maxCount: effectiveMaxCount });
          const newDirectories = new Map(get().directories);
          const currentDirState = newDirectories.get(directory) ?? createEmptyDirectoryState();
          newDirectories.set(directory, {
            ...currentDirState,
            log,
            lastLogFetch: Date.now(),
            logMaxCount: effectiveMaxCount,
          });
          set({ directories: newDirectories });
        } catch (error) {
          console.error('Failed to fetch git log:', error);
        } finally {
          set({ isLoadingLog: false });
        }
      },

      fetchIdentity: async (directory, git) => {
        set({ isLoadingIdentity: true });

        try {
          const identity = await git.getCurrentGitIdentity(directory);
          const newDirectories = new Map(get().directories);
          const dirState = newDirectories.get(directory) ?? createEmptyDirectoryState();
          newDirectories.set(directory, { ...dirState, identity });
          set({ directories: newDirectories });
        } catch (error) {
          console.error('Failed to fetch git identity:', error);
        } finally {
          set({ isLoadingIdentity: false });
        }
      },

      fetchAll: async (directory, git, options = {}) => {
        const { directories } = get();
        let dirState = directories.get(directory);

        if (!dirState) {
          dirState = createEmptyDirectoryState();
          const newDirectories = new Map(directories);
          newDirectories.set(directory, dirState);
          set({ directories: newDirectories });
        }

        const { force = false } = options;
        const now = Date.now();

        await get().fetchStatus(directory, git);

        const updatedDirState = get().directories.get(directory);
        if (!updatedDirState?.isGitRepo) return;

        await get().fetchBranches(directory, git);

        const logAge = now - (updatedDirState.lastLogFetch || 0);
        if (force || logAge > LOG_STALE_THRESHOLD || !updatedDirState.log) {
          await get().fetchLog(directory, git);
        }

        await get().fetchIdentity(directory, git);
      },

      getDiff: (directory, filePath) => {
        const dirState = get().directories.get(directory);
        return dirState?.diffCache.get(filePath) ?? null;
      },

      setDiff: (directory, filePath, diff) => {
        const newDirectories = new Map(get().directories);
        const dirState = newDirectories.get(directory) ?? createEmptyDirectoryState();
        const newDiffCache = new Map(dirState.diffCache);
        newDiffCache.set(filePath, { ...diff, fetchedAt: Date.now() });
        newDirectories.set(directory, { ...dirState, diffCache: newDiffCache });
        set({ directories: newDirectories });
      },

      clearDiffCache: (directory) => {
        const newDirectories = new Map(get().directories);
        const dirState = newDirectories.get(directory);
        if (dirState) {
          newDirectories.set(directory, { ...dirState, diffCache: new Map() });
          set({ directories: newDirectories });
        }
      },

      setLogMaxCount: (directory, maxCount) => {
        const newDirectories = new Map(get().directories);
        const dirState = newDirectories.get(directory) ?? createEmptyDirectoryState();
        newDirectories.set(directory, { ...dirState, logMaxCount: maxCount });
        set({ directories: newDirectories });
      },

      startPolling: (git) => {
        const { pollIntervalId } = get();
        if (pollIntervalId) return;

        const schedulePoll = () => {
          const { currentPollInterval } = get();
          const timeoutId = setTimeout(async () => {
            // Skip if tab not visible
            if (typeof document !== 'undefined' && document.hidden) {
              set({ pollIntervalId: schedulePoll() });
              return;
            }

            const { activeDirectory } = get();
            if (!activeDirectory) {
              set({ pollIntervalId: schedulePoll() });
              return;
            }

            const statusChanged = await get().fetchStatus(activeDirectory, git, { silent: true });
            if (statusChanged) {
              await get().fetchLog(activeDirectory, git);
              // Reset to base interval on changes
              set({ currentPollInterval: GIT_POLL_BASE_INTERVAL });
            } else {
              // Backoff when no changes
              const newInterval = Math.min(
                currentPollInterval + GIT_POLL_BACKOFF_STEP,
                GIT_POLL_MAX_INTERVAL
              );
              set({ currentPollInterval: newInterval });
            }

            // Schedule next poll
            const { pollIntervalId: currentId } = get();
            if (currentId !== null) {
              set({ pollIntervalId: schedulePoll() });
            }
          }, currentPollInterval);

          return timeoutId;
        };

        set({ pollIntervalId: schedulePoll(), currentPollInterval: GIT_POLL_BASE_INTERVAL });
      },

      stopPolling: () => {
        const { pollIntervalId } = get();
        if (pollIntervalId) {
          clearTimeout(pollIntervalId);
          set({ pollIntervalId: null, currentPollInterval: GIT_POLL_BASE_INTERVAL });
        }
      },

      refresh: async (git, options = {}) => {
        const { activeDirectory } = get();
        if (!activeDirectory) return;
        await get().fetchAll(activeDirectory, git, options);
      },
    }),
    { name: 'git-store' }
  )
);

export const useGitStatus = (directory: string | null) => {
  return useGitStore((state) => {
    if (!directory) return null;
    return state.directories.get(directory)?.status ?? null;
  });
};

export const useGitBranches = (directory: string | null) => {
  return useGitStore((state) => {
    if (!directory) return null;
    return state.directories.get(directory)?.branches ?? null;
  });
};

export const useGitLog = (directory: string | null) => {
  return useGitStore((state) => {
    if (!directory) return null;
    return state.directories.get(directory)?.log ?? null;
  });
};

export const useGitIdentity = (directory: string | null) => {
  return useGitStore((state) => {
    if (!directory) return null;
    return state.directories.get(directory)?.identity ?? null;
  });
};

export const useIsGitRepo = (directory: string | null) => {
  return useGitStore((state) => {
    if (!directory) return null;
    return state.directories.get(directory)?.isGitRepo ?? null;
  });
};

export const useGitFileCount = (directory: string | null) => {
  return useGitStore((state) => {
    if (!directory) return 0;
    return state.directories.get(directory)?.status?.files?.length ?? 0;
  });
};
