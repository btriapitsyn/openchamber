import { createVSCodeAPIs } from './api';
import { onThemeChange, sendBridgeMessage } from './api/bridge';
import type { RuntimeAPIs } from '@openchamber/ui/lib/api/types';
import {
  buildVSCodeThemeFromPalette,
  readVSCodeThemePalette,
  type VSCodeThemeKind,
  type VSCodeThemePayload,
} from '@openchamber/ui/lib/theme/vscode/adapter';

type ConnectionStatus = 'connecting' | 'connected' | 'error' | 'disconnected';

declare global {
  interface Window {
    __OPENCHAMBER_RUNTIME_APIS__?: RuntimeAPIs;
    __VSCODE_CONFIG__?: {
      apiUrl: string;
      workspaceFolder: string;
      theme: string;
      connectionStatus: string;
    };
    __OPENCHAMBER_VSCODE_THEME__?: VSCodeThemePayload['theme'];
    __OPENCHAMBER_CONNECTION__?: { status: ConnectionStatus; error?: string };
  }
}

console.log('[OpenChamber] VS Code webview starting...');
console.log('[OpenChamber] Config:', window.__VSCODE_CONFIG__);

window.__OPENCHAMBER_RUNTIME_APIS__ = createVSCodeAPIs();

const bootstrapConnectionStatus = () => {
  const initialStatus = (window.__VSCODE_CONFIG__?.connectionStatus as ConnectionStatus | undefined) || 'connecting';
  window.__OPENCHAMBER_CONNECTION__ = { status: initialStatus };
};

bootstrapConnectionStatus();

const handleConnectionMessage = (event: MessageEvent) => {
  const msg = event.data;
  if (msg?.type === 'connectionStatus') {
    const payload: ConnectionStatus = msg.status;
    const error: string | undefined = msg.error;
    window.__OPENCHAMBER_CONNECTION__ = { status: payload, error };
    window.dispatchEvent(new CustomEvent('openchamber:connection-status', { detail: { status: payload, error } }));
  }
};

window.addEventListener('message', handleConnectionMessage);

const applyInitialTheme = (theme: { metadata?: { variant?: string }; colors?: { surface?: { background?: string; foreground?: string } } }) => {
  if (typeof document === 'undefined' || !theme) return;
  const variant = theme.metadata?.variant === 'dark' ? 'dark' : 'light';
  const root = document.documentElement;
  root.classList.remove('light', 'dark');
  root.classList.add(variant);

  const background = theme.colors?.surface?.background;
  if (background) {
    document.body.style.backgroundColor = background;
    let meta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'theme-color');
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', background);
  }
};

const emitVSCodeTheme = (preferredKind?: VSCodeThemeKind) => {
  const palette = readVSCodeThemePalette(preferredKind);
  if (!palette) {
    return;
  }
  const theme = buildVSCodeThemeFromPalette(palette);
  window.__OPENCHAMBER_VSCODE_THEME__ = theme;
   applyInitialTheme(theme);
  window.dispatchEvent(new CustomEvent<VSCodeThemePayload>('openchamber:vscode-theme', {
    detail: { theme, palette },
  }));
};

emitVSCodeTheme(window.__VSCODE_CONFIG__?.theme as VSCodeThemeKind | undefined);

onThemeChange((payload) => {
  const kind = (typeof payload === 'string'
    ? payload
    : typeof payload === 'object' && payload
      ? payload.kind
      : undefined) as VSCodeThemeKind | undefined;
  emitVSCodeTheme(kind);
});

const workspaceFolder = window.__VSCODE_CONFIG__?.workspaceFolder;
if (workspaceFolder) {
  window.__OPENCHAMBER_HOME__ = workspaceFolder;
  try {
    window.localStorage.setItem('lastDirectory', workspaceFolder);
  } catch (error) {
    console.warn('Failed to persist workspace folder', error);
  }
  sendBridgeMessage('api:opencode/directory', { path: workspaceFolder }).catch((error) => {
    console.warn('Failed to set OpenCode working directory from VS Code workspace', error);
  });
}

const normalizeUrl = (input: string | URL) => {
  try {
    return typeof input === 'string' ? new URL(input, window.location.origin) : new URL(input.toString());
  } catch {
    return null;
  }
};

const apiBaseUrl = window.__VSCODE_CONFIG__?.apiUrl?.replace(/\/+$/, '') || 'http://localhost:47339';

