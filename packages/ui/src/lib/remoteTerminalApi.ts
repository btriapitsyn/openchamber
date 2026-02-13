import { opencodeClient } from '@/lib/opencode/client';
import type {
  TerminalAPI,
  TerminalHandlers,
  TerminalStreamOptions,
  CreateTerminalOptions,
  ResizeTerminalPayload,
  TerminalSession,
  Subscription,
} from '@/lib/api/types';

/**
 * Constructs a WebSocket URL for a remote PTY connection.
 * Converts the HTTP(S) base URL to WS(S) and appends the PTY connect path.
 */
const buildPtyWebSocketUrl = (baseUrl: string, ptyId: string): string => {
  // baseUrl is like "https://remote-host:1234/api" or "http://..."
  // We need "wss://remote-host:1234/api/pty/{ptyId}/connect" or "ws://..."
  const wsUrl = baseUrl.replace(/^http/, 'ws');
  return `${wsUrl.replace(/\/+$/, '')}/pty/${encodeURIComponent(ptyId)}/connect`;
};

/**
 * Creates a TerminalAPI implementation that connects to a remote OpenCode
 * server's PTY infrastructure over WebSocket.
 *
 * Each remote connection has its own instance keyed by connectionId.
 * The adapter uses the SDK client for lifecycle operations (create, resize, remove)
 * and a direct WebSocket for terminal I/O (connect, sendInput).
 */
