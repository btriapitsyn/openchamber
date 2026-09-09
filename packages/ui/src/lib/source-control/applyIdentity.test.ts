import { afterEach, describe, expect, test } from 'bun:test';
import type {
  GitIdentityProfile,
  GitTransportBindingIntent,
  SourceControlBindingRead,
  SourceControlProviderBindingMutation,
  SourceControlRepositoryBinding,
} from '@/lib/api/types';
import { applyIdentityToRepository, describeIdentityApplicability, identityApplicability, isSignatureOnlyIdentity, needsSystemAcknowledgement } from './applyIdentity';
import { repositoryBindingOwner } from './repository-binding';
import { usePendingOpenCodeRestartStore } from '@/stores/usePendingOpenCodeRestartStore';

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

describe('identityApplicability', () => {
  const https = { host: 'gitlab.com', https: true, ssh: false };
  const ssh = { host: 'gitlab.com', https: false, ssh: true };
  const gitlabCom = { provider: 'gitlab', instance: 'https://gitlab.com', accountId: 'a' } as const;
  const privateGitlab = { provider: 'gitlab', instance: 'https://private.gitlab.example', accountId: 'b' } as const;

  test('an identity is specific to its instance', () => {
    expect(identityApplicability(identity({ account: gitlabCom, transport: 'account' }), https)).toEqual({ applicable: true });
    expect(identityApplicability(identity({ account: privateGitlab, transport: 'account' }), https))
      .toEqual({ applicable: false, reason: 'host', host: 'private.gitlab.example' });
    // The instance rule holds whatever the transport: an SSH identity that
    // answers to another instance's account is still the wrong identity here.
    expect(identityApplicability(identity({ account: privateGitlab, transport: 'ssh', sshCredentialId: 'k' }), ssh))
      .toEqual({ applicable: false, reason: 'host', host: 'private.gitlab.example' });
  });

  test('a transport has to reach the address', () => {
    expect(identityApplicability(identity({ account: gitlabCom, transport: 'account' }), ssh))
      .toEqual({ applicable: false, reason: 'scheme', scheme: 'https' });
    expect(identityApplicability(identity({ transport: 'anonymous' }), ssh))
      .toEqual({ applicable: false, reason: 'scheme', scheme: 'https' });
    expect(identityApplicability(identity({ transport: 'ssh', sshCredentialId: 'k' }), https))
      .toEqual({ applicable: false, reason: 'scheme', scheme: 'ssh' });
    expect(identityApplicability(identity({ transport: 'ssh', sshCredentialId: 'k' }), ssh)).toEqual({ applicable: true });
  });

  test('System Git reaches whatever the machine reaches, on any instance', () => {
    expect(identityApplicability(identity({ transport: 'system' }), https)).toEqual({ applicable: true });
    expect(identityApplicability(identity({ transport: 'system' }), ssh)).toEqual({ applicable: true });
    expect(identityApplicability(identity(), { host: 'anything.example', https: false, ssh: false })).toEqual({ applicable: true });
  });

  test('says why, in the words the picker shows', () => {
    const t = (key: string, params?: Record<string, string>) => `${key}:${JSON.stringify(params ?? {})}`;
    expect(describeIdentityApplicability({ applicable: false, reason: 'host', host: 'private.gitlab.example' }, t))
      .toBe('gitView.identity.unavailableHost:{"host":"private.gitlab.example"}');
    expect(describeIdentityApplicability({ applicable: false, reason: 'scheme', scheme: 'ssh' }, t))
      .toBe('gitView.identity.unavailableScheme:{"scheme":"SSH"}');
    expect(describeIdentityApplicability({ applicable: true }, t)).toBe('');
  });
});

