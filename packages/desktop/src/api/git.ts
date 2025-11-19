import { invoke } from '@tauri-apps/api/core';
import type { 
  GitAPI, 
  GitStatus, 
  GitDiffResponse, 
  GetGitDiffOptions, 
  GitBranch, 
  GitDeleteBranchPayload,
  GitDeleteRemoteBranchPayload,
  GeneratedCommitMessage,
  GitWorktreeInfo,
  GitAddWorktreePayload,
  GitRemoveWorktreePayload,
  CreateGitCommitOptions,
  GitCommitResult,
  GitPushResult,
  GitPullResult,
  GitLogOptions,
  GitLogResponse,
  GitIdentitySummary,
  GitIdentityProfile
} from '@openchamber/ui/lib/api/types';

// Wrap invoke to convert errors to Error objects (matching client.ts behavior)
async function safeInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    const message = typeof error === 'string' ? error : (error as Error).message || 'Unknown error';
    throw new Error(message);
  }
}

export const createDesktopGitAPI = (): GitAPI => ({
  async checkIsGitRepository(directory: string): Promise<boolean> {
    return safeInvoke<boolean>('check_is_git_repository', { directory });
  },

  async getGitStatus(directory: string): Promise<GitStatus> {
    return safeInvoke<GitStatus>('get_git_status', { directory });
  },

  async getGitDiff(directory: string, options: GetGitDiffOptions): Promise<GitDiffResponse> {
    const diff = await safeInvoke<string>('get_git_diff', { 
      directory, 
      pathStr: options.path,
      staged: options.staged,
      contextLines: options.contextLines 
    });
    return { diff };
  },

  async revertGitFile(directory: string, filePath: string): Promise<void> {
    return safeInvoke<void>('revert_git_file', { directory, filePath });
  },

  async isLinkedWorktree(directory: string): Promise<boolean> {
    return safeInvoke<boolean>('is_linked_worktree', { directory });
  },

  async getGitBranches(directory: string): Promise<GitBranch> {
    return safeInvoke<GitBranch>('get_git_branches', { directory });
  },

  async deleteGitBranch(directory: string, payload: GitDeleteBranchPayload): Promise<{ success: boolean }> {
    await safeInvoke<void>('delete_git_branch', { 
      directory, 
      branch: payload.branch,
      force: payload.force 
    });
    return { success: true };
  },

  async deleteRemoteBranch(directory: string, payload: GitDeleteRemoteBranchPayload): Promise<{ success: boolean }> {
    await safeInvoke<void>('delete_remote_branch', { 
      directory, 
      branch: payload.branch,
      remote: payload.remote 
    });
    return { success: true };
  },

  async generateCommitMessage(directory: string, files: string[]): Promise<{ message: GeneratedCommitMessage }> {
    const response = await safeInvoke<{ message: GeneratedCommitMessage }>('generate_commit_message', { 
      directory, 
      files 
    });
    return response;
  },

  async listGitWorktrees(directory: string): Promise<GitWorktreeInfo[]> {
    return safeInvoke<GitWorktreeInfo[]>('list_git_worktrees', { directory });
  },

  async addGitWorktree(directory: string, payload: GitAddWorktreePayload): Promise<{ success: boolean; path: string; branch: string }> {
    await safeInvoke<void>('add_git_worktree', { 
      directory, 
      pathStr: payload.path,
      branch: payload.branch,
      createBranch: payload.createBranch
    });
    return { success: true, path: payload.path, branch: payload.branch };
  },

  async removeGitWorktree(directory: string, payload: GitRemoveWorktreePayload): Promise<{ success: boolean }> {
    await safeInvoke<void>('remove_git_worktree', { 
      directory, 
      pathStr: payload.path,
      force: payload.force 
    });
    return { success: true };
  },

  async ensureOpenChamberIgnored(directory: string): Promise<void> {
    return safeInvoke<void>('ensure_openchamber_ignored', { directory });
  },

  async createGitCommit(directory: string, message: string, options?: CreateGitCommitOptions): Promise<GitCommitResult> {
    return safeInvoke<GitCommitResult>('create_git_commit', { 
      directory, 
      message,
      addAll: options?.addAll,
      files: options?.files
    });
  },

  async gitPush(directory: string, options?: { remote?: string; branch?: string; options?: string[] | Record<string, unknown> }): Promise<GitPushResult> {
    return safeInvoke<GitPushResult>('git_push', { 
      directory, 
      remote: options?.remote,
      branch: options?.branch
    });
  },

  async gitPull(directory: string, options?: { remote?: string; branch?: string }): Promise<GitPullResult> {
    return safeInvoke<GitPullResult>('git_pull', { 
      directory, 
      remote: options?.remote,
      branch: options?.branch
    });
  },

  async gitFetch(directory: string, options?: { remote?: string; branch?: string }): Promise<{ success: boolean }> {
    await safeInvoke<void>('git_fetch', { 
      directory, 
      remote: options?.remote 
    });
    return { success: true };
  },

  async checkoutBranch(directory: string, branch: string): Promise<{ success: boolean; branch: string }> {
    await safeInvoke<void>('checkout_branch', { directory, branch });
    return { success: true, branch };
  },

  async createBranch(directory: string, name: string, startPoint?: string): Promise<{ success: boolean; branch: string }> {
    await safeInvoke<void>('create_branch', { 
      directory, 
      name, 
      startPoint 
    });
    return { success: true, branch: name };
  },

  async getGitLog(directory: string, options?: GitLogOptions): Promise<GitLogResponse> {
    return safeInvoke<GitLogResponse>('get_git_log', { 
      directory, 
      maxCount: options?.maxCount,
      from: options?.from,
      to: options?.to,
      file: options?.file
    });
  },

  async getCurrentGitIdentity(directory: string): Promise<GitIdentitySummary | null> {
    try {
      return await safeInvoke<GitIdentitySummary>('get_current_git_identity', { directory });
    } catch {
      return null;
    }
  },

  async setGitIdentity(directory: string, profileId: string): Promise<{ success: boolean; profile: GitIdentityProfile }> {
    const profile = await safeInvoke<GitIdentityProfile>('set_git_identity', { directory, profileId });
    return { success: true, profile };
  },
});
