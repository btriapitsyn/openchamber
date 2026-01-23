import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const API_BASE = 'https://api.github.com';

type JsonRecord = Record<string, unknown>;

type GitHubRepoRef = { owner: string; repo: string; url: string };

type GitHubChecksSummary = {
  state: 'success' | 'failure' | 'pending' | 'unknown';
  total: number;
  success: number;
  failure: number;
  pending: number;
};

type GitHubPullRequest = {
  number: number;
  title: string;
  url: string;
  state: 'open' | 'closed' | 'merged';
  draft: boolean;
  base: string;
  head: string;
  headSha?: string;
  mergeable?: boolean | null;
  mergeableState?: string | null;
};

type GitHubPullRequestStatus = {
  connected: boolean;
  repo?: GitHubRepoRef | null;
  branch?: string;
  pr?: GitHubPullRequest | null;
  checks?: GitHubChecksSummary | null;
  canMerge?: boolean;
};

type GitHubPullRequestCreateInput = {
  directory: string;
  title: string;
  head: string;
  base: string;
  body?: string;
  draft?: boolean;
};

type GitHubPullRequestMergeInput = {
  directory: string;
  number: number;
  method: 'merge' | 'squash' | 'rebase';
};

type GitHubPullRequestMergeResult = { merged: boolean; message?: string };

const parseGitHubRemoteUrl = (raw: string): GitHubRepoRef | null => {
  const value = raw.trim();
  if (!value) return null;

  if (value.startsWith('git@github.com:')) {
    const rest = value.slice('git@github.com:'.length);
    const cleaned = rest.endsWith('.git') ? rest.slice(0, -4) : rest;
    const [owner, repo] = cleaned.split('/');
    if (!owner || !repo) return null;
    return { owner, repo, url: `https://github.com/${owner}/${repo}` };
  }

  if (value.startsWith('ssh://git@github.com/')) {
    const rest = value.slice('ssh://git@github.com/'.length);
    const cleaned = rest.endsWith('.git') ? rest.slice(0, -4) : rest;
    const [owner, repo] = cleaned.split('/');
    if (!owner || !repo) return null;
    return { owner, repo, url: `https://github.com/${owner}/${repo}` };
  }

  try {
    const url = new URL(value);
    if (url.hostname !== 'github.com') return null;
    const path = url.pathname.replace(/^\/+/, '').replace(/\/+$/, '');
    const cleaned = path.endsWith('.git') ? path.slice(0, -4) : path;
    const [owner, repo] = cleaned.split('/');
    if (!owner || !repo) return null;
    return { owner, repo, url: `https://github.com/${owner}/${repo}` };
  } catch {
    return null;
  }
};

const getOriginRemoteUrl = async (directory: string): Promise<string | null> => {
  try {
    const { stdout } = await execFileAsync('git', ['-C', directory, 'remote', 'get-url', 'origin']);
    const url = String(stdout || '').trim();
    return url || null;
  } catch {
    return null;
  }
};

export const resolveRepoFromDirectory = async (directory: string): Promise<GitHubRepoRef | null> => {
  const remote = await getOriginRemoteUrl(directory);
  if (!remote) return null;
  return parseGitHubRemoteUrl(remote);
};

