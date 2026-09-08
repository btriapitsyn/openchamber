import type { GitRemote, PageResult, SourceControlAuthAccount, SourceControlBindingRead, SourceControlIdentity, SourceControlProvider, SourceControlReadContext } from '@/lib/api/types';

export const GITHUB_SOURCE_CONTROL_IDENTITY: SourceControlIdentity = { provider: 'github', instance: 'github.com' };
const GITLAB_SOURCE_CONTROL_IDENTITY: SourceControlIdentity = { provider: 'gitlab', instance: 'https://gitlab.com' };

const getRemoteAuthority = (remote: GitRemote | null | undefined): string | null => {
  const value = remote?.pushUrl?.trim() || remote?.fetchUrl?.trim();
  if (!value) return null;
  try {
    return new URL(value).host.toLowerCase();
  } catch {
    const scpHost = value.match(/^(?:[^@/]+@)?([^:/]+):/u)?.[1];
    return scpHost?.toLowerCase() ?? null;
  }
};

const getIdentityAuthority = (identity: SourceControlIdentity): string => {
  try {
    return new URL(identity.instance.includes('://') ? identity.instance : `https://${identity.instance}`).host.toLowerCase();
  } catch {
    return identity.instance.toLowerCase();
  }
};

export type SourceControlTarget = {
  identity: SourceControlIdentity;
  remote: GitRemote;
};

export const getBoundSourceControlReadContexts = (
  result: SourceControlBindingRead,
  directory: string,
): SourceControlReadContext[] => {
  if (result.status === 'missing') return [];

  return result.binding.providers.filter((provider) => provider.readiness === 'ready'
    && provider.endpoint?.fingerprint === result.repository.remotes.find((remote) => remote.name === provider.primaryRemote)?.fetch.fingerprint
  ).map((provider) => ({
    directory,
    repositoryId: result.repository.repositoryId,
    provider: provider.provider,
    instance: provider.instance,
    accountId: provider.accountId,
    bindingRevision: result.revision,
    primaryRemote: provider.primaryRemote,
  }));
};

export const sourceControlReadContextParts = (context: SourceControlReadContext) => [
  context.provider,
  context.instance,
  context.accountId,
  context.repositoryId,
  context.bindingRevision,
  context.directory,
  context.primaryRemote,
] as const;

export const hasSameSourceControlReadContext = (
  left: SourceControlReadContext,
  right: SourceControlReadContext,
): boolean => left.provider === right.provider
  && left.instance === right.instance
  && left.accountId === right.accountId
  && left.repositoryId === right.repositoryId
  && left.bindingRevision === right.bindingRevision
  && left.directory === right.directory
  && left.primaryRemote === right.primaryRemote;

export const appendMissingSourceControlItems = <T extends { number: number; project: { id: string } }>(
  items: T[],
  candidates: T[],
): T[] => {
  const itemKeys = new Set(items.map((item) => `${item.project.id}#${item.number}`));
  return [...items, ...candidates.filter((item) => !itemKeys.has(`${item.project.id}#${item.number}`))];
};

export const mergeIncompleteSourceControlPage = <T extends { number: number; project: { id: string } }>(
  previous: T[],
  next: PageResult<T>,
): T[] => {
  if (!next.incompleteProjectIds?.length) return next.items;
  const incompleteProjects = new Set(next.incompleteProjectIds);
  return appendMissingSourceControlItems(
    next.items,
    previous.filter((item) => incompleteProjects.has(item.project.id)),
  );
};

export const resolveSourceControlTarget = (
  remotes: GitRemote[],
  identities: SourceControlIdentity[],
): SourceControlTarget | null => {
  const knownIdentities = [GITHUB_SOURCE_CONTROL_IDENTITY, GITLAB_SOURCE_CONTROL_IDENTITY, ...identities];
  const targets: SourceControlTarget[] = [];
  for (const remote of remotes) {
    const authority = getRemoteAuthority(remote);
    if (!authority) continue;
    const identity = knownIdentities.find((candidate) => getIdentityAuthority(candidate) === authority);
    if (identity) targets.push({ identity, remote });
  }
  return targets.length === 1 ? targets[0] : null;
};

export const resolveSourceControlIdentity = (
  remote: GitRemote | null | undefined,
  identities: SourceControlIdentity[],
): SourceControlIdentity | null => remote
  ? resolveSourceControlTarget([remote], identities)?.identity ?? null
  : null;

export const getSourceControlBaseUrl = (identity: SourceControlIdentity): string => (
  identity.instance.includes('://') ? identity.instance : `https://${identity.instance}`
);

export const getSourceControlProviderLabel = (provider: SourceControlProvider): 'GitHub' | 'GitLab' =>
  provider === 'github' ? 'GitHub' : 'GitLab';

