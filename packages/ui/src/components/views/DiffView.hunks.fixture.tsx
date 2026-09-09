import React, { act } from 'react';
import { expect } from 'bun:test';
import { Window } from 'happy-dom';
import type { GitStatus } from '@/lib/api/types';

export async function exerciseDiffHunkActions(snapshotCase?: 'cold' | 'cached') {
  const dom = new Window({ url: 'http://localhost' });
  // Highlighting is unrelated to patch ownership. Keep that browser I/O
  // pending while exercising the real view, menus and Git adapter.
  class PendingHighlightWorker extends EventTarget {
    postMessage() {}
    terminate() {}
  }
  const originals = new Map<string, PropertyDescriptor | undefined>();
  for (const [name, value] of Object.entries({
    window: dom, Window: dom.Window, document: dom.document, navigator: dom.navigator, location: dom.location, localStorage: dom.localStorage,
    Element: dom.Element, HTMLElement: dom.HTMLElement, HTMLInputElement: dom.HTMLInputElement, Node: dom.Node,
    ShadowRoot: dom.ShadowRoot, Document: dom.Document, Worker: PendingHighlightWorker,
    SVGElement: dom.SVGElement, DocumentFragment: dom.DocumentFragment, Text: dom.Text, Range: dom.Range,
    customElements: dom.customElements, CSSStyleSheet: dom.CSSStyleSheet,
    Event: dom.Event, CustomEvent: dom.CustomEvent, KeyboardEvent: dom.KeyboardEvent, MouseEvent: dom.MouseEvent,
    MutationObserver: dom.MutationObserver, ResizeObserver: dom.ResizeObserver, IntersectionObserver: dom.IntersectionObserver,
    getComputedStyle: dom.getComputedStyle.bind(dom), requestAnimationFrame: dom.requestAnimationFrame.bind(dom),
    cancelAnimationFrame: dom.cancelAnimationFrame.bind(dom), IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }
  const { createRoot } = await import('react-dom/client');
  const originalFetch = globalThis.fetch;
  // Unrelated bootstrap I/O stays pending; the Git adapter below owns this
  // scenario's reads and mutations. No real account or filesystem is touched.
  globalThis.fetch = Object.assign(async () => new Promise<Response>(() => {}), originalFetch);
  const { I18nProvider } = await import('@/lib/i18n');
  const { RuntimeAPIContext } = await import('@/contexts/runtimeAPIContext');
  const { createWebAPIs } = await import('../../../../web/src/api/index');
  const { MultiFileDiffEntry } = await import('@/components/views/DiffView');
  const { SyncProvider } = await import('@/sync/sync-context');
  const { opencodeClient } = await import('@/lib/opencode/client');
  const { useGitStore } = await import('@/stores/useGitStore');
  const changes = [1, 25, 50];
  let remaining = [...changes];
  let fullContext = snapshotCase === 'cold';
  let currentVersion = snapshotCase === 'cold' ? 2 : 1;
  let fullVersion = 1;
  let deferVersions = snapshotCase === 'cold';
  let releaseFull: (() => void) | undefined;
  let releaseCanonical: (() => void) | undefined;
  let openedPatch: string | null = null;
  let historical = false;
  let failReads = false;
  let normalReads = 0;
  let mutations = 0;
  const makePatch = (full: boolean, version = currentVersion) => {
    const header = `diff --git a/file.txt b/file.txt\nindex ${'a'.repeat(40)}..${String(version).repeat(40)} 100644\n--- a/file.txt\n+++ b/file.txt\n`;
    const ranges = full ? [[0, 60]] : remaining.map((line) => [Math.max(0, line - 3), line + 4]);
    return header + ranges.map(([start, end]) => `@@ -${start + 1},${end - start} +${start + 1},${end - start} @@\n` +
      Array.from({ length: end - start }, (_, offset) => {
        const index = start + offset;
        return remaining.includes(index) ? `-line${index}\n+v${version}-changed${index}\n` : ` line${index}\n`;
      }).join('')).join('');
  };
  const file = { path: 'file.txt', index: 'M', working_dir: 'M', insertions: 3, deletions: 3, isNew: false };
  const status: GitStatus = { current: 'feature', tracking: null, ahead: 0, behind: 0, files: [file], isClean: false, diffStats: {} };
  const base = createWebAPIs();
  const apis = { ...base, git: { ...base.git,
    checkIsGitRepository: async () => true,
    getGitStatus: async () => status,
    getGitDiff: async (_directory: string, options: { path?: string; staged?: boolean; contextLines?: number }) => {
      if (failReads) throw new Error('Refresh unavailable');
      if (options.contextLines === 3) normalReads += 1;
      const full = (options.contextLines ?? 3) > 3;
      const response = { diff: makePatch(full, full ? fullVersion : currentVersion) };
      if (deferVersions) return new Promise<{ diff: string }>((resolve) => {
        if (full) releaseFull = () => resolve(response);
        else releaseCanonical = () => resolve(response);
      });
      return response;
    },
    stageGitHunk: async (_directory: string, _path: string, patch: string) => {
      expect(patch).toContain(`+v${currentVersion}-changed${remaining[0]}\n`);
      mutations += 1;
      remaining = remaining.slice(1);
    },
  } };
  useGitStore.getState().setActiveDirectory('/repo');
  const container = document.createElement('div');
  container.dataset.diffVirtualRoot = '';
  document.body.append(container);
  const root = createRoot(container);
  const render = () => act(async () => root.render(<I18nProvider><SyncProvider sdk={opencodeClient.getSdkClient()} directory=""><RuntimeAPIContext.Provider value={apis}>
    <MultiFileDiffEntry directory="/repo" file={file} layout="inline" wrapLines={false} isSelected={false}
      isExpanded isMounted onSelect={() => {}} onExpandedChange={() => {}} registerSectionRef={() => {}}
      showOpenInEditorAction onOpenInEditor={(_path, diff) => { openedPatch = diff?.patch ?? null; }}
      hunkActionsEnabled={!historical} loadFullFiles={fullContext}
      initialDiffData={historical ? { original: '', modified: '', patch: makePatch(false), contextMode: 'patch' } : null} />
  </RuntimeAPIContext.Provider></SyncProvider></I18nProvider>));
  const click = async (selector: string) => {
    const element = document.querySelector<HTMLElement>(selector);
    if (!element) throw new Error(`Missing ${selector}`);
    await act(async () => element.click());
  };
  const openHunks = async () => {
    const trigger = container.querySelector<HTMLButtonElement>('button[aria-label="Hunks"]');
    if (!trigger) throw new Error('Missing hunk trigger');
    if (trigger.disabled) throw new Error(`Hunk trigger disabled: ${container.textContent}`);
    await act(async () => {
      trigger.focus();
      trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    });
  };
  try {
    await render();
    if (snapshotCase) {
      if (snapshotCase === 'cold') {
        if (!releaseFull || !releaseCanonical) throw new Error('Both snapshot reads must start');
        await act(async () => { releaseFull?.(); releaseCanonical?.(); });
      } else {
        currentVersion = 2;
        fullVersion = 2;
        fullContext = true;
        await render();
      }
      expect(container.textContent).toContain('Refresh the diff and try again');
      expect(container.querySelector('button[aria-label="Hunks"]')).toBeNull();
      expect(mutations).toBe(0);
      deferVersions = false;
      fullVersion = currentVersion;
      const retry = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Retry');
      if (!retry) throw new Error('Missing snapshot retry');
      await act(async () => retry.click());
      expect(container.textContent).toContain('Hunks · 3');
      expect(normalReads).toBe(2);
      await click('button[title="Open this file in editor at change"]');
      expect(openedPatch).toContain('+v2-changed1\n');
      await openHunks();
      await click('[role="menuitem"][aria-label="Stage hunk 1"]');
      expect(mutations).toBe(1);
      return;
    }
    expect(container.textContent).toContain('Hunks · 3');
    expect(normalReads).toBe(1);
    fullContext = true;
    await render();
    expect(container.textContent).toContain('Hunks · 3');
    expect(normalReads).toBe(1);
    await openHunks();
    await click('[role="menuitem"][aria-label="Stage hunk 1"]');
    expect(mutations).toBe(1);
    expect(container.textContent).toContain('Hunks · 2');
    expect(normalReads).toBe(2);
    failReads = true;
    await openHunks();
    await click('[role="menuitem"][aria-label="Stage hunk 1"]');
    expect(mutations).toBe(2);
    expect(container.textContent).toContain('Refresh unavailable');
    expect(container.querySelector('button[aria-label="Hunks"]')).toBeNull();
    failReads = false;
    const retry = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Retry');
    if (!retry) throw new Error('Missing retry');
    await act(async () => retry.click());
    expect(container.textContent).not.toContain('Refresh unavailable');
    expect(container.querySelector('button[aria-label="Hunks"]')).toBeNull();
    remaining = [...changes];
    historical = true;
    await render();
    expect(container.querySelector('button[aria-label="Hunks"]')).toBeNull();
    expect(mutations).toBe(2);
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = originalFetch;
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
    await dom.happyDOM.close();
  }
}
