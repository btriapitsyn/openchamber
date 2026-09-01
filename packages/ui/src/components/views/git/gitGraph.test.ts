/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Adapted from VS Code's SCM history graph tests:
// https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/scm/test/browser/scmHistory.test.ts

import { describe, expect, test } from 'bun:test';
import {
  buildGitHistoryViewModels,
  getHistoryItemColumn,
  getHistoryItemMaxColumns,
  getHistoryItemSecondaryParentColumns,
  historyItemBaseRefColor,
  historyItemRefColor,
  historyItemRemoteRefColor,
  type GitHistoryGraphRef,
  type GitHistoryItem,
  type GitHistoryRef,
} from './gitGraph';

function makeRef(
  id: string,
  name = id,
  revision?: string,
  category: GitHistoryRef['category'] = 'branches',
  kind: GitHistoryRef['kind'] = 'local',
): GitHistoryRef {
  return {
    id,
    name,
    revision: revision ?? null,
    category,
    kind,
  };
}

function makeItem(id: string, parentIds: string[], references?: GitHistoryRef[]): GitHistoryItem {
  return {
    id,
    parentIds,
    subject: '',
    message: '',
    author: '',
    authorEmail: '',
    timestamp: '',
    statistics: { files: 0, insertions: 0, deletions: 0 },
    references: references ?? [],
  };
}

