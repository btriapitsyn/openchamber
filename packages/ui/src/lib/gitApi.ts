

import type { RuntimeAPIs } from './api/types';
import * as gitHttp from './gitApiHttp';

export type {
  GitStatus,
  GitDiffResponse,
  GetGitDiffOptions,
  GitBranchDetails,
  GitBranch,
  GitCommitResult,
  GitPushResult,
  GitPullResult,
  GitIdentityProfile,
  GitIdentityAuthType,
  GitIdentitySummary,
  GitLogEntry,
  GitLogResponse,
  GitWorktreeInfo,
  GitAddWorktreePayload,
  GitRemoveWorktreePayload,
  GitDeleteBranchPayload,
  GitDeleteRemoteBranchPayload,
  DiscoveredGitCredential,
} from './api/types';

declare global {
  interface Window {
    __OPENCHAMBER_RUNTIME_APIS__?: RuntimeAPIs;
  }
}

const getRuntimeGit = () => {
  if (typeof window !== 'undefined' && window.__OPENCHAMBER_RUNTIME_APIS__?.git) {
    return window.__OPENCHAMBER_RUNTIME_APIS__.git;
  }
  return null;
};

export async function checkIsGitRepository(directory: string): Promise<boolean> {
  const runtime = getRuntimeGit();
  if (runtime) return runtime.checkIsGitRepository(directory);
  return gitHttp.checkIsGitRepository(directory);
}

export async function getGitStatus(directory: string): Promise<import('./api/types').GitStatus> {
  const runtime = getRuntimeGit();
  if (runtime) return runtime.getGitStatus(directory);
  return gitHttp.getGitStatus(directory);
}

export async function getGitDiff(directory: string, options: import('./api/types').GetGitDiffOptions): Promise<import('./api/types').GitDiffResponse> {
  const runtime = getRuntimeGit();
  if (runtime) return runtime.getGitDiff(directory, options);
  return gitHttp.getGitDiff(directory, options);
}

export async function getGitFileDiff(
  directory: string,
  options: import('./api/types').GetGitFileDiffOptions
): Promise<import('./api/types').GitFileDiffResponse> {
  const runtime = getRuntimeGit();
  if (runtime) return runtime.getGitFileDiff(directory, options);
  return gitHttp.getGitFileDiff(directory, options);
}

export async function revertGitFile(directory: string, filePath: string): Promise<void> {
  const runtime = getRuntimeGit();
  if (runtime) return runtime.revertGitFile(directory, filePath);
  return gitHttp.revertGitFile(directory, filePath);
}

export async function isLinkedWorktree(directory: string): Promise<boolean> {
  const runtime = getRuntimeGit();
  if (runtime) return runtime.isLinkedWorktree(directory);
  return gitHttp.isLinkedWorktree(directory);
}

export async function getGitBranches(directory: string): Promise<import('./api/types').GitBranch> {
  const runtime = getRuntimeGit();
  if (runtime) return runtime.getGitBranches(directory);
  return gitHttp.getGitBranches(directory);
}

export async function deleteGitBranch(directory: string, payload: import('./api/types').GitDeleteBranchPayload): Promise<{ success: boolean }> {
  const runtime = getRuntimeGit();
  if (runtime) return runtime.deleteGitBranch(directory, payload);
  return gitHttp.deleteGitBranch(directory, payload);
}

export async function deleteRemoteBranch(directory: string, payload: import('./api/types').GitDeleteRemoteBranchPayload): Promise<{ success: boolean }> {
  const runtime = getRuntimeGit();
  if (runtime) return runtime.deleteRemoteBranch(directory, payload);
  return gitHttp.deleteRemoteBranch(directory, payload);
}

export async function generateCommitMessage(
  directory: string,
  files: string[]
): Promise<{ message: import('./api/types').GeneratedCommitMessage }> {
  const runtime = getRuntimeGit();
  if (runtime) return runtime.generateCommitMessage(directory, files);
  return gitHttp.generateCommitMessage(directory, files);
}

export async function generatePullRequestDescription(
  directory: string,
  payload: { base: string; head: string }
): Promise<import('./api/types').GeneratedPullRequestDescription> {
  const runtime = getRuntimeGit();
  if (runtime?.generatePullRequestDescription) {
    return runtime.generatePullRequestDescription(directory, payload);
  }
  return gitHttp.generatePullRequestDescription(directory, payload);
}

export async function listGitWorktrees(directory: string): Promise<import('./api/types').GitWorktreeInfo[]> {
  const runtime = getRuntimeGit();
  if (runtime) return runtime.listGitWorktrees(directory);
  return gitHttp.listGitWorktrees(directory);
}

export async function addGitWorktree(directory: string, payload: import('./api/types').GitAddWorktreePayload): Promise<{ success: boolean; path: string; branch: string }> {
  const runtime = getRuntimeGit();
  if (runtime) return runtime.addGitWorktree(directory, payload);
  return gitHttp.addGitWorktree(directory, payload);
}

export async function removeGitWorktree(directory: string, payload: import('./api/types').GitRemoveWorktreePayload): Promise<{ success: boolean }> {
  const runtime = getRuntimeGit();
  if (runtime) return runtime.removeGitWorktree(directory, payload);
  return gitHttp.removeGitWorktree(directory, payload);
}

export async function ensureOpenChamberIgnored(directory: string): Promise<void> {
  // LEGACY_WORKTREES: only needed for <project>/.openchamber era. Safe to remove after legacy support dropped.
  const runtime = getRuntimeGit();
  if (runtime) return runtime.ensureOpenChamberIgnored(directory);
  return gitHttp.ensureOpenChamberIgnored(directory);
}

