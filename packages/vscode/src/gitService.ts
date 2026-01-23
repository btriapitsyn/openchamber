/**
 * Git service for VS Code extension
 * Uses VS Code's built-in git extension API for repository operations
 * and raw git commands via child_process for worktree operations
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import { spawn } from 'child_process';
import type { API as GitAPI, Repository, GitExtension, Status } from './git.d';

let gitApi: GitAPI | null = null;
let gitExtensionEnabled = false;

/**
 * Initialize the git extension API
 */
export async function initGitExtension(): Promise<GitAPI | null> {
  if (gitApi && gitExtensionEnabled) {
    return gitApi;
  }

  try {
    const gitExtension = vscode.extensions.getExtension<GitExtension>('vscode.git');
    if (!gitExtension) {
      console.warn('[GitService] Git extension not found');
      return null;
    }

    if (!gitExtension.isActive) {
      await gitExtension.activate();
    }

    const extension = gitExtension.exports;
    if (!extension.enabled) {
      console.warn('[GitService] Git extension is disabled');
      return null;
    }

    gitApi = extension.getAPI(1);
    gitExtensionEnabled = true;

    // Listen for enablement changes
    extension.onDidChangeEnablement((enabled) => {
      gitExtensionEnabled = enabled;
      if (!enabled) {
        gitApi = null;
      }
    });

    return gitApi;
  } catch (error) {
    console.error('[GitService] Failed to initialize git extension:', error);
    return null;
  }
}

/**
 * Get the git API, initializing if necessary
 */
export async function getGitApi(): Promise<GitAPI | null> {
  if (gitApi && gitExtensionEnabled) {
    return gitApi;
  }
  return initGitExtension();
}

/**
 * Get repository for a given directory
 */
export async function getRepository(directory: string): Promise<Repository | null> {
  const api = await getGitApi();
  if (!api) return null;

  const normalizedDir = normalizePath(directory);
  const uri = vscode.Uri.file(normalizedDir);

  // Try to find an existing repository
  let repo = api.getRepository(uri);
  if (repo) return repo;

  // Try to open the repository
  repo = await api.openRepository(uri);
  return repo;
}

/**
 * Normalize a file path for cross-platform compatibility
 */
function normalizePath(p: string): string {
  let normalized = p;
  // Handle tilde expansion first (before converting slashes)
  if (normalized.startsWith('~')) {
    normalized = path.join(os.homedir(), normalized.slice(1));
  }
  // Convert backslashes to forward slashes for consistent path handling
  normalized = normalized.replace(/\\/g, '/');
  return normalized;
}

/**
 * Execute a raw git command and return the output
 */
async function execGit(args: string[], cwd: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const normalizedCwd = normalizePath(cwd);
    const gitPath = gitApi?.git.path || 'git';
    
    const proc = spawn(gitPath, args, {
      cwd: normalizedCwd,
      // Note: shell: true is intentionally omitted. Node.js spawn can find
      // executables in PATH on Windows without shell mode, and using shell mode
      // can cause issues when the git path contains spaces (e.g., "C:\Program Files\Git\...")
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    });

    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (exitCode) => {
      resolve({ stdout, stderr, exitCode: exitCode ?? 0 });
    });

    proc.on('error', (error) => {
      resolve({ stdout: '', stderr: error.message, exitCode: 1 });
    });
  });
}

// ============== Repository Operations ==============

/**
 * Check if a directory is a git repository
 */
export async function checkIsGitRepository(directory: string): Promise<boolean> {
  const result = await execGit(['rev-parse', '--is-inside-work-tree'], directory);
  return result.exitCode === 0 && result.stdout.trim() === 'true';
}

/**
 * Check if a directory is a linked worktree (not the main worktree)
 */
export async function isLinkedWorktree(directory: string): Promise<boolean> {
  const gitDir = await execGit(['rev-parse', '--git-dir'], directory);
  const commonDir = await execGit(['rev-parse', '--git-common-dir'], directory);
  
  if (gitDir.exitCode !== 0 || commonDir.exitCode !== 0) {
    return false;
  }
  
  const gitDirPath = path.resolve(directory, gitDir.stdout.trim());
  const commonDirPath = path.resolve(directory, commonDir.stdout.trim());
  
  return gitDirPath !== commonDirPath;
}

// ============== Status Operations ==============

export interface GitStatusFile {
  path: string;
  index: string;
  working_dir: string;
}

