import {
  connectTerminalStream,
  createTerminalSession,
  resizeTerminal,
  sendTerminalInput,
  closeTerminal,
} from '@openchamber/ui/lib/terminalApi';
import type {
  TerminalAPI,
  TerminalHandlers,
  TerminalStreamOptions,
  CreateTerminalOptions,
  ResizeTerminalPayload,
  TerminalSession,
} from '@openchamber/ui/lib/api/types';

const getRetryPolicy = (options?: TerminalStreamOptions) => {
  const retry = options?.retry;
  return {
    maxRetries: retry?.maxRetries ?? 3,
    initialRetryDelay: retry?.initialDelayMs ?? 1000,
    maxRetryDelay: retry?.maxDelayMs ?? 8000,
    connectionTimeout: options?.connectionTimeoutMs ?? 10000,
  };
};

export const createWebTerminalAPI = (): TerminalAPI => ({
  async createSession(options: CreateTerminalOptions): Promise<TerminalSession> {
    return createTerminalSession(options);
  },

  connect(sessionId: string, handlers: TerminalHandlers, options?: TerminalStreamOptions) {
    const unsubscribe = connectTerminalStream(
      sessionId,
      handlers.onEvent,
      handlers.onError,
      getRetryPolicy(options)
    );

    return {
      close: () => unsubscribe(),
    };
  },

  async sendInput(sessionId: string, input: string): Promise<void> {
    await sendTerminalInput(sessionId, input);
  },

  async resize(payload: ResizeTerminalPayload): Promise<void> {
    await resizeTerminal(payload.sessionId, payload.cols, payload.rows);
  },

  async close(sessionId: string): Promise<void> {
    await closeTerminal(sessionId);
  },
});
