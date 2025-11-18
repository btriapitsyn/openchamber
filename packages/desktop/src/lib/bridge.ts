import { invoke } from '@tauri-apps/api/core';

type ServerInfo = {
  server_port: number;
  opencode_port?: number | null;
  api_prefix?: string | null;
};

declare global {
  interface Window {
    __OPENCHAMBER_DESKTOP_SERVER__?: {
      origin: string;
      opencodePort: number | null;
      apiPrefix: string;
    };
  }
}

let bridgePromise: Promise<void> | null = null;

export function initializeDesktopBridge(): Promise<void> {
  if (!bridgePromise) {
    bridgePromise = setupBridge();
  }
  return bridgePromise;
}

async function setupBridge(): Promise<void> {
  try {
    const info = await invoke<ServerInfo>('desktop_server_info');
    const origin = `http://127.0.0.1:${info.server_port}`;

    window.__OPENCHAMBER_DESKTOP_SERVER__ = {
      origin,
      opencodePort: info.opencode_port ?? null,
      apiPrefix: info.api_prefix ?? '',
    };

    patchFetch(origin);
    patchEventSource(origin);
    registerDevtoolsShortcut();
  } catch (error) {
    console.error('[bridge] Failed to initialize bridge:', error);
    throw error;
  }
}

function patchFetch(origin: string) {
  const originalFetch = window.fetch.bind(window);

  const rewrite = (value: string): string => {
    if (value.startsWith('http://') || value.startsWith('https://')) {
      return value;
    }
    if (value.startsWith('//')) {
      return `http:${value}`;
    }
    if (value.startsWith('/')) {
      return `${origin}${value}`;
    }
    return value;
  };

  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    if (typeof input === 'string') {
      return originalFetch(rewrite(input), init);
    }

    if (input instanceof Request) {
      const rewritten = rewrite(input.url);
      if (rewritten === input.url) {
        return originalFetch(input, init);
      }
      const cloned = new Request(rewritten, input);
      return originalFetch(cloned, init);
    }

    if (input instanceof URL) {
      return originalFetch(rewrite(input.toString()), init);
    }

    return originalFetch(input, init);
  };
}

function patchEventSource(origin: string) {
  if (typeof window.EventSource === 'undefined') {
    return;
  }

  const OriginalEventSource = window.EventSource;

  class DesktopEventSource extends OriginalEventSource {
    constructor(url: string | URL, eventSourceInit?: EventSourceInit) {
      const normalized = typeof url === 'string' ? url : url.toString();
      super(normalized.startsWith('/') ? `${origin}${normalized}` : normalized, eventSourceInit);
    }
  }

  Object.defineProperty(DesktopEventSource, 'name', { value: 'DesktopEventSource' });
  Object.setPrototypeOf(DesktopEventSource.prototype, OriginalEventSource.prototype);
  Object.setPrototypeOf(DesktopEventSource, OriginalEventSource);

  window.EventSource = DesktopEventSource as typeof EventSource;
}

function registerDevtoolsShortcut() {
  const handler = (event: KeyboardEvent) => {
    const key = event.key?.toLowerCase();
    if ((event.metaKey || event.ctrlKey) && event.altKey && key === 'i') {
      event.preventDefault();
      invoke('desktop_open_devtools').catch(() => {
        // ignore failures
      });
    }
  };
  window.addEventListener('keydown', handler);
}
