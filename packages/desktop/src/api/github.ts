import type {
  GitHubAPI,
  GitHubAuthStatus,
  GitHubIssueCommentsResult,
  GitHubIssueGetResult,
  GitHubIssuesListResult,
  GitHubPullRequestContextResult,
  GitHubPullRequestsListResult,
  GitHubPullRequest,
  GitHubPullRequestCreateInput,
  GitHubPullRequestMergeInput,
  GitHubPullRequestMergeResult,
  GitHubPullRequestReadyInput,
  GitHubPullRequestReadyResult,
  GitHubPullRequestStatus,
  GitHubDeviceFlowComplete,
  GitHubDeviceFlowStart,
  GitHubUserSummary,
} from '@openchamber/ui/lib/api/types';

export const createDesktopGitHubAPI = (): GitHubAPI => ({
  async authStatus(): Promise<GitHubAuthStatus> {
    const { safeInvoke } = await import('../lib/tauriCallbackManager');
    return safeInvoke<GitHubAuthStatus>('github_auth_status', {}, { timeout: 8000 });
  },

  async authStart(): Promise<GitHubDeviceFlowStart> {
    const { safeInvoke } = await import('../lib/tauriCallbackManager');
    return safeInvoke<GitHubDeviceFlowStart>('github_auth_start', {}, { timeout: 8000 });
  },

  async authComplete(deviceCode: string): Promise<GitHubDeviceFlowComplete> {
    const { safeInvoke } = await import('../lib/tauriCallbackManager');
    return safeInvoke<GitHubDeviceFlowComplete>('github_auth_complete', { deviceCode }, { timeout: 12000 });
  },

  async authDisconnect(): Promise<{ removed: boolean }> {
    const { safeInvoke } = await import('../lib/tauriCallbackManager');
    const result = await safeInvoke<{ removed: boolean }>('github_auth_disconnect', {}, { timeout: 8000 });
    return { removed: Boolean(result?.removed) };
  },

  async authActivate(accountId: string): Promise<GitHubAuthStatus> {
    const { safeInvoke } = await import('../lib/tauriCallbackManager');
    return safeInvoke<GitHubAuthStatus>('github_auth_activate', { accountId }, { timeout: 8000 });
  },

  async me(): Promise<GitHubUserSummary> {
    const { safeInvoke } = await import('../lib/tauriCallbackManager');
    return safeInvoke<GitHubUserSummary>('github_me', {}, { timeout: 8000 });
  },

  async prStatus(directory: string, branch: string): Promise<GitHubPullRequestStatus> {
    const { safeInvoke } = await import('../lib/tauriCallbackManager');
    return safeInvoke<GitHubPullRequestStatus>('github_pr_status', { directory, branch }, { timeout: 12000 });
  },

  async prCreate(payload: GitHubPullRequestCreateInput): Promise<GitHubPullRequest> {
    const { safeInvoke } = await import('../lib/tauriCallbackManager');
    return safeInvoke<GitHubPullRequest>('github_pr_create', payload, { timeout: 20000 });
  },

  async prMerge(payload: GitHubPullRequestMergeInput): Promise<GitHubPullRequestMergeResult> {
    const { safeInvoke } = await import('../lib/tauriCallbackManager');
    return safeInvoke<GitHubPullRequestMergeResult>('github_pr_merge', payload, { timeout: 20000 });
  },

  async prReady(payload: GitHubPullRequestReadyInput): Promise<GitHubPullRequestReadyResult> {
    const { safeInvoke } = await import('../lib/tauriCallbackManager');
    return safeInvoke<GitHubPullRequestReadyResult>('github_pr_ready', payload, { timeout: 20000 });
  },

  async issuesList(directory: string, options?: { page?: number }): Promise<GitHubIssuesListResult> {
    const { safeInvoke } = await import('../lib/tauriCallbackManager');
    return safeInvoke<GitHubIssuesListResult>('github_issues_list', { directory, page: options?.page ?? 1 }, { timeout: 20000 });
  },

  async issueGet(directory: string, number: number): Promise<GitHubIssueGetResult> {
    const { safeInvoke } = await import('../lib/tauriCallbackManager');
    return safeInvoke<GitHubIssueGetResult>('github_issue_get', { directory, number }, { timeout: 20000 });
  },

  async issueComments(directory: string, number: number): Promise<GitHubIssueCommentsResult> {
    const { safeInvoke } = await import('../lib/tauriCallbackManager');
    return safeInvoke<GitHubIssueCommentsResult>('github_issue_comments', { directory, number }, { timeout: 20000 });
  },

  async prsList(directory: string, options?: { page?: number }): Promise<GitHubPullRequestsListResult> {
    const { safeInvoke } = await import('../lib/tauriCallbackManager');
    return safeInvoke<GitHubPullRequestsListResult>('github_prs_list', { directory, page: options?.page ?? 1 }, { timeout: 20000 });
  },

  async prContext(
    directory: string,
    number: number,
    options?: { includeDiff?: boolean; includeCheckDetails?: boolean }
  ): Promise<GitHubPullRequestContextResult> {
    const { safeInvoke } = await import('../lib/tauriCallbackManager');
    return safeInvoke<GitHubPullRequestContextResult>(
      'github_pr_context',
      { directory, number, includeDiff: Boolean(options?.includeDiff), includeCheckDetails: Boolean(options?.includeCheckDetails) },
      { timeout: 30000 }
    );
  },
});
