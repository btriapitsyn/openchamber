import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

type EventPayload = {
  type: string;
  properties?: Record<string, unknown>;
};

export type DesktopEventsBridge = {
  subscribe: (
    onMessage: (event: EventPayload) => void,
    onError?: (error: unknown) => void,
    onOpen?: () => void,
    onMessageComplete?: (messageId: string) => void
  ) => () => void;
  setDirectory?: (directory: string | null | undefined) => void;
};

export async function setupDesktopEventsBridge(): Promise<DesktopEventsBridge> {
  const bridge: DesktopEventsBridge = {
    setDirectory(directory: string | null | undefined) {
      const normalized = directory ?? null;
      invoke('opencode_events_set_directory', { directory: normalized }).catch((error) => {
        console.warn('[eventsBridge] Failed to set directory for SSE bridge:', error);
      });
    },
    subscribe(onMessage, onError, onOpen, onMessageComplete) {
      let active = true;
      let eventUnlisten: UnlistenFn | null = null;
      let statusUnlisten: UnlistenFn | null = null;
      let completeUnlisten: UnlistenFn | null = null;

      const cleanup = () => {
        if (eventUnlisten) {
          eventUnlisten();
          eventUnlisten = null;
        }
        if (statusUnlisten) {
          statusUnlisten();
          statusUnlisten = null;
        }
        if (completeUnlisten) {
          completeUnlisten();
          completeUnlisten = null;
        }
        void invoke('opencode_events_unsubscribe').catch((error) => {
          console.warn('[eventsBridge] Failed to unregister subscription:', error);
        });
      };

      (async () => {
        try {
          await invoke('opencode_events_subscribe');

          eventUnlisten = await listen('opencode:event', (event) => {
            if (!active) {
              return;
            }
            onMessage(event.payload as EventPayload);
          });

          statusUnlisten = await listen('opencode:status', (event) => {
            if (!active) return;
            const payload = event.payload as Record<string, unknown> | null;
            const status = payload && typeof payload.status === 'string' ? payload.status : null;
            if (status === 'connected') {
              onOpen?.();
            } else if (status === 'error') {
              onError?.(payload);
            }
          });

          completeUnlisten = await listen('opencode:message-complete', (event) => {
            if (!active) return;
            const payload = event.payload as Record<string, unknown> | null;
            const messageId = payload && typeof payload.messageId === 'string' ? payload.messageId : null;
            if (messageId && onMessageComplete) {
              onMessageComplete(messageId);
            }
          });

          try {
            const snapshot = await invoke<unknown[]>('opencode_events_snapshot');
            if (Array.isArray(snapshot)) {
              snapshot.forEach((payload) => {
                if (active) {
                  onMessage(payload as EventPayload);
                }
              });
            }
          } catch (error) {
            onError?.(error);
          }
        } catch (error) {
          onError?.(error);
        }
      })();

      return () => {
        active = false;
        cleanup();
      };
    },
  };

  if (typeof window !== 'undefined') {
    (window as typeof window & { opencodeDesktopEvents?: DesktopEventsBridge }).opencodeDesktopEvents =
      bridge as DesktopEventsBridge;
  }

  return bridge;
}
