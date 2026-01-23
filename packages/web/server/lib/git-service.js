import simpleGit from 'simple-git';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';

const fsp = fs.promises;
const execFileAsync = promisify(execFile);

const normalizeDirectoryPath = (value) => {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return trimmed;
  }

  if (trimmed === '~') {
    return os.homedir();
  }

  if (trimmed.startsWith('~/') || trimmed.startsWith('~\\')) {
    return path.join(os.homedir(), trimmed.slice(2));
  }

  return trimmed;
};

const cleanBranchName = (branch) => {
  if (!branch) {
    return branch;
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

export async function isGitRepository(directory) {
  const directoryPath = normalizeDirectoryPath(directory);
  if (!directoryPath || !fs.existsSync(directoryPath)) {
    return false;
  }

  const gitDir = path.join(directoryPath, '.git');
  return fs.existsSync(gitDir);
}

export async function ensureOpenChamberIgnored(directory) {
  const directoryPath = normalizeDirectoryPath(directory);
  if (!directoryPath || !fs.existsSync(directoryPath)) {
    return false;
  }

  const gitDir = path.join(directoryPath, '.git');
  if (!fs.existsSync(gitDir)) {
    return false;
  }

  const infoDir = path.join(gitDir, 'info');
  const excludePath = path.join(infoDir, 'exclude');
  const entry = '/.openchamber/';

  try {
    await fsp.mkdir(infoDir, { recursive: true });
    let contents = '';
    try {
      contents = await fsp.readFile(excludePath, 'utf8');
    } catch (readError) {
      if (readError && readError.code !== 'ENOENT') {
        throw readError;
      }
    }

    const lines = contents.split(/\r?\n/).map((line) => line.trim());
    if (!lines.includes(entry)) {
      const prefix = contents.length > 0 && !contents.endsWith('\n') ? '\n' : '';
      await fsp.appendFile(excludePath, `${prefix}${entry}\n`, 'utf8');
    }

    return true;
  } catch (error) {
    console.error('Failed to ensure .openchamber ignore:', error);
    throw error;
  }
}

export async function getGlobalIdentity() {
  const git = simpleGit();

  try {
    const userName = await git.getConfig('user.name', 'global').catch(() => null);
    const userEmail = await git.getConfig('user.email', 'global').catch(() => null);
    const sshCommand = await git.getConfig('core.sshCommand', 'global').catch(() => null);

    return {
      userName: userName?.value || null,
      userEmail: userEmail?.value || null,
      sshCommand: sshCommand?.value || null
    };
  } catch (error) {
    console.error('Failed to get global Git identity:', error);
    return {
      userName: null,
      userEmail: null,
      sshCommand: null
    };
  }
}

export async function getRemoteUrl(directory, remoteName = 'origin') {
  const git = simpleGit(normalizeDirectoryPath(directory));

  try {
    const url = await git.remote(['get-url', remoteName]);
    return url?.trim() || null;
  } catch {
    return null;
  }
}

export async function getCurrentIdentity(directory) {
  const git = simpleGit(normalizeDirectoryPath(directory));

  try {

    const userName = await git.getConfig('user.name', 'local').catch(() =>
      git.getConfig('user.name', 'global')
    );

    const userEmail = await git.getConfig('user.email', 'local').catch(() =>
      git.getConfig('user.email', 'global')
    );

    const sshCommand = await git.getConfig('core.sshCommand', 'local').catch(() =>
      git.getConfig('core.sshCommand', 'global')
    );

    return {
      userName: userName?.value || null,
      userEmail: userEmail?.value || null,
      sshCommand: sshCommand?.value || null
    };
  } catch (error) {
    console.error('Failed to get current Git identity:', error);
    return {
      userName: null,
      userEmail: null,
      sshCommand: null
    };
  }
}

export async function hasLocalIdentity(directory) {
  const git = simpleGit(normalizeDirectoryPath(directory));

  try {
    const localName = await git.getConfig('user.name', 'local').catch(() => null);
    const localEmail = await git.getConfig('user.email', 'local').catch(() => null);
    return Boolean(localName?.value || localEmail?.value);
  } catch {
    return false;
  }
}

export async function setLocalIdentity(directory, profile) {
  const git = simpleGit(normalizeDirectoryPath(directory));

  try {

    await git.addConfig('user.name', profile.userName, false, 'local');
    await git.addConfig('user.email', profile.userEmail, false, 'local');

    const authType = profile.authType || 'ssh';

    if (authType === 'ssh' && profile.sshKey) {
      await git.addConfig(
        'core.sshCommand',
        `ssh -i ${profile.sshKey}`,
        false,
        'local'
      );
      await git.raw(['config', '--local', '--unset', 'credential.helper']).catch(() => {});
    } else if (authType === 'token' && profile.host) {
      await git.addConfig(
        'credential.helper',
        'store',
        false,
        'local'
      );
      await git.raw(['config', '--local', '--unset', 'core.sshCommand']).catch(() => {});
    }

    return true;
  } catch (error) {
    console.error('Failed to set Git identity:', error);
    throw error;
  }
}

export async function getStatus(directory) {
  const directoryPath = normalizeDirectoryPath(directory);
  const git = simpleGit(directoryPath);

  try {
    // Use -uall to show all untracked files individually, not just directories
    const status = await git.status(['-uall']);

    const [stagedStatsRaw, workingStatsRaw] = await Promise.all([
      git.raw(['diff', '--cached', '--numstat']).catch(() => ''),
      git.raw(['diff', '--numstat']).catch(() => ''),
    ]);

    const diffStatsMap = new Map();

    const accumulateStats = (raw) => {
      if (!raw) return;
      raw
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .forEach((line) => {
          const parts = line.split('\t');
          if (parts.length < 3) {
            return;
          }
          const [insertionsRaw, deletionsRaw, ...pathParts] = parts;
          const path = pathParts.join('\t');
          if (!path) {
            return;
          }
          const insertions = insertionsRaw === '-' ? 0 : parseInt(insertionsRaw, 10) || 0;
          const deletions = deletionsRaw === '-' ? 0 : parseInt(deletionsRaw, 10) || 0;

          const existing = diffStatsMap.get(path) || { insertions: 0, deletions: 0 };
          diffStatsMap.set(path, {
            insertions: existing.insertions + insertions,
            deletions: existing.deletions + deletions,
          });
        });
    };

    accumulateStats(stagedStatsRaw);
    accumulateStats(workingStatsRaw);

    const diffStats = Object.fromEntries(diffStatsMap.entries());

    const newFileStats = await Promise.all(
      status.files.map(async (file) => {
        const working = (file.working_dir || '').trim();
        const indexStatus = (file.index || '').trim();
        const statusCode = working || indexStatus;

        if (statusCode !== '?' && statusCode !== 'A') {
          return null;
        }

        const existing = diffStats[file.path];
        if (existing && existing.insertions > 0) {
          return null;
        }

        const absolutePath = path.join(directoryPath, file.path);

        try {
          const stat = await fsp.stat(absolutePath);
          if (!stat.isFile()) {
            return null;
          }

          const buffer = await fsp.readFile(absolutePath);
          if (buffer.indexOf(0) !== -1) {
            return {
              path: file.path,
              insertions: existing?.insertions ?? 0,
              deletions: existing?.deletions ?? 0,
            };
          }

          const normalized = buffer.toString('utf8').replace(/\r\n/g, '\n');
          if (!normalized.length) {
            return {
              path: file.path,
              insertions: 0,
              deletions: 0,
            };
          }

          const segments = normalized.split('\n');
          if (normalized.endsWith('\n')) {
            segments.pop();
          }

          const lineCount = segments.length;
          return {
            path: file.path,
            insertions: lineCount,
            deletions: 0,
          };
        } catch (error) {
          console.warn('Failed to estimate diff stats for new file', file.path, error);
          return null;
        }
      })
    );

    for (const entry of newFileStats) {
      if (!entry) continue;
      diffStats[entry.path] = {
        insertions: entry.insertions,
        deletions: entry.deletions,
      };
    }

    const selectBaseRefForUnpublished = async () => {
      const candidates = [];

      const originHead = await git
        .raw(['symbolic-ref', '-q', 'refs/remotes/origin/HEAD'])
        .then((value) => String(value || '').trim())
        .catch(() => '');

      if (originHead) {
        // "refs/remotes/origin/main" -> "origin/main"
        candidates.push(originHead.replace(/^refs\/remotes\//, ''));
      }

      candidates.push('origin/main', 'origin/master', 'main', 'master');

      for (const ref of candidates) {
        const exists = await git
          .raw(['rev-parse', '--verify', ref])
          .then((value) => String(value || '').trim())
          .catch(() => '');
        if (exists) return ref;
      }

      return null;
    };

    let tracking = status.tracking || null;
    let ahead = status.ahead;
    let behind = status.behind;

    // When no upstream is configured (common for new worktree branches), Git doesn't report ahead/behind.
    // We still want to show the number of unpublished commits to the user.
    if (!tracking && status.current) {
      const baseRef = await selectBaseRefForUnpublished();
      if (baseRef) {
        const countRaw = await git
          .raw(['rev-list', '--count', `${baseRef}..HEAD`])
          .then((value) => String(value || '').trim())
          .catch(() => '');
        const count = parseInt(countRaw, 10);
        if (Number.isFinite(count)) {
          ahead = count;
          behind = 0;
        }
      }
    }

    return {
      current: status.current,
      tracking,
      ahead,
      behind,
      files: status.files.map((f) => ({
        path: f.path,
        index: f.index,
        working_dir: f.working_dir,
      })),
      isClean: status.isClean(),
      diffStats,
    };
  } catch (error) {
    console.error('Failed to get Git status:', error);
    throw error;
  }
}

export async function getDiff(directory, { path, staged = false, contextLines = 3 } = {}) {
  const git = simpleGit(normalizeDirectoryPath(directory));

  try {
    const args = ['diff', '--no-color'];

    if (typeof contextLines === 'number' && !Number.isNaN(contextLines)) {
      args.push(`-U${Math.max(0, contextLines)}`);
    }

    if (staged) {
      args.push('--cached');
    }

    if (path) {
      args.push('--', path);
    }

    const diff = await git.raw(args);
    if (diff && diff.trim().length > 0) {
      return diff;
    }

    if (staged) {
      return diff;
    }

    try {
      await git.raw(['ls-files', '--error-unmatch', path]);
      return diff;
    } catch {
      const noIndexArgs = ['diff', '--no-color'];
      if (typeof contextLines === 'number' && !Number.isNaN(contextLines)) {
        noIndexArgs.push(`-U${Math.max(0, contextLines)}`);
      }
      noIndexArgs.push('--no-index', '--', '/dev/null', path);
      const noIndexDiff = await git.raw(noIndexArgs);
      return noIndexDiff;
    }
  } catch (error) {
    console.error('Failed to get Git diff:', error);
    throw error;
  }
}

export async function getRangeDiff(directory, { base, head, path, contextLines = 3 } = {}) {
  const git = simpleGit(normalizeDirectoryPath(directory));
  const baseRef = typeof base === 'string' ? base.trim() : '';
  const headRef = typeof head === 'string' ? head.trim() : '';
  if (!baseRef || !headRef) {
    throw new Error('base and head are required');
  }

  // Prefer remote-tracking base ref so merged commits don't reappear
  // when local base branch is stale (common when user stays on feature branch).
  let resolvedBase = baseRef;
  const originCandidate = `refs/remotes/origin/${baseRef}`;
  try {
    const verified = await git.raw(['rev-parse', '--verify', originCandidate]);
    if (verified && verified.trim()) {
      resolvedBase = `origin/${baseRef}`;
    }
  } catch {
    // ignore
  }

  const args = ['diff', '--no-color'];
  if (typeof contextLines === 'number' && !Number.isNaN(contextLines)) {
    args.push(`-U${Math.max(0, contextLines)}`);
  }
  args.push(`${resolvedBase}...${headRef}`);
  if (path) {
    args.push('--', path);
  }
  const diff = await git.raw(args);
  return diff;
}

export async function getRangeFiles(directory, { base, head } = {}) {
  const git = simpleGit(normalizeDirectoryPath(directory));
  const baseRef = typeof base === 'string' ? base.trim() : '';
  const headRef = typeof head === 'string' ? head.trim() : '';
  if (!baseRef || !headRef) {
    throw new Error('base and head are required');
  }

  let resolvedBase = baseRef;
  const originCandidate = `refs/remotes/origin/${baseRef}`;
  try {
    const verified = await git.raw(['rev-parse', '--verify', originCandidate]);
    if (verified && verified.trim()) {
      resolvedBase = `origin/${baseRef}`;
    }
  } catch {
    // ignore
  }

  const raw = await git.raw(['diff', '--name-only', `${resolvedBase}...${headRef}`]);
  return String(raw || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'bmp', 'avif'];

function isImageFile(filePath) {
  const ext = filePath.split('.').pop()?.toLowerCase();
  return IMAGE_EXTENSIONS.includes(ext || '');
}

function getImageMimeType(filePath) {
  const ext = filePath.split('.').pop()?.toLowerCase();
  const mimeMap = {
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'gif': 'image/gif',
    'svg': 'image/svg+xml',
    'webp': 'image/webp',
    'ico': 'image/x-icon',
    'bmp': 'image/bmp',
    'avif': 'image/avif',
  };
  return mimeMap[ext] || 'application/octet-stream';
}

export async function getFileDiff(directory, { path: filePath, staged = false } = {}) {
  if (!directory || !filePath) {
    throw new Error('directory and path are required for getFileDiff');
  }

  const directoryPath = normalizeDirectoryPath(directory);
  const git = simpleGit(directoryPath);
  const isImage = isImageFile(filePath);
  const mimeType = isImage ? getImageMimeType(filePath) : null;

  let original = '';
  try {
    if (isImage) {
      // For images, use git show with raw output and convert to base64
      try {
        const { stdout } = await execFileAsync('git', ['show', `HEAD:${filePath}`], {
          cwd: directoryPath,
          encoding: 'buffer',
          maxBuffer: 50 * 1024 * 1024, // 50MB max
        });
        if (stdout && stdout.length > 0) {
          original = `data:${mimeType};base64,${stdout.toString('base64')}`;
        }
      } catch {
        original = '';
      }
    } else {
      original = await git.show([`HEAD:${filePath}`]);
    }
  } catch {
    original = '';
  }

  const fullPath = path.join(directoryPath, filePath);
  let modified = '';
  try {
    const stat = await fsp.stat(fullPath);
    if (stat.isFile()) {
      if (isImage) {
        // For images, read as binary and convert to data URL
        const buffer = await fsp.readFile(fullPath);
        modified = `data:${mimeType};base64,${buffer.toString('base64')}`;
      } else {
        modified = await fsp.readFile(fullPath, 'utf8');
      }
    }
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') {
      modified = '';
    } else {
      console.error('Failed to read modified file contents for diff:', error);
      throw error;
    }
  }

  return {
    original,
    modified,
    path: filePath,
  };
}

export async function revertFile(directory, filePath) {
  const directoryPath = normalizeDirectoryPath(directory);
  const git = simpleGit(directoryPath);
  const repoRoot = path.resolve(directoryPath);
  const absoluteTarget = path.resolve(repoRoot, filePath);

  if (!absoluteTarget.startsWith(repoRoot + path.sep) && absoluteTarget !== repoRoot) {
    throw new Error('Invalid file path');
  }

  const isTracked = await git
    .raw(['ls-files', '--error-unmatch', filePath])
    .then(() => true)
    .catch(() => false);

  if (!isTracked) {
    try {
      await git.raw(['clean', '-f', '-d', '--', filePath]);
      return;
    } catch (cleanError) {
      try {
        await fsp.rm(absoluteTarget, { recursive: true, force: true });
        return;
      } catch (fsError) {
        if (fsError && typeof fsError === 'object' && fsError.code === 'ENOENT') {
          return;
        }
        console.error('Failed to remove untracked file during revert:', fsError);
        throw fsError;
      }
    }
  }

  try {
    await git.raw(['restore', '--staged', filePath]);
  } catch (error) {
    await git.raw(['reset', 'HEAD', '--', filePath]).catch(() => {});
  }

  try {
    await git.raw(['restore', filePath]);
  } catch (error) {
    try {
      await git.raw(['checkout', '--', filePath]);
    } catch (fallbackError) {
      console.error('Failed to revert git file:', fallbackError);
      throw fallbackError;
    }
  }
}

export async function collectDiffs(directory, files = []) {
  const results = [];
  for (const filePath of files) {
    try {
      const diff = await getDiff(directory, { path: filePath });
      if (diff && diff.trim().length > 0) {
        results.push({ path: filePath, diff });
      }
    } catch (error) {
      console.error(`Failed to diff ${filePath}:`, error);
    }
  }
  return results;
}

export async function pull(directory, options = {}) {
  const git = simpleGit(normalizeDirectoryPath(directory));

  try {
    const result = await git.pull(
      options.remote || 'origin',
      options.branch,
      options.options || {}
    );

    return {
      success: true,
      summary: result.summary,
      files: result.files,
      insertions: result.insertions,
      deletions: result.deletions
    };
  } catch (error) {
    console.error('Failed to pull:', error);
    throw error;
  }
}

export async function push(directory, options = {}) {
  const git = simpleGit(normalizeDirectoryPath(directory));

  const buildUpstreamOptions = (raw) => {
    if (Array.isArray(raw)) {
      return raw.includes('--set-upstream') ? raw : [...raw, '--set-upstream'];
    }

    if (raw && typeof raw === 'object') {
      return { ...raw, '--set-upstream': null };
    }

    return ['--set-upstream'];
  };

  const looksLikeMissingUpstream = (error) => {
    const message = String(error?.message || error?.stderr || '').toLowerCase();
    return (
      message.includes('has no upstream') ||
      message.includes('no upstream') ||
      message.includes('set-upstream') ||
      message.includes('set upstream') ||
      (message.includes('upstream') && message.includes('push') && message.includes('-u'))
    );
  };

  const normalizePushResult = (result) => {
    return {
      success: true,
      pushed: result.pushed,
      repo: result.repo,
      ref: result.ref,
    };
  };

  const remote = options.remote || 'origin';

  // If caller didn't specify a branch, this is the common "Push"/"Commit & Push" path.
  // When there's no upstream yet (typical for freshly-created worktree branches), publish it on first push.
  if (!options.branch) {
    try {
      const status = await git.status();
      if (status.current && !status.tracking) {
        const result = await git.push(remote, status.current, buildUpstreamOptions(options.options));
        return normalizePushResult(result);
      }
    } catch (error) {
      // If we can't read status, fall back to the regular push path below.
      console.warn('Failed to read git status before push:', error);
    }
  }

  try {
    const result = await git.push(remote, options.branch, options.options || {});
    return normalizePushResult(result);
  } catch (error) {
    // Last-resort fallback: retry with upstream if the error suggests it's missing.
    if (!looksLikeMissingUpstream(error)) {
      console.error('Failed to push:', error);
      throw error;
    }

    try {
      const status = await git.status();
      const branch = options.branch || status.current;
      if (!branch) {
        console.error('Failed to push: missing branch name for upstream setup:', error);
        throw error;
      }

      const result = await git.push(remote, branch, buildUpstreamOptions(options.options));
      return normalizePushResult(result);
    } catch (fallbackError) {
      console.error('Failed to push (including upstream fallback):', fallbackError);
      throw fallbackError;
    }
  }
}

export async function deleteRemoteBranch(directory, options = {}) {
  const { branch, remote } = options;
  if (!branch) {
    throw new Error('branch is required to delete remote branch');
  }

  const git = simpleGit(normalizeDirectoryPath(directory));
  const targetBranch = branch.startsWith('refs/heads/')
    ? branch.substring('refs/heads/'.length)
    : branch;
  const remoteName = remote || 'origin';

  try {
    await git.push(remoteName, `:${targetBranch}`);
    return { success: true };
  } catch (error) {
    console.error('Failed to delete remote branch:', error);
    throw error;
  }
}

export async function fetch(directory, options = {}) {
  const git = simpleGit(normalizeDirectoryPath(directory));

  try {
    await git.fetch(
      options.remote || 'origin',
      options.branch,
      options.options || {}
    );

    return { success: true };
  } catch (error) {
    console.error('Failed to fetch:', error);
    throw error;
  }
}

export async function commit(directory, message, options = {}) {
  const git = simpleGit(normalizeDirectoryPath(directory));

  try {

    if (options.addAll) {
      await git.add('.');
    } else if (Array.isArray(options.files) && options.files.length > 0) {
      await git.add(options.files);
    }

    const commitArgs =
      !options.addAll && Array.isArray(options.files) && options.files.length > 0
        ? options.files
        : undefined;

    const result = await git.commit(message, commitArgs);

    return {
      success: true,
      commit: result.commit,
      branch: result.branch,
      summary: result.summary
    };
  } catch (error) {
    console.error('Failed to commit:', error);
    throw error;
  }
}

export async function getBranches(directory) {
  const git = simpleGit(normalizeDirectoryPath(directory));

  try {
    const result = await git.branch();

    const allBranches = result.all;
    const remoteBranches = allBranches.filter(branch => branch.startsWith('remotes/'));
    const activeRemoteBranches = await filterActiveRemoteBranches(git, remoteBranches);

    const filteredAll = [
      ...allBranches.filter(branch => !branch.startsWith('remotes/')),
      ...activeRemoteBranches
    ];

    return {
      all: filteredAll,
      current: result.current,
      branches: result.branches
    };
  } catch (error) {
    console.error('Failed to get branches:', error);
    throw error;
  }
}

async function filterActiveRemoteBranches(git, remoteBranches) {
  try {

    const lsRemoteResult = await git.raw(['ls-remote', '--heads', 'origin']);
    const actualRemoteBranches = new Set();

    const lines = lsRemoteResult.trim().split('\n');
    for (const line of lines) {
      if (line.includes('\trefs/heads/')) {
        const branchName = line.split('\t')[1].replace('refs/heads/', '');
        actualRemoteBranches.add(branchName);
      }
    }

    return remoteBranches.filter(remoteBranch => {

      const match = remoteBranch.match(/^remotes\/[^\/]+\/(.+)$/);
      if (!match) return false;

      const branchName = match[1];
      return actualRemoteBranches.has(branchName);
    });
  } catch (error) {
    console.warn('Failed to filter active remote branches, returning all:', error.message);
    return remoteBranches;
  }
}

export async function createBranch(directory, branchName, options = {}) {
  const git = simpleGit(normalizeDirectoryPath(directory));

  try {
    await git.checkoutBranch(branchName, options.startPoint || 'HEAD');
    return { success: true, branch: branchName };
  } catch (error) {
    console.error('Failed to create branch:', error);
    throw error;
  }
}

export async function checkoutBranch(directory, branchName) {
  const git = simpleGit(normalizeDirectoryPath(directory));

  try {
    await git.checkout(branchName);
    return { success: true, branch: branchName };
  } catch (error) {
    console.error('Failed to checkout branch:', error);
    throw error;
  }
}

export async function getWorktrees(directory) {
  const directoryPath = normalizeDirectoryPath(directory);
  if (!directoryPath || !fs.existsSync(directoryPath) || !fs.existsSync(path.join(directoryPath, '.git'))) {
    return [];
  }

  const git = simpleGit(directoryPath);

  try {
    const result = await git.raw(['worktree', 'list', '--porcelain']);

    const worktrees = [];
    const lines = result.split('\n');
    let current = {};

    for (const line of lines) {
      if (line.startsWith('worktree ')) {
        if (current.worktree) {
          worktrees.push(current);
        }
        current = { worktree: line.substring(9) };
      } else if (line.startsWith('HEAD ')) {
        current.head = line.substring(5);
      } else if (line.startsWith('branch ')) {
        current.branch = cleanBranchName(line.substring(7));
      } else if (line === '') {
        if (current.worktree) {
          worktrees.push(current);
          current = {};
        }
      }
    }

    if (current.worktree) {
      worktrees.push(current);
    }

    return worktrees;
  } catch (error) {
    console.warn('Failed to list worktrees, returning empty list:', error?.message || error);
    return [];
  }
}

export async function addWorktree(directory, worktreePath, branch, options = {}) {
  const git = simpleGit(normalizeDirectoryPath(directory));

  try {
    const args = ['worktree', 'add'];
    const startPoint = typeof options.startPoint === 'string' ? options.startPoint.trim() : '';

    if (options.createBranch) {
      args.push('-b', branch);
    }

    args.push(worktreePath);

    if (!options.createBranch) {
      args.push(branch);
    } else if (startPoint) {
      args.push(startPoint);
    }

    await git.raw(args);

    return {
      success: true,
      path: worktreePath,
      branch
    };
  } catch (error) {
    console.error('Failed to add worktree:', error);
    throw error;
  }
}

export async function removeWorktree(directory, worktreePath, options = {}) {
  const git = simpleGit(normalizeDirectoryPath(directory));

  try {
    const args = ['worktree', 'remove', worktreePath];

    if (options.force) {
      args.push('--force');
    }

    await git.raw(args);

    return { success: true };
  } catch (error) {
    console.error('Failed to remove worktree:', error);
    throw error;
  }
}

export async function deleteBranch(directory, branch, options = {}) {
  const git = simpleGit(normalizeDirectoryPath(directory));

  try {
    const branchName = branch.startsWith('refs/heads/')
      ? branch.substring('refs/heads/'.length)
      : branch;
    const args = ['branch', options.force ? '-D' : '-d', branchName];
    await git.raw(args);
    return { success: true };
  } catch (error) {
    console.error('Failed to delete branch:', error);
    throw error;
  }
}

export async function getLog(directory, options = {}) {
  const git = simpleGit(normalizeDirectoryPath(directory));

  try {
    const maxCount = options.maxCount || 50;
    const baseLog = await git.log({
      maxCount,
      from: options.from,
      to: options.to,
      file: options.file
    });

    const logArgs = [
      'log',
      `--max-count=${maxCount}`,
      '--date=iso',
      '--pretty=format:%H%x1f%an%x1f%ae%x1f%ad%x1f%s%x1e',
      '--shortstat'
    ];

    if (options.from && options.to) {
      logArgs.push(`${options.from}..${options.to}`);
    } else if (options.from) {
      logArgs.push(`${options.from}..HEAD`);
    } else if (options.to) {
      logArgs.push(options.to);
    }

    if (options.file) {
      logArgs.push('--', options.file);
    }

    const rawLog = await git.raw(logArgs);
    const records = rawLog
      .split('\x1e')
      .map((entry) => entry.trim())
      .filter(Boolean);

    const statsMap = new Map();

    records.forEach((record) => {
      const lines = record.split('\n').filter((line) => line.trim().length > 0);
      const header = lines.shift() || '';
      const [hash] = header.split('\x1f');
      if (!hash) {
        return;
      }

      let filesChanged = 0;
      let insertions = 0;
      let deletions = 0;

      lines.forEach((line) => {
        const filesMatch = line.match(/(\d+)\s+files?\s+changed/);
        const insertMatch = line.match(/(\d+)\s+insertions?\(\+\)/);
        const deleteMatch = line.match(/(\d+)\s+deletions?\(-\)/);

        if (filesMatch) {
          filesChanged = parseInt(filesMatch[1], 10);
        }
        if (insertMatch) {
          insertions = parseInt(insertMatch[1], 10);
        }
        if (deleteMatch) {
          deletions = parseInt(deleteMatch[1], 10);
        }
      });

      statsMap.set(hash, { filesChanged, insertions, deletions });
    });

    const merged = baseLog.all.map((entry) => {
      const stats = statsMap.get(entry.hash) || { filesChanged: 0, insertions: 0, deletions: 0 };
      return {
        hash: entry.hash,
        date: entry.date,
        message: entry.message,
        refs: entry.refs || '',
        body: entry.body || '',
        author_name: entry.author_name,
        author_email: entry.author_email,
        filesChanged: stats.filesChanged,
        insertions: stats.insertions,
        deletions: stats.deletions
      };
    });

    return {
      all: merged,
      latest: merged[0] || null,
      total: baseLog.total
    };
  } catch (error) {
    console.error('Failed to get log:', error);
    throw error;
  }
}

export async function isLinkedWorktree(directory) {
  const git = simpleGit(normalizeDirectoryPath(directory));
  try {
    const [gitDir, gitCommonDir] = await Promise.all([
      git.raw(['rev-parse', '--git-dir']).then((output) => output.trim()),
      git.raw(['rev-parse', '--git-common-dir']).then((output) => output.trim())
    ]);
    return gitDir !== gitCommonDir;
  } catch (error) {
    console.error('Failed to determine worktree type:', error);
    return false;
  }
}

export async function getCommitFiles(directory, commitHash) {
  const git = simpleGit(normalizeDirectoryPath(directory));

  try {

    const numstatRaw = await git.raw([
      'show',
      '--numstat',
      '--format=',
      commitHash
    ]);

    const files = [];
    const lines = numstatRaw.trim().split('\n').filter(Boolean);

    for (const line of lines) {
      const parts = line.split('\t');
      if (parts.length < 3) continue;

      const [insertionsRaw, deletionsRaw, ...pathParts] = parts;
      const filePath = pathParts.join('\t');
      if (!filePath) continue;

      const insertions = insertionsRaw === '-' ? 0 : parseInt(insertionsRaw, 10) || 0;
      const deletions = deletionsRaw === '-' ? 0 : parseInt(deletionsRaw, 10) || 0;
      const isBinary = insertionsRaw === '-' && deletionsRaw === '-';

      let changeType = 'M';
      let displayPath = filePath;

      if (filePath.includes(' => ')) {
        changeType = 'R';

        const match = filePath.match(/(?:\{[^}]*\s=>\s[^}]*\}|.*\s=>\s.*)/);
        if (match) {
          displayPath = filePath;
        }
      }

      files.push({
        path: displayPath,
        insertions,
        deletions,
        isBinary,
        changeType
      });
    }

    const nameStatusRaw = await git.raw([
      'show',
      '--name-status',
      '--format=',
      commitHash
    ]).catch(() => '');

    const statusMap = new Map();
    const statusLines = nameStatusRaw.trim().split('\n').filter(Boolean);
    for (const line of statusLines) {
      const match = line.match(/^([AMDRC])\d*\t(.+)$/);
      if (match) {
        const [, status, path] = match;
        statusMap.set(path, status);
      }
    }

    for (const file of files) {
      const basePath = file.path.includes(' => ')
        ? file.path.split(' => ').pop()?.replace(/[{}]/g, '') || file.path
        : file.path;

      const status = statusMap.get(basePath) || statusMap.get(file.path);
      if (status) {
        file.changeType = status;
      }
    }

    return { files };
  } catch (error) {
    console.error('Failed to get commit files:', error);
    throw error;
  }
}

export async function renameBranch(directory, oldName, newName) {
  const git = simpleGit(normalizeDirectoryPath(directory));

  try {
    // Use git branch -m command to rename the branch
    await git.raw(['branch', '-m', oldName, newName]);
    return { success: true, branch: newName };
  } catch (error) {
    console.error('Failed to rename branch:', error);
    throw error;
  }
}