describe('needsSystemAcknowledgement', () => {
  const system = identity({ id: 'global', transport: 'system' });

  test('asks before the identity that uses whatever the machine holds', () => {
    expect(needsSystemAcknowledgement(system, true)).toBe(true);
    // A stored identity that names no account is a signature, not a claim on
    // the machine's credentials, so it asks nothing.
    expect(needsSystemAcknowledgement(identity(), true)).toBe(false);
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

  test('asks for an OpenCode restart when a remote first gets an HTTPS credential grant', async () => {
    const pending = () => usePendingOpenCodeRestartStore.getState().changes.map((change) => change.id);
    usePendingOpenCodeRestartStore.getState().clear();
    await applyIdentityToRepository(
      { directory: '/repo', remoteName: 'origin', identity: identity({ account, transport: 'account' }) },
      harness().apis,
    );
    expect(pending().some((id) => id.startsWith('cli:agent-git:/repo:'))).toBe(true);

    // A key travels over SSH and never through the credential helper.
    usePendingOpenCodeRestartStore.getState().clear();
    await applyIdentityToRepository(
      { directory: '/repo', remoteName: 'origin', identity: identity({ transport: 'ssh', sshCredentialId: 'ocgit:v1:ssh:key' }) },
      harness().apis,
    );
    expect(pending()).toEqual([]);

    // A remote the agent already answers for needs no second restart.
    const answered = read();
    answered.binding!.remotes = [{ ...remote, mode: 'managed', credentialId: 'grant', readiness: 'ready' }];
    usePendingOpenCodeRestartStore.getState().clear();
    await applyIdentityToRepository(
      { directory: '/repo', remoteName: 'origin', identity: identity({ account, transport: 'account' }) },
      harness(answered).apis,
    );
    expect(pending()).toEqual([]);
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
      { directory: '/repo', remoteName: 'origin', identity: identity({ id: 'global', transport: 'system' }) },
      unacknowledged.apis,
    )).toEqual({ status: 'acknowledgement-required' });
    expect(unacknowledged.transportCalls).toEqual([]);
    // The signature is still written: it is about who commits, not about trust.
    expect(unacknowledged.authorCalls).toEqual(['/repo:global']);

    const acknowledged = harness();
    expect(await applyIdentityToRepository({
      directory: '/repo', remoteName: 'origin', identity: identity({ id: 'global', transport: 'system' }), acknowledgedSystem: true,
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

  test('applies the system identity as the absence of an override', async () => {
    const bound = {
      ...account, primaryRemote: 'origin', readiness: 'ready' as const, endpoint: endpoint('fetch-one'),
    };
    const { apis, providerCalls, authorCalls } = harness(read([bound]));
    await applyIdentityToRepository({
      directory: '/repo', remoteName: 'origin', identity: identity({ id: 'global', transport: 'system' }),
      acknowledgedSystem: true,
    }, apis);
    // The account it used to answer to belonged to the identity it replaced.
    expect(providerCalls[0]).toEqual({
      directory: '/repo', expectedRepositoryId: 'repo_one', expectedRevision: 2, operation: 'remove',
      target: {
        provider: bound.provider, instance: bound.instance, accountId: bound.accountId, primaryRemote: bound.primaryRemote,
      },
    });
    // The server reads `global` as "remove this repository's own author".
    expect(authorCalls).toEqual(['/repo:global']);
  });

  test('leaves no account bound for an identity that names none', async () => {
    const bound = {
      ...account, primaryRemote: 'origin', readiness: 'ready' as const, endpoint: endpoint('fetch-one'),
    };
    const { apis, providerCalls } = harness(read([bound]));
    await applyIdentityToRepository(
      { directory: '/repo', remoteName: 'origin', identity: identity({ transport: 'anonymous' }) },
      apis,
    );
    expect(providerCalls).toHaveLength(1);
    expect(providerCalls[0].operation).toBe('remove');
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

  test('writes the signature alone when the runtime cannot bind transports', async () => {
    const { apis, authorCalls, providerCalls } = harness();
    expect(await applyIdentityToRepository(
      { directory: '/repo', remoteName: 'origin', identity: identity({ account, transport: 'account' }) },
      { ...apis, git: { setGitIdentity: apis.git.setGitIdentity } },
    )).toEqual({ status: 'applied' });
    expect(authorCalls).toEqual(['/repo:work']);
    expect(providerCalls).toEqual([]);
  });

  test('writes the signature alone for a repository with no remote', async () => {
    const { apis, authorCalls, providerCalls, transportCalls } = harness();
    expect(await applyIdentityToRepository(
      { directory: '/repo', remoteName: null, identity: identity({ account, transport: 'account' }) },
      apis,
    )).toEqual({ status: 'applied' });
    expect(authorCalls).toEqual(['/repo:work']);
    expect(providerCalls).toEqual([]);
    expect(transportCalls).toEqual([]);
  });
});

describe('signature-only identities from an earlier release', () => {
  const legacy = identity({ id: 'profile-1', name: 'Work' });

  test('writes the author and leaves the repository account and transport alone', async () => {
    const bound = {
      provider: 'github' as const, instance: 'github.com', accountId: 'occred:v1:github:one:r1',
      primaryRemote: 'origin', readiness: 'ready' as const, endpoint: endpoint('fetch-one'),
    };
    const { apis, providerCalls, transportCalls, authorCalls } = harness(read([bound]));

    expect(await applyIdentityToRepository({ directory: '/repo', remoteName: 'origin', identity: legacy }, apis))
      .toEqual({ status: 'applied' });
    expect(authorCalls).toEqual(['/repo:profile-1']);
    // In the release that made these, choosing one wrote the author and nothing
    // else. Removing the repository's account here would be a new behaviour.
    expect(providerCalls).toEqual([]);
    expect(transportCalls).toEqual([]);
  });

  test('is not the System identity, so it asks for no acknowledgement', () => {
    expect(isSignatureOnlyIdentity(legacy)).toBe(true);
    expect(needsSystemAcknowledgement(legacy, true)).toBe(false);
    // The System identity still asks: it does claim the machine's credentials.
    expect(isSignatureOnlyIdentity(identity({ id: 'global', transport: 'system' }))).toBe(false);
    expect(needsSystemAcknowledgement(identity({ id: 'global', transport: 'system' }), true)).toBe(true);
    // An identity that names an account is complete, not a signature.
    expect(isSignatureOnlyIdentity(identity({ account, transport: 'account' }))).toBe(false);
  });
});
