import { create } from 'zustand';
import type { GitHubPullRequestStatus, RuntimeAPIs } from '@/lib/api/types';

const PR_REVALIDATE_TTL_MS = 90_000;
const PR_REVALIDATE_INTERVAL_MS = 15_000;
const PR_DISCOVERY_INTERVAL_MS = 5 * 60_000;
const PR_BOOTSTRAP_RETRY_DELAYS_MS = [2_000, 5_000] as const;
const PR_OPEN_BUSY_INTERVAL_MS = 60_000;
const PR_OPEN_DEFAULT_INTERVAL_MS = 2 * 60_000;
const PR_OPEN_STABLE_INTERVAL_MS = 5 * 60_000;

const isTerminalPrState = (state: string | null | undefined): boolean => state === 'closed' || state === 'merged';
const isPendingChecks = (status: GitHubPullRequestStatus | null): boolean => {
  const checks = status?.checks;
  if (!checks) {
    return false;
  }
  return checks.state === 'pending' || checks.pending > 0;
};

export const getGitHubPrStatusKey = (directory: string, branch: string, remoteName?: string | null): string => {
  void remoteName;
  return `${directory}::${branch}`;
};

type RefreshOptions = {
  force?: boolean;
  onlyExistingPr?: boolean;
  silent?: boolean;
  markInitialResolved?: boolean;
};

type PrTrackingTarget = {
  directory: string;
  branch: string;
  remoteName?: string | null;
};

type PrRuntimeParams = {
  directory: string;
  branch: string;
  remoteName: string | null;
  canShow: boolean;
  github?: RuntimeAPIs['github'];
  githubAuthChecked: boolean;
  githubConnected: boolean | null;
};

type PrStatusEntry = {
  status: GitHubPullRequestStatus | null;
  isLoading: boolean;
  error: string | null;
  isInitialStatusResolved: boolean;
  lastRefreshAt: number;
  lastDiscoveryPollAt: number;
  watchers: number;
  params: PrRuntimeParams | null;
};

type GitHubPrStatusStore = {
  entries: Record<string, PrStatusEntry>;
  activeRequestCount: number;
  totalRequestCount: number;
  ensureEntry: (key: string) => void;
  setParams: (key: string, params: PrRuntimeParams) => void;
  startWatching: (key: string) => void;
  stopWatching: (key: string) => void;
  refresh: (key: string, options?: RefreshOptions) => Promise<void>;
  updateStatus: (key: string, updater: (prev: GitHubPullRequestStatus | null) => GitHubPullRequestStatus | null) => void;
  syncBackgroundTargets: (args: {
    targets: PrTrackingTarget[];
    github?: RuntimeAPIs['github'];
    githubAuthChecked: boolean;
    githubConnected: boolean | null;
  }) => void;
};

const timers = new Map<string, number>();
const bootstrapTimers = new Map<string, number[]>();
const inFlightBySignature = new Set<string>();
const lastRefreshBySignature = new Map<string, number>();
const backgroundWatchingKeys = new Set<string>();

const getSignatureFromParams = (params: PrRuntimeParams | null | undefined): string | null => {
  if (!params?.directory || !params.branch) {
    return null;
  }
  return `${params.directory}::${params.branch}`;
};

const getKeysBySignature = (entries: Record<string, PrStatusEntry>, signature: string): string[] => {
  return Object.entries(entries)
    .filter(([, entry]) => getSignatureFromParams(entry.params) === signature)
    .map(([key]) => key);
};

