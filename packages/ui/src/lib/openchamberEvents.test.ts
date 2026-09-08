import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

let lastSsePath: string | undefined;
let lastSseQuery: Record<string, string> | undefined;

mock.module('./runtime-url', () => ({
  getRuntimeUrlResolver: () => ({
    sse: (path: string, query?: Record<string, string>) => {
      lastSsePath = path;
      lastSseQuery = query;
      return `http://runtime.test${path}`;
    },
  }),
}));

mock.module('./runtime-switch', () => ({
  subscribeRuntimeEndpointChanged: () => () => undefined,
}));

class MockEventSource {
  static CLOSED = 2;
  static OPEN = 1;
  static instances: MockEventSource[] = [];

  readyState = 1;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(public readonly url: string) {
    MockEventSource.instances.push(this);
  }

  close() {
    this.readyState = MockEventSource.CLOSED;
  }
}

describe('openchamber events', () => {
  test('mints a UUID v4 fallback clientId when crypto.randomUUID is unavailable', async () => {
    const originalCrypto = globalThis.crypto;
    Object.defineProperty(globalThis, 'crypto', {
      value: {},
      configurable: true,
      writable: true,
    });
    try {
      const { getBrowserControlClientId } = await import('./openchamberEvents');
      expect(typeof getBrowserControlClientId).toBe('function');
      expect(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
          getBrowserControlClientId(),
        ),
      ).toBe(true);
    } finally {
      Object.defineProperty(globalThis, 'crypto', {
        value: originalCrypto,
        configurable: true,
        writable: true,
      });
    }
  });

  beforeEach(() => {
    MockEventSource.instances = [];
    lastSsePath = undefined;
    lastSseQuery = undefined;
    globalThis.window = {} as Window & typeof globalThis;
    globalThis.EventSource = MockEventSource as unknown as typeof EventSource;
  });

  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
    delete (globalThis as { EventSource?: unknown }).EventSource;
  });

  test('dispatches externally created session events', async () => {
    const { subscribeOpenchamberEvents } = await import('./openchamberEvents');
    const events: unknown[] = [];
    const listener = (event: unknown) => events.push(event);
    const unsubscribe = subscribeOpenchamberEvents(listener);
    const source = MockEventSource.instances[0];

    source.onmessage?.({
      data: JSON.stringify({
        type: 'openchamber:session-created',
        properties: {
          sessionId: 'ses_123',
          directory: '/repo/worktrees/research',
          projectId: 'project_1',
          createdAt: 123,
          promptDispatched: true,
          dispatchedAsCommand: false,
        },
      }),
    });

    expect(events).toEqual([
      {
        type: 'session-created',
        sessionId: 'ses_123',
        directory: '/repo/worktrees/research',
        projectId: 'project_1',
        createdAt: 123,
        promptDispatched: true,
        dispatchedAsCommand: false,
      },
    ]);
    unsubscribe();
  });

  test('sends the per-window clientId on the SSE connect params', async () => {
    const { getBrowserControlClientId, subscribeOpenchamberEvents } = await import('./openchamberEvents');

    const unsubscribePlain = subscribeOpenchamberEvents(() => undefined);
    expect(lastSsePath).toBe('/api/openchamber/events');
    expect(lastSseQuery?.clientId).toBe(getBrowserControlClientId());
    expect(lastSseQuery?.browser).toBe(undefined);
    unsubscribePlain();

    (globalThis.window as { __OPENCHAMBER_ELECTRON__?: boolean }).__OPENCHAMBER_ELECTRON__ = true;
    const unsubscribeElectron = subscribeOpenchamberEvents(() => undefined);
    expect(lastSseQuery?.clientId).toBe(getBrowserControlClientId());
    expect(lastSseQuery?.browser).toBe('1');
    unsubscribeElectron();
  });

  test('notifies stream-ready subscribers on open and on the stream-ready envelope', async () => {
    const { subscribeEventStreamReady, subscribeOpenchamberEvents } = await import('./openchamberEvents');
    let notifications = 0;
    const unsubscribeReady = subscribeEventStreamReady(() => { notifications += 1; });
    const unsubscribe = subscribeOpenchamberEvents(() => undefined);
    const source = MockEventSource.instances[0];

    source.onopen?.();
    expect(notifications).toBe(1);

    source.onmessage?.({ data: JSON.stringify({ type: 'openchamber:event-stream-ready' }) });
    expect(notifications).toBe(2);

    unsubscribeReady();
    source.onopen?.();
    expect(notifications).toBe(2);
    unsubscribe();
  });

  test('reports whether the event stream is currently connected', async () => {
    const { isEventStreamConnected, subscribeOpenchamberEvents } = await import('./openchamberEvents');
    expect(isEventStreamConnected()).toBe(false);

    const unsubscribe = subscribeOpenchamberEvents(() => undefined);
    expect(isEventStreamConnected()).toBe(true);

    unsubscribe();
    expect(isEventStreamConnected()).toBe(false);
  });
});
