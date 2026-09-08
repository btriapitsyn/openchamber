const isString = (value) => Object.prototype.toString.call(value) === '[object String]';
const text = (value) => (isString(value) ? value.trim() : '');

const sameAccount = (left, right) => Boolean(left) && Boolean(right)
  && left.provider === right.provider
  && left.instance === right.instance
  && left.accountId === right.accountId;

/**
 * The signature an identity for this account starts with.
 *
 * A provider that publishes an address gives it. GitHub often does not, and
 * answers that with its own no-reply address, which is the address its own web
 * interface commits as — so an identity is complete on the spot rather than
 * asking for something the person has to go and look up.
 */
const accountSignature = (account, user) => {
  const login = text(user?.login) || text(user?.username);
  const userName = text(user?.name) || login;
  const email = text(user?.email);
  if (email) return { userName, userEmail: email };
  if (account.provider === 'github' && login && Number.isInteger(user?.id)) {
    return { userName, userEmail: `${user.id}+${login}@users.noreply.github.com` };
  }
  return { userName, userEmail: '' };
};

const uniqueName = (profiles, candidate) => {
  const taken = new Set(profiles.map((profile) => text(profile.name).toLowerCase()));
  if (!taken.has(candidate.toLowerCase())) return candidate;
  for (let suffix = 2; suffix < 100; suffix += 1) {
    const next = `${candidate} ${suffix}`;
    if (!taken.has(next.toLowerCase())) return next;
  }
  return `${candidate} ${Date.now()}`;
};

/**
 * Identities that follow the accounts people connect.
 *
 * Connecting an account is the moment every part of an identity is known — who
 * it is, what it may authenticate with, and how it signs — so the identity is
 * made there rather than asked for again later. Re-authenticating renews the
 * credential an identity names, and the identity follows it, because "my GitHub
 * account" is expected to keep working after signing in again.
 */
export function createGitIdentityProvisioning({ store, now = Date.now, randomId = () => Math.random().toString(36).slice(2, 9) }) {
  if (!store || !(store.getProfiles instanceof Function) || !(store.createProfile instanceof Function)
    || !(store.updateProfile instanceof Function)) {
    throw new TypeError('Git identity provisioning dependencies are invalid');
  }

  const provisioned = Object.freeze({
    /** Creates the identity for a newly connected account, if it has none. */
    ensureAccountIdentity: ({ account, user }) => {
      if (!account?.provider || !text(account.instance) || !text(account.accountId)) return null;
      const profiles = store.getProfiles();
      const existing = profiles.find((profile) => sameAccount(profile.account, account));
      if (existing) return existing;
      const signature = accountSignature(account, user);
      // A signature is required, and an account that publishes neither a name
      // nor an address cannot supply one. The person makes that identity.
      if (!signature.userName || !signature.userEmail) return null;
      const login = text(user?.login) || text(user?.username) || signature.userName;
      return store.createProfile({
        id: `identity-${now()}-${randomId()}`,
        name: uniqueName(profiles, login),
        userName: signature.userName,
        userEmail: signature.userEmail,
        account,
        transport: 'account',
        color: 'keyword',
        icon: account.provider === 'github' ? 'github' : 'gitlab',
      });
    },

    /**
     * Identities for accounts connected before identities carried one.
     *
     * Runs once at startup rather than on demand, because the add and clone
     * screens propose identities and an account with none would look like an
     * account OpenChamber does not know about.
     */
    backfillAccountIdentities: (accounts) => {
      const created = [];
      for (const entry of accounts ?? []) {
        try {
          const identity = provisioned.ensureAccountIdentity(entry);
          if (identity) created.push(identity);
        } catch {
          // One account that cannot describe itself must not stop the rest.
        }
      }
      return created;
    },

    /** Follows a renewed credential, so identities keep naming a live account. */
    repointAccountIdentities: ({ from, to }) => {
      if (!sameAccount({ ...from, accountId: 'x' }, { ...to, accountId: 'x' }) || from.accountId === to.accountId) return [];
      return store.getProfiles()
        .filter((profile) => sameAccount(profile.account, from))
        .map((profile) => store.updateProfile(profile.id, { ...profile, account: to }));
    },
  });
  return provisioned;
}
