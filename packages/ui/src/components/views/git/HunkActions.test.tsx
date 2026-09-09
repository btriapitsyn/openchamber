import React, { act } from 'react';
import { expect, test } from 'bun:test';
import { Window } from 'happy-dom';

test('a long hunk menu counts header-like content and navigates to its last action', async () => {
  const dom = new Window({ url: 'http://localhost' });
  const originals = new Map<string, PropertyDescriptor | undefined>();
  for (const [name, value] of Object.entries({
    window: dom, Window: dom.Window, document: dom.document, navigator: dom.navigator,
    Element: dom.Element, HTMLElement: dom.HTMLElement, Node: dom.Node, ShadowRoot: dom.ShadowRoot,
    customElements: dom.customElements, CSSStyleSheet: dom.CSSStyleSheet,
    Event: dom.Event, CustomEvent: dom.CustomEvent, KeyboardEvent: dom.KeyboardEvent,
    MouseEvent: dom.MouseEvent, ResizeObserver: dom.ResizeObserver,
    getComputedStyle: dom.getComputedStyle.bind(dom), requestAnimationFrame: dom.requestAnimationFrame.bind(dom),
    cancelAnimationFrame: dom.cancelAnimationFrame.bind(dom), IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }
  const { createRoot } = await import('react-dom/client');
  const { I18nProvider } = await import('@/lib/i18n');
  const { HunkActions } = await import('./HunkActions');
  const patch = 'diff --git a/f b/f\n--- a/f\n+++ b/f\n' + Array.from({ length: 60 }, (_, i) => `@@ -${i * 10 + 1} +${i * 10 + 1} @@\n--- a/old\n+++ b/new\n`).join('');
  const actions: string[] = [];
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const key = async (name: string, ctrlKey = false) => act(async () => {
    document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: name, ctrlKey, bubbles: true, cancelable: true }));
  });
  try {
    await act(async () => root.render(<I18nProvider><HunkActions filePath="f" patch={patch} staged={false} busyHunk={null} disabled={false} onAction={(index, action) => actions.push(`${action}:${index}`)} /></I18nProvider>));
    const trigger = container.querySelector<HTMLButtonElement>('button[aria-label="Hunks"]');
    if (!trigger) throw new Error('Missing hunk trigger');
    trigger.focus();
    await key('ArrowDown');
    const menu = document.querySelector<HTMLElement>('[role="menu"]');
    if (!menu) throw new Error('Missing hunk menu');
    expect(menu.className).toContain('overflow-y-auto');
    expect(menu.className).toContain('max-h-');
    const first = menu.querySelector('[aria-label="Stage hunk 1"]');
    expect(first?.textContent).toContain('+1');
    expect(first?.textContent).toContain('-1');
    await key('End');
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Discard hunk 60');
    await key('p', true);
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Stage hunk 60');
    await key('n', true);
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Discard hunk 60');
    expect(document.activeElement?.getAttribute('data-variant')).toBe('destructive');
    const last = document.activeElement;
    if (!(last instanceof HTMLElement)) throw new Error('Missing final action');
    await act(async () => last.click());
    expect(actions).toEqual(['discard:59']);
  } finally {
    await act(async () => root.unmount());
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
    await dom.happyDOM.close();
  }
});