const pickFetchParamsForSignature = (
  entries: Record<string, PrStatusEntry>,
  signature: string,
  preferredKey: string,
): PrRuntimeParams | null => {
  const keys = getKeysBySignature(entries, signature);
  const candidates = keys
    .map((key) => entries[key])
    .filter((entry): entry is PrStatusEntry => Boolean(entry?.params))
    .map((entry) => entry.params)
    .filter((params): params is PrRuntimeParams => Boolean(params?.canShow && params.github?.prStatus));

  if (candidates.length === 0) {
    return null;
  }

  const preferred = entries[preferredKey]?.params;
  if (
    preferred
    && getSignatureFromParams(preferred) === signature
    && preferred.canShow
    && preferred.github?.prStatus
  ) {
    return preferred;
  }

  const withRemote = candidates.find((params) => Boolean(params.remoteName));
  if (withRemote) {
    return withRemote;
  }

  return candidates[0] ?? null;
};

const createEntry = (): PrStatusEntry => ({
  status: null,
  isLoading: false,
  error: null,
  isInitialStatusResolved: false,
  lastRefreshAt: 0,
  lastDiscoveryPollAt: 0,
  watchers: 0,
  params: null,
});

const mergeParams = (current: PrRuntimeParams | null, next: PrRuntimeParams): PrRuntimeParams => {
  if (!current) {
    return next;
  }

  return {
    ...current,
    ...next,
    remoteName: next.remoteName ?? current.remoteName ?? null,
  };
};

