import { afterEach, describe, expect, test } from 'bun:test';
import type {
  GitIdentityProfile,
  GitTransportBindingIntent,
  SourceControlBindingRead,
  SourceControlProviderBindingMutation,
  SourceControlRepositoryBinding,
} from '@/lib/api/types';
import { applyIdentityToRepository, needsSystemAcknowledgement } from './applyIdentity';
import { repositoryBindingOwner } from './repository-binding';

const account = { provider: 'github', instance: 'github.com', accountId: 'occred:v1:github:one:r1' } as const;
const endpoint = (fingerprint: string) => ({ displayUrl: 'https://github.com/team/repo.git', fingerprint });
const remote = { name: 'origin', fetch: endpoint('fetch-one'), push: endpoint('push-one') };

type BoundProvider = SourceControlRepositoryBinding['providers'][number];

const read = (providers: BoundProvider[] = []): SourceControlBindingRead => ({
  status: 'bound',
  revision: 2,
  repository: { repositoryId: 'repo_one', configRevision: 'config_one', bare: false, remotes: [remote] },
  binding: {
    repositoryId: 'repo_one', configRevision: 'config_one', revision: 2, state: 'bound',
    providers, remotes: [], auxiliary: [],
  },
});

const identity = (overrides: Partial<GitIdentityProfile> = {}): GitIdentityProfile => ({
  id: 'work', name: 'Work', userName: 'Ada', userEmail: 'ada@example.com', ...overrides,
});

const harness = (initial = read()) => {
  const providerCalls: SourceControlProviderBindingMutation[] = [];
  const transportCalls: GitTransportBindingIntent[] = [];
  const authorCalls: string[] = [];
  return {
    providerCalls,
    transportCalls,
    authorCalls,
    apis: {
      git: {
        configureTransportBinding: async (intent: GitTransportBindingIntent) => {
          transportCalls.push(intent);
          return { status: 'configured' as const, binding: initial };
        },
        setGitIdentity: async (directory: string, profileId: string) => {
          authorCalls.push(`${directory}:${profileId}`);
          return { success: true, profile: identity() };
        },
      },
      sourceControl: {
        repositoryBinding: async () => initial,
        repositoryProviderBindingMutate: async (mutation: SourceControlProviderBindingMutation) => {
          providerCalls.push(mutation);
          return initial;
        },
      },
    },
  };
};

afterEach(() => { repositoryBindingOwner.reset(); });

describe('needsSystemAcknowledgement', () => {
  test('asks before an identity that uses whatever the machine holds', () => {
    expect(needsSystemAcknowledgement(identity({ transport: 'system' }), true)).toBe(true);
    // An identity written before identities carried a transport means the same.
    expect(needsSystemAcknowledgement(identity(), true)).toBe(true);
  });

  test('asks nothing when the identity names its own credentials', () => {
    expect(needsSystemAcknowledgement(identity({ account, transport: 'account' }), true)).toBe(false);
    expect(needsSystemAcknowledgement(identity({ transport: 'ssh', sshCredentialId: 'k' }), true)).toBe(false);
    expect(needsSystemAcknowledgement(identity({ transport: 'anonymous' }), true)).toBe(false);
  });

  test('asks nothing when there is no remote to bind', () => {
    expect(needsSystemAcknowledgement(identity({ transport: 'system' }), false)).toBe(false);
  });
});

