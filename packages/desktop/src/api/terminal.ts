import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type {
  TerminalAPI,
  TerminalHandlers,
  CreateTerminalOptions,
  ResizeTerminalPayload,
  TerminalSession,
  TerminalStreamEvent
} from '@openchamber/ui/lib/api/types';

// Helper for safe invoke
async function safeInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    const message = typeof error === 'string' ? error : (error as Error).message || 'Unknown error';
    throw new Error(message);
  }
}

export const createDesktopTerminalAPI = (): TerminalAPI => ({
  async createSession(options: CreateTerminalOptions): Promise<TerminalSession> {
    const cols = options.cols ?? 80;
    const rows = options.rows ?? 24;
    
    const res = await safeInvoke<{ session_id: string }>('create_terminal_session', { 
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

    const stopListening = () => {
      if (unlistenFn) {
        unlistenFn();
        unlistenFn = undefined;
      }
    };

    const startListening = async () => {
      try {
        const unlisten = await listen<TerminalStreamEvent>(`terminal://${sessionId}`, (event) => {
          handlers.onEvent(event.payload);

          if (event.payload?.type === 'exit') {
            stopListening();
          }
        });

        if (cancelled) {
          unlisten();
          return;
        }

        unlistenFn = unlisten;
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
    };
  },

  async sendInput(sessionId: string, input: string): Promise<void> {
    await safeInvoke('send_terminal_input', { sessionId, data: input });
  },

  async resize(payload: ResizeTerminalPayload): Promise<void> {
    await safeInvoke('resize_terminal', { 
        sessionId: payload.sessionId, 
        cols: payload.cols, 
        rows: payload.rows 
    });
  },

  async close(sessionId: string): Promise<void> {
    await safeInvoke('close_terminal', { sessionId });
  },
});
