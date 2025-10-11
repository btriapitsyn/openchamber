import simpleGit from 'simple-git';
import fs from 'fs';
import path from 'path';

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
      isClean: status.isClean()
    };
  } catch (error) {
    console.error('Failed to get Git status:', error);
    throw error;
  }
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
    }

    const result = await git.commit(message);

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
 * Get commit log
 */
export async function getLog(directory, options = {}) {
  const git = simpleGit(directory);

  try {
    const result = await git.log({
      maxCount: options.maxCount || 50,
      from: options.from,
      to: options.to,
      file: options.file
    });

    return {
      all: result.all,
      latest: result.latest,
      total: result.total
    };
  } catch (error) {
    console.error('Failed to get log:', error);
    throw error;
  }
}
