import type { OpenCodeManager } from './opencode';

// Session activity tracking (mirrors web server and desktop Tauri behavior)
type ActivityPhase = 'idle' | 'busy' | 'cooldown';

interface SessionActivity {
  sessionId: string;
  phase: ActivityPhase;
}

const sessionActivityPhases = new Map<string, { phase: ActivityPhase; updatedAt: number }>();
const sessionActivityCooldowns = new Map<string, NodeJS.Timeout>();
const SESSION_COOLDOWN_DURATION_MS = 2000;

let globalEventWatcherAbortController: AbortController | null = null;
let chatViewProvider: { postMessage: (message: unknown) => void } | null = null;

const setSessionActivityPhase = (sessionId: string, phase: ActivityPhase): void => {
  if (!sessionId) return;

  // Cancel existing cooldown timer
  const existingTimer = sessionActivityCooldowns.get(sessionId);
  if (existingTimer) {
    clearTimeout(existingTimer);
    sessionActivityCooldowns.delete(sessionId);
  }

  const current = sessionActivityPhases.get(sessionId);
  if (current?.phase === phase) return; // No change

  sessionActivityPhases.set(sessionId, { phase, updatedAt: Date.now() });

  // Notify webview if available
  if (chatViewProvider) {
    chatViewProvider.postMessage({
      type: 'openchamber:session-activity',
      properties: {
        sessionId,
        phase,
      },
    });
  }

  // Schedule transition from cooldown to idle
  if (phase === 'cooldown') {
    const timer = setTimeout(() => {
      const now = sessionActivityPhases.get(sessionId);
      if (now?.phase === 'cooldown') {
        sessionActivityPhases.set(sessionId, { phase: 'idle', updatedAt: Date.now() });
        if (chatViewProvider) {
          chatViewProvider.postMessage({
            type: 'openchamber:session-activity',
            properties: {
              sessionId,
              phase: 'idle',
            },
          });
        }
      }
      sessionActivityCooldowns.delete(sessionId);
    }, SESSION_COOLDOWN_DURATION_MS);
    sessionActivityCooldowns.set(sessionId, timer);
  }
};

const deriveSessionActivity = (payload: Record<string, unknown>): SessionActivity | null => {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const type = payload.type as string;
  const properties = (payload.properties ?? payload) as Record<string, unknown>;

  if (type === 'session.status') {
    const status = properties?.status as Record<string, unknown> | undefined;
    const sessionId = (properties?.sessionID ?? properties?.sessionId) as string;
    const statusType = status?.type as string;

    if (typeof sessionId === 'string' && sessionId.length > 0 && typeof statusType === 'string') {
      const phase = statusType === 'busy' || statusType === 'retry' ? 'busy' : 'idle';
      return { sessionId, phase };
    }
  }

  if (type === 'message.updated' || type === 'message.part.updated') {
    const info = properties?.info as Record<string, unknown> | undefined;
    const sessionId = (info?.sessionID ?? info?.sessionId ?? properties?.sessionID ?? properties?.sessionId) as string;
    const role = info?.role as string;
    const finish = info?.finish as string;
    if (typeof sessionId === 'string' && sessionId.length > 0 && role === 'assistant' && finish === 'stop') {
      return { sessionId, phase: 'cooldown' };
    }
  }

  if (type === 'session.idle') {
    const sessionId = (properties?.sessionID ?? properties?.sessionId) as string;
    if (typeof sessionId === 'string' && sessionId.length > 0) {
      return { sessionId, phase: 'idle' };
    }
  }

  return null;
};

const parseSseDataPayload = (block: string): Record<string, unknown> | null => {
  if (!block) {
    return null;
  }

  const lines = block.split('\n');
  const dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).replace(/^\s/, ''));
    }
  }

  if (dataLines.length === 0) {
    return null;
  }

  const payloadText = dataLines.join('\n').trim();
  if (!payloadText) {
    return null;
  }

  try {
    return JSON.parse(payloadText) as Record<string, unknown>;
  } catch {
    return null;
  }
};