export const createRemoteTerminalAPI = (connectionId: string): TerminalAPI => {
  // Map of ptyId -> WebSocket for active connections
  const activeWebSockets = new Map<string, WebSocket>();

  const getClient = () => opencodeClient.getClientForConnection(connectionId);
  const getBaseUrl = () => opencodeClient.getBaseUrlForConnection(connectionId);

  return {
    async createSession(options: CreateTerminalOptions): Promise<TerminalSession> {
      const client = getClient();
      const response = await client.pty.create({
        cwd: options.cwd,
        directory: options.cwd,
        ...(options.cols != null || options.rows != null
          ? {} // size is set after connect via update
          : {}),
      });

      if (!response.data) {
        throw new Error('Failed to create remote PTY session');
      }

      const pty = response.data;

      // Set initial size if provided
      if (options.cols != null && options.rows != null) {
        await client.pty.update({
          ptyID: pty.id,
          size: { cols: options.cols, rows: options.rows },
        }).catch(() => {
          // Non-fatal: size will be set on first resize
        });
      }

      return {
        sessionId: pty.id,
        cols: options.cols ?? 80,
        rows: options.rows ?? 24,
      };
    },

    connect(
      sessionId: string,
      handlers: TerminalHandlers,
      options?: TerminalStreamOptions
    ): Subscription {
      const baseUrl = getBaseUrl();
      const wsUrl = buildPtyWebSocketUrl(baseUrl, sessionId);

      const maxRetries = options?.retry?.maxRetries ?? 3;
      const initialDelayMs = options?.retry?.initialDelayMs ?? 500;
      const maxDelayMs = options?.retry?.maxDelayMs ?? 8000;
      const connectionTimeoutMs = options?.connectionTimeoutMs ?? 10_000;

      let attempt = 0;
      let closed = false;
      let ws: WebSocket | null = null;
      let connectionTimer: ReturnType<typeof setTimeout> | null = null;

      const clearConnectionTimer = () => {
        if (connectionTimer != null) {
          clearTimeout(connectionTimer);
          connectionTimer = null;
        }
      };

      const cleanup = () => {
        closed = true;
        clearConnectionTimer();
        if (ws) {
          activeWebSockets.delete(sessionId);
          try {
            ws.close();
          } catch {
            // ignore
          }
          ws = null;
        }
      };

      const scheduleReconnect = () => {
        if (closed) return;
        attempt++;
        if (attempt > maxRetries) {
          handlers.onError?.(
            new Error(`Connection failed after ${maxRetries} retries`),
            true
          );
          cleanup();
          return;
        }
        const delay = Math.min(initialDelayMs * Math.pow(2, attempt - 1), maxDelayMs);
        handlers.onEvent({ type: 'reconnecting', attempt, maxAttempts: maxRetries });
        setTimeout(() => {
          if (!closed) openConnection();
        }, delay);
      };

      const openConnection = () => {
        if (closed) return;

        try {
          ws = new WebSocket(wsUrl);
          ws.binaryType = 'arraybuffer';
        } catch (err) {
          handlers.onError?.(
            err instanceof Error ? err : new Error(String(err)),
            attempt >= maxRetries
          );
          scheduleReconnect();
          return;
        }

        // Connection timeout
        connectionTimer = setTimeout(() => {
          if (ws && ws.readyState !== WebSocket.OPEN) {
            ws.close();
            handlers.onError?.(new Error('Connection timeout'), false);
            scheduleReconnect();
          }
        }, connectionTimeoutMs);

        ws.onopen = () => {
          clearConnectionTimer();
          attempt = 0;
          activeWebSockets.set(sessionId, ws!);
          handlers.onEvent({ type: 'connected' });
        };

        ws.onmessage = (event: MessageEvent) => {
          let text: string;
          if (event.data instanceof ArrayBuffer) {
            text = new TextDecoder().decode(event.data);
          } else if (typeof event.data === 'string') {
            text = event.data;
          } else {
            return;
          }
          if (text) {
            handlers.onEvent({ type: 'data', data: text });
          }
        };

        ws.onerror = () => {
          // onerror is always followed by onclose, handle reconnect there
        };

        ws.onclose = (event: CloseEvent) => {
          clearConnectionTimer();
          activeWebSockets.delete(sessionId);

          if (closed) return;

          // Normal closure or explicit termination
          if (event.code === 1000 || event.code === 1001) {
            handlers.onEvent({
              type: 'exit',
              exitCode: 0,
            });
            cleanup();
            return;
          }

          // Unexpected close — try to reconnect
          scheduleReconnect();
        };
      };

      openConnection();

      return {
        close: cleanup,
      };
    },

    async sendInput(sessionId: string, input: string): Promise<void> {
      const ws = activeWebSockets.get(sessionId);
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        throw new Error('Terminal WebSocket not connected');
      }
      ws.send(input);
    },

    async resize(payload: ResizeTerminalPayload): Promise<void> {
      const client = getClient();
      await client.pty.update({
        ptyID: payload.sessionId,
        size: { cols: payload.cols, rows: payload.rows },
      });
    },

    async close(sessionId: string): Promise<void> {
      // Close WebSocket first
      const ws = activeWebSockets.get(sessionId);
      if (ws) {
        activeWebSockets.delete(sessionId);
        try {
          ws.close(1000, 'Terminal closed');
        } catch {
          // ignore
        }
      }

      // Remove the PTY on the remote server
      const client = getClient();
      await client.pty.remove({ ptyID: sessionId }).catch(() => {
        // Best-effort cleanup
      });
    },
  };
};

/**
 * Cache of remote terminal API instances per connectionId.
 * Avoids recreating the adapter (and its WebSocket map) on every render.
 */
const remoteTerminalApiCache = new Map<string, TerminalAPI>();

/**
 * Returns a cached remote TerminalAPI for the given connectionId.
 * For local connections, returns null (caller should use the local terminal API).
 */
export const getRemoteTerminalAPI = (connectionId: string): TerminalAPI | null => {
  if (!connectionId || connectionId === 'local') {
    return null;
  }

  const existing = remoteTerminalApiCache.get(connectionId);
  if (existing) {
    return existing;
  }

  const api = createRemoteTerminalAPI(connectionId);
  remoteTerminalApiCache.set(connectionId, api);
  return api;
};

/**
 * Cleans up a cached remote terminal API when a connection is removed.
 */
export const cleanupRemoteTerminalAPI = (connectionId: string): void => {
  remoteTerminalApiCache.delete(connectionId);
};