const handleLocalApiRequest = async (url: URL, init?: RequestInit) => {
  const pathname = url.pathname;

  // Health endpoints: always return OK to avoid blocking VS Code UX
  if (pathname === '/health' || pathname === '/api/health') {
    return new Response(JSON.stringify({ status: 'ok', isOpenCodeReady: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (pathname.startsWith('/api/openchamber/models-metadata')) {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : undefined;
    const timeout = controller ? setTimeout(() => controller.abort(), 8000) : undefined;
    try {
      const response = await fetch('https://models.dev/api.json', {
        signal: controller?.signal,
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) {
        throw new Error(`models.dev responded with ${response.status}`);
      }
      const data = await response.json();
      return new Response(JSON.stringify(data), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error) {
      console.warn('[OpenChamber] Failed to fetch models metadata, returning empty set:', error);
      return new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  if (pathname.startsWith('/api/fs/list')) {
    const targetPath = url.searchParams.get('path') || '';
    const data = await sendBridgeMessage('api:fs:list', { path: targetPath });
    return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  if (pathname.startsWith('/api/fs/search')) {
    const directory = url.searchParams.get('directory') || '';
    const query = url.searchParams.get('q') || '';
    const limitParam = url.searchParams.get('limit');
    const limit = limitParam ? Number(limitParam) : undefined;
    const resolvedLimit = Number.isFinite(limit) ? limit : undefined;
    const data = await sendBridgeMessage('api:fs:search', { directory, query, limit: resolvedLimit });
    return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  if (pathname.startsWith('/api/fs/mkdir')) {
    const body = init?.body ? JSON.parse(init.body as string) : {};
    const data = await sendBridgeMessage('api:fs:mkdir', { path: body.path });
    return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  if (pathname.startsWith('/api/fs/home')) {
    const data = await sendBridgeMessage('api:fs/home');
    return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  if (pathname.startsWith('/api/vscode/pick-files')) {
    const data = await sendBridgeMessage('api:files/pick');
    return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  if (pathname.startsWith('/api/config/settings')) {
    if ((init?.method || 'GET').toUpperCase() === 'GET') {
      const settings = await sendBridgeMessage('api:config/settings:get');
      return new Response(JSON.stringify(settings), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    const body = init?.body ? JSON.parse(init.body as string) : {};
    const updated = await sendBridgeMessage('api:config/settings:save', body);
    return new Response(JSON.stringify(updated), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  if (pathname.startsWith('/api/config/reload')) {
    await sendBridgeMessage('api:config/reload');
    return new Response(JSON.stringify({ restarted: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  if (pathname.startsWith('/api/openchamber/models-metadata')) {
    try {
      const data = await sendBridgeMessage('api:models/metadata');
      return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
    } catch (error) {
      console.warn('[OpenChamber] Failed to fetch models metadata via bridge, returning empty set:', error);
      return new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
  }

  if (pathname === '/auth/session') {
    // VS Code host is trusted; mirror web server shape to keep UI logic happy
    const body = {
      authenticated: true,
      requireSetup: false,
      authenticatedAt: Date.now(),
    };
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  if (pathname.startsWith('/api/opencode/directory')) {
    const body = init?.body ? JSON.parse(init.body as string) : {};
    const result = await sendBridgeMessage('api:opencode/directory', { path: body.path });
    return new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  return null;
};

const originalFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const targetUrl = typeof input === 'string' || input instanceof URL ? normalizeUrl(input) : normalizeUrl((input as Request).url);
  const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();

  const pathname = targetUrl?.pathname || '';
  const normalizedPathname = pathname.replace(/\/+/, '/');
  if (targetUrl && normalizedPathname === '/health') {
    return new Response(JSON.stringify({ status: 'ok', isOpenCodeReady: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (targetUrl && targetUrl.pathname.startsWith('/api/')) {
    const localResponse = await handleLocalApiRequest(targetUrl, init);
    if (localResponse) {
      return localResponse;
    }

    const rewritten = new URL(targetUrl.href);
    rewritten.pathname = targetUrl.pathname.replace(/^\/api/, '');
    const fetchTarget = `${apiBaseUrl}${rewritten.pathname}${rewritten.search}`;

    if (input instanceof Request) {
      const cloned = input.clone();
      const requestInit: RequestInit = {
        method: method,
        headers: cloned.headers,
        body: method === 'GET' || method === 'HEAD' ? undefined : await cloned.blob(),
      };
      return originalFetch(fetchTarget, requestInit);
    }

    return originalFetch(fetchTarget, init);
  }

  if (targetUrl && targetUrl.hostname.includes('models.dev')) {
    try {
      const data = await sendBridgeMessage('api:models/metadata');
      return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
    } catch (error) {
      console.warn('[OpenChamber] models.dev request failed via bridge, returning empty metadata:', error);
      return new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
  }

  return originalFetch(input as RequestInfo, init);
};
import('@openchamber/ui/main');