const waitForOpenCodePort = async (manager: OpenCodeManager, timeoutMs = 30000): Promise<number | null> => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const apiUrl = manager.getApiUrl();
    if (apiUrl) {
      try {
        const url = new URL(apiUrl);
        if (url.port) {
          return parseInt(url.port, 10);
        }
      } catch {
        // ignore
      }
    }
    await new Promise(r => setTimeout(r, 500));
  }
  return null;
};

const buildOpenCodeUrl = (pathname: string, baseUrl: string): string => {
  const normalized = baseUrl.replace(/\/+$/, '');
  return `${normalized}${pathname}`;
};

export const startGlobalEventWatcher = async (
  manager: OpenCodeManager,
  provider: { postMessage: (message: unknown) => void }
): Promise<void> => {
  if (globalEventWatcherAbortController) {
    return;
  }

  chatViewProvider = provider;

  const port = await waitForOpenCodePort(manager);
  if (!port) {
    console.warn('[VSCode:Activity] OpenCode port unavailable; will retry');
    setTimeout(() => startGlobalEventWatcher(manager, provider), 2000);
    return;
  }

  globalEventWatcherAbortController = new AbortController();
  const signal = globalEventWatcherAbortController.signal;

  let attempt = 0;

  const run = async (): Promise<void> => {
    while (!signal.aborted) {
      attempt += 1;
      let upstream: Response | null = null;
      let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;

      try {
        const baseUrl = manager.getApiUrl();
        if (!baseUrl) {
          throw new Error('OpenCode API URL not available');
        }

        const url = buildOpenCodeUrl('/global/event', baseUrl);
        upstream = await fetch(url, {
          headers: {
            Accept: 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
          },
          signal,
        });

        if (!upstream.ok || !upstream.body) {
          throw new Error(`bad status ${upstream.status}`);
        }

        console.log('[VSCode:Activity] connected');

        const decoder = new TextDecoder();
        reader = upstream.body.getReader();
        let buffer = '';

        while (!signal.aborted) {
          const { value, done } = await reader.read();
          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');

          let separatorIndex: number;
          while ((separatorIndex = buffer.indexOf('\n\n')) !== -1) {
            const block = buffer.slice(0, separatorIndex);
            buffer = buffer.slice(separatorIndex + 2);
            const payload = parseSseDataPayload(block);
            if (payload) {
              const activity = deriveSessionActivity(payload);
              if (activity) {
                setSessionActivityPhase(activity.sessionId, activity.phase);
              }
            }
          }
        }
      } catch (error) {
        if (signal.aborted) {
          return;
        }
        console.warn('[VSCode:Activity] disconnected', error instanceof Error ? error.message : error);
      } finally {
        try {
          if (reader) {
            await reader.cancel();
          } else if (upstream?.body && !(upstream.body as ReadableStream<Uint8Array>).locked) {
            await upstream.body.cancel();
          }
        } catch {
          // ignore
        }
      }

      const backoffMs = Math.min(1000 * Math.pow(2, Math.min(attempt, 5)), 30000);
      await new Promise(r => setTimeout(r, backoffMs));
    }
  };

  void run();
};

export const stopGlobalEventWatcher = (): void => {
  if (!globalEventWatcherAbortController) {
    return;
  }
  try {
    globalEventWatcherAbortController.abort();
  } catch {
    // ignore
  }
  globalEventWatcherAbortController = null;
  chatViewProvider = null;

  // Clear all cooldown timers
  for (const timer of sessionActivityCooldowns.values()) {
    clearTimeout(timer);
  }
  sessionActivityCooldowns.clear();
};

export const setChatViewProvider = (provider: { postMessage: (message: unknown) => void } | null): void => {
  chatViewProvider = provider;
};
