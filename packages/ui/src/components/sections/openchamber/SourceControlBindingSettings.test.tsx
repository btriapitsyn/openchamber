import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import type { SourceControlBindingRead, SourceControlRepositoryBindingResetIntent } from '@/lib/api/types';

const identity = { provider: 'github', instance: 'github.com' } as const;
const remote = { name: 'origin', fetch: { displayUrl: 'https://github.com/team/repo', fingerprint: 'fetch' }, push: { displayUrl: 'https://github.com/team/repo', fingerprint: 'push' } };
const repository = { repositoryId: 'repository', configRevision: 'config', bare: false, remotes: [remote] };
const read: SourceControlBindingRead = { status: 'bound', repository, revision: 4, binding: {
  repositoryId: 'repository', configRevision: 'config', revision: 4, state: 'bound', auxiliary: [],
  providers: [{ ...identity, accountId: 'oauth-one', primaryRemote: 'origin', endpoint: remote.fetch, readiness: 'ready' }],
  remotes: [{ ...remote, mode: 'managed', credentialId: 'actual-transport-grant', readiness: 'ready', presentation: {
    status: 'available', transport: 'https', provider: 'github', instance: 'github.com', source: 'oauth',
    username: 'same-user', providerUserId: 'github.com#42',
  } }],
} };

const source = ts.createSourceFile('SourceControlBindingSettings.tsx', readFileSync(new URL('./SourceControlBindingSettings.tsx', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const findReset = (node: ts.Node): ts.ArrowFunction | undefined => {
  if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'resetBinding' && node.initializer && ts.isArrowFunction(node.initializer)) return node.initializer;
  return ts.forEachChild(node, findReset);
};
const reset = findReset(source);
if (!reset) throw new Error('Repository binding reset callback missing');
const resetCallback = ts.transpileModule(`(${reset.getText(source)})()`, { compilerOptions: { target: ts.ScriptTarget.ESNext } }).outputText;

test('full reset sends one confirmed exact-authority intent and publishes only its committed result', async () => {
  const calls: unknown[] = [];
  const result = { ...read, status: 'missing' as const, revision: 5, binding: null };
  const mutationScope = { release: () => calls.push('release') };
  await runInNewContext(resetCallback, {
    resetting: false, binding: { status: 'ready', isCurrent: () => true, scope: 'scope' }, read,
    resetRequestRef: { current: 1 }, getRuntimeKey: () => 'runtime', directory: '/repo',
    repositoryBindingOwner: {
      captureMutation: () => mutationScope,
      setMutationResult: (scope: typeof mutationScope, value: typeof result) => { calls.push(['publish', scope, value]); return true; },
      reconcile: () => { throw new Error('Successful reset must not reconcile'); },
    },
    sourceControl: { resetRepositoryBinding: async (intent: SourceControlRepositoryBindingResetIntent) => { calls.push(intent); return result; } },
    setResetting: (value: boolean) => calls.push(['resetting', value]), setResetError: () => {},
    setResetOpen: (value: boolean) => calls.push(['open', value]),
  });
  expect(calls[1]).toEqual({ directory: '/repo', expectedRepositoryId: 'repository', expectedRevision: 4,
    expectedConfigRevision: 'config', confirmed: true,
  });
  expect(calls.find((entry) => Array.isArray(entry) && entry[0] === 'publish')).toEqual(['publish', mutationScope, result]);
  expect(calls.filter((entry) => Array.isArray(entry) && entry[0] === 'open')).toEqual([['open', false]]);
});

test('failed full reset reconciles once without retrying the mutation', async () => {
  let mutations = 0;
  let reconciliations = 0;
  let errors = 0;
  await runInNewContext(resetCallback, {
    resetting: false, binding: { status: 'ready', isCurrent: () => true, scope: 'scope' }, read,
    resetRequestRef: { current: 1 }, getRuntimeKey: () => 'runtime', directory: '/repo',
    repositoryBindingOwner: {
      captureMutation: () => ({ release: () => {} }), setMutationResult: () => true,
      reconcile: async () => { reconciliations += 1; },
    },
    sourceControl: { resetRepositoryBinding: async () => { mutations += 1; throw new Error('stale'); } },
    setResetting: () => {}, setResetError: (value: boolean) => { if (value) errors += 1; }, setResetOpen: () => {},
  });
  expect(mutations).toBe(1);
  expect(reconciliations).toBe(1);
  expect(errors).toBe(1);
});

test('every locale supplies repository context copy', async () => {
  const keys = ['configure', 'draft', 'needsAttention', 'settings', 'author', 'notConfigured'];
  for (const locale of ['en', 'de', 'es', 'fr', 'ja', 'ko', 'pl', 'pt-BR', 'uk', 'zh-CN', 'zh-TW']) {
    const { dict } = await import(`../../../lib/i18n/messages/${locale}.ts`);
    for (const key of keys) expect(dict[`gitView.context.${key}`]).toBeTruthy();
  }
});

test('every locale supplies explicit transport removal and full reset copy', async () => {
  const keys = [
    'settings.sourceControl.transport.remove', 'settings.sourceControl.reset.title',
    'settings.sourceControl.reset.description', 'settings.sourceControl.reset.action',
    'settings.sourceControl.reset.confirmTitle', 'settings.sourceControl.reset.confirmDescription',
    'settings.sourceControl.reset.failed', 'settings.sourceControl.reset.confirmAction',
  ] as const;
  const { dict: english } = await import('../../../lib/i18n/messages/en.ts');
  for (const locale of ['en', 'de', 'es', 'fr', 'ja', 'ko', 'pl', 'pt-BR', 'uk', 'zh-CN', 'zh-TW']) {
    const { dict } = await import(`../../../lib/i18n/messages/${locale}.ts`);
    for (const key of keys) {
      expect(dict[key]).toBeTruthy();
      if (locale !== 'en') expect(dict[key]).not.toBe(english[key]);
    }
  }
});

test('every locale supplies checkout hydration repair copy', async () => {
  const keys = [
    'title', 'description', 'parentRemote', 'retry', 'endpoint', 'chooseEndpoint',
    'systemConfirmation', 'lfsMissing', 'kind.submodule', 'kind.lfs',
    'status.succeeded', 'status.failed', 'status.cancelled', 'status.authorization-required',
    'status.invalid', 'status.client-missing', 'status.not-needed',
  ] as const;
  const { dict: english } = await import('../../../lib/i18n/messages/en.ts');
  for (const locale of ['en', 'de', 'es', 'fr', 'ja', 'ko', 'pl', 'pt-BR', 'uk', 'zh-CN', 'zh-TW']) {
    const { dict } = await import(`../../../lib/i18n/messages/${locale}.ts`);
    for (const key of keys) {
      const messageKey = `gitView.hydration.${key}` as const;
      expect(dict[messageKey]).toBeTruthy();
      if (locale !== 'en' && !['kind.lfs'].includes(key)) expect(dict[messageKey]).not.toBe(english[messageKey]);
    }
  }
});
