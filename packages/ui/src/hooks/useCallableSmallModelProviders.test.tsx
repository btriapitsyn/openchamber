import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Window } from 'happy-dom';

import { useCallableSmallModelProviders } from './useCallableSmallModelProviders';

describe('useCallableSmallModelProviders', () => {
  let windowInstance: Window;
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    windowInstance = new Window({ url: 'http://localhost/' });
    Object.assign(globalThis, {
      window: windowInstance,
      document: windowInstance.document,
      navigator: windowInstance.navigator,
      HTMLElement: windowInstance.HTMLElement,
      Element: windowInstance.Element,
      Node: windowInstance.Node,
      Event: windowInstance.Event,
      IS_REACT_ACT_ENVIRONMENT: true,
    });
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    windowInstance.close();
  });

  test('publishes only the current directory response', async () => {
    const pending = new Map<string, (providers: string[]) => void>();
    const fetchProviders = (directory: string | null | undefined) => new Promise<string[]>((resolve) => {
      pending.set(directory ?? '', resolve);
    });
    let providers: string[] | undefined;
    const Harness = ({ directory }: { directory: string }) => {
      providers = useCallableSmallModelProviders(directory, true, fetchProviders);
      return null;
    };

    await act(async () => root.render(<Harness directory="/one" />));
    expect(providers).toBeUndefined();
    await act(async () => root.render(<Harness directory="/two" />));
    pending.get('/one')?.(['stale']);
    await act(async () => Promise.resolve());
    expect(providers).toBeUndefined();
    pending.get('/two')?.(['current']);
    await act(async () => Promise.resolve());
    expect(providers).toEqual(['current']);
  });
});
