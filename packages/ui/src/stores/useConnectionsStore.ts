import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { Connection } from '@/lib/api/types';
import type { DesktopSettings } from '@/lib/desktop';
import { updateDesktopSettings } from '@/lib/persistence';
import { getSafeStorage } from './utils/safeStorage';
import { streamDebugEnabled } from '@/stores/utils/streamDebug';
import { opencodeClient } from '@/lib/opencode/client';

interface ConnectionHealth {
  status: 'connected' | 'disconnected' | 'checking';
  latencyMs?: number;
  lastCheckedAt?: number;
  error?: string;
}

interface ConnectionsStore {
  connections: Connection[];
  activeConnectionId: string;
  connectionHealth: Record<string, ConnectionHealth>;

  addConnection: (connection: Omit<Connection, 'id'>) => Connection | null;
  removeConnection: (id: string) => void;
  updateConnection: (id: string, updates: Partial<Omit<Connection, 'id' | 'type'>>) => void;
  setActiveConnection: (id: string) => void;
  synchronizeFromSettings: (settings: DesktopSettings) => void;
  checkConnectionHealth: (connectionId: string) => Promise<void>;
  startHealthChecks: () => void;
  stopHealthChecks: () => void;
}

const safeStorage = getSafeStorage();
const CONNECTIONS_STORAGE_KEY = 'connections';
const ACTIVE_CONNECTION_STORAGE_KEY = 'activeConnectionId';

const LOCAL_CONNECTION: Connection = {
  id: 'local',
  label: 'Local',
  baseUrl: '/api',
  type: 'local',
};