export const useGitHubPrStatusStore = create<GitHubPrStatusStore>((set, get) => ({
  entries: {},
  activeRequestCount: 0,
  totalRequestCount: 0,

  ensureEntry: (key) => {
    set((state) => {
      if (state.entries[key]) {
        return state;
      }
      return {
        entries: {
          ...state.entries,
          [key]: createEntry(),
        },
      };
    });
  },

  setParams: (key, params) => {
    set((state) => {
      const current = state.entries[key] ?? createEntry();
      return {
        entries: {
          ...state.entries,
          [key]: {
            ...current,
            params: mergeParams(current.params, params),
          },
        },
      };
    });
  },

  startWatching: (key) => {
    set((state) => {
      const current = state.entries[key] ?? createEntry();
      return {
        entries: {
          ...state.entries,
          [key]: {
            ...current,
            watchers: current.watchers + 1,
          },
        },
      };
    });

    if (timers.has(key)) {
      return;
    }

    const runBootstrapRefresh = (delayMs: number) => {
      const timerId = window.setTimeout(() => {
        if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
          return;
        }
        const entry = get().entries[key];
        if (!entry || entry.watchers <= 0) {
          return;
        }
        if (entry.status?.pr) {
          return;
        }
        void get().refresh(key, { force: true, silent: true, markInitialResolved: true });
      }, delayMs);
      const existing = bootstrapTimers.get(key) ?? [];
      existing.push(timerId);
      bootstrapTimers.set(key, existing);
    };

    void get().refresh(key, { force: true, silent: true, markInitialResolved: true });
    PR_BOOTSTRAP_RETRY_DELAYS_MS.forEach((delay) => runBootstrapRefresh(delay));

    const timerId = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        return;
      }

      const entry = get().entries[key];
      if (!entry || entry.watchers <= 0) {
        return;
      }

      const hasPr = Boolean(entry.status?.pr);
      if (!hasPr) {
        const now = Date.now();
        if (now - entry.lastDiscoveryPollAt < PR_DISCOVERY_INTERVAL_MS) {
          return;
        }
        set((state) => {
          const current = state.entries[key];
          if (!current) {
            return state;
          }
          return {
            entries: {
              ...state.entries,
              [key]: {
                ...current,
                lastDiscoveryPollAt: now,
              },
            },
          };
        });
        void get().refresh(key, { force: true, silent: true, markInitialResolved: true });
        return;
      }

      if (isTerminalPrState(entry.status?.pr?.state)) {
        return;
      }

      const elapsed = Date.now() - entry.lastRefreshAt;
      const nextInterval = isPendingChecks(entry.status)
        ? PR_OPEN_BUSY_INTERVAL_MS
        : (entry.status?.checks && entry.status.checks.state !== 'pending'
            ? PR_OPEN_STABLE_INTERVAL_MS
            : PR_OPEN_DEFAULT_INTERVAL_MS);
      if (elapsed < nextInterval) {
        return;
      }

      void get().refresh(key, { force: true, onlyExistingPr: true, silent: true, markInitialResolved: true });
    }, PR_REVALIDATE_INTERVAL_MS);

    timers.set(key, timerId);
  },

  stopWatching: (key) => {
    set((state) => {
      const current = state.entries[key];
      if (!current) {
        return state;
      }

      const watchers = Math.max(0, current.watchers - 1);
      return {
        entries: {
          ...state.entries,
          [key]: {
            ...current,
            watchers,
          },
        },
      };
    });

    const entry = get().entries[key];
    if (entry && entry.watchers > 0) {
      return;
    }

    const timerId = timers.get(key);
    if (typeof timerId === 'number') {
      window.clearInterval(timerId);
    }
    timers.delete(key);

    const pendingBootstrapTimers = bootstrapTimers.get(key);
    if (pendingBootstrapTimers && pendingBootstrapTimers.length > 0) {
      pendingBootstrapTimers.forEach((id) => {
        window.clearTimeout(id);
      });
    }
    bootstrapTimers.delete(key);
  },

  refresh: async (key, options) => {
    const state = get();
    const entry = state.entries[key];
    const signature = getSignatureFromParams(entry?.params);

    if (!entry || !signature) {
      return;
    }
    const signatureKeys = getKeysBySignature(state.entries, signature);
    const hasExistingPr = signatureKeys.some((signatureKey) => Boolean(state.entries[signatureKey]?.status?.pr));
    if (options?.onlyExistingPr && !hasExistingPr) {
      return;
    }
    const lastRefreshAt = lastRefreshBySignature.get(signature) ?? 0;
    if (!options?.force && Date.now() - lastRefreshAt < PR_REVALIDATE_TTL_MS) {
      return;
    }
    if (inFlightBySignature.has(signature)) {
      return;
    }

    const params = pickFetchParamsForSignature(state.entries, signature, key);
    if (!params) {
      return;
    }

    inFlightBySignature.add(signature);
    lastRefreshBySignature.set(signature, Date.now());

    set((prev) => {
      const nextEntries = { ...prev.entries };
      signatureKeys.forEach((signatureKey) => {
        const current = nextEntries[signatureKey];
        if (!current) {
          return;
        }
        nextEntries[signatureKey] = {
          ...current,
          lastRefreshAt: Date.now(),
          isLoading: options?.silent ? current.isLoading : true,
          error: null,
        };
      });
      return {
        entries: nextEntries,
      };
    });

    if (params.githubAuthChecked && params.githubConnected === false) {
      set((prev) => {
        const nextEntries = { ...prev.entries };
        signatureKeys.forEach((signatureKey) => {
          const current = nextEntries[signatureKey];
          if (!current) {
            return;
          }
          nextEntries[signatureKey] = {
            ...current,
            status: { connected: false },
            error: null,
            isLoading: options?.silent ? current.isLoading : false,
            isInitialStatusResolved: options?.markInitialResolved === false ? current.isInitialStatusResolved : true,
          };
        });
        return {
          entries: nextEntries,
        };
      });
      inFlightBySignature.delete(signature);
      return;
    }

    if (!params.github?.prStatus) {
      set((prev) => {
        const nextEntries = { ...prev.entries };
        signatureKeys.forEach((signatureKey) => {
          const current = nextEntries[signatureKey];
          if (!current) {
            return;
          }
          nextEntries[signatureKey] = {
            ...current,
            status: null,
            error: 'GitHub runtime API unavailable',
            isLoading: options?.silent ? current.isLoading : false,
            isInitialStatusResolved: options?.markInitialResolved === false ? current.isInitialStatusResolved : true,
          };
        });
        return {
          entries: nextEntries,
        };
      });
      inFlightBySignature.delete(signature);
      return;
    }

    try {
      set((prev) => ({
        ...prev,
        activeRequestCount: prev.activeRequestCount + 1,
        totalRequestCount: prev.totalRequestCount + 1,
      }));
      const next = await params.github.prStatus(params.directory, params.branch, params.remoteName ?? undefined);
      set((prev) => {
        const nextEntries = { ...prev.entries };
        signatureKeys.forEach((signatureKey) => {
          const current = nextEntries[signatureKey];
          if (!current) {
            return;
          }

          const prevPr = current.status?.pr;
          const nextPr = next.pr;
          const shouldCarryBody = Boolean(
            nextPr
            && prevPr
            && nextPr.number === prevPr.number
            && (!nextPr.body || !nextPr.body.trim())
            && typeof prevPr.body === 'string'
            && prevPr.body.trim().length > 0,
          );

          const status = shouldCarryBody && nextPr && prevPr?.body
            ? {
              ...next,
              pr: {
                ...nextPr,
                body: prevPr.body,
              },
            }
            : next;

          nextEntries[signatureKey] = {
            ...current,
            status,
            error: null,
            isLoading: options?.silent ? current.isLoading : false,
            isInitialStatusResolved: options?.markInitialResolved === false ? current.isInitialStatusResolved : true,
          };
        });

        return {
          entries: nextEntries,
        };
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set((prev) => {
        const nextEntries = { ...prev.entries };
        signatureKeys.forEach((signatureKey) => {
          const current = nextEntries[signatureKey];
          if (!current) {
            return;
          }
          nextEntries[signatureKey] = {
            ...current,
            error: message || 'Failed to load PR status',
            isLoading: options?.silent ? current.isLoading : false,
            isInitialStatusResolved: options?.markInitialResolved === false ? current.isInitialStatusResolved : true,
          };
        });
        return {
          entries: nextEntries,
        };
      });
    } finally {
      inFlightBySignature.delete(signature);
      set((prev) => ({ ...prev, activeRequestCount: Math.max(0, prev.activeRequestCount - 1) }));
    }
  },

  updateStatus: (key, updater) => {
    set((state) => {
      const current = state.entries[key] ?? createEntry();
      return {
        entries: {
          ...state.entries,
          [key]: {
            ...current,
            status: updater(current.status),
          },
        },
      };
    });
  },

  syncBackgroundTargets: ({ targets, github, githubAuthChecked, githubConnected }) => {
    if (!github || targets.length === 0) {
      Array.from(backgroundWatchingKeys).forEach((key) => {
        get().stopWatching(key);
        backgroundWatchingKeys.delete(key);
      });
      return;
    }

    const uniqueTargets = new Map<string, PrTrackingTarget>();
    targets.forEach((target) => {
      const directory = target.directory.trim();
      const branch = target.branch.trim();
      if (!directory || !branch) {
        return;
      }
      const key = getGitHubPrStatusKey(directory, branch, target.remoteName ?? null);
      if (!uniqueTargets.has(key)) {
        uniqueTargets.set(key, {
          directory,
          branch,
          remoteName: target.remoteName ?? null,
        });
      }
    });

    const nextKeys = new Set(uniqueTargets.keys());

    Array.from(backgroundWatchingKeys).forEach((key) => {
      if (nextKeys.has(key)) {
        return;
      }
      get().stopWatching(key);
      backgroundWatchingKeys.delete(key);
    });

    uniqueTargets.forEach((target, key) => {
      get().ensureEntry(key);
      get().setParams(key, {
        directory: target.directory,
        branch: target.branch,
        remoteName: target.remoteName ?? null,
        canShow: true,
        github,
        githubAuthChecked,
        githubConnected,
      });

      if (!backgroundWatchingKeys.has(key)) {
        get().startWatching(key);
        backgroundWatchingKeys.add(key);
      }
    });
  },
}));
