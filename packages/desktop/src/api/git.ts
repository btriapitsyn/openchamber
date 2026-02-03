
import { safeInvoke } from '../lib/tauriCallbackManager';
import type {
  GitAPI,
  GitStatus,
  GitDiffResponse,
  GetGitDiffOptions,
  GitFileDiffResponse,
  GitBranch,
  GitDeleteBranchPayload,
  GitDeleteRemoteBranchPayload,
  GeneratedCommitMessage,
  GeneratedPullRequestDescription,
  GitWorktreeInfo,
  GitAddWorktreePayload,
  GitRemoveWorktreePayload,
  CreateGitCommitOptions,
  GitCommitResult,
  GitPushResult,
  GitPullResult,
  GitLogOptions,
  GitLogResponse,
  GitCommitFilesResponse,
  GitIdentitySummary,
  GitIdentityProfile,
  DiscoveredGitCredential
} from '@openchamber/ui/lib/api/types';

async function safeGitInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await safeInvoke<T>(command, args, {
      timeout: 120000,
      onCancel: () => {
        console.warn(`[GitAPI] Git operation ${command} did not complete within 120s; it may still be running.`);
      }
    });
  } catch (error) {
    const message = typeof error === 'string' ? error : (error as Error).message || 'Unknown error';
    throw new Error(message);
  }
}

