import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import type { Provider } from '@opencode-ai/sdk';
import { opencodeClient } from '@/lib/opencode/client';

interface ConfigStore {
  // State
  providers: Provider[];
  currentProviderId: string;
  currentModelId: string;
  defaultProviders: { [key: string]: string };
  isConnected: boolean;
  isInitialized: boolean;

  // Actions
  loadProviders: () => Promise<void>;
  setProvider: (providerId: string) => void;
  setModel: (modelId: string) => void;
  checkConnection: () => Promise<boolean>;
  initializeApp: () => Promise<void>;
  getCurrentProvider: () => Provider | undefined;
  getCurrentModel: () => any | undefined;
}

export const useConfigStore = create<ConfigStore>()(
  devtools(
    persist(
      (set, get) => ({
        // Initial State
        providers: [],
        currentProviderId: 'anthropic',
        currentModelId: 'claude-3-5-sonnet-20241022',
        defaultProviders: {},
        isConnected: false,
        isInitialized: false,

        // Load providers from server
        loadProviders: async () => {
          try {
            const { providers, default: defaults } = await opencodeClient.getProviders();
            
            // Set default provider and model if not already set
            const defaultProviderId = defaults.provider || providers[0]?.id || 'anthropic';
            const provider = providers.find((p: any) => p.id === defaultProviderId);
            const defaultModelId = defaults.model || provider?.models?.[0]?.id || 'claude-3-5-sonnet-20241022';
            
            set((state) => ({
              providers,
              defaultProviders: defaults,
              currentProviderId: state.currentProviderId || defaultProviderId,
              currentModelId: state.currentModelId || defaultModelId
            }));
          } catch (error) {
            console.error('Failed to load providers:', error);
          }
        },

        // Set current provider
        setProvider: (providerId: string) => {
          const { providers } = get();
          const provider = providers.find(p => p.id === providerId);
          
          if (provider) {
            // Set first model of the new provider as default
            const firstModel = provider.models?.[0];
            set({
              currentProviderId: providerId,
              currentModelId: firstModel?.id || ''
            });
          }
        },

        // Set current model
        setModel: (modelId: string) => {
          set({ currentModelId: modelId });
        },

        // Check server connection
        checkConnection: async () => {
          try {
            const isHealthy = await opencodeClient.checkHealth();
            set({ isConnected: isHealthy });
            return isHealthy;
          } catch {
            set({ isConnected: false });
            return false;
          }
        },

        // Initialize app
        initializeApp: async () => {
          try {
            console.log('Starting app initialization...');
            // Check connection first
            const isConnected = await get().checkConnection();
            console.log('Connection check result:', isConnected);
            
            if (!isConnected) {
              console.log('Server not connected');
              set({ isConnected: false });
              return;
            }

            // Initialize the app
            console.log('Initializing app...');
            await opencodeClient.initApp();
            
            // Load providers
            console.log('Loading providers...');
            await get().loadProviders();
            
            set({ isInitialized: true, isConnected: true });
            console.log('App initialized successfully');
          } catch (error) {
            console.error('Failed to initialize app:', error);
            set({ isInitialized: false, isConnected: false });
          }
        },

        // Get current provider object
        getCurrentProvider: () => {
          const { providers, currentProviderId } = get();
          return providers.find(p => p.id === currentProviderId);
        },

        // Get current model object
        getCurrentModel: () => {
          const provider = get().getCurrentProvider();
          const { currentModelId } = get();
          const models = provider?.models;
          if (!Array.isArray(models)) return undefined;
          return models.find((m: any) => m.id === currentModelId);
        }
      }),
      {
        name: 'config-store',
        partialize: (state) => ({
          currentProviderId: state.currentProviderId,
          currentModelId: state.currentModelId
        })
      }
    ),
    {
      name: 'config-store'
    }
  )
);