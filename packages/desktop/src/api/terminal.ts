import { safeInvoke, safeListen } from '../lib/tauriCallbackManager';
import type {
  TerminalAPI,
  TerminalHandlers,
  CreateTerminalOptions,
  ResizeTerminalPayload,
  TerminalSession,
  TerminalStreamEvent
} from '@openchamber/ui/lib/api/types';

async function safeTerminalInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await safeInvoke<T>(command, args, {
      timeout: 10000,
      onCancel: () => {
        console.warn(`[TerminalAPI] Command ${command} timed out`);
      }
    });
  } catch (error) {
    const message = typeof error === 'string' ? error : (error as Error).message || 'Unknown error';
    throw new Error(message);
  }
}

export const createDesktopTerminalAPI = (): TerminalAPI => ({
  async createSession(options: CreateTerminalOptions): Promise<TerminalSession> {
    const cols = options.cols ?? 80;
    const rows = options.rows ?? 24;

    const res = await safeTerminalInvoke<{ session_id: string }>('create_terminal_session', {
        payload: {
            cols,
            rows,
            cwd: options.cwd
        }
    });

    return {
        sessionId: res.session_id,
        cols,
        rows
    };
  },

  connect(sessionId: string, handlers: TerminalHandlers) {
    let unlistenFn: (() => void) | undefined;
    let cancelled = false;
    let isConnected = false;

    const stopListening = () => {
      if (unlistenFn) {
        unlistenFn();
        unlistenFn = undefined;
        isConnected = false;
      }
    };

    const startListening = async () => {
      try {
        const unlisten = await safeListen<TerminalStreamEvent>(
          `terminal://${sessionId}`,
          (event) => {
          if (cancelled) {
            return;
          }

          handlers.onEvent(event.payload);

          if (event.payload?.type === 'exit') {
            stopListening();
          }
        },
        {
          // Terminal streams are long-lived; never auto-expire this listener.
          timeout: 0,
        }
        );

        if (cancelled) {
          unlisten();
          return;
        }

        unlistenFn = unlisten;
        isConnected = true;
        handlers.onEvent({ type: 'connected' });
      } catch (err) {
        console.error('Failed to listen to terminal events:', err);
        if (!cancelled) {
          handlers.onError?.(err instanceof Error ? err : new Error(String(err)));
        }
      }
    };

    startListening();

    return {
      close: () => {
        cancelled = true;
        stopListening();
      },
      isConnected: () => isConnected,
    };
  },

  async sendInput(sessionId: string, input: string): Promise<void> {
    await safeTerminalInvoke('send_terminal_input', {

      sessionId,
      session_id: sessionId,
      data: input,
    });
  },

  async resize(payload: ResizeTerminalPayload): Promise<void> {
    await safeTerminalInvoke('resize_terminal', {
      sessionId: payload.sessionId,
      session_id: payload.sessionId,
      cols: payload.cols,
      rows: payload.rows,
    });
  },

  async close(sessionId: string): Promise<void> {
    await safeTerminalInvoke('close_terminal', {
      sessionId,
      session_id: sessionId,
    });
  },

  async restartSession(
    currentSessionId: string,
    options: CreateTerminalOptions
  ): Promise<TerminalSession> {
    const cols = options.cols ?? 80;
    const rows = options.rows ?? 24;

    const res = await safeTerminalInvoke<{ session_id: string }>(
      'restart_terminal_session',
      {
        payload: {
          session_id: currentSessionId,
          cols,
          rows,
          cwd: options.cwd ?? '',
        },
      }
    );

    return {
      sessionId: res.session_id,
      cols,
      rows,
    };
  },

  async forceKill(options: {
    sessionId?: string;
    cwd?: string;
  }): Promise<void> {
    await safeTerminalInvoke('force_kill_terminal', {
      payload: {
        session_id: options.sessionId ?? null,
        cwd: options.cwd ?? null,
      },
    });
  },
});
