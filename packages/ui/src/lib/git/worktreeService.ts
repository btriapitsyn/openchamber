import { addGitWorktree, deleteGitBranch, deleteRemoteBranch, getGitStatus, listGitWorktrees, removeGitWorktree, type GitAddWorktreePayload, type GitWorktreeInfo } from '@/lib/gitApi';
import { opencodeClient } from '@/lib/opencode/client';
import type { WorktreeMetadata } from '@/types/worktree';

const WORKTREE_ROOT = '.openchamber';

const normalize = (value: string): string => {
  if (!value) {
    return '';
  }
  const replaced = value.replace(/\\/g, '/');
  if (replaced === '/') {
    return '/';
  }
  return replaced.replace(/\/+$/, '');
};

const joinPath = (base: string, segment: string): string => {
  const normalizedBase = normalize(base);
  const sanitizedSegment = segment.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
  if (!normalizedBase || normalizedBase === '/') {
    return `/${sanitizedSegment}`;
  }
  return `${normalizedBase}/${sanitizedSegment}`;
};

const shortBranchLabel = (branch?: string): string => {
  if (!branch) {
    return '';
  }
  if (branch.startsWith('refs/heads/')) {
    return branch.substring('refs/heads/'.length);
  }
  if (branch.startsWith('heads/')) {
    return branch.substring('heads/'.length);
  }
  if (branch.startsWith('refs/')) {
    return branch.substring('refs/'.length);
  }
  return branch;
};

const ensureDirectory = async (path: string) => {
  try {
    await opencodeClient.createDirectory(path);
  } catch (error) {

    if (error instanceof Error) {
      if (/exist/i.test(error.message)) {
        return;
      }
    }
    throw error;
  }
};

export interface CreateWorktreeOptions {
  projectDirectory: string;
  worktreeSlug: string;
  branch: string;
  createBranch?: boolean;
  startPoint?: string;
}

export interface RemoveWorktreeOptions {
  projectDirectory: string;
  path: string;
  force?: boolean;
}

export interface ArchiveWorktreeOptions {
  projectDirectory: string;
  path: string;
  branch: string;
  force?: boolean;
  deleteRemote?: boolean;
  remote?: string;
}

export async function resolveWorktreePath(projectDirectory: string, worktreeSlug: string): Promise<string> {
  const normalizedProject = normalize(projectDirectory);
  const root = joinPath(normalizedProject, WORKTREE_ROOT);
  await ensureDirectory(root);
  return joinPath(root, worktreeSlug);
}

export async function createWorktree(options: CreateWorktreeOptions): Promise<WorktreeMetadata> {
  const { projectDirectory, worktreeSlug, branch, createBranch, startPoint } = options;
  const normalizedProject = normalize(projectDirectory);
  const worktreePath = await resolveWorktreePath(normalizedProject, worktreeSlug);

  const payload: GitAddWorktreePayload = {
    path: worktreePath,
    branch,
    createBranch: Boolean(createBranch),
    startPoint: startPoint?.trim() || undefined,
  };

  await addGitWorktree(normalizedProject, payload);

  return {
    path: worktreePath,
    branch,
    label: shortBranchLabel(branch),
    projectDirectory: normalizedProject,
    relativePath: worktreePath.startsWith(`${normalizedProject}/`)
      ? worktreePath.slice(normalizedProject.length + 1)
      : worktreePath,
  };
}

export async function removeWorktree(options: RemoveWorktreeOptions): Promise<void> {
  const { projectDirectory, path, force } = options;
  const normalizedProject = normalize(projectDirectory);
  await removeGitWorktree(normalizedProject, { path, force });
}

export async function archiveWorktree(options: ArchiveWorktreeOptions): Promise<void> {
  const { projectDirectory, path, branch, force, deleteRemote, remote } = options;
  const normalizedProject = normalize(projectDirectory);
  const normalizedBranch = branch.startsWith('refs/heads/')
    ? branch.substring('refs/heads/'.length)
    : branch;

  await removeGitWorktree(normalizedProject, { path, force });
  if (normalizedBranch) {
    await deleteGitBranch(normalizedProject, { branch: normalizedBranch, force: true });
    if (deleteRemote) {
      try {
        await deleteRemoteBranch(normalizedProject, {
          branch: normalizedBranch,
          remote,
        });
      } catch (error) {
        console.warn('Failed to delete remote branch during worktree archive:', error);
      }
    }
  }
}

export async function listWorktrees(projectDirectory: string): Promise<GitWorktreeInfo[]> {
  const normalizedProject = normalize(projectDirectory);
  return listGitWorktrees(normalizedProject);
}

export async function getWorktreeStatus(worktreePath: string): Promise<WorktreeMetadata['status']> {
  const normalizedPath = normalize(worktreePath);
  const status = await getGitStatus(normalizedPath);
  return {
    isDirty: !status.isClean,
    ahead: status.ahead,
    behind: status.behind,
    upstream: status.tracking,
  };
}

export function mapWorktreeToMetadata(projectDirectory: string, info: GitWorktreeInfo): WorktreeMetadata {
  const normalizedProject = normalize(projectDirectory);
  const normalizedPath = normalize(info.worktree);
  return {
    path: normalizedPath,
    branch: info.branch ?? '',
    label: shortBranchLabel(info.branch ?? ''),
    projectDirectory: normalizedProject,
    relativePath: normalizedPath.startsWith(`${normalizedProject}/`)
      ? normalizedPath.slice(normalizedProject.length + 1)
      : normalizedPath,
  };
}
