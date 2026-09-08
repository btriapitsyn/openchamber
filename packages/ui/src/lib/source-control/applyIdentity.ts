import type {
  GitAPI,
  GitIdentityProfile,
  GitTransportBindingIntent,
  SourceControlAPI,
  SourceControlBindingRead,
} from '@/lib/api/types';
import { identityTransport } from '@/lib/api/git-identity';
import { repositoryBindingOwner } from './repository-binding';

type ApplyIdentityOutcome =
  | { status: 'applied' }
  | { status: 'unsupported' }
  | { status: 'acknowledgement-required' }
  | { status: 'failed'; reason: 'binding' | 'author' };

type ApplyIdentityInput = {
  directory: string;
  identity: GitIdentityProfile;
  /** The remote the identity answers for; the repository's own anchor. */
  remoteName: string;
  /** Passing System Git on means the person confirmed the unverified transport. */
  acknowledgedSystem?: boolean;
};

type ApplyIdentityAPIs = {
  git: Pick<GitAPI, 'configureTransportBinding' | 'setGitIdentity'>;
  sourceControl: Pick<SourceControlAPI, 'repositoryBinding' | 'repositoryProviderBindingMutate'>;
};

/**
 * The binding an identity asks for, or null when it names nothing to bind.
 *
 * System Git is a decision about trusting whatever the machine holds, so it is
 * only written once someone has said so.
 */
const transportIntent = (
  identity: GitIdentityProfile,
  read: SourceControlBindingRead,
  remoteName: string,
  acknowledgedSystem: boolean,
  directory: string,
): GitTransportBindingIntent | null => {
  const remote = read.repository.remotes.find((entry) => entry.name === remoteName);
  if (!remote) return null;
  const authority = {
    directory,
    expectedRepositoryId: read.repository.repositoryId,
    expectedRevision: read.revision,
    expectedConfigRevision: read.repository.configRevision,
    expectedFetchFingerprint: remote.fetch.fingerprint,
    expectedPushFingerprint: remote.push.fingerprint,
    remote: remoteName,
  };
  const transport = identityTransport(identity);
  if (transport === 'account' && identity.account) {
    return { ...authority, transport: 'https', credentialAccount: identity.account };
  }
  if (transport === 'ssh' && identity.sshCredentialId) {
    return { ...authority, transport: 'ssh', sshCredentialId: identity.sshCredentialId };
  }
  if (transport === 'anonymous') return { ...authority, transport: 'anonymous' };
  if (transport === 'system' && acknowledgedSystem) {
    return { ...authority, transport: 'system', unverifiedConfirmed: true };
  }
  return null;
};

/**
 * Whether applying this identity has to be confirmed first.
 *
 * A System Git identity says "use whatever this machine holds", and
 * OpenChamber cannot tell whose credentials those are. Asking beforehand keeps
 * a cancelled choice from leaving a signature written and a transport refused.
 * A repository with no remote binds nothing, so there is nothing to confirm.
 */
export const needsSystemAcknowledgement = (
  identity: Pick<GitIdentityProfile, 'transport'>,
  hasBindableRemote: boolean,
): boolean => hasBindableRemote && identityTransport(identity) === 'system';

/**
 * Writes one identity onto a repository.
 *
 * The three answers a repository needs — whose issues these are, how transfers
 * authenticate, and who commits — are what an identity is, so applying it
 * writes all three rather than asking for them one control at a time.
 *
 * A part that cannot be written leaves the others written: half a binding is
 * more useful than none, and the strip and the panel show what is still
 * missing.
 */
export const applyIdentityToRepository = async (
  { directory, identity, remoteName, acknowledgedSystem = false }: ApplyIdentityInput,
  { git, sourceControl }: ApplyIdentityAPIs,
): Promise<ApplyIdentityOutcome> => {
  if (!git.configureTransportBinding) return { status: 'unsupported' };
  const scope = repositoryBindingOwner.scope(directory);
  let read: SourceControlBindingRead;
  try {
    read = await sourceControl.repositoryBinding(directory);
  } catch {
    return { status: 'failed', reason: 'binding' };
  }
  const mutation = repositoryBindingOwner.captureMutation(scope, read);
  let outcome: ApplyIdentityOutcome = { status: 'applied' };
  try {
    if (identity.account) {
      const bound = read.binding?.providers[0];
      const provider = { ...identity.account, primaryRemote: remoteName };
      const context = {
        directory,
        expectedRepositoryId: read.repository.repositoryId,
        expectedRevision: read.revision,
      };
      read = await sourceControl.repositoryProviderBindingMutate(bound
        ? {
          ...context,
          operation: 'replace',
          target: {
            provider: bound.provider,
            instance: bound.instance,
            accountId: bound.accountId,
            primaryRemote: bound.primaryRemote,
          },
          provider,
        }
        : { ...context, operation: 'add', provider });
    }
    const intent = transportIntent(identity, read, remoteName, acknowledgedSystem, directory);
    if (intent) {
      const result = await git.configureTransportBinding(intent);
      if (result.status === 'configured') read = result.binding;
    } else if (identityTransport(identity) === 'system') {
      outcome = { status: 'acknowledgement-required' };
    }
    repositoryBindingOwner.setMutationResult(mutation, read);
  } catch {
    outcome = { status: 'failed', reason: 'binding' };
    await repositoryBindingOwner.reconcile(mutation, sourceControl);
  } finally {
    mutation.release();
  }

  // The signature is written to the repository itself, so it is applied even
  // when the transfer side could not be.
  try {
    if (identity.id && identity.id !== 'global') await git.setGitIdentity(directory, identity.id);
  } catch {
    if (outcome.status === 'applied') outcome = { status: 'failed', reason: 'author' };
  }
  return outcome;
};