describe('buildGitHistoryViewModels', () => {
  test('returns an empty graph for empty history', () => {
    expect(buildGitHistoryViewModels([], { current: null, upstream: null, base: null }, {
      showIncoming: false,
      showOutgoing: false,
      mergeBase: null,
    })).toEqual([]);
  });

  test('builds a linear history', () => {
    const viewModels = buildGitHistoryViewModels([
      makeItem('a', ['b']),
      makeItem('b', ['c']),
      makeItem('c', ['d']),
      makeItem('d', ['e']),
      makeItem('e', []),
    ], { current: null, upstream: null, base: null }, {
      showIncoming: false,
      showOutgoing: false,
      mergeBase: null,
    });

    expect(viewModels).toHaveLength(5);
    expect(viewModels[0].inputSwimlanes).toHaveLength(0);
    expect(viewModels[0].outputSwimlanes).toEqual([{ id: 'b', color: 'var(--chart-1)' }]);
    expect(viewModels[1].inputSwimlanes).toEqual([{ id: 'b', color: 'var(--chart-1)' }]);
    expect(viewModels[4].outputSwimlanes).toHaveLength(0);
  });

  test('keeps divergence and merge swimlanes stable', () => {
    const viewModels = buildGitHistoryViewModels([
      makeItem('a', ['b', 'c']),
      makeItem('c', ['d']),
      makeItem('b', ['e']),
      makeItem('e', ['f']),
      makeItem('f', ['d']),
      makeItem('d', ['g']),
    ], { current: null, upstream: null, base: null }, {
      showIncoming: false,
      showOutgoing: false,
      mergeBase: null,
    });

    expect(viewModels[0].outputSwimlanes).toEqual([
      { id: 'b', color: 'var(--chart-1)' },
      { id: 'c', color: 'var(--chart-2)' },
    ]);
    expect(viewModels[1].inputSwimlanes).toEqual([
      { id: 'b', color: 'var(--chart-1)' },
      { id: 'c', color: 'var(--chart-2)' },
    ]);
    expect(viewModels[4].outputSwimlanes).toEqual([
      { id: 'd', color: 'var(--chart-1)' },
      { id: 'd', color: 'var(--chart-2)' },
    ]);
  });

  test('handles branches created from merge commits', () => {
    const viewModels = buildGitHistoryViewModels([
      makeItem('a', ['b', 'c']),
      makeItem('c', ['b']),
      makeItem('b', ['d', 'e']),
      makeItem('e', ['f']),
      makeItem('f', ['g']),
      makeItem('d', ['h']),
    ], { current: null, upstream: null, base: null }, {
      showIncoming: false,
      showOutgoing: false,
      mergeBase: null,
    });

    expect(viewModels[2].inputSwimlanes).toEqual([
      { id: 'b', color: 'var(--chart-1)' },
      { id: 'b', color: 'var(--chart-2)' },
    ]);
    expect(viewModels[2].outputSwimlanes).toEqual([
      { id: 'd', color: 'var(--chart-1)' },
      { id: 'e', color: 'var(--chart-3)' },
    ]);
  });

  test('colors ordinary branch refs from the commit lane, leaves tags uncolored, and keeps same-rank ref order stable', () => {
    const topic = makeRef('refs/heads/topic', 'topic', 'a', 'branches', 'local');
    const release = makeRef('refs/remotes/origin/release', 'origin/release', 'a', 'remote-branches', 'remote');
    const tag = makeRef('refs/tags/v1.0.0', 'v1.0.0', 'a', 'tags', 'tag');
    const viewModels = buildGitHistoryViewModels([
      makeItem('a', ['b'], [topic, release, tag]),
      makeItem('b', []),
    ], { current: null, upstream: null, base: null }, {
      showIncoming: false,
      showOutgoing: false,
      mergeBase: null,
    });

    expect(viewModels[0].historyItem.references?.map((ref) => ref.id)).toEqual([
      topic.id,
      release.id,
      tag.id,
    ]);
    expect(viewModels[0].historyItem.references?.map((ref: GitHistoryGraphRef) => ref.color)).toEqual([
      'var(--chart-1)',
      'var(--chart-1)',
      undefined,
    ]);
  });

  test('prioritizes current, upstream, and base ref colors and ordering', () => {
    const current = makeRef('refs/heads/topic', 'topic', 'a', 'branches', 'local');
    const upstream = makeRef('refs/remotes/origin/topic', 'origin/topic', 'c', 'remote-branches', 'remote');
    const base = makeRef('refs/remotes/origin/main', 'origin/main', 'g', 'remote-branches', 'remote');
    const viewModels = buildGitHistoryViewModels([
      makeItem('a', ['b'], [current]),
      makeItem('b', ['c']),
      makeItem('c', ['d'], [upstream]),
      makeItem('d', ['e']),
      makeItem('e', ['f', 'g']),
      makeItem('g', ['h'], [base]),
    ], { current, upstream, base }, {
      showIncoming: false,
      showOutgoing: false,
      mergeBase: null,
    });

    expect(viewModels[0].outputSwimlanes[0].color).toBe(historyItemRefColor);
    expect(viewModels[2].outputSwimlanes[0].color).toBe(historyItemRemoteRefColor);
    expect(viewModels[4].outputSwimlanes[1].color).toBe(historyItemBaseRefColor);
    expect(viewModels[0].historyItem.references?.map((ref) => ref.id)).toEqual([current.id]);
    expect(viewModels[2].historyItem.references?.map((ref) => ref.id)).toEqual([upstream.id]);
  });

  test('adds incoming and outgoing synthetic nodes around the merge base', () => {
    const current = makeRef('refs/heads/main', 'main', 'c', 'branches', 'local');
    const upstream = makeRef('refs/remotes/origin/main', 'origin/main', 'a', 'remote-branches', 'remote');
    const viewModels = buildGitHistoryViewModels([
      makeItem('a', ['b'], [upstream]),
      makeItem('b', ['e']),
      makeItem('c', ['d'], [current]),
      makeItem('d', ['e']),
      makeItem('e', ['f']),
      makeItem('f', ['g']),
    ], { current, upstream, base: null }, {
      showIncoming: true,
      showOutgoing: true,
      mergeBase: 'e',
    });

    expect(viewModels.map((model) => model.kind)).toEqual([
      'node',
      'node',
      'outgoing-changes',
      'HEAD',
      'node',
      'incoming-changes',
      'node',
      'node',
    ]);
    expect(viewModels[2].outputSwimlanes).toEqual([
      { id: 'e', color: historyItemRemoteRefColor },
      { id: 'c', color: historyItemRefColor },
    ]);
    expect(viewModels[5].inputSwimlanes).toEqual([
      { id: 'scm-graph-incoming-changes', color: historyItemRemoteRefColor },
      { id: 'e', color: historyItemRefColor },
    ]);
  });

  test('skips the incoming synthetic node when incoming changes are already merged', () => {
    const current = makeRef('refs/heads/main', 'main', 'c', 'branches', 'local');
    const upstream = makeRef('refs/remotes/origin/main', 'origin/main', 'a', 'remote-branches', 'remote');
    const viewModels = buildGitHistoryViewModels([
      makeItem('a', ['b'], [upstream]),
      makeItem('b', ['c', 'd']),
      makeItem('c', ['e'], [current]),
      makeItem('d', ['e']),
      makeItem('e', ['f']),
      makeItem('f', ['g']),
    ], { current, upstream, base: null }, {
      showIncoming: true,
      showOutgoing: true,
      mergeBase: 'c',
    });

    expect(viewModels.some((model) => model.kind === 'incoming-changes')).toBe(false);
    expect(viewModels.find((model) => model.kind === 'HEAD')?.historyItem.id).toBe('c');
  });

  test('preserves unresolved parents on partial pages', () => {
    const viewModels = buildGitHistoryViewModels([
      makeItem('a', ['b', 'c']),
      makeItem('c', ['d']),
    ], { current: null, upstream: null, base: null }, {
      showIncoming: false,
      showOutgoing: false,
      mergeBase: null,
    });

    expect(viewModels[0].outputSwimlanes).toEqual([
      { id: 'b', color: 'var(--chart-1)' },
      { id: 'c', color: 'var(--chart-2)' },
    ]);
    expect(viewModels[1].outputSwimlanes).toEqual([
      { id: 'b', color: 'var(--chart-1)' },
      { id: 'd', color: 'var(--chart-2)' },
    ]);
  });

  test('keeps existing swimlanes stable when additional history is appended', () => {
    const firstPage = buildGitHistoryViewModels([
      makeItem('a', ['b', 'c']),
      makeItem('c', ['d']),
    ], { current: null, upstream: null, base: null }, {
      showIncoming: false,
      showOutgoing: false,
      mergeBase: null,
    });
    const appended = buildGitHistoryViewModels([
      makeItem('a', ['b', 'c']),
      makeItem('c', ['d']),
      makeItem('b', ['e']),
      makeItem('e', ['f']),
      makeItem('d', ['g']),
    ], { current: null, upstream: null, base: null }, {
      showIncoming: false,
      showOutgoing: false,
      mergeBase: null,
    });

    expect(appended[0].outputSwimlanes).toEqual(firstPage[0].outputSwimlanes);
    expect(appended[1].inputSwimlanes).toEqual(firstPage[1].inputSwimlanes);
    expect(appended[1].outputSwimlanes).toEqual(firstPage[1].outputSwimlanes);
  });

  test('handles double merge of same branch with single commit between merges (screenshot case)', () => {
    // Repro for screenshot: admin branch forked from base, 3 commits (48f6,c55f,2949),
    // merged into main at 594c, then one more admin commit 3257 whose parent is
    // the same 2949 as the merge's second parent (criss-cross), then merged again at a37.
    // Order is topo-order as returned by `git log --all --topo-order` for that DAG.
    const viewModels = buildGitHistoryViewModels([
      makeItem('a37', ['594c', '3257']),
      makeItem('3257', ['2949']),
      makeItem('594c', ['base', '2949']),
      makeItem('2949', ['c55f']),
      makeItem('c55f', ['48f6']),
      makeItem('48f6', ['base']),
      makeItem('base', []),
    ], { current: null, upstream: null, base: null }, {
      showIncoming: false,
      showOutgoing: false,
      mergeBase: null,
    });

    // Should use only 2 lanes (main=0, admin=1) throughout - no third column.
    expect(Math.max(...viewModels.map(getHistoryItemMaxColumns))).toBe(2);

    // The intermediate admin commit 3257 should be on admin lane
    const c3257 = viewModels.find((model) => model.historyItem.id === '3257')!;
    expect(getHistoryItemColumn(c3257)).toBe(1);

    // Second merge (594c) must reuse admin lane rather than opening a new one,
    // so its extra parent lane is 1 (reused) not a fresh lane.
    const m1 = viewModels.find((model) => model.historyItem.id === '594c')!;
    expect(getHistoryItemSecondaryParentColumns(m1)).toEqual([1]);

    // Crucial: at the merge row, the reused admin lane must keep its vertical
    // passing segment for continuity between 3257 above and 2949 below.
    // Without this, a gap appears between those rows (the screenshot bug).
    expect(m1.inputSwimlanes[1]?.id).toBe('2949');
    expect(m1.outputSwimlanes[1]?.id).toBe('2949');

    // Top merge also branch-out to admin lane
    const m2 = viewModels.find((model) => model.historyItem.id === 'a37')!;
    expect(getHistoryItemSecondaryParentColumns(m2)).toEqual([1]);
    // Top merge's admin lane is new, so no passing at that row (branch starts there)
    expect(m2.inputSwimlanes[1]).toBe(undefined);

    // Base should merge both lanes cleanly
    const base = viewModels.find((model) => model.historyItem.id === 'base')!;
    expect(base.inputSwimlanes.filter((node) => node.id === 'base')).toHaveLength(2);
  });

  test('reuses lane when merge second parent already active (no extra lane)', () => {
    const viewModels = buildGitHistoryViewModels([
      makeItem('m2', ['m1', 'a3']),
      makeItem('a3', ['common']),
      makeItem('m1', ['base', 'common']),
      makeItem('common', ['base']),
      makeItem('base', []),
    ], { current: null, upstream: null, base: null }, {
      showIncoming: false,
      showOutgoing: false,
      mergeBase: null,
    });
    // m1 should reuse lane 1 (where a3 lives) rather than opening lane 2
    const m1 = viewModels.find((model) => model.historyItem.id === 'm1')!;
    expect(getHistoryItemSecondaryParentColumns(m1)).toEqual([1]);
    expect(Math.max(...viewModels.map(getHistoryItemMaxColumns))).toBe(2);
  });
});
