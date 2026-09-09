import React, { act } from 'react';
import { expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import type { GitComparisonSource } from './useGitComparison';

test('comparison reads preserve scope, report failures, retry, and stop while hidden', async () => {
  const dom = new Window({ url: 'http://localhost' });
  const originals = new Map<string, PropertyDescriptor | undefined>();
  const globals = {
    window: dom, document: dom.document, navigator: dom.navigator, location: dom.location,
    localStorage: dom.localStorage,
    Element: dom.Element, HTMLElement: dom.HTMLElement, Node: dom.Node,
    Event: dom.Event, CustomEvent: dom.CustomEvent,
    requestAnimationFrame: dom.requestAnimationFrame.bind(dom),
    cancelAnimationFrame: dom.cancelAnimationFrame.bind(dom), IS_REACT_ACT_ENVIRONMENT: true,
  };
  for (const [name, value] of Object.entries(globals)) {
    originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: URL; resolve: (response: Response) => void }> = [];
  globalThis.fetch = Object.assign((input: RequestInfo | URL) => {
    const url = new URL(input instanceof Request ? input.url : String(input), 'http://localhost');
    // Hold unrelated app-store bootstrap outside this fixture. Only explicitly
    // resolved comparison requests should publish data during these transitions.
    if (url.pathname === '/api/fs/home' || url.pathname === '/api/session-folders') {
      return new Promise<Response>(() => {});
    }
    return new Promise<Response>((resolve) => { requests.push({ url, resolve }); });
  }, originalFetch);
  const { createRoot } = await import('react-dom/client');
  const { I18nProvider } = await import('@/lib/i18n');
  const { useGitComparison } = await import('./useGitComparison');
  type Capture = { current: ReturnType<typeof useGitComparison> | null };
  const captured: Capture = { current: null };
  let directory = '/repo-a';
  let source: GitComparisonSource = { kind: 'branch', baseRef: 'refs/heads/main', headRef: 'feature' };
  let enabled = false;
  let revision = '1';
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  function Harness() {
    captured.current = useGitComparison(directory, source, enabled, revision);
    return null;
  }
  const current = () => {
    if (!captured.current) throw new Error('Comparison did not render');
    return captured.current;
  };
  const render = () => act(async () => { root.render(<I18nProvider><Harness /></I18nProvider>); });
  const finish = (index: number, response: Response) => act(async () => { requests[index].resolve(response); });
  try {
    await render();
    expect(requests.map(({ url }) => url.pathname)).toEqual([]);
    enabled = true;
    await render();
    expect(requests).toHaveLength(1);
    expect(requests[0].url.searchParams.get('base')).toBe('refs/heads/main');
    expect(requests[0].url.searchParams.get('includeWorkingTree')).toBe('true');
    await finish(0, Response.json({ files: [{ path: 'a.ts', status: 'M' }] }));
    expect(current().files?.map((file) => file.path)).toEqual(['a.ts']);
    const oldRefresh = current().refresh;
    const oldFetchDiff = current().fetchDiff;

    const patch = current().fetchDiff('a.ts');
    await act(async () => { await Promise.resolve(); });
    expect(requests[1].url.pathname).toBe('/api/git/range-diff');
    expect(requests[1].url.searchParams.get('includeWorkingTree')).toBe('true');
    await finish(1, Response.json({ diff: 'branch patch' }));
    expect(await patch).toEqual({ diff: 'branch patch' });

    revision = '2';
    await render();
    expect(current().files?.map((file) => file.path)).toEqual(['a.ts']);
    await finish(2, Response.json({ error: 'snapshot failed' }, { status: 500 }));
    expect(current().files).toBeNull();
    expect(current().error).toBe('snapshot failed');
    let retry: Promise<void> | undefined;
    await act(async () => { retry = current().refresh(); });
    await finish(3, Response.json({ files: [] }));
    await retry;
    expect(current().files).toEqual([]);
    expect(current().error).toBeNull();

    source = { kind: 'commit', hash: 'a'.repeat(40) };
    await render();
    expect(current().files).toBeNull();
    expect(requests[4].url.pathname).toBe('/api/git/commit-files');
    await finish(4, Response.json({ files: [{ path: 'new.ts', previousPath: 'old.ts', changeType: 'R', insertions: 1, deletions: 1, isBinary: false }] }));
    const commitPatch = current().fetchDiff('new.ts', 20);
    await act(async () => { await Promise.resolve(); });
    expect(requests[5].url.pathname).toBe('/api/git/commit-diff');
    expect(requests[5].url.searchParams.get('hash')).toBe('a'.repeat(40));
    expect(requests[5].url.searchParams.get('previousPath')).toBe('old.ts');
    expect(requests[5].url.searchParams.get('context')).toBe('20');
    await finish(5, Response.json({ diff: 'commit patch' }));
    expect(await commitPatch).toEqual({ diff: 'commit patch' });
    await oldRefresh();
    await expect(oldFetchDiff('a.ts')).rejects.toThrow();
    expect(requests).toHaveLength(6);

    source = { kind: 'branch', baseRef: 'main', headRef: 'feature' };
    await render();
    directory = '/repo-b';
    await render();
    await finish(7, Response.json({ files: [{ path: 'b.ts', status: 'A' }] }));
    await finish(6, Response.json({ files: [{ path: 'stale.ts', status: 'D' }] }));
    expect(current().files?.map((file) => file.path)).toEqual(['b.ts']);

    const refreshBeforeHide = current().refresh;
    const fetchBeforeHide = current().fetchDiff;
    enabled = false;
    revision = '3';
    await render();
    await current().refresh();
    await refreshBeforeHide();
    await expect(fetchBeforeHide('b.ts')).rejects.toThrow();
    expect(requests).toHaveLength(8);
    expect(current().files?.map((file) => file.path)).toEqual(['b.ts']);
    enabled = true;
    await render();
    expect(requests).toHaveLength(9);
    await finish(8, Response.json({ files: [{ path: 'b.ts', status: 'A' }] }));
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = originalFetch;
    await dom.happyDOM.abort();
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  }
});
