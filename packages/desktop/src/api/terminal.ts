import type {
  TerminalAPI,
  TerminalHandlers,
  TerminalStreamOptions,
  CreateTerminalOptions,
  ResizeTerminalPayload,
  TerminalSession,
  Subscription,
} from '@openchamber/ui/lib/api/types';

const notImplemented = (...args: unknown[]) => {
  void args;
  throw new Error('Desktop terminal API not implemented');
};

const noopSubscription: Subscription = { close: () => {} };

export const createDesktopTerminalAPI = (): TerminalAPI => ({
  async createSession(options: CreateTerminalOptions): Promise<TerminalSession> {
    return notImplemented(options);
  },

  connect(sessionId: string, handlers: TerminalHandlers, options?: TerminalStreamOptions): Subscription {
    notImplemented(sessionId, handlers, options);
    return noopSubscription;
  },

  async sendInput(sessionId: string, input: string): Promise<void> {
    return notImplemented(sessionId, input);
  },

  async resize(payload: ResizeTerminalPayload): Promise<void> {
    return notImplemented(payload);
  },

  async close(sessionId: string): Promise<void> {
    return notImplemented(sessionId);
  },
});
