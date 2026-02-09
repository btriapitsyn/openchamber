import { opencodeClient } from '@/lib/opencode/client';
import { substituteCommandVariables } from '@/lib/openchamberConfig';
import type { WorktreeMetadata } from '@/types/worktree';
import { deleteRemoteBranch, getGitStatus } from '@/lib/gitApi';

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
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
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

const waitForSdkWorktreeReady = async (directory: string, timeoutMs = 60_000): Promise<void> => {
  const target = normalizePath(directory);
  if (!target) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    let done = false;
    let unsubscribe = () => {};
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const cleanup = () => {
      if (timeout) {
        clearTimeout(timeout);
      }
      try {
        unsubscribe();
      } catch {
        // ignore
      }
    };
    const finish = (result?: { error?: string }) => {
      if (done) return;
      done = true;
      cleanup();
      if (result?.error) {
        reject(new Error(result.error));
      } else {
        resolve();
      }
    };

    timeout = setTimeout(() => {
      finish({ error: 'Worktree startup timed out' });
    }, timeoutMs);

    unsubscribe = opencodeClient.subscribeToGlobalEvents(
      (event) => {
        const payload = event.payload as { type?: string; properties?: Record<string, unknown> };
        if (payload?.type === 'worktree.ready') {
          finish();
          return;
        }
        if (payload?.type === 'worktree.failed') {
          const message = typeof payload.properties?.message === 'string'
            ? payload.properties.message
            : 'Worktree failed to start';
          finish({ error: message });
        }
      },
      undefined,
      undefined,
      { directory: target }
    );
  });
};

export async function listProjectWorktrees(project: ProjectRef): Promise<WorktreeMetadata[]> {
  const projectDirectory = project.path;
  const scoped = opencodeClient.getScopedApiClient(projectDirectory);

  const results: WorktreeMetadata[] = [];

  // SDK worktrees
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
        branch: '',
        label: name,
      });
    }
  } catch {
    // ignore
  }

  // Enrich worktrees with branch information from git status
  await Promise.all(
    results.map(async (worktree) => {
      try {
        const status = await getGitStatus(worktree.path);
        if (status?.current) {
          worktree.branch = status.current;
        }
      } catch {
        // ignore - branch will remain empty
      }
    })
  );

  return results.sort((a, b) => {
    const aLabel = (a.label || a.branch || a.path).toLowerCase();
    const bLabel = (b.label || b.branch || b.path).toLowerCase();
    return aLabel.localeCompare(bLabel);
  });
}

export async function createSdkWorktree(project: ProjectRef, args: {
  preferredName?: string;
  setupCommands?: string[];
}): Promise<WorktreeMetadata> {
  const projectDirectory = project.path;
  const scoped = opencodeClient.getScopedApiClient(projectDirectory);

  const baseName = typeof args.preferredName === 'string' ? slugifyWorktreeName(args.preferredName) : '';
  const seed = baseName || undefined;

  const commands = Array.isArray(args.setupCommands) ? args.setupCommands : [];
  const startCommand = buildSdkStartCommand({
    projectDirectory,
    setupCommands: commands,
  });

  const name = seed || undefined;
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

  const metadata: WorktreeMetadata = {
    source: 'sdk',
    name: returnedName,
    path: normalizePath(returnedDirectory),
    projectDirectory,
    branch: returnedBranch,
    label: returnedName,
  };

  await waitForSdkWorktreeReady(metadata.path);

  return metadata;
}

export async function removeProjectWorktree(project: ProjectRef, worktree: WorktreeMetadata, options?: {
  deleteRemoteBranch?: boolean;
  remoteName?: string;
  force?: boolean;
}): Promise<void> {
  const projectDirectory = project.path;

  const deleteRemote = Boolean(options?.deleteRemoteBranch);
  const remoteName = options?.remoteName;
  const scoped = opencodeClient.getScopedApiClient(projectDirectory);
  const raw = await scoped.worktree.remove({ worktreeRemoveInput: { directory: worktree.path } });
  const ok = unwrapSdkData(raw);
  if (ok !== true) {
    throw new Error('Worktree removal failed');
  }

  const branchName = (worktree.branch || '').replace(/^refs\/heads\//, '').trim();
  if (deleteRemote && branchName) {
    await deleteRemoteBranch(projectDirectory, { branch: branchName, remote: remoteName }).catch(() => undefined);
  }
}
