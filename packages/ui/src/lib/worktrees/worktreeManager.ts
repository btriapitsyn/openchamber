import { substituteCommandVariables } from '@/lib/openchamberConfig';
import type { WorktreeMetadata } from '@/types/worktree';
import {
  createGitWorktree,
  deleteGitWorktree,
  deleteRemoteBranch,
  listGitWorktrees,
  validateGitWorktree,
} from '@/lib/gitApi';
import type {
  CreateGitWorktreePayload,
  GitWorktreeValidationResult,
} from '@/lib/api/types';

export type ProjectRef = { id: string; path: string };

const normalizePath = (value: string): string => {
  const replaced = value.replace(/\\/g, '/');
  if (replaced === '/') {
    return '/';
  }
  return replaced.length > 1 ? replaced.replace(/\/+$/, '') : replaced;
};

const slugifyWorktreeName = (value: string): string => {
  return value
    .trim()
    .replace(/^refs\/heads\//, '')
    .replace(/^heads\//, '')
    .replace(/\s+/g, '-')
    .replace(/^\/+|\/+$/g, '')
    .split('/').join('-')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
};

const normalizeBranchName = (value: string): string => {
  return value
    .trim()
    .replace(/^refs\/heads\//, '')
    .replace(/^heads\//, '')
    .replace(/\s+/g, '-')
    .replace(/^\/+|\/+$/g, '');
};

const deriveSdkWorktreeNameFromDirectory = (directory: string): string => {
  const normalized = normalizePath(directory);
  const parts = normalized.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? normalized;
};

export const buildSdkStartCommand = (args: {
  projectDirectory: string;
  setupCommands: string[];
}): string | undefined => {
  const commands: string[] = [];

  for (const raw of args.setupCommands) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    commands.push(
      substituteCommandVariables(trimmed, { rootWorktreePath: args.projectDirectory })
    );
  }

  const joined = commands.filter(Boolean).join(' && ');
  return joined.trim().length > 0 ? joined : undefined;
};

const toCreatePayload = (args: {
  preferredName?: string;
  setupCommands?: string[];
  mode?: 'new' | 'existing';
  worktreeName?: string;
  branchName?: string;
  existingBranch?: string;
  startRef?: string;
  setUpstream?: boolean;
  upstreamRemote?: string;
  upstreamBranch?: string;
  ensureRemoteName?: string;
  ensureRemoteUrl?: string;
}, projectDirectory: string): CreateGitWorktreePayload => {
  const mode = args.mode === 'existing' ? 'existing' : 'new';

  const worktreeNameSeed = args.worktreeName ?? args.preferredName ?? '';
  const worktreeName = slugifyWorktreeName(worktreeNameSeed);

  const branchNameSeed = args.branchName ?? (mode === 'new' ? args.preferredName : undefined) ?? '';
  const branchName = normalizeBranchName(branchNameSeed);

  const existingBranch = normalizeBranchName(args.existingBranch ?? args.branchName ?? '');
  const startRef = (args.startRef || '').trim();

  const commands = Array.isArray(args.setupCommands) ? args.setupCommands : [];
  const startCommand = buildSdkStartCommand({
    projectDirectory,
    setupCommands: commands,
  });

  return {
    mode,
    ...(worktreeName ? { worktreeName } : {}),
    ...(branchName ? { branchName } : {}),
    ...(existingBranch ? { existingBranch } : {}),
    ...(startRef ? { startRef } : {}),
    ...(startCommand ? { startCommand } : {}),
    ...(args.setUpstream ? { setUpstream: true } : {}),
    ...(args.upstreamRemote ? { upstreamRemote: args.upstreamRemote } : {}),
    ...(args.upstreamBranch ? { upstreamBranch: args.upstreamBranch } : {}),
    ...(args.ensureRemoteName ? { ensureRemoteName: args.ensureRemoteName } : {}),
    ...(args.ensureRemoteUrl ? { ensureRemoteUrl: args.ensureRemoteUrl } : {}),
  };
};

export async function listProjectWorktrees(project: ProjectRef): Promise<WorktreeMetadata[]> {
  const projectDirectory = project.path;
  const normalizedProjectDirectory = normalizePath(projectDirectory);

  const worktrees = await listGitWorktrees(projectDirectory).catch(() => []);
  const results: WorktreeMetadata[] = worktrees
    .filter((entry) => typeof entry.worktree === 'string' && entry.worktree.trim().length > 0)
    .map((entry) => {
      const worktreePath = normalizePath(entry.worktree);
      return {
        source: 'sdk' as const,
        name: deriveSdkWorktreeNameFromDirectory(worktreePath),
        path: worktreePath,
        projectDirectory,
        branch: (entry.branch || '').replace(/^refs\/heads\//, '').trim(),
        label: (entry.branch || '').replace(/^refs\/heads\//, '').trim() || deriveSdkWorktreeNameFromDirectory(worktreePath),
      };
    })
    .filter((entry) => normalizePath(entry.path) !== normalizedProjectDirectory);

  return results.sort((a, b) => {
    const aLabel = (a.label || a.branch || a.path).toLowerCase();
    const bLabel = (b.label || b.branch || b.path).toLowerCase();
    return aLabel.localeCompare(bLabel);
  });
}

export type CreateSdkWorktreeArgs = {
  preferredName?: string;
  setupCommands?: string[];
  mode?: 'new' | 'existing';
  worktreeName?: string;
  branchName?: string;
  existingBranch?: string;
  startRef?: string;
  setUpstream?: boolean;
  upstreamRemote?: string;
  upstreamBranch?: string;
  ensureRemoteName?: string;
  ensureRemoteUrl?: string;
};

export async function createSdkWorktree(project: ProjectRef, args: CreateSdkWorktreeArgs): Promise<WorktreeMetadata> {
  const projectDirectory = project.path;
  const payload = toCreatePayload(args, projectDirectory);

  const created = await createGitWorktree(projectDirectory, payload);
  const returnedName = typeof created?.name === 'string' ? created.name : '';
  const returnedBranch = typeof created?.branch === 'string' ? created.branch : '';
  const returnedDirectory = typeof created?.directory === 'string' ? created.directory : '';

  if (!returnedName || !returnedDirectory) {
    throw new Error('Worktree create missing name/directory');
  }

  const metadata: WorktreeMetadata = {
    source: 'sdk',
    name: returnedName,
    path: normalizePath(returnedDirectory),
    projectDirectory,
    branch: returnedBranch,
    label: returnedBranch || returnedName,
  };

  return metadata;
}

export async function validateSdkWorktree(project: ProjectRef, args: CreateSdkWorktreeArgs): Promise<GitWorktreeValidationResult> {
  const projectDirectory = project.path;
  const payload = toCreatePayload(args, projectDirectory);
  return validateGitWorktree(projectDirectory, payload);
}

export async function removeProjectWorktree(project: ProjectRef, worktree: WorktreeMetadata, options?: {
  deleteRemoteBranch?: boolean;
  deleteLocalBranch?: boolean;
  remoteName?: string;
  force?: boolean;
}): Promise<void> {
  const projectDirectory = project.path;

  const deleteRemote = Boolean(options?.deleteRemoteBranch);
  const deleteLocalBranch = options?.deleteLocalBranch === true;
  const remoteName = options?.remoteName;
  const raw = await deleteGitWorktree(projectDirectory, {
    directory: worktree.path,
    deleteLocalBranch,
  });
  if (!raw?.success) {
    throw new Error('Worktree removal failed');
  }

  const branchName = (worktree.branch || '').replace(/^refs\/heads\//, '').trim();
  if (deleteRemote && branchName) {
    await deleteRemoteBranch(projectDirectory, { branch: branchName, remote: remoteName }).catch(() => undefined);
  }
}