export interface GitStatusResult {
  current: string;
  tracking: string | null;
  ahead: number;
  behind: number;
  files: GitStatusFile[];
  isClean: boolean;
  diffStats?: Record<string, { insertions: number; deletions: number }>;
}

/**
 * Map VS Code git status to our status codes
 */
function mapStatus(status: Status): string {
  // Status enum values
  const statusMap: Record<number, string> = {
    0: 'M',   // INDEX_MODIFIED
    1: 'A',   // INDEX_ADDED
    2: 'D',   // INDEX_DELETED
    3: 'R',   // INDEX_RENAMED
    4: 'C',   // INDEX_COPIED
    5: 'M',   // MODIFIED
    6: 'D',   // DELETED
    7: '?',   // UNTRACKED
    8: '!',   // IGNORED
    9: 'A',   // INTENT_TO_ADD
    10: 'R',  // INTENT_TO_RENAME
    11: 'T',  // TYPE_CHANGED
    12: 'U',  // ADDED_BY_US
    13: 'U',  // ADDED_BY_THEM
    14: 'U',  // DELETED_BY_US
    15: 'U',  // DELETED_BY_THEM
    16: 'U',  // BOTH_ADDED
    17: 'U',  // BOTH_DELETED
    18: 'U',  // BOTH_MODIFIED
  };
  return statusMap[status] || ' ';
}

/**
 * Get git status for a directory
 */
export async function getGitStatus(directory: string): Promise<GitStatusResult> {
  const repo = await getRepository(directory);
  
  if (!repo) {
    // Fallback to raw git
    return getGitStatusRaw(directory);
  }

  const state = repo.state;
  const head = state.HEAD;
  
  const files: GitStatusFile[] = [];
  
  // Process index changes (staged)
  for (const change of state.indexChanges) {
    const relativePath = vscode.workspace.asRelativePath(change.uri, false);
    files.push({
      path: relativePath,
      index: mapStatus(change.status),
      working_dir: ' ',
    });
  }
  
  // Process working tree changes (unstaged)
  for (const change of state.workingTreeChanges) {
    const relativePath = vscode.workspace.asRelativePath(change.uri, false);
    const existing = files.find(f => f.path === relativePath);
    if (existing) {
      existing.working_dir = mapStatus(change.status);
    } else {
      files.push({
        path: relativePath,
        index: ' ',
        working_dir: mapStatus(change.status),
      });
    }
  }

  return {
    current: head?.name || '',
    tracking: head?.upstream ? `${head.upstream.remote}/${head.upstream.name}` : null,
    ahead: head?.ahead || 0,
    behind: head?.behind || 0,
    files,
    isClean: files.length === 0,
  };
}

/**
 * Fallback: Get git status using raw git commands
 */
