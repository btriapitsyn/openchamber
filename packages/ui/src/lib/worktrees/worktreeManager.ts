import { opencodeClient } from '@/lib/opencode/client';
import { substituteCommandVariables } from '@/lib/openchamberConfig';
import type { WorktreeMetadata } from '@/types/worktree';
import {
  listWorktrees as listLegacyGitWorktrees,
  mapWorktreeToMetadata,
  removeWorktree as removeLegacyWorktree,
} from '@/lib/git/worktreeService';
import { deleteGitBranch, deleteRemoteBranch, removeGitWorktree } from '@/lib/gitApi';

export type ProjectRef = { id: string; path: string };

const WORKTREE_LEGACY_ROOT = '.openchamber';

const normalizePath = (value: string): string => {
  const replaced = value.replace(/\\/g, '/');
  if (replaced === '/') {
    return '/';
  }
  return replaced.length > 1 ? replaced.replace(/\/+$/, '') : replaced;
};

const isLegacyWorktreePath = (projectDirectory: string, candidatePath: string): boolean => {
  const project = normalizePath(projectDirectory);
  const candidate = normalizePath(candidatePath);
  const root = `${project}/${WORKTREE_LEGACY_ROOT}/`;
  return candidate.startsWith(root);
};

const slugifyWorktreeName = (value: string): string => {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
};

