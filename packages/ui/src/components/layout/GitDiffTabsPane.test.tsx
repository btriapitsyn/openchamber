/**
 * Tests for GitDiffTabsPane.
 *
 * Mutation checks (each names the production change that would fail it):
 * - no tabs → null: fails if the empty check is removed or inverted
 * - label/title builders: fails if basenames, tooltips, or disambiguation break
 * - store integration: covered by useGitDiffTabsStore.test.ts (open/close/active)
 *
 * renderToStaticMarkup always reads the store's initial state (SSR
 * getServerSnapshot), so store-seeded rendering is not testable here.
 * The label/title logic is tested as pure functions.
 */

import { describe, expect, test } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nProvider } from '@/lib/i18n';
import { GitDiffTabsPane } from './GitDiffTabsPane';
import { getGitDiffTabLabel, getGitDiffTabTitle } from './gitDiffTabLabels';
import type { GitDiffTab } from '@/stores/useGitDiffTabsStore';
import type { GitCommitDiffTarget } from '@/stores/useUIStore';

const commitTarget = (commitHash: string, path: string): GitCommitDiffTarget => ({
  commitHash,
  parentHash: null,
  file: {
    path,
    originalPath: undefined,
    status: 'M',
    kind: 'file',
    objectId: '1'.repeat(40),
    originalObjectId: '2'.repeat(40),
    insertions: 10,
    deletions: 5,
    isBinary: false,
  },
});

const workingTab = (path: string): GitDiffTab => ({
  kind: 'working',
  path,
  scope: 'working',
  id: `working:${path}`,
  touchedAt: 1000,
});

const commitTab = (commitHash: string, path: string): GitDiffTab => ({
  kind: 'commit',
  target: commitTarget(commitHash, path),
  id: `commit:${commitHash}:${path}`,
  touchedAt: 1000,
});

describe('GitDiffTabsPane', () => {
  test('renders null when no tabs exist (store initial state)', () => {
    const markup = renderToStaticMarkup(
      React.createElement(
        I18nProvider,
        null,
        React.createElement(GitDiffTabsPane, { directory: '/repo' }),
      ),
    );
    expect(markup).toBe('');
  });
});

describe('getGitDiffTabLabel', () => {
  test('returns basename for a working tab', () => {
    const tab = workingTab('src/app.tsx');
    expect(getGitDiffTabLabel([tab], tab)).toBe('app.tsx');
  });

  test('returns basename for a commit tab', () => {
    const tab = commitTab('abc123', 'src/history.ts');
    expect(getGitDiffTabLabel([tab], tab)).toBe('history.ts');
  });

  test('disambiguates duplicate basenames with parent segment', () => {
    const tab1 = workingTab('src/components/Button.tsx');
    const tab2 = workingTab('lib/components/Button.tsx');
    const tabs = [tab1, tab2];

    expect(getGitDiffTabLabel(tabs, tab1)).toBe('components/Button.tsx');
    expect(getGitDiffTabLabel(tabs, tab2)).toBe('components/Button.tsx');
  });

  test('does not disambiguate when basenames are unique', () => {
    const tab1 = workingTab('src/app.tsx');
    const tab2 = workingTab('src/other.tsx');
    const tabs = [tab1, tab2];

    expect(getGitDiffTabLabel(tabs, tab1)).toBe('app.tsx');
    expect(getGitDiffTabLabel(tabs, tab2)).toBe('other.tsx');
  });

  test('handles paths with no directory segment', () => {
    const tab = workingTab('README.md');
    expect(getGitDiffTabLabel([tab], tab)).toBe('README.md');
  });

  test('handles trailing slashes', () => {
    const tab = workingTab('src/utils/');
    expect(getGitDiffTabLabel([tab], tab)).toBe('utils');
  });
});

describe('getGitDiffTabTitle', () => {
  test('returns full path for a working tab', () => {
    const tab = workingTab('src/components/App.tsx');
    expect(getGitDiffTabTitle(tab)).toBe('src/components/App.tsx');
  });

  test('returns path @ shortHash for a commit tab', () => {
    const tab = commitTab('abc1234def5678', 'src/history.ts');
    expect(getGitDiffTabTitle(tab)).toBe('src/history.ts @ abc1234');
  });
});
