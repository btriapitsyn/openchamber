import React from 'react';
import { execCommand } from '@/lib/execCommands';
import type { WorktreeMetadata } from '@/types/worktree';

const normalizePath = (value: string): string => {
  if (!value) return '';
  const replaced = value.replace(/\\/g, '/');
  if (replaced === '/') return '/';
  return replaced.replace(/\/+$/, '');
};

/**
 * Derive the primary worktree (project) root from the absolute git directory.
 *
 * Secondary worktree:  /project/.git/worktrees/<name>  → /project
 * Primary worktree:    /project/.git                   → null (not a secondary)
 */
const deriveProjectRoot = (gitDir: string): string | null => {
  const normalized = normalizePath(gitDir);
  if (!normalized) return null;

  const marker = '/.git/worktrees/';
  const idx = normalized.indexOf(marker);
  if (idx > 0) {
    return normalized.slice(0, idx) || null;
  }

  return null;
};

/**
 * When the store-based WorktreeMetadata lookup fails, this hook falls back to
 * a single `git rev-parse --absolute-git-dir` call to detect whether
 * `currentDirectory` is a secondary worktree.  If it is, a minimal
 * WorktreeMetadata is synthesised so that "Re-integrate commits" and other
 * worktree features can function without explicit store entries.
 *
 * @param currentDirectory  Effective directory for the active session/tab.
 * @param storeMetadata     Result of the normal store-based lookup (may be undefined).
 * @param currentBranch     Current git branch (from status?.current in the parent).
 */
export function useDetectedWorktreeMetadata(
  currentDirectory: string | undefined,
  storeMetadata: WorktreeMetadata | undefined,
  currentBranch: string | undefined,
): WorktreeMetadata | undefined {
  const [detected, setDetected] = React.useState<WorktreeMetadata | undefined>();

  React.useEffect(() => {
    if (storeMetadata) {
      setDetected(undefined);
      return;
    }

    if (!currentDirectory) {
      setDetected(undefined);
      return;
    }

    let cancelled = false;
    void (async () => {
      const result = await execCommand('git rev-parse --absolute-git-dir', currentDirectory);
      if (cancelled) return;

      if (!result.success) {
        setDetected(undefined);
        return;
      }

      const gitDir = normalizePath((result.stdout || '').trim());
      const projectRoot = deriveProjectRoot(gitDir);

      if (!projectRoot) {
        setDetected(undefined);
        return;
      }

      // Sanity-check: secondary worktree path must differ from project root
      if (projectRoot === normalizePath(currentDirectory)) {
        setDetected(undefined);
        return;
      }

      const normalizedPath = normalizePath(currentDirectory);
      const branch = currentBranch || '';
      const name = normalizedPath.split('/').filter(Boolean).pop() || normalizedPath;

      setDetected({
        source: 'sdk',
        path: normalizedPath,
        projectDirectory: projectRoot,
        branch,
        label: branch || name,
        name,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [currentDirectory, storeMetadata, currentBranch]);

  return storeMetadata ?? detected;
}
