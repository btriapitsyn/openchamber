import type {
  GitAPI,
  GetGitDiffOptions,
  GitDeleteBranchPayload,
  GitDeleteRemoteBranchPayload,
  GitAddWorktreePayload,
  GitRemoveWorktreePayload,
  GitLogOptions,
  CreateGitCommitOptions,
} from '@openchamber/ui/lib/api/types';

const notImplemented = (...args: unknown[]) => {
  void args;
  throw new Error('Desktop git API not implemented');
};

export const createDesktopGitAPI = (): GitAPI => ({
  async checkIsGitRepository(directory: string): Promise<boolean> {
    return notImplemented(directory);
  },
  async getGitStatus(directory: string) {
    return notImplemented(directory);
  },
  async getGitDiff(directory: string, options: GetGitDiffOptions) {
    return notImplemented(directory, options);
  },
  async revertGitFile(directory: string, filePath: string) {
    return notImplemented(directory, filePath);
  },
  async isLinkedWorktree(directory: string): Promise<boolean> {
    return notImplemented(directory);
  },
  async getGitBranches(directory: string) {
    return notImplemented(directory);
  },
  async deleteGitBranch(directory: string, payload: GitDeleteBranchPayload) {
    return notImplemented(directory, payload);
  },
  async deleteRemoteBranch(directory: string, payload: GitDeleteRemoteBranchPayload) {
    return notImplemented(directory, payload);
  },
  async generateCommitMessage(directory: string, files: string[]) {
    return notImplemented(directory, files);
  },
  async listGitWorktrees(directory: string) {
    return notImplemented(directory);
  },
  async addGitWorktree(directory: string, payload: GitAddWorktreePayload) {
    return notImplemented(directory, payload);
  },
  async removeGitWorktree(directory: string, payload: GitRemoveWorktreePayload) {
    return notImplemented(directory, payload);
  },
  async ensureOpenChamberIgnored(directory: string) {
    return notImplemented(directory);
  },
  async createGitCommit(directory: string, message: string, options?: CreateGitCommitOptions) {
    return notImplemented(directory, message, options);
  },
  async gitPush(directory: string, options?: { remote?: string; branch?: string; options?: string[] | Record<string, unknown> }) {
    return notImplemented(directory, options);
  },
  async gitPull(directory: string, options?: { remote?: string; branch?: string }) {
    return notImplemented(directory, options);
  },
  async gitFetch(directory: string, options?: { remote?: string; branch?: string }) {
    return notImplemented(directory, options);
  },
  async checkoutBranch(directory: string, branch: string) {
    return notImplemented(directory, branch);
  },
  async createBranch(directory: string, name: string, startPoint?: string) {
    return notImplemented(directory, name, startPoint);
  },
  async getGitLog(directory: string, options?: GitLogOptions) {
    return notImplemented(directory, options);
  },
  async getCurrentGitIdentity(directory: string) {
    return notImplemented(directory);
  },
  async setGitIdentity(directory: string, profileId: string) {
    return notImplemented(directory, profileId);
  },
});