const githubFetch = async (
  url: string,
  accessToken: string,
  init?: RequestInit,
): Promise<Response> => {
  return fetch(url, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${accessToken}`,
      'User-Agent': 'OpenChamber',
      ...(init?.headers || {}),
    },
  });
};

const jsonOrNull = async <T>(response: Response): Promise<T | null> => {
  return (await response.json().catch(() => null)) as T | null;
};

const readString = (value: unknown): string => (typeof value === 'string' ? value : '');

export const getPullRequestStatus = async (
  accessToken: string,
  userLogin: string | null,
  directory: string,
  branch: string,
): Promise<GitHubPullRequestStatus> => {
  const repo = await resolveRepoFromDirectory(directory);
  if (!repo) {
    return { connected: true, repo: null, branch, pr: null, checks: null, canMerge: false };
  }

  const listUrl = new URL(`${API_BASE}/repos/${repo.owner}/${repo.repo}/pulls`);
  listUrl.searchParams.set('state', 'open');
  listUrl.searchParams.set('head', `${repo.owner}:${branch}`);
  listUrl.searchParams.set('per_page', '10');

  const listResp = await githubFetch(listUrl.toString(), accessToken);
  if (listResp.status === 401) {
    return { connected: false };
  }
  const list = await jsonOrNull<Array<{ number: number }>>(listResp);
  if (!listResp.ok || !Array.isArray(list) || list.length === 0) {
    return { connected: true, repo, branch, pr: null, checks: null, canMerge: false };
  }

  const number = list[0].number;
  const prResp = await githubFetch(`${API_BASE}/repos/${repo.owner}/${repo.repo}/pulls/${number}`, accessToken);
  if (prResp.status === 401) {
    return { connected: false };
  }
  const prJson = await jsonOrNull<JsonRecord>(prResp);
  if (!prResp.ok || !prJson) {
    throw new Error('Failed to load PR');
  }

  const merged = Boolean(prJson.merged);
  const prState = readString(prJson.state);
  const state = merged ? 'merged' : (prState === 'closed' ? 'closed' : 'open');
  const pr: GitHubPullRequest = {
    number: typeof prJson.number === 'number' ? prJson.number : 0,
    title: readString(prJson.title) || '',
    url: readString(prJson.html_url) || '',
    state,
    draft: Boolean(prJson.draft),
    base: readString((prJson.base as JsonRecord | undefined)?.ref) || '',
    head: readString((prJson.head as JsonRecord | undefined)?.ref) || '',
    headSha: readString((prJson.head as JsonRecord | undefined)?.sha) || undefined,
    mergeable: typeof prJson.mergeable === 'boolean' ? prJson.mergeable : null,
    mergeableState: readString(prJson.mergeable_state) || undefined,
  };

  let checks: GitHubChecksSummary | null = null;
  if (pr.headSha) {
    // Prefer check-runs (Actions)
    const runsResp = await githubFetch(
      `${API_BASE}/repos/${repo.owner}/${repo.repo}/commits/${pr.headSha}/check-runs`,
      accessToken,
    );
    const runsJson = await jsonOrNull<JsonRecord>(runsResp);
    const runs = Array.isArray((runsJson as JsonRecord | null)?.check_runs)
      ? ((runsJson as JsonRecord).check_runs as unknown[])
      : [];

    if (runsResp.ok && runs.length > 0) {
      const counts = { success: 0, failure: 0, pending: 0 };
      runs.forEach((r) => {
        const rec = (r && typeof r === 'object') ? (r as JsonRecord) : null;
        const status = readString(rec?.status);
        const conclusion = readString(rec?.conclusion);
        if (status === 'queued' || status === 'in_progress') {
          counts.pending += 1;
          return;
        }
        if (!conclusion) {
          counts.pending += 1;
          return;
        }
        if (conclusion === 'success' || conclusion === 'neutral' || conclusion === 'skipped') {
          counts.success += 1;
        } else {
          counts.failure += 1;
        }
      });
      const total = counts.success + counts.failure + counts.pending;
      const state2 = counts.failure > 0
        ? 'failure'
        : (counts.pending > 0 ? 'pending' : (total > 0 ? 'success' : 'unknown'));
      checks = { state: state2, total, ...counts };
    }

    // Fallback: classic statuses
    if (!checks) {
      const statusResp = await githubFetch(
        `${API_BASE}/repos/${repo.owner}/${repo.repo}/commits/${pr.headSha}/status`,
        accessToken,
      );
      const statusJson = await jsonOrNull<JsonRecord>(statusResp);
      if (statusResp.ok && statusJson) {
        const statuses = Array.isArray(statusJson.statuses) ? (statusJson.statuses as unknown[]) : [];
        const counts = { success: 0, failure: 0, pending: 0 };
        statuses.forEach((s) => {
          const st = readString((s as JsonRecord | null)?.state);
          if (st === 'success') counts.success += 1;
          else if (st === 'failure' || st === 'error') counts.failure += 1;
          else if (st === 'pending') counts.pending += 1;
        });
        const total = counts.success + counts.failure + counts.pending;
        const state2 = counts.failure > 0
          ? 'failure'
          : (counts.pending > 0 ? 'pending' : (total > 0 ? 'success' : 'unknown'));
        checks = { state: state2, total, ...counts };
      }
    }
  }

  let canMerge = false;
  if (userLogin) {
    const permResp = await githubFetch(
      `${API_BASE}/repos/${repo.owner}/${repo.repo}/collaborators/${encodeURIComponent(userLogin)}/permission`,
      accessToken,
    );
    const permJson = await jsonOrNull<{ permission?: string }>(permResp);
    const perm = typeof permJson?.permission === 'string' ? permJson.permission : '';
    canMerge = perm === 'admin' || perm === 'maintain' || perm === 'write';
  }

  return { connected: true, repo, branch, pr, checks, canMerge };
};

export const createPullRequest = async (
  accessToken: string,
  directory: string,
  payload: GitHubPullRequestCreateInput,
): Promise<GitHubPullRequest> => {
  const repo = await resolveRepoFromDirectory(directory);
  if (!repo) {
    throw new Error('Unable to resolve GitHub repo from git remote');
  }

  const resp = await githubFetch(`${API_BASE}/repos/${repo.owner}/${repo.repo}/pulls`, accessToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: payload.title,
      head: payload.head,
      base: payload.base,
      ...(typeof payload.body === 'string' ? { body: payload.body } : {}),
      ...(typeof payload.draft === 'boolean' ? { draft: payload.draft } : {}),
    }),
  });

  const json = await jsonOrNull<JsonRecord>(resp);
  if (!resp.ok || !json) {
    throw new Error('Failed to create PR');
  }

  return {
    number: typeof json.number === 'number' ? json.number : 0,
    title: readString(json.title) || '',
    url: readString(json.html_url) || '',
    state: readString(json.state) === 'closed' ? 'closed' : 'open',
    draft: Boolean(json.draft),
    base: readString((json.base as JsonRecord | undefined)?.ref) || payload.base,
    head: readString((json.head as JsonRecord | undefined)?.ref) || payload.head,
    headSha: readString((json.head as JsonRecord | undefined)?.sha) || undefined,
    mergeable: typeof json.mergeable === 'boolean' ? json.mergeable : null,
    mergeableState: readString(json.mergeable_state) || undefined,
  };
};

export const mergePullRequest = async (
  accessToken: string,
  directory: string,
  payload: GitHubPullRequestMergeInput,
): Promise<GitHubPullRequestMergeResult> => {
  const repo = await resolveRepoFromDirectory(directory);
  if (!repo) {
    throw new Error('Unable to resolve GitHub repo from git remote');
  }

  const resp = await githubFetch(`${API_BASE}/repos/${repo.owner}/${repo.repo}/pulls/${payload.number}/merge`, accessToken, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ merge_method: payload.method }),
  });

  if (resp.status === 403) {
    throw new Error('Not authorized to merge this PR');
  }
  if (resp.status === 405 || resp.status === 409) {
    return { merged: false, message: 'PR not mergeable' };
  }
  const json = await jsonOrNull<JsonRecord>(resp);
  if (!resp.ok || !json) {
    throw new Error('Failed to merge PR');
  }
  return { merged: Boolean(json.merged), message: readString(json.message) || undefined };
};

export const markPullRequestReady = async (
  accessToken: string,
  directory: string,
  number: number,
): Promise<{ ready: boolean }> => {
  const repo = await resolveRepoFromDirectory(directory);
  if (!repo) {
    throw new Error('Unable to resolve GitHub repo from git remote');
  }

  const prResp = await githubFetch(`${API_BASE}/repos/${repo.owner}/${repo.repo}/pulls/${number}`, accessToken);
  if (prResp.status === 401) {
    return { ready: false };
  }
  const prJson = await jsonOrNull<JsonRecord>(prResp);
  const nodeId = typeof prJson?.node_id === 'string' ? prJson.node_id : '';
  const isDraft = Boolean((prJson as Record<string, unknown> | null)?.draft);
  if (!prResp.ok || !nodeId) {
    throw new Error('Failed to resolve PR node id');
  }

  if (!isDraft) {
    return { ready: true };
  }

  const resp = await githubFetch(`${API_BASE}/graphql`, accessToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query:
        'mutation($pullRequestId: ID!) { markPullRequestReadyForReview(input: { pullRequestId: $pullRequestId }) { pullRequest { id isDraft } } }',
      variables: { pullRequestId: nodeId },
    }),
  });

  if (resp.status === 403) {
    throw new Error('Not authorized to mark PR ready');
  }
  if (resp.status === 401) {
    const error = new Error('unauthorized');
    (error as unknown as { status?: number }).status = 401;
    throw error;
  }
  const json = await jsonOrNull<JsonRecord>(resp);
  if (!resp.ok || !json) {
    throw new Error('Failed to mark PR ready');
  }
  if (json.errors) {
    throw new Error('GitHub GraphQL error');
  }
  return { ready: true };
};
