import { describe, expect, test } from 'bun:test';
import type { GitRemote, SourceControlBindingRead, SourceControlIdentity } from '@/lib/api/types';
import {
  getBoundSourceControlReadContexts,
  getSourceControlBaseUrl,
  mergeIncompleteSourceControlPage,
  resolveSourceControlIdentity,
  resolveSourceControlTarget,
  gitRemoteHost,
} from './identity';

const remote = (url: string): GitRemote => ({ name: 'origin', fetchUrl: url, pushUrl: url });

const repository = {
  repositoryId: 'repo-one',
  configRevision: 'config-one',
  bare: false,
  remotes: [{ name: 'origin', fetch: { displayUrl: 'https://github.com/team/repo', fingerprint: 'fetch' },
    push: { displayUrl: 'https://github.com/team/repo', fingerprint: 'push' } }],
};

const bindingRead = (status: 'bound' | 'needs-attention' | 'missing'): SourceControlBindingRead => {
  if (status === 'missing') return { status, repository, revision: 0, binding: null };
  return {
    status,
    repository,
    revision: 3,
    binding: {
      repositoryId: repository.repositoryId,
      revision: 3,
      providers: [{ provider: 'github', instance: 'github.com', accountId: 'github.com#7', primaryRemote: 'origin',
        readiness: status === 'bound' ? 'ready' : 'account-unavailable', endpoint: repository.remotes[0].fetch }],
      remotes: [],
      auxiliary: [],
      state: status === 'bound' ? 'bound' : 'needs-attention',
      configRevision: repository.configRevision,
    },
  };
};

describe('source-control identity resolution', () => {
  test('recognizes GitLab.com HTTPS and SSH remotes', () => {
    const expected = { provider: 'gitlab', instance: 'https://gitlab.com' };
    expect(resolveSourceControlIdentity(remote('https://gitlab.com/team/repo.git'), [])).toEqual(expected);
    expect(resolveSourceControlIdentity(remote('git@gitlab.com:team/repo.git'), [])).toEqual(expected);
  });

  test('matches a known self-managed instance by remote host', () => {
    const identity = { provider: 'gitlab', instance: 'https://gitlab.example.com' } satisfies SourceControlIdentity;
    expect(resolveSourceControlIdentity(remote('ssh://git@gitlab.example.com/team/repo.git'), [identity])).toBe(identity);
  });

  test('recognizes GitHub and rejects unknown hosts', () => {
    const expected = { provider: 'github', instance: 'github.com' };
    expect(resolveSourceControlIdentity(remote('git@github.com:team/repo.git'), [])).toEqual(expected);
    expect(resolveSourceControlIdentity(remote('git@example.com:team/repo.git'), [])).toBeNull();
  });

  test('strict target resolution rejects unknown and ambiguous remotes', () => {
    expect(resolveSourceControlTarget([remote('git@example.com:team/repo.git')], [])).toBeNull();

    const upstream = { ...remote('https://github.com/team/repo.git'), name: 'upstream' };
    const origin = { ...remote('https://gitlab.com/team/repo.git'), name: 'origin' };
    expect(resolveSourceControlTarget([upstream, origin], [])).toBeNull();
  });

  test('matches self-managed instances by host and port', () => {
    const first = { provider: 'gitlab', instance: 'https://gitlab.example.com:8443' } satisfies SourceControlIdentity;
    const second = { provider: 'gitlab', instance: 'https://gitlab.example.com:9443' } satisfies SourceControlIdentity;
    expect(resolveSourceControlTarget(
      [remote('ssh://git@gitlab.example.com:9443/team/repo.git')],
      [first, second],
    )?.identity).toBe(second);
  });

  test('normalizes provider instances for browser links', () => {
    expect(getSourceControlBaseUrl({ provider: 'github', instance: 'github.com' })).toBe('https://github.com');
    expect(getSourceControlBaseUrl({ provider: 'gitlab', instance: 'https://gitlab.example.com' })).toBe('https://gitlab.example.com');
  });
});

describe('source-control binding read contexts', () => {
  test('a valid binding provides the exact account, remote and revision', () => {
    expect(getBoundSourceControlReadContexts(bindingRead('bound'), '/repo')).toEqual([{
      provider: 'github', instance: 'github.com', accountId: 'github.com#7', primaryRemote: 'origin',
      directory: '/repo', repositoryId: 'repo-one', bindingRevision: 3,
    }]);
  });

  test('missing and needs-attention bindings grant no read authority', () => {
    for (const status of ['missing', 'needs-attention'] as const) {
      expect(getBoundSourceControlReadContexts(bindingRead(status), '/repo')).toEqual([]);
    }
  });
});

describe('partial source-control pages', () => {
  const item = (projectId: string, number: number) => ({ project: { id: projectId }, number });

  test('preserves only failed project items missing from the next page', () => {
    const retained = item('upstream/repo', 2);
    const replaced = item('upstream/repo', 3);
    const staleComplete = item('owner/repo', 4);
    const nextReplacement = item('upstream/repo', 3);
    const freshComplete = item('owner/repo', 5);

    expect(mergeIncompleteSourceControlPage(
      [retained, replaced, staleComplete],
      {
        items: [nextReplacement, freshComplete],
        page: 1,
        hasMore: false,
        incompleteProjectIds: ['upstream/repo'],
      },
    )).toEqual([nextReplacement, freshComplete, retained]);
  });

  test('accepts an authoritative empty page when every project completed', () => {
    expect(mergeIncompleteSourceControlPage(
      [item('owner/repo', 1)],
      { items: [], page: 1, hasMore: false },
    )).toEqual([]);
  });
});

describe('gitRemoteHost', () => {
  test('reads the host from https and scp-like remotes alike', () => {
    expect(gitRemoteHost('https://github.com/team/repo.git')).toBe('github.com');
    expect(gitRemoteHost('https://GitLab.example.com:8443/team/repo.git')).toBe('gitlab.example.com');
    expect(gitRemoteHost('git@github.com:team/repo.git')).toBe('github.com');
    expect(gitRemoteHost('ssh://git@gitlab.example.com/team/repo.git')).toBe('gitlab.example.com');
    expect(gitRemoteHost('  git@GitHub.com:team/repo.git  ')).toBe('github.com');
  });

  test('returns null when there is no host to read', () => {
    expect(gitRemoteHost('')).toBeNull();
    expect(gitRemoteHost('   ')).toBeNull();
    expect(gitRemoteHost('team/repo.git')).toBeNull();
    expect(gitRemoteHost('not a url')).toBeNull();
  });
});
