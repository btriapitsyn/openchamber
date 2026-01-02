

import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

interface PendingCallback {
  id: string;
  timestamp: number;
  type: 'invoke' | 'listen';
  cleanup?: () => void;
  timeout?: NodeJS.Timeout;
  timeoutMs?: number;
}

interface CallbackManagerConfig {
  maxCallbackAge?: number;
  cleanupInterval?: number;
  invokeTimeout?: number;
  listenTimeout?: number;
}

class TauriCallbackManager {
  private callbacks = new Map<string, PendingCallback>();
  private isShuttingDown = false;
  private cleanupTimer?: NodeJS.Timeout;
  private config: Required<CallbackManagerConfig>;
  private windowUnloadHandler?: () => void;

  constructor(config: CallbackManagerConfig = {}) {
    this.config = {
      maxCallbackAge: 30000,
      cleanupInterval: 5000,
      invokeTimeout: 10000,
      listenTimeout: 30000,
      ...config,
    };

    this.setupWindowUnloadHandler();
    this.startCleanupTimer();
  }

  register(callback: Omit<PendingCallback, 'timestamp'>): string {
    if (this.isShuttingDown) {
      console.warn('[TauriCallbackManager] Attempted to register callback during shutdown');
      return callback.id;
    }

    const fullCallback: PendingCallback = {
      ...callback,
      timestamp: Date.now(),
    };

    this.callbacks.set(callback.id, fullCallback);

    const timeoutMs =
      typeof fullCallback.timeoutMs === 'number'
        ? fullCallback.timeoutMs
        : callback.type === 'listen'
          ? this.config.listenTimeout
          : 0;

    if (timeoutMs > 0) {
      const timeout = setTimeout(() => {
        this.cleanupCallback(callback.id, 'timeout');
      }, timeoutMs);
      fullCallback.timeout = timeout;
    }

    return callback.id;
  }

  unregister(callbackId: string): void {
    const callback = this.callbacks.get(callbackId);
    if (!callback) {
      return;
    }

    if (callback.timeout) {
      clearTimeout(callback.timeout);
    }

    if (callback.cleanup) {
      try {
        callback.cleanup();
      } catch (error) {
        console.warn('[TauriCallbackManager] Cleanup function failed:', error);
      }
    }

    this.callbacks.delete(callbackId);
  }

  private cleanupCallback(callbackId: string, reason: 'timeout' | 'shutdown' | 'expired'): void {
    const callback = this.callbacks.get(callbackId);
    if (!callback) {
      return;
    }

    if (reason === 'expired') {
      console.warn(`[TauriCallbackManager] Callback ${callbackId} expired and was cleaned up`);
    }

    this.unregister(callbackId);
  }

  cleanupAll(): void {
    this.isShuttingDown = true;

    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }

    const callbackIds = Array.from(this.callbacks.keys());
    callbackIds.forEach(id => this.cleanupCallback(id, 'shutdown'));

    this.callbacks.clear();
  }

  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      if (this.isShuttingDown) {
        return;
      }

      const now = Date.now();
      const expiredCallbacks: string[] = [];

      this.callbacks.forEach((callback, id) => {
        if (callback.type !== 'invoke') {
          return;
        }
        const age = now - callback.timestamp;
        if (age > this.config.maxCallbackAge) {
          expiredCallbacks.push(id);
        }
      });

      expiredCallbacks.forEach(id => this.cleanupCallback(id, 'expired'));
    }, this.config.cleanupInterval);
  }

  private setupWindowUnloadHandler(): void {
    if (typeof window === 'undefined') {
      return;
    }

    this.windowUnloadHandler = () => {
      console.info('[TauriCallbackManager] Window unloading, cleaning up callbacks...');
      this.cleanupAll();
    };

    window.addEventListener('beforeunload', this.windowUnloadHandler);
    window.addEventListener('pagehide', this.windowUnloadHandler);
  }

  removeWindowHandlers(): void {
    if (this.windowUnloadHandler && typeof window !== 'undefined') {
      window.removeEventListener('beforeunload', this.windowUnloadHandler);
      window.removeEventListener('pagehide', this.windowUnloadHandler);
      this.windowUnloadHandler = undefined;
    }
  }

  getStats(): { total: number; invoke: number; listen: number } {
    const stats = { total: 0, invoke: 0, listen: 0 };

    this.callbacks.forEach(callback => {
      stats.total++;
      stats[callback.type]++;
    });

    return stats;
  }
}