export const createDesktopGitAPI = (): GitAPI => ({
  async checkIsGitRepository(directory: string): Promise<boolean> {
    return safeGitInvoke<boolean>('check_is_git_repository', { directory });
  },

  async getGitStatus(directory: string): Promise<GitStatus> {
    return safeGitInvoke<GitStatus>('get_git_status', { directory });
  },

  async getGitDiff(directory: string, options: GetGitDiffOptions): Promise<GitDiffResponse> {
    const diff = await safeGitInvoke<string>('get_git_diff', {
      directory,
      pathStr: options.path,
      staged: options.staged,
      contextLines: options.contextLines
    });
    return { diff };
  },

  async getGitFileDiff(directory: string, options: { path: string }): Promise<GitFileDiffResponse> {
    const [original, modified] = await safeGitInvoke<[string, string]>('get_git_file_diff', {
      directory,
      pathStr: options.path,
    });
    return {
      original: original ?? '',
      modified: modified ?? '',
      path: options.path,
    };
  },

  async revertGitFile(directory: string, filePath: string): Promise<void> {
    return safeGitInvoke<void>('revert_git_file', { directory, filePath });
  },

  async isLinkedWorktree(directory: string): Promise<boolean> {
    return safeGitInvoke<boolean>('is_linked_worktree', { directory });
  },

  async getGitBranches(directory: string): Promise<GitBranch> {
    return safeGitInvoke<GitBranch>('get_git_branches', { directory });
  },

  async deleteGitBranch(directory: string, payload: GitDeleteBranchPayload): Promise<{ success: boolean }> {
    await safeGitInvoke<void>('delete_git_branch', {
      directory,
      branch: payload.branch,
      force: payload.force
    });
    return { success: true };
  },

  async deleteRemoteBranch(directory: string, payload: GitDeleteRemoteBranchPayload): Promise<{ success: boolean }> {
    await safeGitInvoke<void>('delete_remote_branch', {
      directory,
      branch: payload.branch,
      remote: payload.remote
    });
    return { success: true };
  },

  async generateCommitMessage(directory: string, files: string[]): Promise<{ message: GeneratedCommitMessage }> {
    const response = await safeGitInvoke<{ message: GeneratedCommitMessage }>('generate_commit_message', {
      directory,
      files
    });
    return response;
  },

  async generatePullRequestDescription(
    directory: string,
    payload: { base: string; head: string; context?: string }
  ): Promise<GeneratedPullRequestDescription> {
    const params: { directory: string; base: string; head: string; context?: string } = {
      directory,
      base: payload.base,
      head: payload.head,
    };
    if (payload.context?.trim()) {
      params.context = payload.context.trim();
    }
    return safeGitInvoke<GeneratedPullRequestDescription>('generate_pr_description', params);
  },

  async listGitWorktrees(directory: string): Promise<GitWorktreeInfo[]> {
    return safeGitInvoke<GitWorktreeInfo[]>('list_git_worktrees', { directory });
  },

  async addGitWorktree(directory: string, payload: GitAddWorktreePayload): Promise<{ success: boolean; path: string; branch: string }> {
    await safeGitInvoke<void>('add_git_worktree', {
      directory,
      pathStr: payload.path,
      branch: payload.branch,
      createBranch: payload.createBranch,
      startPoint: payload.startPoint,
    });
    return { success: true, path: payload.path, branch: payload.branch };
  },

  async removeGitWorktree(directory: string, payload: GitRemoveWorktreePayload): Promise<{ success: boolean }> {
    await safeGitInvoke<void>('remove_git_worktree', {
      directory,
      pathStr: payload.path,
      force: payload.force
    });
    return { success: true };
  },

  async ensureOpenChamberIgnored(directory: string): Promise<void> {
    // LEGACY_WORKTREES: only needed for <project>/.openchamber era. Safe to remove after legacy support dropped.
    return safeGitInvoke<void>('ensure_openchamber_ignored', { directory });
  },

  async createGitCommit(directory: string, message: string, options?: CreateGitCommitOptions): Promise<GitCommitResult> {
    return safeGitInvoke<GitCommitResult>('create_git_commit', {
      directory,
      message,
      addAll: options?.addAll,
      files: options?.files
    });
  },

  async gitPush(directory: string, options?: { remote?: string; branch?: string; options?: string[] | Record<string, unknown> }): Promise<GitPushResult> {
    return safeGitInvoke<GitPushResult>('git_push', {
      directory,
      remote: options?.remote,
      branch: options?.branch,
      options: options?.options
    });
  },

  async gitPull(directory: string, options?: { remote?: string; branch?: string }): Promise<GitPullResult> {
    return safeGitInvoke<GitPullResult>('git_pull', {
      directory,
      remote: options?.remote,
      branch: options?.branch
    });
  },

  async gitFetch(directory: string, options?: { remote?: string; branch?: string }): Promise<{ success: boolean }> {
    await safeGitInvoke<void>('git_fetch', {
      directory,
      remote: options?.remote
    });
    return { success: true };
  },

  async checkoutBranch(directory: string, branch: string): Promise<{ success: boolean; branch: string }> {
    await safeGitInvoke<void>('checkout_branch', { directory, branch });
    return { success: true, branch };
  },

  async createBranch(directory: string, name: string, startPoint?: string): Promise<{ success: boolean; branch: string }> {
    await safeGitInvoke<void>('create_branch', {
      directory,
      name,
      startPoint
    });
    return { success: true, branch: name };
  },

  async renameBranch(directory: string, oldName: string, newName: string): Promise<{ success: boolean; branch: string }> {
    await safeGitInvoke<void>('rename_branch', {
      directory,
      oldName,
      newName
    });
    return { success: true, branch: newName };
  },

  async getGitLog(directory: string, options?: GitLogOptions): Promise<GitLogResponse> {
    return safeGitInvoke<GitLogResponse>('get_git_log', {
      directory,
      maxCount: options?.maxCount,
      from: options?.from,
      to: options?.to,
      file: options?.file
    });
  },

  async getCommitFiles(directory: string, hash: string): Promise<GitCommitFilesResponse> {
    return safeGitInvoke<GitCommitFilesResponse>('get_commit_files', {
      directory,
      hash
    });
  },

  async getCurrentGitIdentity(directory: string): Promise<GitIdentitySummary | null> {
    try {
      return await safeGitInvoke<GitIdentitySummary>('get_current_git_identity', { directory });
    } catch {
      return null;
    }
  },

  async hasLocalIdentity(directory: string): Promise<boolean> {
    try {
      return await safeGitInvoke<boolean>('has_local_identity', { directory });
    } catch {
      return false;
    }
  },

  async setGitIdentity(directory: string, profileId: string): Promise<{ success: boolean; profile: GitIdentityProfile }> {
    const profile = await safeGitInvoke<GitIdentityProfile>('set_git_identity', { directory, profileId });
    return { success: true, profile };
  },

  async getGitIdentities(): Promise<GitIdentityProfile[]> {
    return safeGitInvoke<GitIdentityProfile[]>('get_git_identities');
  },

  async createGitIdentity(profile: GitIdentityProfile): Promise<GitIdentityProfile> {
    return safeGitInvoke<GitIdentityProfile>('create_git_identity', { profile });
  },

  async updateGitIdentity(id: string, updates: GitIdentityProfile): Promise<GitIdentityProfile> {
    return safeGitInvoke<GitIdentityProfile>('update_git_identity', { id, updates });
  },

  async deleteGitIdentity(id: string): Promise<void> {
    return safeGitInvoke<void>('delete_git_identity', { id });
  },

  async discoverGitCredentials(): Promise<DiscoveredGitCredential[]> {
    return safeGitInvoke<DiscoveredGitCredential[]>('discover_git_credentials');
  },

  async getGlobalGitIdentity(): Promise<GitIdentitySummary | null> {
    try {
      return await safeGitInvoke<GitIdentitySummary>('get_global_git_identity');
    } catch {
      return null;
    }
  },

  async getRemoteUrl(directory: string, remote?: string): Promise<string | null> {
    try {
      return await safeGitInvoke<string | null>('get_remote_url', { directory, remote });
    } catch {
      return null;
    }
  },
});