const createConnectionId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `conn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
};

const sanitizeConnections = (value: unknown): Connection[] => {
  if (!Array.isArray(value)) {
    return [LOCAL_CONNECTION];
  }

  const result: Connection[] = [];
  const seenIds = new Set<string>();

  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const candidate = entry as Record<string, unknown>;

    const id = typeof candidate.id === 'string' ? candidate.id.trim() : '';
    const label = typeof candidate.label === 'string' ? candidate.label.trim() : '';
    const baseUrl = typeof candidate.baseUrl === 'string' ? candidate.baseUrl.trim() : '';
    const type = candidate.type === 'local' || candidate.type === 'remote' ? candidate.type : null;

    if (!id || !label || !baseUrl || !type) continue;
    if (seenIds.has(id)) continue;
    seenIds.add(id);

    result.push({ id, label, baseUrl, type });
  }

  // Ensure local connection always exists
  if (!result.find((conn) => conn.id === 'local')) {
    return [LOCAL_CONNECTION, ...result];
  }

  return result;
};

const readPersistedConnections = (): Connection[] => {
  try {
    const raw = safeStorage.getItem(CONNECTIONS_STORAGE_KEY);
    if (!raw) {
      return [LOCAL_CONNECTION];
    }
    return sanitizeConnections(JSON.parse(raw));
  } catch {
    return [LOCAL_CONNECTION];
  }
};

const readPersistedActiveConnectionId = (): string => {
  try {
    const raw = safeStorage.getItem(ACTIVE_CONNECTION_STORAGE_KEY);
    if (typeof raw === 'string' && raw.trim().length > 0) {
      return raw.trim();
    }
  } catch {
    return 'local';
  }
  return 'local';
};

const cacheConnections = (connections: Connection[], activeConnectionId: string) => {
  try {
    safeStorage.setItem(CONNECTIONS_STORAGE_KEY, JSON.stringify(connections));
  } catch {
    // ignored
  }

  try {
    safeStorage.setItem(ACTIVE_CONNECTION_STORAGE_KEY, activeConnectionId);
  } catch {
    // ignored
  }
};

const persistConnections = (connections: Connection[], activeConnectionId: string) => {
  cacheConnections(connections, activeConnectionId);
  void updateDesktopSettings({ connections, activeConnectionId });
};

const initialConnections = readPersistedConnections();
const rawActiveId = readPersistedActiveConnectionId();
// Ensure active ID exists in connections list, fallback to 'local'
const initialActiveConnectionId = initialConnections.some(conn => conn.id === rawActiveId)
  ? rawActiveId
  : 'local';

let healthCheckIntervalId: ReturnType<typeof setInterval> | null = null;

export const useConnectionsStore = create<ConnectionsStore>()(
  devtools((set, get) => ({
    connections: initialConnections,
    activeConnectionId: initialActiveConnectionId,
    connectionHealth: {},

    addConnection: (connection: Omit<Connection, 'id'>) => {
      const { label, baseUrl, type } = connection;

      if (!label.trim() || !baseUrl.trim()) {
        return null;
      }

      const trimmedLabel = label.trim();
      const trimmedBaseUrl = baseUrl.trim();

      // Check if connection with same baseUrl already exists
      const existing = get().connections.find((conn) => conn.baseUrl === trimmedBaseUrl);
      if (existing) {
        return existing;
      }

      const id = createConnectionId();
      const newConnection: Connection = {
        id,
        label: trimmedLabel,
        baseUrl: trimmedBaseUrl,
        type: type === 'local' ? 'local' : 'remote',
      };

      const nextConnections = [...get().connections, newConnection];
      set({ connections: nextConnections });
      persistConnections(nextConnections, get().activeConnectionId);

      if (streamDebugEnabled()) {
        console.info('[ConnectionsStore] Added connection', newConnection);
      }

      // Check health immediately for remote connections
      if (newConnection.type === 'remote') {
        void get().checkConnectionHealth(id);
      }

      return newConnection;
    },

    removeConnection: (id: string) => {
      // Cannot remove local connection
      if (id === 'local') {
        if (streamDebugEnabled()) {
          console.warn('[ConnectionsStore] Cannot remove local connection');
        }
        return;
      }

      const current = get();
      const target = current.connections.find(conn => conn.id === id);
      if (!target) {
        if (streamDebugEnabled()) {
          console.warn('[ConnectionsStore] Connection not found for removal', id);
        }
        return;
      }

      const nextConnections = current.connections.filter((conn) => conn.id !== id);
      let nextActiveId = current.activeConnectionId;

      // If we're removing the active connection, switch to local
      if (current.activeConnectionId === id) {
        nextActiveId = 'local';
      }

      // Clean up health state
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { [id]: _, ...nextConnectionHealth } = current.connectionHealth;

      set({ connections: nextConnections, activeConnectionId: nextActiveId, connectionHealth: nextConnectionHealth });
      persistConnections(nextConnections, nextActiveId);

      // Clean up cached client resources
      opencodeClient.cleanupConnection(id);

      if (streamDebugEnabled()) {
        console.info('[ConnectionsStore] Removed connection', id);
      }
    },

    updateConnection: (id: string, updates: Partial<Omit<Connection, 'id' | 'type'>>) => {
      const { connections, activeConnectionId } = get();
      const target = connections.find((conn) => conn.id === id);
      if (!target) {
        return;
      }

      // If updating baseUrl, check for duplicates
      if (updates.baseUrl !== undefined) {
        const trimmedUrl = updates.baseUrl.trim();
        const existing = connections.find(
          (conn) => conn.id !== id && conn.baseUrl === trimmedUrl
        );
        if (existing) {
          if (streamDebugEnabled()) {
            console.warn('[ConnectionsStore] Cannot update: baseUrl already exists', trimmedUrl);
          }
          return;
        }
      }

      const nextConnections = connections.map((conn) => {
        if (conn.id !== id) {
          return conn;
        }
        return {
          ...conn,
          ...(updates.label !== undefined ? { label: updates.label.trim() } : {}),
          ...(updates.baseUrl !== undefined ? { baseUrl: updates.baseUrl.trim() } : {}),
        };
      });

      set({ connections: nextConnections });
      persistConnections(nextConnections, activeConnectionId);

      if (streamDebugEnabled()) {
        console.info('[ConnectionsStore] Updated connection', id, updates);
      }
    },

    setActiveConnection: (id: string) => {
      const { connections, activeConnectionId } = get();
      if (activeConnectionId === id) {
        return;
      }

      const target = connections.find((conn) => conn.id === id);
      if (!target) {
        if (streamDebugEnabled()) {
          console.warn('[ConnectionsStore] Connection not found', id);
        }
        return;
      }

      set({ activeConnectionId: id });
      persistConnections(connections, id);

      if (streamDebugEnabled()) {
        console.info('[ConnectionsStore] Set active connection', id);
      }

      // Check health immediately for remote connections
      if (target.type === 'remote') {
        void get().checkConnectionHealth(id);
      }
    },

    synchronizeFromSettings: (settings: DesktopSettings) => {
      const incomingConnections = sanitizeConnections(settings.connections ?? []);
      const incomingActive = typeof settings.activeConnectionId === 'string' && settings.activeConnectionId.trim()
        ? settings.activeConnectionId.trim()
        : 'local';

      const current = get();
      const connectionsChanged = JSON.stringify(current.connections) !== JSON.stringify(incomingConnections);
      const activeChanged = current.activeConnectionId !== incomingActive;

      if (!connectionsChanged && !activeChanged) {
        return;
      }

      set({ connections: incomingConnections, activeConnectionId: incomingActive });
      cacheConnections(incomingConnections, incomingActive);

      if (streamDebugEnabled()) {
        console.info('[ConnectionsStore] Synchronized from settings', {
          connections: incomingConnections.length,
          activeConnectionId: incomingActive,
        });
      }
    },

    checkConnectionHealth: async (connectionId: string) => {
      const { connections, connectionHealth } = get();
      const connection = connections.find((conn) => conn.id === connectionId);
      
      if (!connection) {
        if (streamDebugEnabled()) {
          console.warn('[ConnectionsStore] Connection not found for health check', connectionId);
        }
        return;
      }

      // Local connection is always connected
      if (connection.type === 'local') {
        set({ 
          connectionHealth: {
            ...connectionHealth,
            [connectionId]: {
              status: 'connected',
              lastCheckedAt: Date.now(),
            }
          }
        });
        return;
      }

      // Set checking status
      set({ 
        connectionHealth: {
          ...connectionHealth,
          [connectionId]: {
            status: 'checking',
            lastCheckedAt: Date.now(),
          }
        }
      });

      // Perform health check with timeout
      const startTime = performance.now();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      try {
        const response = await fetch(`${connection.baseUrl}/health`, {
          method: 'GET',
          signal: controller.signal,
        });

        const endTime = performance.now();
        const latencyMs = Math.round(endTime - startTime);

        if (response.ok) {
          set({ 
            connectionHealth: {
              ...get().connectionHealth,
              [connectionId]: {
                status: 'connected',
                latencyMs,
                lastCheckedAt: Date.now(),
              }
            }
          });

          if (streamDebugEnabled()) {
            console.info('[ConnectionsStore] Health check passed', connectionId, `${latencyMs}ms`);
          }
        } else {
          set({ 
            connectionHealth: {
              ...get().connectionHealth,
              [connectionId]: {
                status: 'disconnected',
                lastCheckedAt: Date.now(),
                error: `HTTP ${response.status}`,
              }
            }
          });

          if (streamDebugEnabled()) {
            console.warn('[ConnectionsStore] Health check failed', connectionId, response.status);
          }
        }
      } catch (error) {
        set({ 
          connectionHealth: {
            ...get().connectionHealth,
            [connectionId]: {
              status: 'disconnected',
              lastCheckedAt: Date.now(),
              error: error instanceof Error ? error.message : 'Connection failed',
            }
          }
        });

        if (streamDebugEnabled()) {
          console.warn('[ConnectionsStore] Health check error', connectionId, error);
        }
      } finally {
        clearTimeout(timeoutId);
      }
    },

    startHealthChecks: () => {
      // Clear existing interval
      if (healthCheckIntervalId !== null) {
        clearInterval(healthCheckIntervalId);
      }

      // Check all remote connections immediately
      const { connections } = get();
      const remoteConnections = connections.filter((conn) => conn.type === 'remote');
      
      for (const conn of remoteConnections) {
        void get().checkConnectionHealth(conn.id);
      }

      // Set up interval for future checks
      healthCheckIntervalId = setInterval(() => {
        const { connections } = get();
        const remoteConnections = connections.filter((conn) => conn.type === 'remote');
        
        for (const conn of remoteConnections) {
          void get().checkConnectionHealth(conn.id);
        }
      }, 30000); // 30 seconds

      if (streamDebugEnabled()) {
        console.info('[ConnectionsStore] Health checks started');
      }
    },

    stopHealthChecks: () => {
      if (healthCheckIntervalId !== null) {
        clearInterval(healthCheckIntervalId);
        healthCheckIntervalId = null;
        
        if (streamDebugEnabled()) {
          console.info('[ConnectionsStore] Health checks stopped');
        }
      }
    },
  }), { name: 'connections-store' })
);

if (typeof window !== 'undefined') {
  window.addEventListener('openchamber:settings-synced', (event: Event) => {
    const detail = (event as CustomEvent<DesktopSettings>).detail;
    if (detail && typeof detail === 'object') {
      useConnectionsStore.getState().synchronizeFromSettings(detail);
    }
  });

  // Clean up health check interval when page unloads
  window.addEventListener('beforeunload', () => {
    useConnectionsStore.getState().stopHealthChecks();
  });
}