async function getGitStatusRaw(directory: string): Promise<GitStatusResult> {
  const statusResult = await execGit(['status', '--porcelain=v1', '-b', '-uall'], directory);
  
  if (statusResult.exitCode !== 0) {
    return {
      current: '',
      tracking: null,
      ahead: 0,
      behind: 0,
      files: [],
      isClean: true,
    };
  }

  const lines = statusResult.stdout.trim().split('\n').filter(Boolean);
  const files: GitStatusFile[] = [];
  let current = '';
  let tracking: string | null = null;
  let ahead = 0;
  let behind = 0;

  for (const line of lines) {
    if (line.startsWith('##')) {
      // Parse branch info
      const branchMatch = line.match(/^## (.+?)(?:\.\.\.(.+?))?(?:\s+\[(.+)\])?$/);
      if (branchMatch) {
        current = branchMatch[1] || '';
        tracking = branchMatch[2] || null;
        const trackingInfo = branchMatch[3] || '';
        const aheadMatch = trackingInfo.match(/ahead (\d+)/);
        const behindMatch = trackingInfo.match(/behind (\d+)/);
        ahead = aheadMatch ? parseInt(aheadMatch[1], 10) : 0;
        behind = behindMatch ? parseInt(behindMatch[1], 10) : 0;
      }
    } else {
      // Parse file status
      const index = line[0] || ' ';
      const workingDir = line[1] || ' ';
      const filePath = line.slice(3).trim();
      files.push({
        path: filePath,
        index,
        working_dir: workingDir,
      });
    }
  }

  return {
    current,
    tracking,
    ahead,
    behind,
    files,
    isClean: files.length === 0,
  };
}

// ============== Branch Operations ==============

export interface GitBranchDetails {
  current: boolean;
  name: string;
  commit: string;
  label: string;
  tracking?: string;
  ahead?: number;
  behind?: number;
}

export interface GitBranchResult {
  all: string[];
  current: string;
  branches: Record<string, GitBranchDetails>;
}

/**
 * Get all branches for a directory
 */
export async function getGitBranches(directory: string): Promise<GitBranchResult> {
  const repo = await getRepository(directory);
  
  if (!repo) {
    return getGitBranchesRaw(directory);
  }

  const state = repo.state;
  const currentBranch = state.HEAD?.name || '';
  const branches: Record<string, GitBranchDetails> = {};
  const all: string[] = [];

  // Get local branches
  const localRefs = await repo.getBranches({ remote: false });
  for (const ref of localRefs) {
    if (ref.name) {
      all.push(ref.name);
      branches[ref.name] = {
        current: ref.name === currentBranch,
        name: ref.name,
        commit: ref.commit || '',
        label: ref.name,
      };
    }
  }

  // Get remote branches
  const remoteRefs = await repo.getBranches({ remote: true });
  for (const ref of remoteRefs) {
    if (ref.name) {
      const remoteBranchName = `remotes/${ref.name}`;
      all.push(remoteBranchName);
      branches[remoteBranchName] = {
        current: false,
        name: remoteBranchName,
        commit: ref.commit || '',
        label: ref.name,
      };
    }
  }

  // Add upstream info for HEAD
  if (state.HEAD?.name && state.HEAD?.upstream) {
    const branchInfo = branches[state.HEAD.name];
    if (branchInfo) {
      branchInfo.tracking = `${state.HEAD.upstream.remote}/${state.HEAD.upstream.name}`;
      branchInfo.ahead = state.HEAD.ahead;
      branchInfo.behind = state.HEAD.behind;
    }
  }

  return { all, current: currentBranch, branches };
}

/**
 * Fallback: Get branches using raw git commands
 */
async function getGitBranchesRaw(directory: string): Promise<GitBranchResult> {
  const result = await execGit(['branch', '-a', '-v', '--format=%(refname:short)|%(objectname:short)|%(upstream:short)|%(HEAD)'], directory);
  
  if (result.exitCode !== 0) {
    return { all: [], current: '', branches: {} };
  }

  const lines = result.stdout.trim().split('\n').filter(Boolean);
  const branches: Record<string, GitBranchDetails> = {};
  const all: string[] = [];
  let current = '';

  for (const line of lines) {
    const [name, commit, tracking, head] = line.split('|');
    if (name) {
      all.push(name);
      const isCurrent = head === '*';
      if (isCurrent) current = name;
      
      branches[name] = {
        current: isCurrent,
        name,
        commit: commit || '',
        label: name.replace(/^remotes\//, ''),
        tracking: tracking || undefined,
      };
    }
  }

  return { all, current, branches };
}

/**
 * Checkout a branch
 */
export async function checkoutBranch(directory: string, branch: string): Promise<{ success: boolean; branch: string }> {
  const repo = await getRepository(directory);
  
  if (repo) {
    try {
      await repo.checkout(branch);
      return { success: true, branch };
    } catch (error) {
      console.error('[GitService] Failed to checkout branch:', error);
    }
  }

  // Fallback to raw git
  const result = await execGit(['checkout', branch], directory);
  return { success: result.exitCode === 0, branch };
}

/**
 * Detach HEAD at current commit
 * This allows the current branch to be used in a worktree
 */
export async function detachHead(directory: string): Promise<{ success: boolean; commit: string }> {
  // Get current HEAD commit
  const headResult = await execGit(['rev-parse', 'HEAD'], directory);
  if (headResult.exitCode !== 0) {
    return { success: false, commit: '' };
  }
  
  const commit = headResult.stdout.trim();
  
  // Checkout the commit directly to detach HEAD
  const result = await execGit(['checkout', '--detach', 'HEAD'], directory);
  return { success: result.exitCode === 0, commit };
}

/**
 * Get the current HEAD branch name (null if detached)
 */
export async function getCurrentBranch(directory: string): Promise<string | null> {
  const repo = await getRepository(directory);
  
  if (repo) {
    const head = repo.state.HEAD;
    return head?.name || null;
  }

  // Fallback to raw git
  const result = await execGit(['symbolic-ref', '--short', 'HEAD'], directory);
  if (result.exitCode === 0) {
    return result.stdout.trim();
  }
  return null; // Detached HEAD
}

/**
 * Create a new branch
 */
export async function createBranch(directory: string, name: string, startPoint?: string): Promise<{ success: boolean; branch: string }> {
  const repo = await getRepository(directory);
  
  if (repo) {
    try {
      await repo.createBranch(name, false, startPoint);
      return { success: true, branch: name };
    } catch (error) {
      console.error('[GitService] Failed to create branch:', error);
    }
  }

  // Fallback to raw git
  const args = ['branch', name];
  if (startPoint) args.push(startPoint);
  const result = await execGit(args, directory);
  return { success: result.exitCode === 0, branch: name };
}

/**
 * Delete a local branch
 */
export async function deleteGitBranch(directory: string, branch: string, force = false): Promise<{ success: boolean }> {
  const repo = await getRepository(directory);
  
  if (repo) {
    try {
      await repo.deleteBranch(branch, force);
      return { success: true };
    } catch (error) {
      console.error('[GitService] Failed to delete branch:', error);
    }
  }

  // Fallback to raw git
  const flag = force ? '-D' : '-d';
  const result = await execGit(['branch', flag, branch], directory);
  return { success: result.exitCode === 0 };
}

/**
 * Delete a remote branch
 */
export async function deleteRemoteBranch(directory: string, branch: string, remote = 'origin'): Promise<{ success: boolean }> {
  const result = await execGit(['push', remote, '--delete', branch], directory);
  return { success: result.exitCode === 0 };
}

// ============== Worktree Operations ==============

export interface GitWorktreeInfo {
  worktree: string;
  head?: string;
  branch?: string;
}

/**
 * List all worktrees for a repository
 */
export async function listGitWorktrees(directory: string): Promise<GitWorktreeInfo[]> {
  const result = await execGit(['worktree', 'list', '--porcelain'], directory);
  
  if (result.exitCode !== 0) {
    return [];
  }

  const worktrees: GitWorktreeInfo[] = [];
  let current: Partial<GitWorktreeInfo> = {};

  for (const line of result.stdout.split('\n')) {
    if (line.startsWith('worktree ')) {
      if (current.worktree) {
        worktrees.push(current as GitWorktreeInfo);
      }
      current = { worktree: line.slice(9).trim() };
    } else if (line.startsWith('HEAD ')) {
      current.head = line.slice(5).trim();
    } else if (line.startsWith('branch ')) {
      current.branch = line.slice(7).trim();
    } else if (line === '' && current.worktree) {
      worktrees.push(current as GitWorktreeInfo);
      current = {};
    }
  }

  if (current.worktree) {
    worktrees.push(current as GitWorktreeInfo);
  }

  return worktrees;
}

/**
 * Get branches that are available for worktree checkout
 * (branches not already checked out in any worktree)
 */
export async function getAvailableBranchesForWorktree(directory: string): Promise<GitBranchDetails[]> {
  const [branches, worktrees] = await Promise.all([
    getGitBranches(directory),
    listGitWorktrees(directory),
  ]);

  // Get set of branches already checked out in worktrees
  const checkedOutBranches = new Set<string>();
  for (const wt of worktrees) {
    if (wt.branch) {
      // Normalize branch name (remove refs/heads/ prefix)
      const branchName = wt.branch.replace(/^refs\/heads\//, '');
      checkedOutBranches.add(branchName);
    }
  }

  // Filter out branches that are already checked out
  const availableBranches: GitBranchDetails[] = [];
  for (const name of branches.all) {
    // Skip remote branches for worktree creation
    if (name.startsWith('remotes/')) {
      continue;
    }
    
    if (!checkedOutBranches.has(name)) {
      const details = branches.branches[name];
      if (details) {
        availableBranches.push(details);
      }
    }
  }

  return availableBranches;
}

/**
 * Add a new worktree
 */
export async function addGitWorktree(
  directory: string, 
  worktreePath: string, 
  branch: string, 
  createBranch = false
): Promise<{ success: boolean; path: string; branch: string }> {
  const args = ['worktree', 'add'];
  
  if (createBranch) {
    args.push('-b', branch, worktreePath);
  } else {
    args.push(worktreePath, branch);
  }

  const result = await execGit(args, directory);
  
  return {
    success: result.exitCode === 0,
    path: worktreePath,
    branch,
  };
}

/**
 * Remove a worktree
 */
export async function removeGitWorktree(
  directory: string, 
  worktreePath: string, 
  force = false
): Promise<{ success: boolean }> {
  const args = ['worktree', 'remove'];
  if (force) args.push('--force');
  args.push(worktreePath);

  const result = await execGit(args, directory);
  return { success: result.exitCode === 0 };
}

// ============== Diff Operations ==============

/**
 * Get diff for a file
 */
export async function getGitDiff(
  directory: string, 
  filePath: string, 
  staged = false,
  contextLines?: number
): Promise<{ diff: string }> {
  const args = ['diff'];
  if (staged) args.push('--cached');
  if (typeof contextLines === 'number') args.push(`-U${contextLines}`);
  args.push('--', filePath);

  const result = await execGit(args, directory);
  return { diff: result.stdout };
}

/**
 * Get diff between two refs for a file (base...head).
 */
export async function getGitRangeDiff(
  directory: string,
  base: string,
  head: string,
  filePath: string,
  contextLines = 3
): Promise<{ diff: string }> {
  const baseRef = (base || '').trim();
  const headRef = (head || '').trim();
  if (!baseRef || !headRef) {
    return { diff: '' };
  }

  let resolvedBase = baseRef;
  try {
    const verify = await execGit(['rev-parse', '--verify', `refs/remotes/origin/${baseRef}`], directory);
    if (verify.exitCode === 0) {
      resolvedBase = `origin/${baseRef}`;
    }
  } catch {
    // ignore
  }

  const args = ['diff', '--no-color', `-U${Math.max(0, contextLines)}`, `${resolvedBase}...${headRef}`, '--', filePath];
  const result = await execGit(args, directory);
  return { diff: result.stdout };
}

/**
 * List files changed between two refs (base...head).
 */
export async function getGitRangeFiles(
  directory: string,
  base: string,
  head: string
): Promise<string[]> {
  const baseRef = (base || '').trim();
  const headRef = (head || '').trim();
  if (!baseRef || !headRef) {
    return [];
  }

  let resolvedBase = baseRef;
  try {
    const verify = await execGit(['rev-parse', '--verify', `refs/remotes/origin/${baseRef}`], directory);
    if (verify.exitCode === 0) {
      resolvedBase = `origin/${baseRef}`;
    }
  } catch {
    // ignore
  }

  const args = ['diff', '--name-only', `${resolvedBase}...${headRef}`];
  const result = await execGit(args, directory);
  if (result.exitCode !== 0) return [];
  return String(result.stdout || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

/**
 * Get file diff with original and modified content
 */
export async function getGitFileDiff(
  directory: string, 
  filePath: string, 
  staged = false
): Promise<{ original: string; modified: string; path: string }> {
  const repo = await getRepository(directory);
  
  if (repo) {
    try {
      // For staged files, get content from HEAD
      // For unstaged files, get content from index (staged) or HEAD
      let original: string;
      if (staged) {
        original = await repo.show('HEAD', filePath);
      } else {
        try {
          // Try to get from index first
          original = await repo.show(':0:' + filePath, filePath);
        } catch {
          // Fall back to HEAD
          original = await repo.show('HEAD', filePath);
        }
      }
      
      // Read the current file content
      const fileUri = vscode.Uri.file(path.join(directory, filePath));
      const modifiedBytes = await vscode.workspace.fs.readFile(fileUri);
      const modified = Buffer.from(modifiedBytes).toString('utf8');
      
      return { original, modified, path: filePath };
    } catch (error) {
      console.error('[GitService] Failed to get file diff:', error);
    }
  }

  // Fallback: return empty content
  return { original: '', modified: '', path: filePath };
}

/**
 * Revert a file to its last committed state
 */
export async function revertGitFile(directory: string, filePath: string): Promise<void> {
  const repo = await getRepository(directory);
  
  if (repo) {
    try {
      await repo.revert([filePath]);
      return;
    } catch (error) {
      console.error('[GitService] Failed to revert via API:', error);
    }
  }

  // Fallback to raw git
  await execGit(['checkout', '--', filePath], directory);
}

// ============== Commit Operations ==============

export interface GitCommitResult {
  success: boolean;
  commit: string;
  branch: string;
  summary: {
    changes: number;
    insertions: number;
    deletions: number;
  };
}

/**
 * Create a git commit
 */
export async function createGitCommit(
  directory: string,
  message: string,
  options?: { addAll?: boolean; files?: string[] }
): Promise<GitCommitResult> {
  const repo = await getRepository(directory);
  
  if (repo) {
    try {
      if (options?.addAll) {
        await repo.add(['.']);
      } else if (options?.files?.length) {
        await repo.add(options.files);
      }
      
      await repo.commit(message);
      
      const head = repo.state.HEAD;
      return {
        success: true,
        commit: head?.commit || '',
        branch: head?.name || '',
        summary: { changes: 0, insertions: 0, deletions: 0 },
      };
    } catch (error) {
      console.error('[GitService] Failed to commit:', error);
    }
  }

  // Fallback to raw git
  if (options?.addAll) {
    await execGit(['add', '-A'], directory);
  } else if (options?.files?.length) {
    await execGit(['add', ...options.files], directory);
  }

  const result = await execGit(['commit', '-m', message], directory);
  
  if (result.exitCode !== 0) {
    return {
      success: false,
      commit: '',
      branch: '',
      summary: { changes: 0, insertions: 0, deletions: 0 },
    };
  }

  // Get commit info
  const hashResult = await execGit(['rev-parse', 'HEAD'], directory);
  const branchResult = await execGit(['rev-parse', '--abbrev-ref', 'HEAD'], directory);

  return {
    success: true,
    commit: hashResult.stdout.trim(),
    branch: branchResult.stdout.trim(),
    summary: { changes: 0, insertions: 0, deletions: 0 },
  };
}

// ============== Remote Operations ==============

/**
 * Convert options to an array of git arguments.
 * Supports both array format ['--set-upstream', '--force'] and 
 * object format { '--set-upstream': null, '--force': true }
 */
function normalizeGitOptions(options?: string[] | Record<string, unknown>): string[] {
  if (!options) return [];
  
  if (Array.isArray(options)) {
    return options;
  }
  
  // Object format: { '--set-upstream': null, '--force': true, '--remote': 'origin' }
  const args: string[] = [];
  for (const [key, value] of Object.entries(options)) {
    if (value === null || value === true) {
      args.push(key);
    } else if (value !== false && value !== undefined) {
      args.push(key, String(value));
    }
  }
  return args;
}

/**
 * Check if options contain a specific flag
 */
function hasOption(options: string[] | Record<string, unknown> | undefined, flag: string): boolean {
  if (!options) return false;
  
  if (Array.isArray(options)) {
    return options.includes(flag);
  }
  
  return flag in options && options[flag] !== false;
}

/**
 * Push to remote
 */
export async function gitPush(
  directory: string,
  options?: { remote?: string; branch?: string; options?: string[] | Record<string, unknown> }
): Promise<{ success: boolean; pushed: Array<{ local: string; remote: string }>; repo: string; ref: unknown }> {
  const repo = await getRepository(directory);
  const remote = options?.remote || 'origin';
  const branch = options?.branch;
  const gitOptions = options?.options;
  
  // Determine if we should set upstream (default true if no options specified)
  const setUpstream = gitOptions 
    ? hasOption(gitOptions, '--set-upstream') || hasOption(gitOptions, '-u')
    : true;
  
  if (repo) {
    try {
      await repo.push(remote, branch, setUpstream);
      
      return {
        success: true,
        pushed: [{ local: branch || '', remote }],
        repo: directory,
        ref: null,
      };
    } catch (error) {
      console.error('[GitService] Failed to push via VS Code API:', error);
    }
  }

  // Fallback to raw git - use full options here
  const args = ['push'];
  
  // Add normalized options
  const normalizedOptions = normalizeGitOptions(gitOptions);
  
  // If no options provided, default to -u for upstream
  if (normalizedOptions.length === 0) {
    args.push('-u');
  } else {
    args.push(...normalizedOptions);
  }
  
  // Add remote and branch
  args.push(remote);
  if (branch) args.push(branch);

  const result = await execGit(args, directory);
  
  return {
    success: result.exitCode === 0,
    pushed: result.exitCode === 0 ? [{ local: branch || '', remote }] : [],
    repo: directory,
    ref: null,
  };
}

/**
 * Pull from remote
 */
export async function gitPull(
  directory: string,
  options?: { remote?: string; branch?: string }
): Promise<{ success: boolean; summary: { changes: number; insertions: number; deletions: number }; files: string[]; insertions: number; deletions: number }> {
  const repo = await getRepository(directory);
  
  if (repo) {
    try {
      await repo.pull();
      return {
        success: true,
        summary: { changes: 0, insertions: 0, deletions: 0 },
        files: [],
        insertions: 0,
        deletions: 0,
      };
    } catch (error) {
      console.error('[GitService] Failed to pull:', error);
    }
  }

  // Fallback to raw git
  const args = ['pull'];
  if (options?.remote) args.push(options.remote);
  if (options?.branch) args.push(options.branch);

  const result = await execGit(args, directory);
  
  return {
    success: result.exitCode === 0,
    summary: { changes: 0, insertions: 0, deletions: 0 },
    files: [],
    insertions: 0,
    deletions: 0,
  };
}

/**
 * Fetch from remote
 */
export async function gitFetch(
  directory: string,
  options?: { remote?: string; branch?: string }
): Promise<{ success: boolean }> {
  const repo = await getRepository(directory);
  
  if (repo) {
    try {
      await repo.fetch({ remote: options?.remote, ref: options?.branch });
      return { success: true };
    } catch (error) {
      console.error('[GitService] Failed to fetch:', error);
    }
  }

  // Fallback to raw git
  const args = ['fetch'];
  if (options?.remote) args.push(options.remote);
  if (options?.branch) args.push(options.branch);

  const result = await execGit(args, directory);
  return { success: result.exitCode === 0 };
}

// ============== Log Operations ==============

export interface GitLogEntry {
  hash: string;
  date: string;
  message: string;
  refs: string;
  body: string;
  author_name: string;
  author_email: string;
  filesChanged: number;
  insertions: number;
  deletions: number;
}

/**
 * Get git log
 */
export async function getGitLog(
  directory: string,
  options?: { maxCount?: number; from?: string; to?: string; file?: string }
): Promise<{ all: GitLogEntry[]; latest: GitLogEntry | null; total: number }> {
  const maxCount = options?.maxCount || 50;
  const args = [
    'log',
    `--max-count=${maxCount}`,
    '--format=%H|%aI|%s|%D|%b|%an|%ae',
    '--shortstat',
  ];
  
  if (options?.from && options?.to) {
    args.push(`${options.from}..${options.to}`);
  }
  
  if (options?.file) {
    args.push('--', options.file);
  }

  const result = await execGit(args, directory);
  
  if (result.exitCode !== 0) {
    return { all: [], latest: null, total: 0 };
  }

  const entries: GitLogEntry[] = [];
  const lines = result.stdout.split('\n');
  let current: Partial<GitLogEntry> | null = null;

  for (const line of lines) {
    if (line.includes('|') && !line.startsWith(' ')) {
      if (current?.hash) {
        entries.push(current as GitLogEntry);
      }
      const parts = line.split('|');
      current = {
        hash: parts[0] || '',
        date: parts[1] || '',
        message: parts[2] || '',
        refs: parts[3] || '',
        body: parts[4] || '',
        author_name: parts[5] || '',
        author_email: parts[6] || '',
        filesChanged: 0,
        insertions: 0,
        deletions: 0,
      };
    } else if (current && line.includes('file')) {
      const statsMatch = line.match(/(\d+)\s+files?\s+changed(?:,\s+(\d+)\s+insertions?)?(?:,\s+(\d+)\s+deletions?)?/);
      if (statsMatch) {
        current.filesChanged = parseInt(statsMatch[1] || '0', 10);
        current.insertions = parseInt(statsMatch[2] || '0', 10);
        current.deletions = parseInt(statsMatch[3] || '0', 10);
      }
    }
  }

  if (current?.hash) {
    entries.push(current as GitLogEntry);
  }

  return {
    all: entries,
    latest: entries[0] || null,
    total: entries.length,
  };
}

/**
 * Get files changed in a commit
 */
export async function getCommitFiles(
  directory: string,
  hash: string
): Promise<{ files: Array<{ path: string; insertions: number; deletions: number; isBinary: boolean; changeType: string }> }> {
  const result = await execGit(['show', '--numstat', '--format=', hash], directory);
  
  if (result.exitCode !== 0) {
    return { files: [] };
  }

  const files: Array<{ path: string; insertions: number; deletions: number; isBinary: boolean; changeType: string }> = [];
  
  for (const line of result.stdout.trim().split('\n').filter(Boolean)) {
    const parts = line.split('\t');
    if (parts.length >= 3) {
      const isBinary = parts[0] === '-' && parts[1] === '-';
      files.push({
        path: parts[2] || '',
        insertions: isBinary ? 0 : parseInt(parts[0] || '0', 10),
        deletions: isBinary ? 0 : parseInt(parts[1] || '0', 10),
        isBinary,
        changeType: 'M', // Would need additional parsing for actual change type
      });
    }
  }

  return { files };
}

// ============== Git Identity Operations ==============

export interface GitIdentitySummary {
  userName: string | null;
  userEmail: string | null;
  sshCommand: string | null;
}

/**
 * Get current git identity for a directory
 */
export async function getCurrentGitIdentity(directory: string): Promise<GitIdentitySummary | null> {
  const repo = await getRepository(directory);
  
  if (repo) {
    try {
      const userName = await repo.getConfig('user.name').catch(() => '');
      const userEmail = await repo.getConfig('user.email').catch(() => '');
      const sshCommand = await repo.getConfig('core.sshCommand').catch(() => '');
      
      return {
        userName: userName || null,
        userEmail: userEmail || null,
        sshCommand: sshCommand || null,
      };
    } catch (error) {
      console.error('[GitService] Failed to get identity:', error);
    }
  }

  // Fallback to raw git
  const nameResult = await execGit(['config', 'user.name'], directory);
  const emailResult = await execGit(['config', 'user.email'], directory);
  const sshResult = await execGit(['config', 'core.sshCommand'], directory);

  return {
    userName: nameResult.exitCode === 0 ? nameResult.stdout.trim() : null,
    userEmail: emailResult.exitCode === 0 ? emailResult.stdout.trim() : null,
    sshCommand: sshResult.exitCode === 0 ? sshResult.stdout.trim() : null,
  };
}

/**
 * Escape an SSH key path for use in core.sshCommand.
 * Handles Windows/Unix differences and prevents command injection.
 */
function escapeSshKeyPath(sshKeyPath: string): string {
  // Validate: reject paths with characters that could enable injection
  // Allow only alphanumeric, path separators, dots, dashes, underscores, spaces, and colons (for Windows drives)
  const dangerousChars = /[`$\\!"';&|<>(){}[\]*?#~]/;
  if (dangerousChars.test(sshKeyPath)) {
    throw new Error(`SSH key path contains invalid characters: ${sshKeyPath}`);
  }

  const isWindows = process.platform === 'win32';
  
  if (isWindows) {
    // On Windows, Git (via MSYS/MinGW) expects Unix-style paths
    // Convert backslashes to forward slashes and handle drive letters
    let unixPath = sshKeyPath.replace(/\\/g, '/');
    
    // Convert "C:/path" to "/c/path" for MSYS compatibility
    const driveMatch = unixPath.match(/^([A-Za-z]):\//);
    if (driveMatch) {
      unixPath = `/${driveMatch[1].toLowerCase()}${unixPath.slice(2)}`;
    }
    
    // Use single quotes for the path (prevents shell interpretation)
    return `'${unixPath}'`;
  } else {
    // On Unix, use single quotes and escape any single quotes in the path
    // Single quotes prevent all shell interpretation except for single quotes themselves
    const escaped = sshKeyPath.replace(/'/g, "'\\''");
    return `'${escaped}'`;
  }
}

/**
 * Build the SSH command string for git config
 */
function buildSshCommand(sshKeyPath: string): string {
  const escapedPath = escapeSshKeyPath(sshKeyPath);
  return `ssh -i ${escapedPath} -o IdentitiesOnly=yes`;
}

/**
 * Set git identity for a directory
 */
export async function setGitIdentity(
  directory: string,
  userName: string,
  userEmail: string,
  sshKey?: string | null
): Promise<{ success: boolean }> {
  const repo = await getRepository(directory);
  
  // Build SSH command once if needed
  const sshCommand = sshKey ? buildSshCommand(sshKey) : null;
  
  if (repo) {
    try {
      await repo.setConfig('user.name', userName);
      await repo.setConfig('user.email', userEmail);
      if (sshCommand) {
        await repo.setConfig('core.sshCommand', sshCommand);
      }
      return { success: true };
    } catch (error) {
      console.error('[GitService] Failed to set identity:', error);
    }
  }

  // Fallback to raw git
  await execGit(['config', 'user.name', userName], directory);
  await execGit(['config', 'user.email', userEmail], directory);
  if (sshCommand) {
    await execGit(['config', 'core.sshCommand', sshCommand], directory);
  }

  return { success: true };
}

// ============== Utility Operations ==============

/**
 * Ensure .openchamber is in git exclude
 */
export async function ensureOpenChamberIgnored(directory: string): Promise<void> {
  const excludeFile = path.join(directory, '.git', 'info', 'exclude');
  
  try {
    const uri = vscode.Uri.file(excludeFile);
    let content = '';
    
    try {
      const bytes = await vscode.workspace.fs.readFile(uri);
      content = Buffer.from(bytes).toString('utf8');
    } catch {
      // File doesn't exist, we'll create it
    }
    
    if (!content.includes('.openchamber')) {
      const newContent = content.trimEnd() + '\n.openchamber\n';
      await vscode.workspace.fs.writeFile(uri, Buffer.from(newContent, 'utf8'));
    }
  } catch (error) {
    console.warn('[GitService] Failed to update git exclude:', error);
  }
}
