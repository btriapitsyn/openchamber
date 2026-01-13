import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { Preferences } from '@capacitor/preferences';

export interface RemoteConnection {
  url: string;
  token?: string;
  connectedAt: number;
  label?: string;
}

interface RemoteConnectionState {
  // Current connection
  currentConnection: RemoteConnection | null;
  isConnecting: boolean;
  connectionError: string | null;
  
  // Connection history
  recentConnections: RemoteConnection[];
  
  // Actions
  connect: (url: string, token?: string) => Promise<boolean>;
  disconnect: () => void;
  setConnectionError: (error: string | null) => void;
  clearHistory: () => void;
}

// Custom storage adapter for Capacitor Preferences
const capacitorStorage = {
  getItem: async (name: string): Promise<string | null> => {
    const { value } = await Preferences.get({ key: name });
    return value;
  },
  setItem: async (name: string, value: string): Promise<void> => {
    await Preferences.set({ key: name, value });
  },
  removeItem: async (name: string): Promise<void> => {
    await Preferences.remove({ key: name });
  },
};

export const useRemoteConnectionStore = create<RemoteConnectionState>()(
  persist(
    (set, get) => ({
      currentConnection: null,
      isConnecting: false,
      connectionError: null,
      recentConnections: [],
      
      connect: async (url: string, token?: string) => {
        set({ isConnecting: true, connectionError: null });
        
        try {
          // Normalize URL
          let normalizedUrl = url.trim();
          if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
            normalizedUrl = `https://${normalizedUrl}`;
          }
          // Remove trailing slashes
          normalizedUrl = normalizedUrl.replace(/\/+$/, '');
          
          // Extract token from URL if present
          let extractedToken = token;
          try {
            const urlObj = new URL(normalizedUrl);
            const urlToken = urlObj.searchParams.get('token');
            if (urlToken) {
              extractedToken = urlToken;
              // Remove token from URL for storage
              urlObj.searchParams.delete('token');
              normalizedUrl = urlObj.toString().replace(/\/+$/, '');
            }
          } catch {
            // Invalid URL, will fail health check
          }
          
          // Test connection with health check
          const healthUrl = `${normalizedUrl}/health`;
          const response = await fetch(healthUrl, {
            method: 'GET',
            headers: extractedToken ? { 'Authorization': `Bearer ${extractedToken}` } : {},
          });
          
          if (!response.ok) {
            throw new Error(`Server returned ${response.status}`);
          }
          
          const healthData = await response.json();
          if (healthData.isOpenCodeReady === false) {
            throw new Error('OpenCode server is not ready');
          }
          
          const connection: RemoteConnection = {
            url: normalizedUrl,
            token: extractedToken,
            connectedAt: Date.now(),
            label: new URL(normalizedUrl).hostname,
          };
          
          // Add to recent connections (avoid duplicates)
          const { recentConnections } = get();
          const filteredRecent = recentConnections.filter(c => c.url !== normalizedUrl);
          const newRecent = [connection, ...filteredRecent].slice(0, 10);
          
          set({
            currentConnection: connection,
            isConnecting: false,
            recentConnections: newRecent,
          });
          
          return true;
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Connection failed';
          set({ isConnecting: false, connectionError: message });
          return false;
        }
      },
      
      disconnect: () => {
        set({ currentConnection: null, connectionError: null });
      },
      
      setConnectionError: (error) => {
        set({ connectionError: error });
      },
      
      clearHistory: () => {
        set({ recentConnections: [] });
      },
    }),
    {
      name: 'openchamber-remote-connection',
      storage: createJSONStorage(() => capacitorStorage),
      partialize: (state) => ({
        recentConnections: state.recentConnections,
      }),
    }
  )
);
