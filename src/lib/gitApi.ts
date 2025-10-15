/**
 * Git API client functions
 * Wraps Express server endpoints from server/index.js
 */

export interface GitStatus {
  current: string;
  tracking: string | null;
  ahead: number;
  behind: number;
  files: Array<{
    path: string;
    index: string;
    working_dir: string;
  }>;
  isClean: boolean;
}

export interface GitBranch {
  all: string[];
  current: string;
  branches: Record<string, any>;
}

export interface GitCommitResult {
  success: boolean;
  commit: string;
  branch: string;
  summary: any;
}

export interface GitPushResult {
  success: boolean;
  pushed: any[];
  repo: string;
  ref: any;
}

export interface GitPullResult {
  success: boolean;
  summary: any;
  files: string[];
  insertions: number;
  deletions: number;
}

const API_BASE = '/api/git';

function buildUrl(path: string, directory: string): string {
  const url = new URL(path, window.location.origin);
  url.searchParams.set('directory', directory);
  return url.toString();
}

export async function checkIsGitRepository(directory: string): Promise<boolean> {
  const response = await fetch(buildUrl(`${API_BASE}/check`, directory));
  if (!response.ok) {
    throw new Error(`Failed to check git repository: ${response.statusText}`);
  }
  const data = await response.json();
  return data.isGitRepository;
}

export async function getGitStatus(directory: string): Promise<GitStatus> {
  const response = await fetch(buildUrl(`${API_BASE}/status`, directory));
  if (!response.ok) {
    throw new Error(`Failed to get git status: ${response.statusText}`);
  }
  return response.json();
}

export async function getGitBranches(directory: string): Promise<GitBranch> {
  const response = await fetch(buildUrl(`${API_BASE}/branches`, directory));
  if (!response.ok) {
    throw new Error(`Failed to get branches: ${response.statusText}`);
  }
  return response.json();
}

export async function createGitCommit(
  directory: string,
  message: string,
  addAll: boolean = false
): Promise<GitCommitResult> {
  const response = await fetch(buildUrl(`${API_BASE}/commit`, directory), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, addAll }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error.error || 'Failed to create commit');
  }
  return response.json();
}

export async function gitPush(
  directory: string,
  options: { remote?: string; branch?: string } = {}
): Promise<GitPushResult> {
  const response = await fetch(buildUrl(`${API_BASE}/push`, directory), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error.error || 'Failed to push');
  }
  return response.json();
}

export async function gitPull(
  directory: string,
  options: { remote?: string; branch?: string } = {}
): Promise<GitPullResult> {
  const response = await fetch(buildUrl(`${API_BASE}/pull`, directory), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error.error || 'Failed to pull');
  }
  return response.json();
}

export async function gitFetch(
  directory: string,
  options: { remote?: string; branch?: string } = {}
): Promise<{ success: boolean }> {
  const response = await fetch(buildUrl(`${API_BASE}/fetch`, directory), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error.error || 'Failed to fetch');
  }
  return response.json();
}

export async function checkoutBranch(directory: string, branch: string): Promise<{ success: boolean; branch: string }> {
  const response = await fetch(buildUrl(`${API_BASE}/checkout`, directory), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ branch }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error.error || 'Failed to checkout branch');
  }
  return response.json();
}

export async function createBranch(
  directory: string,
  name: string,
  startPoint?: string
): Promise<{ success: boolean; branch: string }> {
  const response = await fetch(buildUrl(`${API_BASE}/branches`, directory), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, startPoint }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error.error || 'Failed to create branch');
  }
  return response.json();
}
