import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type {
  GitHubPRResponse,
  GitHubPRInfo,
  GitHubCreatePRPayload,
  GitHubMergeStrategy,
} from '@/lib/api/types';
import * as gitApi from '@/lib/gitApi';

const PR_POLL_INTERVAL = 30000; // 30 seconds
const PR_POLL_AFTER_ACTION = 5000; // 5 seconds after actions

interface DirectoryPRState {
  prInfo: GitHubPRInfo | null;
  hasPR: boolean;
  isLoading: boolean;
  error: string | null;
  lastFetch: number;
}

interface PRStore {
  directories: Map<string, DirectoryPRState>;
  activeDirectory: string | null;
  pollIntervalId: ReturnType<typeof setInterval> | null;

  setActiveDirectory: (directory: string | null) => void;
  getDirectoryState: (directory: string) => DirectoryPRState | null;

  fetchPR: (directory: string) => Promise<void>;
  createPR: (directory: string, payload: GitHubCreatePRPayload) => Promise<{ success: boolean; error?: string }>;
  mergePR: (directory: string, strategy?: GitHubMergeStrategy) => Promise<{ success: boolean; error?: string }>;
  refreshChecks: (directory: string) => Promise<{ error?: string } | undefined>;

  startPolling: () => void;
  stopPolling: () => void;
}

const createEmptyDirectoryState = (): DirectoryPRState => ({
  prInfo: null,
  hasPR: false,
  isLoading: false,
  error: null,
  lastFetch: 0,
});

