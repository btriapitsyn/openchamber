import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import type { SourceControlBindingRead, SourceControlRepositoryBindingResetIntent } from '@/lib/api/types';
import { I18nProvider } from '@/lib/i18n';
import { CredentialLabel } from './RepositoryBindingEditors';

const identity = { provider: 'github', instance: 'github.com' } as const;
const user = { ...identity, id: 'user', username: 'same-user' };
const accounts = [
  { id: 'oauth-one', credentialId: 'oauth-one', credentialRevision: 1, providerUserId: 'github.com#user', providerUserStatus: 'available', user, source: 'oauth', status: 'valid', current: true },
  { id: 'cli-one', credentialId: 'cli-one', credentialRevision: 1, providerUserId: 'github.com#user', providerUserStatus: 'available', user, source: 'cli', status: 'valid', current: false },
] as const;
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

describe('credential labels', () => {
  test('labels exact OAuth and CLI credentials for the same user without grouping them', () => {
    const labels = accounts.map((account) => renderToStaticMarkup(<I18nProvider><CredentialLabel identity={identity} account={account} /></I18nProvider>));
    expect(labels[0]).toContain('OAuth');
    expect(labels[1]).toContain('CLI');
    for (const label of labels) { expect(label).toContain('same-user'); expect(label).toContain('github.com'); }
    expect(labels[0]).not.toBe(labels[1]);
  });
});

const source = ts.createSourceFile('SourceControlBindingSettings.tsx', readFileSync(new URL('./SourceControlBindingSettings.tsx', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const findApply = (node: ts.Node): ts.ArrowFunction | undefined => {
  if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'applyAuthor' && node.initializer && ts.isArrowFunction(node.initializer)) return node.initializer;
  return ts.forEachChild(node, findApply);
};
const apply = findApply(source);
if (!apply) throw new Error('Author application callback missing');
const callback = ts.transpileModule(`(${apply.getText(source)})()`, { compilerOptions: { target: ts.ScriptTarget.ESNext } }).outputText;
const findReset = (node: ts.Node): ts.ArrowFunction | undefined => {
  if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'resetBinding' && node.initializer && ts.isArrowFunction(node.initializer)) return node.initializer;
  return ts.forEachChild(node, findReset);
};
const reset = findReset(source);
if (!reset) throw new Error('Repository binding reset callback missing');
const resetCallback = ts.transpileModule(`(${reset.getText(source)})()`, { compilerOptions: { target: ts.ScriptTarget.ESNext } }).outputText;

test('mobile author application calls only the repository-local author API and store refresh', async () => {
  const calls: string[] = [];
  const profile = { id: 'signed', signCommits: true, signingKey: 'existing-signing-key' };
  const git = { setGitIdentity: async (directory: string, id: string) => { calls.push(`author:${directory}:${id}`); return { success: true, profile }; } };
  await runInNewContext(callback, {
    directory: '/repo', selected: 'signed', profiles: [profile], saving: false, loading: false, generation: { current: 1 }, getRuntimeKey: () => 'runtime', git,
    setSaving: () => {}, setError: () => {}, setSelected: () => {},
    fetchIdentity: async (directory: string, api: typeof git) => { expect(api).toBe(git); calls.push(`refresh:${directory}`); },
  });
  expect(calls).toEqual(['author:/repo:signed', 'refresh:/repo']);
  expect(profile.signingKey).toBe('existing-signing-key');
});

test('late author application after a runtime switch cannot refresh or publish to the new runtime', async () => {
  let runtime = 'old';
  let refreshed = false;
  const states: boolean[] = [];
  await runInNewContext(callback, {
    directory: '/repo', selected: 'author', profiles: [{ id: 'author' }], saving: false, loading: false, generation: { current: 1 }, getRuntimeKey: () => runtime,
    git: { setGitIdentity: async () => { runtime = 'new'; return { success: true }; } },
    setSaving: (value: boolean) => states.push(value), setError: () => {}, setSelected: () => { throw new Error('Stale draft publication'); },
    fetchIdentity: async () => { refreshed = true; },
  });
  expect(refreshed).toBe(false);
  expect(states).toEqual([true]);
});

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
  const keys = ['configure', 'draft', 'transport', 'ready', 'needsAttention', 'removeProvider', 'systemUnverified', 'managedCredentialUnavailable', 'applyAuthor', 'settings', 'stale'];
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
