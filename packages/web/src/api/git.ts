import * as gitApiHttp from '@openchamber/ui/lib/gitApiHttp';
import type {
  GitAPI,
  CreateGitCommitOptions,
  GitLogOptions,
} from '@openchamber/ui/lib/api/types';

export const createWebGitAPI = (): GitAPI => ({
  checkIsGitRepository: gitApiHttp.checkIsGitRepository,
  getGitStatus: gitApiHttp.getGitStatus,
  getGitDiff: gitApiHttp.getGitDiff,
  revertGitFile: gitApiHttp.revertGitFile,
  isLinkedWorktree: gitApiHttp.isLinkedWorktree,
  getGitBranches: gitApiHttp.getGitBranches,
  deleteGitBranch: gitApiHttp.deleteGitBranch as GitAPI['deleteGitBranch'],
  deleteRemoteBranch: gitApiHttp.deleteRemoteBranch as GitAPI['deleteRemoteBranch'],
  generateCommitMessage: gitApiHttp.generateCommitMessage,
  listGitWorktrees: gitApiHttp.listGitWorktrees,
  addGitWorktree: gitApiHttp.addGitWorktree as GitAPI['addGitWorktree'],
  removeGitWorktree: gitApiHttp.removeGitWorktree as GitAPI['removeGitWorktree'],
  ensureOpenChamberIgnored: gitApiHttp.ensureOpenChamberIgnored,
  createGitCommit(directory: string, message: string, options?: CreateGitCommitOptions) {
    return gitApiHttp.createGitCommit(directory, message, options);
  },
  gitPush: gitApiHttp.gitPush,
  gitPull: gitApiHttp.gitPull,
  gitFetch: gitApiHttp.gitFetch,
  checkoutBranch: gitApiHttp.checkoutBranch,
  createBranch: gitApiHttp.createBranch,
  getGitLog(directory: string, options?: GitLogOptions) {
    return gitApiHttp.getGitLog(directory, options);
  },
  getCurrentGitIdentity: gitApiHttp.getCurrentGitIdentity,
  setGitIdentity: gitApiHttp.setGitIdentity,
  getGitIdentities: gitApiHttp.getGitIdentities,
  createGitIdentity: gitApiHttp.createGitIdentity,
  updateGitIdentity: gitApiHttp.updateGitIdentity,
  deleteGitIdentity: gitApiHttp.deleteGitIdentity,
});