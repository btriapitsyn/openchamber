import React from 'react';
import type { Session } from '@opencode-ai/sdk/v2';
import type { RuntimeAPIs } from '@/lib/api/types';
import { useDirectoryStore } from '@/stores/useDirectoryStore';
import { useGitHubAuthStore } from '@/stores/useGitHubAuthStore';
import { useGitHubPrStatusStore } from '@/stores/useGitHubPrStatusStore';
import { useProjectsStore } from '@/stores/useProjectsStore';
import { useSessionStore } from '@/stores/useSessionStore';

const MAX_BACKGROUND_PR_DIRECTORIES = 50;
const BRANCH_REFRESH_TTL_MS = 2 * 60_000;
const BRANCH_REFRESH_INTERVAL_MS = 60_000;

const normalizePath = (value?: string | null): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const normalized = trimmed.replace(/\\/g, '/');
  if (normalized === '/') {
    return '/';
  }
  return normalized.replace(/\/+$/, '');
};

type SessionLike = Session & {
  directory?: string | null;
  project?: { worktree?: string | null } | null;
};

type BranchCacheEntry = {
  branch: string | null;
  fetchedAt: number;
};

export const useGitHubPrBackgroundTracking = (
  github: RuntimeAPIs['github'] | undefined,
  git: RuntimeAPIs['git'],
): void => {
  const currentDirectory = useDirectoryStore((state) => state.currentDirectory);
  const projects = useProjectsStore((state) => state.projects);
  const sessions = useSessionStore((state) => state.sessions);
  const archivedSessions = useSessionStore((state) => state.archivedSessions);
  const availableWorktreesByProject = useSessionStore((state) => state.availableWorktreesByProject);
  const worktreeMetadata = useSessionStore((state) => state.worktreeMetadata);

  const githubAuthStatus = useGitHubAuthStore((state) => state.status);
  const githubAuthChecked = useGitHubAuthStore((state) => state.hasChecked);
  const refreshGitHubAuthStatus = useGitHubAuthStore((state) => state.refreshStatus);

  const syncBackgroundTargets = useGitHubPrStatusStore((state) => state.syncBackgroundTargets);

  const [branchCache, setBranchCache] = React.useState<Map<string, BranchCacheEntry>>(new Map());
  const branchCacheRef = React.useRef<Map<string, BranchCacheEntry>>(new Map());

  React.useEffect(() => {
    branchCacheRef.current = branchCache;
  }, [branchCache]);

  React.useEffect(() => {
    if (!github || githubAuthChecked) {
      return;
    }
    void refreshGitHubAuthStatus(github);
  }, [github, githubAuthChecked, refreshGitHubAuthStatus]);

  const candidateDirectories = React.useMemo(() => {
    const ordered = new Map<string, string>();
    const add = (value?: string | null) => {
      const normalized = normalizePath(value);
      if (!normalized || ordered.has(normalized)) {
        return;
      }
      ordered.set(normalized, normalized);
    };

    add(currentDirectory);
    projects.forEach((project) => {
      add(project.path);
    });
    availableWorktreesByProject.forEach((worktrees) => {
      worktrees.forEach((worktree) => {
        add(worktree.path);
      });
    });
    worktreeMetadata.forEach((metadata) => {
      add(metadata.path);
    });

    [...sessions, ...archivedSessions]
      .sort((a, b) => (b.time?.updated ?? 0) - (a.time?.updated ?? 0))
      .forEach((rawSession) => {
        const session = rawSession as SessionLike;
        add(session.directory ?? null);
        add(session.project?.worktree ?? null);
      });

    return Array.from(ordered.values()).slice(0, MAX_BACKGROUND_PR_DIRECTORIES);
  }, [archivedSessions, availableWorktreesByProject, currentDirectory, projects, sessions, worktreeMetadata]);

  React.useEffect(() => {
    let cancelled = false;

    const refreshBranches = async (force = false) => {
      const now = Date.now();
      const directoriesToFetch = candidateDirectories.filter((directory) => {
        const cached = branchCacheRef.current.get(directory);
        if (!cached) {
          return true;
        }
        if (force) {
          return true;
        }
        return now - cached.fetchedAt > BRANCH_REFRESH_TTL_MS;
      });

      if (directoriesToFetch.length === 0) {
        return;
      }

      const results = await Promise.all(
        directoriesToFetch.map(async (directory) => {
          try {
            const status = await git.getGitStatus(directory);
            const branch = typeof status.current === 'string' ? status.current.trim() : '';
            return { directory, branch: branch && branch !== 'HEAD' ? branch : null };
          } catch {
            return { directory, branch: null };
          }
        }),
      );

      if (cancelled) {
        return;
      }

      setBranchCache((prev) => {
        const next = new Map(prev);
        let changed = false;
        results.forEach(({ directory, branch }) => {
          const previous = next.get(directory);
          const fetchedAt = Date.now();
          if (!previous || previous.branch !== branch) {
            changed = true;
          }
          if (!previous || previous.fetchedAt !== fetchedAt || previous.branch !== branch) {
            next.set(directory, { branch, fetchedAt });
          }
        });

        if (!changed && results.length > 0) {
          return prev;
        }

        branchCacheRef.current = next;
        return next;
      });
    };

    void refreshBranches();

    const intervalId = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        return;
      }
      void refreshBranches();
    }, BRANCH_REFRESH_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [candidateDirectories, git]);

  React.useEffect(() => {
    const validDirectories = new Set(candidateDirectories);
    setBranchCache((prev) => {
      let changed = false;
      const next = new Map<string, BranchCacheEntry>();
      prev.forEach((value, key) => {
        if (!validDirectories.has(key)) {
          changed = true;
          return;
        }
        next.set(key, value);
      });
      if (!changed) {
        return prev;
      }
      branchCacheRef.current = next;
      return next;
    });
  }, [candidateDirectories]);

  const targets = React.useMemo(() => {
    const result: Array<{ directory: string; branch: string; remoteName?: string | null }> = [];
    candidateDirectories.forEach((directory) => {
      const cached = branchCache.get(directory);
      if (!cached?.branch) {
        return;
      }
      result.push({
        directory,
        branch: cached.branch,
        remoteName: null,
      });
    });
    return result;
  }, [branchCache, candidateDirectories]);

  React.useEffect(() => {
    syncBackgroundTargets({
      targets,
      github,
      githubAuthChecked,
      githubConnected: githubAuthStatus?.connected ?? null,
    });
  }, [github, githubAuthChecked, githubAuthStatus?.connected, syncBackgroundTargets, targets]);
};
