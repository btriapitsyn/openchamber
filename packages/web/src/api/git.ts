import * as gitApi from '@openchamber/ui/lib/gitApi';
import type {
  GitAPI,
  CreateGitCommitOptions,
  GitLogOptions,
} from '@openchamber/ui/lib/api/types';

export const createWebGitAPI = (): GitAPI => ({
  checkIsGitRepository: gitApi.checkIsGitRepository,
  getGitStatus: gitApi.getGitStatus,
  getGitDiff: gitApi.getGitDiff,
  revertGitFile: gitApi.revertGitFile,
  isLinkedWorktree: gitApi.isLinkedWorktree,
  getGitBranches: gitApi.getGitBranches,
  deleteGitBranch: gitApi.deleteGitBranch as GitAPI['deleteGitBranch'],
  deleteRemoteBranch: gitApi.deleteRemoteBranch as GitAPI['deleteRemoteBranch'],
  generateCommitMessage: gitApi.generateCommitMessage,
  listGitWorktrees: gitApi.listGitWorktrees,
  addGitWorktree: gitApi.addGitWorktree as GitAPI['addGitWorktree'],
  removeGitWorktree: gitApi.removeGitWorktree as GitAPI['removeGitWorktree'],
  ensureOpenChamberIgnored: gitApi.ensureOpenChamberIgnored,
  createGitCommit(directory: string, message: string, options?: CreateGitCommitOptions) {
    return gitApi.createGitCommit(directory, message, options);
  },
  gitPush: gitApi.gitPush,
  gitPull: gitApi.gitPull,
  gitFetch: gitApi.gitFetch,
  checkoutBranch: gitApi.checkoutBranch,
  createBranch: gitApi.createBranch,
  getGitLog(directory: string, options?: GitLogOptions) {
    return gitApi.getGitLog(directory, options);
  },
  getCurrentGitIdentity: gitApi.getCurrentGitIdentity,
  setGitIdentity: gitApi.setGitIdentity,
});