/** GitLab addresses merge requests as `!N`; GitHub addresses pull requests as `#N`. */
export const getChangeRequestReferencePrefix = (provider: SourceControlProvider): '#' | '!' =>
  provider === 'gitlab' ? '!' : '#';

export const formatChangeRequestReference = (provider: SourceControlProvider | null | undefined, number: number): string =>
  `${provider ? getChangeRequestReferencePrefix(provider) : '#'}${number}`;

/** One label shape for every account picker: provider @user · instance · source · exact account id. */
const formatSourceControlAccountLabel = (
  identity: SourceControlIdentity,
  account: { id: string; user: { username: string } },
  sourceLabel: string,
): string => `${getSourceControlProviderLabel(identity.provider)} @${account.user.username} · ${identity.instance} · ${sourceLabel} · ${account.id}`;

type ManagedCredentialSourceLabelKey =
  | 'settings.github.page.accountSource.oauth'
  | 'settings.github.page.accountSource.cli'
  | 'settings.gitlab.token.label';

export const getManagedCredentialSourceLabelKey = (source: 'oauth' | 'pat' | 'cli'): ManagedCredentialSourceLabelKey => (
  source === 'oauth' ? 'settings.github.page.accountSource.oauth'
    : source === 'cli' ? 'settings.github.page.accountSource.cli'
      : 'settings.gitlab.token.label'
);

/** Origin of a provider instance, or null when the instance is not a valid host or URL. */
export const getSourceControlIdentityOrigin = (identity: SourceControlIdentity): string | null => {
  try {
    return new URL(identity.instance.includes('://') ? identity.instance : `https://${identity.instance}`).origin;
  } catch {
    return null;
  }
};

/**
 * The host a git remote points at, for `https://host/owner/repo.git` and for
 * the scp-like `git@host:owner/repo.git` alike. A provider association is
 * about which host answers for the repository, not how the bytes travel, so
 * it must recognise an SSH remote too.
 */
export const gitRemoteHost = (remoteUrl: string): string | null => {
  const value = remoteUrl.trim();
  if (!value) return null;
  const scpLike = /^[^/@]+@([^/:]+):/.exec(value);
  if (scpLike) return scpLike[1].toLowerCase();
  try {
    return new URL(value).hostname.toLowerCase() || null;
  } catch {
    return null;
  }
};

/**
 * Whether a remote URL travels over SSH: an explicit `ssh://`, or the scp-like
 * `git@host:owner/repo.git`. The scp-like form has no scheme, which is what
 * separates it from `https://host/owner/repo.git` — that also reads as
 * `<word>:<rest>` and would otherwise pass for an SSH remote.
 */
export const isSshRemoteUrl = (remoteUrl: string): boolean => {
  const value = remoteUrl.trim();
  if (value.startsWith('ssh://')) return true;
  return !value.includes('://') && /^(?:[^@/:\s]+@)?[^/:\s]+:[^\s]+$/.test(value);
};

/** True only when every endpoint parses and shares the given origin. */
/**
 * The identity to offer for a repository on this host.
 *
 * An identity that already names an account on the host is the answer the
 * person has effectively given: it says both whose repository this is and how
 * to reach it. Failing that, the one marked default, and failing that nothing —
 * proposing an unrelated identity would be a guess wearing a name.
 */
export const proposeIdentityForHost = <T extends { id: string; account?: { instance: string } | null }>(
  identities: T[],
  host: string | null,
  defaultIdentityId?: string | null,
): T | null => {
  const matching = host
    ? identities.find((identity) => {
      const instance = identity.account?.instance ?? '';
      // An instance is either a bare host or a URL, the way accounts store it.
      return instance.length > 0
        && gitRemoteHost(instance.includes('://') ? instance : `https://${instance}`) === host;
    })
    : undefined;
  if (matching) return matching;
  const preferred = defaultIdentityId?.trim();
  return (preferred && identities.find((identity) => identity.id === preferred)) || null;
};

export const endpointsShareOrigin = (endpoints: string[], origin: string): boolean => endpoints.every((endpoint) => {
  try {
    return new URL(endpoint).origin === origin;
  } catch {
    return false;
  }
});

type ManagedAccountOption = {
  key: string;
  reference: SourceControlIdentity & { accountId: string };
  label: string;
};

/** Selectable managed HTTPS credential accounts: valid, non-CLI accounts of one connected identity. */
export const buildManagedAccountOptions = (
  identity: SourceControlIdentity,
  accounts: SourceControlAuthAccount[],
  sourceLabel: (account: SourceControlAuthAccount) => string,
): ManagedAccountOption[] => accounts
  .filter((account) => account.status === 'valid' && account.source !== 'cli')
  .map((account) => ({
    key: JSON.stringify([identity.provider, identity.instance, account.id]),
    reference: { ...identity, accountId: account.id },
    label: formatSourceControlAccountLabel(identity, account, sourceLabel(account)),
  }));