export async function createGitCommit(
  directory: string,
  message: string,
  options: import('./api/types').CreateGitCommitOptions = {}
): Promise<import('./api/types').GitCommitResult> {
  const runtime = getRuntimeGit();
  if (runtime) return runtime.createGitCommit(directory, message, options);
  return gitHttp.createGitCommit(directory, message, options);
}

export async function gitPush(
  directory: string,
  options: { remote?: string; branch?: string; options?: string[] | Record<string, unknown> } = {}
): Promise<import('./api/types').GitPushResult> {
  const runtime = getRuntimeGit();
  if (runtime) return runtime.gitPush(directory, options);
  return gitHttp.gitPush(directory, options);
}

export async function gitPull(
  directory: string,
  options: { remote?: string; branch?: string } = {}
): Promise<import('./api/types').GitPullResult> {
  const runtime = getRuntimeGit();
  if (runtime) return runtime.gitPull(directory, options);
  return gitHttp.gitPull(directory, options);
}

export async function gitFetch(
  directory: string,
  options: { remote?: string; branch?: string } = {}
): Promise<{ success: boolean }> {
  const runtime = getRuntimeGit();
  if (runtime) return runtime.gitFetch(directory, options);
  return gitHttp.gitFetch(directory, options);
}

export async function checkoutBranch(directory: string, branch: string): Promise<{ success: boolean; branch: string }> {
  const runtime = getRuntimeGit();
  if (runtime) return runtime.checkoutBranch(directory, branch);
  return gitHttp.checkoutBranch(directory, branch);
}

export async function createBranch(
  directory: string,
  name: string,
  startPoint?: string
): Promise<{ success: boolean; branch: string }> {
  const runtime = getRuntimeGit();
  if (runtime) return runtime.createBranch(directory, name, startPoint);
  return gitHttp.createBranch(directory, name, startPoint);
}

export async function renameBranch(
  directory: string,
  oldName: string,
  newName: string
): Promise<{ success: boolean; branch: string }> {
  const runtime = getRuntimeGit();
  if (runtime) return runtime.renameBranch(directory, oldName, newName);
  return gitHttp.renameBranch(directory, oldName, newName);
}

export async function getGitLog(
  directory: string,
  options: import('./api/types').GitLogOptions = {}
): Promise<import('./api/types').GitLogResponse> {
  const runtime = getRuntimeGit();
  if (runtime) return runtime.getGitLog(directory, options);
  return gitHttp.getGitLog(directory, options);
}

export async function getCommitFiles(
  directory: string,
  hash: string
): Promise<import('./api/types').GitCommitFilesResponse> {
  const runtime = getRuntimeGit();
  if (runtime) return runtime.getCommitFiles(directory, hash);
  return gitHttp.getCommitFiles(directory, hash);
}

export async function getGitIdentities(): Promise<import('./api/types').GitIdentityProfile[]> {
  const runtime = getRuntimeGit();
  if (runtime) return runtime.getGitIdentities();
  return gitHttp.getGitIdentities();
}

export async function createGitIdentity(profile: import('./api/types').GitIdentityProfile): Promise<import('./api/types').GitIdentityProfile> {
  const runtime = getRuntimeGit();
  if (runtime) return runtime.createGitIdentity(profile);
  return gitHttp.createGitIdentity(profile);
}

export async function updateGitIdentity(id: string, updates: import('./api/types').GitIdentityProfile): Promise<import('./api/types').GitIdentityProfile> {
  const runtime = getRuntimeGit();
  if (runtime) return runtime.updateGitIdentity(id, updates);
  return gitHttp.updateGitIdentity(id, updates);
}

export async function deleteGitIdentity(id: string): Promise<void> {
  const runtime = getRuntimeGit();
  if (runtime) return runtime.deleteGitIdentity(id);
  return gitHttp.deleteGitIdentity(id);
}

export async function getCurrentGitIdentity(directory: string): Promise<import('./api/types').GitIdentitySummary | null> {
  const runtime = getRuntimeGit();
  if (runtime) return runtime.getCurrentGitIdentity(directory);
  return gitHttp.getCurrentGitIdentity(directory);
}

export async function hasLocalIdentity(directory: string): Promise<boolean> {
  const runtime = getRuntimeGit();
  if (runtime?.hasLocalIdentity) return runtime.hasLocalIdentity(directory);
  return gitHttp.hasLocalIdentity(directory);
}

export async function setGitIdentity(
  directory: string,
  profileId: string
): Promise<{ success: boolean; profile: import('./api/types').GitIdentityProfile }> {
  const runtime = getRuntimeGit();
  if (runtime) return runtime.setGitIdentity(directory, profileId);
  return gitHttp.setGitIdentity(directory, profileId);
}

export async function discoverGitCredentials(): Promise<import('./api/types').DiscoveredGitCredential[]> {
  const runtime = getRuntimeGit();
  if (runtime?.discoverGitCredentials) return runtime.discoverGitCredentials();
  return gitHttp.discoverGitCredentials();
}

export async function getGlobalGitIdentity(): Promise<import('./api/types').GitIdentitySummary | null> {
  const runtime = getRuntimeGit();
  if (runtime?.getGlobalGitIdentity) return runtime.getGlobalGitIdentity();
  return gitHttp.getGlobalGitIdentity();
}

export async function getRemoteUrl(directory: string, remote?: string): Promise<string | null> {
  const runtime = getRuntimeGit();
  if (runtime?.getRemoteUrl) return runtime.getRemoteUrl(directory, remote);
  return gitHttp.getRemoteUrl(directory, remote);
}
