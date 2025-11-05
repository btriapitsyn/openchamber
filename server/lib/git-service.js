import simpleGit from 'simple-git';
import fs from 'fs';
import path from 'path';
const fsp = fs.promises;

/**
 * Check if directory is a Git repository
 */
export async function isGitRepository(directory) {
  if (!directory || !fs.existsSync(directory)) {
    return false;
  }

  const gitDir = path.join(directory, '.git');
  return fs.existsSync(gitDir);
}

export async function ensureOpenChamberIgnored(directory) {
  if (!directory || !fs.existsSync(directory)) {
    return false;
  }

  const gitDir = path.join(directory, '.git');
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

/**
 * Get global Git identity (user.name, user.email, core.sshCommand)
 * Reads from global config only
 */
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

/**
 * Get current Git identity (user.name, user.email, core.sshCommand)
 * Reads from local config first, falls back to global
 */
export async function getCurrentIdentity(directory) {
  const git = simpleGit(directory);

  try {
    // Try local first, fallback to global
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

/**
 * Set Git identity locally for repository
 */
export async function setLocalIdentity(directory, profile) {
  const git = simpleGit(directory);

  try {
    // Set user.name and user.email locally
    await git.addConfig('user.name', profile.userName, false, 'local');
    await git.addConfig('user.email', profile.userEmail, false, 'local');

    // Set SSH key if provided
    if (profile.sshKey) {
      await git.addConfig(
        'core.sshCommand',
        `ssh -i ${profile.sshKey}`,
        false,
        'local'
      );
    }

    return true;
  } catch (error) {
    console.error('Failed to set Git identity:', error);
    throw error;
  }
}

/**
 * Get repository status
 */
export async function getStatus(directory) {
  const git = simpleGit(directory);

  try {
    const status = await git.status();

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

        const absolutePath = path.join(directory, file.path);

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

    return {
      current: status.current,
      tracking: status.tracking,
      ahead: status.ahead,
      behind: status.behind,
      files: status.files.map(f => ({
        path: f.path,
        index: f.index,
        working_dir: f.working_dir
      })),
      isClean: status.isClean(),
      diffStats,
    };
  } catch (error) {
    console.error('Failed to get Git status:', error);
    throw error;
  }
}

/**
 * Get diff for a path within repository
 */
export async function getDiff(directory, { path, staged = false, contextLines = 3 } = {}) {
  const git = simpleGit(directory);

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

export async function revertFile(directory, filePath) {
  const git = simpleGit(directory);

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

/**
 * Pull from remote
 */
export async function pull(directory, options = {}) {
  const git = simpleGit(directory);

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

/**
 * Push to remote
 */
export async function push(directory, options = {}) {
  const git = simpleGit(directory);

  try {
    const result = await git.push(
      options.remote || 'origin',
      options.branch,
      options.options || {}
    );

    return {
      success: true,
      pushed: result.pushed,
      repo: result.repo,
      ref: result.ref
    };
  } catch (error) {
    console.error('Failed to push:', error);
    throw error;
  }
}

export async function deleteRemoteBranch(directory, options = {}) {
  const { branch, remote } = options;
  if (!branch) {
    throw new Error('branch is required to delete remote branch');
  }

  const git = simpleGit(directory);
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

/**
 * Fetch from remote
 */
export async function fetch(directory, options = {}) {
  const git = simpleGit(directory);

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

/**
 * Create commit
 */
export async function commit(directory, message, options = {}) {
  const git = simpleGit(directory);

  try {
    // Stage all changes if requested
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

/**
 * List branches
 */
export async function getBranches(directory) {
  const git = simpleGit(directory);

  try {
    const result = await git.branch();
    return {
      all: result.all,
      current: result.current,
      branches: result.branches
    };
  } catch (error) {
    console.error('Failed to get branches:', error);
    throw error;
  }
}

/**
 * Create new branch
 */
export async function createBranch(directory, branchName, options = {}) {
  const git = simpleGit(directory);

  try {
    await git.checkoutBranch(branchName, options.startPoint || 'HEAD');
    return { success: true, branch: branchName };
  } catch (error) {
    console.error('Failed to create branch:', error);
    throw error;
  }
}

/**
 * Checkout existing branch
 */
export async function checkoutBranch(directory, branchName) {
  const git = simpleGit(directory);

  try {
    await git.checkout(branchName);
    return { success: true, branch: branchName };
  } catch (error) {
    console.error('Failed to checkout branch:', error);
    throw error;
  }
}

/**
 * List worktrees
 */
export async function getWorktrees(directory) {
  const git = simpleGit(directory);

  try {
    const result = await git.raw(['worktree', 'list', '--porcelain']);

    // Parse worktree list output
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
        current.branch = line.substring(7);
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
    console.error('Failed to list worktrees:', error);
    throw error;
  }
}

/**
 * Add new worktree
 */
export async function addWorktree(directory, worktreePath, branch, options = {}) {
  const git = simpleGit(directory);

  try {
    const args = ['worktree', 'add'];

    if (options.createBranch) {
      args.push('-b', branch);
    }

    args.push(worktreePath);

    if (!options.createBranch) {
      args.push(branch);
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

/**
 * Remove worktree
 */
export async function removeWorktree(directory, worktreePath, options = {}) {
  const git = simpleGit(directory);

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

/**
 * Delete a branch
 */
export async function deleteBranch(directory, branch, options = {}) {
  const git = simpleGit(directory);

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

/**
 * Get commit log
 */
export async function getLog(directory, options = {}) {
  const git = simpleGit(directory);

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
