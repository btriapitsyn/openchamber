import { createOpencodeClient } from '@opencode-ai/sdk';
import type { Event } from '@opencode-ai/sdk';

type BridgeEvent = { type: string; properties?: Record<string, unknown> };

type BridgeStatus =
  | { state: 'idle' }
  | { state: 'connecting' }
  | { state: 'connected' }
  | { state: 'reconnecting'; attempt: number };

type EventListener = (event: BridgeEvent) => void;
type StatusListener = (status: BridgeStatus) => void;

const MAX_BASE_DELAY = 32000;
type StreamPayload<TData> = {
  data: TData;
  event?: string;
  id?: string;
  retry?: number;
};

export class EventStreamBridge {
  private client: ReturnType<typeof createOpencodeClient>;
  private abortController: AbortController | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private pendingReconnect = false;
  private attempt = 0;
  private running = false;
  private directory: string | undefined;
  private listeners = new Set<EventListener>();
  private statusListeners = new Set<StatusListener>();
  private state: BridgeStatus = { state: 'idle' };

  constructor(private readonly baseUrl: string) {
    this.client = createOpencodeClient({ baseUrl });
  }

  getState(): BridgeStatus {
    return this.state;
  }

  onEvent(listener: EventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  onStatus(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    listener(this.state);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  setDirectory(directory: string | undefined | null) {
    const normalized =
      typeof directory === 'string' && directory.trim().length > 0
        ? directory.trim()
        : undefined;

    if (this.directory === normalized) {
      return;
    }

    this.directory = normalized;
    if (this.running) {
      this.restart();
    }
  }

  start() {
    if (this.running) {
      return;
    }
    this.running = true;
    this.connect();
  }

  restart() {
    if (!this.running) {
      return;
    }
    this.stopCurrentStream();
    this.connect();
  }

  stop() {
    this.running = false;
    this.pendingReconnect = false;
    this.stopCurrentStream();
    this.updateState({ state: 'idle' });
  }

  private updateState(status: BridgeStatus) {
    this.state = status;
    this.statusListeners.forEach((listener) => listener(status));
  }

  private stopCurrentStream() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  private async connect() {
    if (!this.running) {
      return;
    }

    this.pendingReconnect = false;
    this.stopCurrentStream();
    this.abortController = new AbortController();
    this.updateState({ state: 'connecting' });

    try {
      const result = await this.client.event.subscribe({
        query: this.directory ? { directory: this.directory } : undefined,
        sseMaxRetryAttempts: 2,
        sseDefaultRetryDelay: 500,
        sseMaxRetryDelay: 8000,
        onSseEvent: (event: StreamPayload<unknown>) => {
          if (this.abortController?.signal.aborted) {
            return;
          }
          const payload = event.data;
          if (payload && typeof payload === 'object') {
            this.emitEvent(payload as Event);
          }
        },
        onSseError: (error: unknown) => {
          if (this.abortController?.signal.aborted || !this.running) {
            return;
          }
          console.warn('[Desktop] Event stream error:', error);
          this.scheduleReconnect();
        },
      });

      if (!this.running || this.abortController.signal.aborted) {
        return;
      }

      this.attempt = 0;
      this.updateState({ state: 'connected' });

      for await (const _ of result.stream) {
        if (!this.running || this.abortController?.signal.aborted) {
          return;
        }
        void _;
      }

      if (!this.running || this.abortController?.signal.aborted) {
        return;
      }

      this.scheduleReconnect();
    } catch (error) {
      if (this.abortController?.signal.aborted || !this.running) {
        return;
      }
      console.error('[Desktop] Failed to open event stream:', error);
      this.scheduleReconnect();
    }
  }

  private emitEvent(event: Event) {
    const payload: BridgeEvent = {
      type: event.type ?? '',
      properties:
        typeof event.properties === 'object' && event.properties !== null
          ? (event.properties as Record<string, unknown>)
          : undefined,
    };

    this.listeners.forEach((listener) => {
      try {
        listener(payload);
      } catch (error) {
        console.warn('[Desktop] Event listener failed:', error);
      }
    });
  }

  private scheduleReconnect() {
    if (!this.running || this.pendingReconnect) {
      return;
    }

    this.pendingReconnect = true;
    this.stopCurrentStream();

    this.attempt += 1;
    const baseDelay =
      this.attempt <= 3
        ? Math.min(1000 * Math.pow(2, this.attempt - 1), 8000)
        : Math.min(2000 * Math.pow(2, this.attempt - 3), MAX_BASE_DELAY);
    const jitter = Math.floor(Math.random() * 250);
    const delay = baseDelay + jitter;

    this.updateState({ state: 'reconnecting', attempt: this.attempt });

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }
}