describe('applyIdentityToRepository', () => {
  test('writes the account, the transport and the signature from one identity', async () => {
    const { apis, providerCalls, transportCalls, authorCalls } = harness();
    const outcome = await applyIdentityToRepository(
      { directory: '/repo', remoteName: 'origin', identity: identity({ account, transport: 'account' }) },
      apis,
    );
    expect(outcome).toEqual({ status: 'applied' });
    expect(providerCalls[0]).toEqual({
      directory: '/repo', expectedRepositoryId: 'repo_one', expectedRevision: 2,
      operation: 'add', provider: { ...account, primaryRemote: 'origin' },
    });
    expect(transportCalls[0]).toEqual({
      directory: '/repo', expectedRepositoryId: 'repo_one', expectedRevision: 2, expectedConfigRevision: 'config_one',
      expectedFetchFingerprint: 'fetch-one', expectedPushFingerprint: 'push-one', remote: 'origin',
      transport: 'https', credentialAccount: account,
    });
    expect(authorCalls).toEqual(['/repo:work']);
  });

  test('replaces the account a repository already answers to', async () => {
    const bound = {
      ...account, accountId: 'occred:v1:github:old:r1', primaryRemote: 'origin',
      readiness: 'ready' as const, endpoint: endpoint('fetch-one'),
    };
    const { apis, providerCalls } = harness(read([bound]));
    await applyIdentityToRepository(
      { directory: '/repo', remoteName: 'origin', identity: identity({ account, transport: 'account' }) },
      apis,
    );
    expect(providerCalls[0]).toEqual({
      directory: '/repo', expectedRepositoryId: 'repo_one', expectedRevision: 2, operation: 'replace',
      target: {
        provider: bound.provider, instance: bound.instance, accountId: bound.accountId, primaryRemote: bound.primaryRemote,
      },
      provider: { ...account, primaryRemote: 'origin' },
    });
  });

  test('binds a managed key, and an SSH identity may still answer to an account', async () => {
    const { apis, transportCalls, providerCalls } = harness();
    await applyIdentityToRepository({
      directory: '/repo',
      remoteName: 'origin',
      identity: identity({ account, transport: 'ssh', sshCredentialId: 'ocgit:v1:ssh:key' }),
    }, apis);
    expect(transportCalls[0]).toEqual({
      directory: '/repo', expectedRepositoryId: 'repo_one', expectedRevision: 2, expectedConfigRevision: 'config_one',
      expectedFetchFingerprint: 'fetch-one', expectedPushFingerprint: 'push-one', remote: 'origin',
      transport: 'ssh', sshCredentialId: 'ocgit:v1:ssh:key',
    });
    expect(providerCalls).toHaveLength(1);
  });

  test('asks before trusting whatever the machine holds', async () => {
    const unacknowledged = harness();
    expect(await applyIdentityToRepository(
      { directory: '/repo', remoteName: 'origin', identity: identity({ transport: 'system' }) },
      unacknowledged.apis,
    )).toEqual({ status: 'acknowledgement-required' });
    expect(unacknowledged.transportCalls).toEqual([]);
    // The signature is still written: it is about who commits, not about trust.
    expect(unacknowledged.authorCalls).toEqual(['/repo:work']);

    const acknowledged = harness();
    expect(await applyIdentityToRepository({
      directory: '/repo', remoteName: 'origin', identity: identity({ transport: 'system' }), acknowledgedSystem: true,
    }, acknowledged.apis)).toEqual({ status: 'applied' });
    expect(acknowledged.transportCalls[0]).toEqual({
      directory: '/repo', expectedRepositoryId: 'repo_one', expectedRevision: 2, expectedConfigRevision: 'config_one',
      expectedFetchFingerprint: 'fetch-one', expectedPushFingerprint: 'push-one', remote: 'origin',
      transport: 'system', unverifiedConfirmed: true,
    });
  });

  test('binds an anonymous transport without an account', async () => {
    const { apis, transportCalls, providerCalls } = harness();
    await applyIdentityToRepository(
      { directory: '/repo', remoteName: 'origin', identity: identity({ transport: 'anonymous' }) },
      apis,
    );
    expect(transportCalls[0]).toEqual({
      directory: '/repo', expectedRepositoryId: 'repo_one', expectedRevision: 2, expectedConfigRevision: 'config_one',
      expectedFetchFingerprint: 'fetch-one', expectedPushFingerprint: 'push-one', remote: 'origin',
      transport: 'anonymous',
    });
    expect(providerCalls).toEqual([]);
  });

  test('leaves the signature alone for the global identity, which the repository does not own', async () => {
    const { apis, authorCalls } = harness();
    await applyIdentityToRepository(
      { directory: '/repo', remoteName: 'origin', identity: identity({ id: 'global', transport: 'anonymous' }) },
      apis,
    );
    expect(authorCalls).toEqual([]);
  });

  test('reports a binding it could not write, and still writes the signature', async () => {
    const { apis, authorCalls } = harness();
    apis.sourceControl.repositoryProviderBindingMutate = async () => { throw new Error('conflict'); };
    expect(await applyIdentityToRepository(
      { directory: '/repo', remoteName: 'origin', identity: identity({ account, transport: 'account' }) },
      apis,
    )).toEqual({ status: 'failed', reason: 'binding' });
    expect(authorCalls).toEqual(['/repo:work']);
  });

  test('says so when the runtime cannot bind transports at all', async () => {
    const { apis } = harness();
    expect(await applyIdentityToRepository(
      { directory: '/repo', remoteName: 'origin', identity: identity({ transport: 'anonymous' }) },
      { ...apis, git: { setGitIdentity: apis.git.setGitIdentity } },
    )).toEqual({ status: 'unsupported' });
  });
});