export const usePRStore = create<PRStore>()(
  devtools(
    (set, get) => ({
      directories: new Map(),
      activeDirectory: null,
      pollIntervalId: null,

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

        // Fetch PR info when directory changes
        if (directory) {
          void get().fetchPR(directory);
        }
      },

      getDirectoryState: (directory) => {
        return get().directories.get(directory) ?? null;
      },

      fetchPR: async (directory) => {
        const { directories } = get();
        let dirState = directories.get(directory);

        if (!dirState) {
          dirState = createEmptyDirectoryState();
        }

        // Update loading state
        const newDirectories = new Map(directories);
        newDirectories.set(directory, { ...dirState, isLoading: true, error: null });
        set({ directories: newDirectories });

        try {
          const response: GitHubPRResponse = await gitApi.getGitHubPR(directory);

          const updatedDirectories = new Map(get().directories);
          const currentState = updatedDirectories.get(directory) ?? createEmptyDirectoryState();

          updatedDirectories.set(directory, {
            ...currentState,
            prInfo: response.pr ?? null,
            hasPR: response.hasPR,
            isLoading: false,
            error: response.error ?? null,
            lastFetch: Date.now(),
          });
          set({ directories: updatedDirectories });
        } catch (error) {
          const updatedDirectories = new Map(get().directories);
          const currentState = updatedDirectories.get(directory) ?? createEmptyDirectoryState();

          updatedDirectories.set(directory, {
            ...currentState,
            isLoading: false,
            error: error instanceof Error ? error.message : 'Failed to fetch PR info',
            lastFetch: Date.now(),
          });
          set({ directories: updatedDirectories });
        }
      },

      createPR: async (directory, payload) => {
        const { directories } = get();
        const dirState = directories.get(directory) ?? createEmptyDirectoryState();

        // Update loading state
        const newDirectories = new Map(directories);
        newDirectories.set(directory, { ...dirState, isLoading: true, error: null });
        set({ directories: newDirectories });

        try {
          const response = await gitApi.createGitHubPR(directory, payload);

          if (response.success && response.pr) {
            const updatedDirectories = new Map(get().directories);
            const currentState = updatedDirectories.get(directory) ?? createEmptyDirectoryState();

            updatedDirectories.set(directory, {
              ...currentState,
              prInfo: response.pr,
              hasPR: true,
              isLoading: false,
              error: null,
              lastFetch: Date.now(),
            });
            set({ directories: updatedDirectories });
            return { success: true };
          } else {
            const updatedDirectories = new Map(get().directories);
            const currentState = updatedDirectories.get(directory) ?? createEmptyDirectoryState();

            updatedDirectories.set(directory, {
              ...currentState,
              isLoading: false,
              error: response.error ?? 'Failed to create PR',
            });
            set({ directories: updatedDirectories });
            return { success: false, error: response.error };
          }
        } catch (error) {
          const updatedDirectories = new Map(get().directories);
          const currentState = updatedDirectories.get(directory) ?? createEmptyDirectoryState();
          const errorMessage = error instanceof Error ? error.message : 'Failed to create PR';

          updatedDirectories.set(directory, {
            ...currentState,
            isLoading: false,
            error: errorMessage,
          });
          set({ directories: updatedDirectories });
          return { success: false, error: errorMessage };
        }
      },

      mergePR: async (directory, strategy) => {
        const { directories } = get();
        const dirState = directories.get(directory) ?? createEmptyDirectoryState();

        // Update loading state
        const newDirectories = new Map(directories);
        newDirectories.set(directory, { ...dirState, isLoading: true, error: null });
        set({ directories: newDirectories });

        try {
          const response = await gitApi.mergeGitHubPR(directory, strategy ? { strategy } : undefined);

          if (response.success && response.merged) {
            // Refresh PR state after merge
            setTimeout(() => {
              void get().fetchPR(directory);
            }, PR_POLL_AFTER_ACTION);
            return { success: true };
          } else {
            const updatedDirectories = new Map(get().directories);
            const currentState = updatedDirectories.get(directory) ?? createEmptyDirectoryState();

            updatedDirectories.set(directory, {
              ...currentState,
              isLoading: false,
              error: response.error ?? 'Failed to merge PR',
            });
            set({ directories: updatedDirectories });
            return { success: false, error: response.error };
          }
        } catch (error) {
          const updatedDirectories = new Map(get().directories);
          const currentState = updatedDirectories.get(directory) ?? createEmptyDirectoryState();
          const errorMessage = error instanceof Error ? error.message : 'Failed to merge PR';

          updatedDirectories.set(directory, {
            ...currentState,
            isLoading: false,
            error: errorMessage,
          });
          set({ directories: updatedDirectories });
          return { success: false, error: errorMessage };
        }
      },

      refreshChecks: async (directory) => {
        const { directories } = get();
        const dirState = directories.get(directory) ?? createEmptyDirectoryState();

        // Update loading state
        const newDirectories = new Map(directories);
        newDirectories.set(directory, { ...dirState, isLoading: true });
        set({ directories: newDirectories });

        try {
          const response = await gitApi.refreshGitHubPRChecks(directory);

          const updatedDirectories = new Map(get().directories);
          const currentState = updatedDirectories.get(directory) ?? createEmptyDirectoryState();

          updatedDirectories.set(directory, {
            ...currentState,
            prInfo: response.pr ?? currentState.prInfo,
            hasPR: response.hasPR,
            isLoading: false,
            error: response.error ?? null,
            lastFetch: Date.now(),
          });
          set({ directories: updatedDirectories });
          return response.error ? { error: response.error } : undefined;
        } catch (error) {
          const updatedDirectories = new Map(get().directories);
          const currentState = updatedDirectories.get(directory) ?? createEmptyDirectoryState();
          const errorMessage = error instanceof Error ? error.message : 'Failed to refresh checks';

          updatedDirectories.set(directory, {
            ...currentState,
            isLoading: false,
            error: errorMessage,
          });
          set({ directories: updatedDirectories });
          return { error: errorMessage };
        }
      },

      startPolling: () => {
        const { pollIntervalId } = get();
        if (pollIntervalId) return;

        const intervalId = setInterval(() => {
          const { activeDirectory } = get();
          if (activeDirectory) {
            void get().fetchPR(activeDirectory);
          }
        }, PR_POLL_INTERVAL);

        set({ pollIntervalId: intervalId });
      },

      stopPolling: () => {
        const { pollIntervalId } = get();
        if (pollIntervalId) {
          clearInterval(pollIntervalId);
          set({ pollIntervalId: null });
        }
      },
    }),
    { name: 'pr-store' }
  )
);

// Selector hooks
export const usePRInfo = (directory: string | null) => {
  return usePRStore((state) => {
    if (!directory) return null;
    return state.directories.get(directory)?.prInfo ?? null;
  });
};

export const useHasPR = (directory: string | null) => {
  return usePRStore((state) => {
    if (!directory) return false;
    return state.directories.get(directory)?.hasPR ?? false;
  });
};

export const usePRLoading = (directory: string | null) => {
  return usePRStore((state) => {
    if (!directory) return false;
    return state.directories.get(directory)?.isLoading ?? false;
  });
};

export const usePRError = (directory: string | null) => {
  return usePRStore((state) => {
    if (!directory) return null;
    return state.directories.get(directory)?.error ?? null;
  });
};