let globalCallbackManager: TauriCallbackManager | null = null;

export function getTauriCallbackManager(config?: CallbackManagerConfig): TauriCallbackManager {
  if (!globalCallbackManager) {
    globalCallbackManager = new TauriCallbackManager(config);
  }
  return globalCallbackManager;
}

export async function safeInvoke<T>(
  command: string,
  args?: Record<string, unknown>,
  options?: {
    timeout?: number;
    onCancel?: () => void;
  }
): Promise<T> {
  const manager = getTauriCallbackManager();
  const callbackId = `invoke:${command}:${Date.now()}:${Math.random().toString(36).slice(2)}`;

  let timeoutHandle: NodeJS.Timeout | undefined;
  let settled = false;

  manager.register({
    id: callbackId,
    type: 'invoke',
  });

  const clearAndUnregister = () => {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
      timeoutHandle = undefined;
    }
    manager.unregister(callbackId);
  };

  if (!options?.timeout || options.timeout <= 0) {
    try {
      const result = await invoke<T>(command, args);
      clearAndUnregister();
      return result;
    } catch (error) {
      clearAndUnregister();
      throw error;
    }
  }

  return new Promise<T>((resolve, reject) => {
    timeoutHandle = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;

      console.warn(`[safeInvoke] Command ${command} timed out after ${options.timeout}ms`);
      try {
        options.onCancel?.();
      } catch (error) {
        console.warn('[safeInvoke] onCancel handler threw:', error);
      }

      clearAndUnregister();
      reject(new Error(`Command ${command} timed out after ${options.timeout}ms`));
    }, options.timeout);

    invoke<T>(command, args)
      .then((result) => {
        if (settled) {

          return;
        }
        settled = true;
        clearAndUnregister();
        resolve(result);
      })
      .catch((error) => {
        if (settled) {
          return;
        }
        settled = true;
        clearAndUnregister();
        reject(error);
      });
  });
}

export async function safeListen<T>(
  event: string,
  handler: (event: { payload: T }) => void,
  options?: {
    timeout?: number;
    onCancel?: () => void;
  }
): Promise<UnlistenFn> {
  const manager = getTauriCallbackManager();
  const callbackId = `listen:${event}:${Date.now()}:${Math.random().toString(36).slice(2)}`;

  try {
 
    manager.register({
      id: callbackId,
      type: 'listen',
      cleanup: options?.onCancel,
      timeoutMs: options?.timeout,
    });

    const unlisten = await listen<T>(event, (event) => {

      const currentManager = getTauriCallbackManager();
      if (currentManager.getStats().total === 0) {
        return;
      }

      try {
        handler(event);
      } catch (error) {
        console.error(`[safeListen] Handler error for event ${event}:`, error);
      }
    });

    const enhancedUnlisten = () => {
      try {
        unlisten();
      } catch (error) {
        console.warn(`[safeListen] Failed to unlisten from ${event}:`, error);
      }
      manager.unregister(callbackId);
    };

    return enhancedUnlisten;
  } catch (error) {

    manager.unregister(callbackId);
    throw error;
  }
}

export function cleanupAllTauriCallbacks(): void {
  if (globalCallbackManager) {
    globalCallbackManager.cleanupAll();
    globalCallbackManager.removeWindowHandlers();
    globalCallbackManager = null;
  }
}