const shellQuote = (value: string): string => {
  const v = value.trim();
  if (!v) {
    return "''";
  }
  return `'${v.replace(/'/g, `'\\''`)}'`;
};

const unwrapSdkData = (value: unknown): unknown => {
  if (!value || typeof value !== 'object') {
    return value;
  }
  const record = value as Record<string, unknown>;
  if ('data' in record) {
    return record.data;
  }
  return value;
};

const deriveSdkWorktreeNameFromDirectory = (directory: string): string => {
  const normalized = normalizePath(directory);
  const parts = normalized.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? normalized;
};

type WorktreeRemovalParams = Record<string, unknown>;
type WorktreeRemovalMethod = (params?: WorktreeRemovalParams) => Promise<unknown>;

const getWorktreeMethod = (client: unknown, key: string): WorktreeRemovalMethod | null => {
  if (!client || (typeof client !== 'object' && typeof client !== 'function')) {
    return null;
  }
  const record = client as Record<string, unknown>;
  const candidate = record[key];
  if (typeof candidate !== 'function') {
    return null;
  }
  // Keep method binding; SDK methods use `this.client`.
  return (params?: WorktreeRemovalParams) => (candidate as (this: unknown, p?: WorktreeRemovalParams) => Promise<unknown>).call(client, params);
};

export const buildSdkStartCommand = (args: {
  projectDirectory: string;
  setupCommands: string[];
  startPoint?: string | null;
}): string | undefined => {
  const commands: string[] = [];

  const startPoint = typeof args.startPoint === 'string' ? args.startPoint.trim() : '';
  if (startPoint && startPoint !== 'HEAD') {
    commands.push(`git reset --hard ${shellQuote(startPoint)}`);
  } else {
    commands.push('git reset --hard HEAD');
  }

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

export async function listProjectWorktrees(project: ProjectRef): Promise<WorktreeMetadata[]> {
  const projectDirectory = project.path;
  const scoped = opencodeClient.getScopedApiClient(projectDirectory);

  const results: WorktreeMetadata[] = [];

  // SDK worktrees (new)
  try {
    const raw = await scoped.worktree.list();
    const data = unwrapSdkData(raw);
    const directories = Array.isArray(data) ? data : [];

    for (const entry of directories) {
      if (typeof entry !== 'string' || entry.trim().length === 0) {
        continue;
      }
      const directory = normalizePath(entry);
      const name = deriveSdkWorktreeNameFromDirectory(directory);
      results.push({
        source: 'sdk',
        name,
        path: directory,
        projectDirectory,
        branch: `opencode/${name}`,
        label: name,
      });
    }
  } catch {
    // ignore
  }

  // Legacy worktrees (<project>/.openchamber/*)
  // LEGACY_WORKTREES: list legacy git worktrees rooted under <project>/.openchamber
  try {
    const legacy = await listLegacyGitWorktrees(projectDirectory);
    const mapped = legacy
      .map((info) => mapWorktreeToMetadata(projectDirectory, info))
      .filter((meta) => isLegacyWorktreePath(projectDirectory, meta.path))
      .map((meta) => ({ ...meta, source: 'legacy' as const }));
    results.push(...mapped);
  } catch {
    // ignore
  }

  // Dedupe by path, prefer SDK entry on collision.
  const byPath = new Map<string, WorktreeMetadata>();
  for (const meta of results) {
    const key = normalizePath(meta.path);
    const existing = byPath.get(key);
    if (!existing) {
      byPath.set(key, meta);
      continue;
    }
    if (existing.source !== 'sdk' && meta.source === 'sdk') {
      byPath.set(key, meta);
    }
  }

  return Array.from(byPath.values()).sort((a, b) => {
    const aLabel = (a.label || a.branch || a.path).toLowerCase();
    const bLabel = (b.label || b.branch || b.path).toLowerCase();
    return aLabel.localeCompare(bLabel);
  });
}

export async function createSdkWorktree(project: ProjectRef, args: {
  preferredName?: string;
  setupCommands?: string[];
  startPoint?: string | null;
  allowSuffix?: boolean;
}): Promise<WorktreeMetadata> {
  const projectDirectory = project.path;
  const scoped = opencodeClient.getScopedApiClient(projectDirectory);

  const baseName = typeof args.preferredName === 'string' ? slugifyWorktreeName(args.preferredName) : '';
  const seed = baseName || undefined;

  const commands = Array.isArray(args.setupCommands) ? args.setupCommands : [];
  const startCommand = buildSdkStartCommand({
    projectDirectory,
    setupCommands: commands,
    startPoint: args.startPoint,
  });

  let lastError: unknown = null;
  const allowSuffix = args.allowSuffix !== false;
  const maxAttempts = seed ? (allowSuffix ? 6 : 1) : 1;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const name = seed ? (attempt === 0 ? seed : `${seed}-${attempt + 1}`) : undefined;
    try {
      const raw = await scoped.worktree.create({
        worktreeCreateInput: {
          ...(name ? { name } : {}),
          ...(startCommand ? { startCommand } : {}),
        },
      });

      const data = unwrapSdkData(raw);
      if (!data || typeof data !== 'object') {
        throw new Error('Invalid worktree.create response');
      }

      const record = data as Record<string, unknown>;
      const returnedName = typeof record.name === 'string' ? record.name : name;
      const returnedBranch = typeof record.branch === 'string' ? record.branch : (returnedName ? `opencode/${returnedName}` : '');
      const returnedDirectory = typeof record.directory === 'string' ? record.directory : '';

      if (!returnedName || !returnedDirectory) {
        throw new Error('Worktree create missing name/directory');
      }

      return {
        source: 'sdk',
        name: returnedName,
        path: normalizePath(returnedDirectory),
        projectDirectory,
        branch: returnedBranch,
        label: returnedName,
      };
    } catch (err) {
      lastError = err;
    }
  }

  const message = lastError instanceof Error ? lastError.message : 'Failed to create worktree';
  throw new Error(message);
}

export async function removeProjectWorktree(project: ProjectRef, worktree: WorktreeMetadata, options?: {
  deleteRemoteBranch?: boolean;
  remoteName?: string;
  force?: boolean;
}): Promise<void> {
  const projectDirectory = project.path;

  const deleteLocalBranch = true;
  const deleteRemote = Boolean(options?.deleteRemoteBranch);
  const remoteName = options?.remoteName;

  if (worktree.source === 'sdk') {
    const scoped = opencodeClient.getScopedApiClient(projectDirectory);
    const worktreeClient = scoped.worktree as unknown;
    const force = Boolean(options?.force ?? true);

    const fallbackRemoveViaGit = async () => {
      await removeGitWorktree(projectDirectory, { path: worktree.path, force });
    };

    const removeMethod = getWorktreeMethod(worktreeClient, 'remove');
    if (removeMethod) {
      const raw = await removeMethod({ worktreeRemoveInput: { directory: worktree.path } });
      const ok = unwrapSdkData(raw);
      if (ok !== true) {
        await fallbackRemoveViaGit();
      }
    } else {
      const deleteMethod = getWorktreeMethod(worktreeClient, 'delete');
      if (deleteMethod) {
        const raw = await deleteMethod({ worktreeDeleteInput: { directory: worktree.path } });
        const ok = unwrapSdkData(raw);
        if (ok !== true) {
          await fallbackRemoveViaGit();
        }
      } else {
        const archiveMethod = getWorktreeMethod(worktreeClient, 'archive');
        if (archiveMethod) {
          const raw = await archiveMethod({ worktreeArchiveInput: { directory: worktree.path } });
          const ok = unwrapSdkData(raw);
          if (ok !== true) {
            await fallbackRemoveViaGit();
          }
        } else {
          throw new Error('Worktree removal is not supported by this SDK version.');
        }
      }
    }

    // Some OpenCode builds only update internal state; remove git worktree best-effort.
    await fallbackRemoveViaGit().catch(() => undefined);

    // Best-effort branch cleanup. Some OpenCode builds may keep the branch.
    const branchName = (worktree.branch || '').replace(/^refs\/heads\//, '').trim();
    if (deleteLocalBranch && branchName) {
      await deleteGitBranch(projectDirectory, { branch: branchName, force: true }).catch(() => undefined);
    }
    if (deleteRemote && branchName) {
      await deleteRemoteBranch(projectDirectory, { branch: branchName, remote: remoteName }).catch(() => undefined);
    }
    return;
  }

  // LEGACY_WORKTREES: delete legacy git worktree under <project>/.openchamber
  const statusIsDirty = Boolean(worktree.status?.isDirty);
  const force = Boolean(options?.force ?? statusIsDirty);

  await removeGitWorktree(projectDirectory, { path: worktree.path, force }).catch(async () => {
    await removeLegacyWorktree({ projectDirectory, path: worktree.path, force: true });
  });

  const branchName = (worktree.branch || '').replace(/^refs\/heads\//, '').trim();
  if (deleteLocalBranch && branchName) {
    await deleteGitBranch(projectDirectory, { branch: branchName, force: true }).catch(() => undefined);
  }
  if (deleteRemote && branchName) {
    await deleteRemoteBranch(projectDirectory, { branch: branchName, remote: remoteName }).catch(() => undefined);
  }
}
