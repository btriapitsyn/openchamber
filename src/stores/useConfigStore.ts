import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";
import type { Provider, Agent } from "@opencode-ai/sdk";
import { opencodeClient } from "@/lib/opencode/client";

interface ConfigStore {
    // State
    providers: Provider[];
    agents: Agent[];
    currentProviderId: string;
    currentModelId: string;
    currentAgentName: string | undefined;
    agentModelSelections: { [agentName: string]: { providerId: string; modelId: string } };
    defaultProviders: { [key: string]: string };
    isConnected: boolean;
    isInitialized: boolean;

    // Actions
    loadProviders: () => Promise<void>;
    loadAgents: () => Promise<void>;
    setProvider: (providerId: string) => void;
    setModel: (modelId: string) => void;
    setAgent: (agentName: string | undefined) => void;
    saveAgentModelSelection: (agentName: string, providerId: string, modelId: string) => void;
    getAgentModelSelection: (agentName: string) => { providerId: string; modelId: string } | null;
    checkConnection: () => Promise<boolean>;
    initializeApp: () => Promise<void>;
    getCurrentProvider: () => Provider | undefined;
    getCurrentModel: () => any | undefined;
    getCurrentAgent: () => Agent | undefined;
}

export const useConfigStore = create<ConfigStore>()(
    devtools(
        persist(
            (set, get) => ({
                // Initial State
                providers: [],
                agents: [],
                currentProviderId: "",
                currentModelId: "",
                currentAgentName: undefined,
                agentModelSelections: {},
                defaultProviders: {},
                isConnected: false,
                isInitialized: false,

                // Load providers from server
                loadProviders: async () => {
                    try {
                        const { providers, default: defaults } = await opencodeClient.getProviders();

                        // Convert models object to array for each provider
                        const processedProviders = providers.map((provider: any) => ({
                            ...provider,
                            models: provider.models
                                ? Object.values(provider.models) // Convert object to array
                                : [],
                        }));

                        // Set default provider and model from API or first available, never hardcoded
                        const defaultProviderId = defaults.provider || processedProviders[0]?.id || "";
                        const provider = processedProviders.find((p: any) => p.id === defaultProviderId);
                        const defaultModelId = defaults.model || provider?.models?.[0]?.id || "";

                        set((state) => ({
                            providers: processedProviders,
                            defaultProviders: defaults,
                            currentProviderId: state.currentProviderId || defaultProviderId,
                            currentModelId: state.currentModelId || defaultModelId,
                        }));
                    } catch (error) {
                        console.error("Failed to load providers:", error);
                    }
                },

                // Set current provider
                setProvider: (providerId: string) => {
                    const { providers } = get();
                    const provider = providers.find((p) => p.id === providerId);

                    if (provider) {
                        // Set first model of the new provider as default
                        const firstModel = provider.models?.[0];
                        const newModelId = firstModel?.id || "";

                        set({
                            currentProviderId: providerId,
                            currentModelId: newModelId,
                        });
                    }
                },

                // Set current model
                setModel: (modelId: string) => {
                    const { currentProviderId } = get();
                    set({ currentModelId: modelId });
                },

                // Save custom model selection for an agent
                saveAgentModelSelection: (agentName: string, providerId: string, modelId: string) => {
                    set((state) => ({
                        agentModelSelections: {
                            ...state.agentModelSelections,
                            [agentName]: { providerId, modelId },
                        },
                    }));
                },

                // Get saved model selection for an agent
                getAgentModelSelection: (agentName: string) => {
                    const { agentModelSelections } = get();
                    return agentModelSelections[agentName] || null;
                },

                // Load agents from server
                loadAgents: async () => {
                    try {
                        const agents = await opencodeClient.listAgents();
                        set({ agents });

                        // Auto-select default agent if none is currently selected
                        const { currentAgentName, providers } = get();
                        if (!currentAgentName) {
                            const primaryAgents = agents.filter((agent) => agent.mode === "primary");
                            if (primaryAgents.length > 0) {
                                // Try to find 'build' agent first, otherwise use first primary agent
                                const buildAgent = primaryAgents.find((agent) => agent.name === "build");
                                const defaultAgent = buildAgent || primaryAgents[0];
                                set({ currentAgentName: defaultAgent.name });

                                // Also set the agent's default model if available
                                if (defaultAgent?.model?.providerID && defaultAgent?.model?.modelID) {
                                    const agentProvider = providers.find((p) => p.id === defaultAgent.model!.providerID);
                                    if (agentProvider) {
                                        const agentModel = Array.isArray(agentProvider.models) ? agentProvider.models.find((m: any) => m.id === defaultAgent.model!.modelID) : null;

                                        if (agentModel) {
                                            set({
                                                currentProviderId: defaultAgent.model!.providerID,
                                                currentModelId: defaultAgent.model!.modelID,
                                            });
                                        }
                                    }
                                }
                            }
                        }
                    } catch (error) {
                        console.error("Failed to load agents:", error);
                        set({ agents: [] });
                    }
                },

                // Set current agent
                setAgent: (agentName: string | undefined) => {
                    const { agents, providers } = get();

                    set({ currentAgentName: agentName });

                    // Initialize new WebUI sessions with agent defaults and track agent context
                    if (agentName && typeof window !== "undefined") {
                        // Get session store to check if current session needs initialization
                        const sessionStore = (window as any).__zustand_session_store__;
                        if (sessionStore) {
                            const sessionState = sessionStore.getState();
                            const { currentSessionId, isWebUICreatedSession, initializeNewWebUISession, getAgentModelForSession } = sessionState;

                            // Track current agent context for all sessions
                            if (currentSessionId) {
                                // Update agent context using the store's set method
                                sessionStore.setState((state: any) => {
                                    const newAgentContext = new Map(state.currentAgentContext);
                                    newAgentContext.set(currentSessionId, agentName);
                                    return { currentAgentContext: newAgentContext };
                                });
                            }

                            // Only initialize if this is a WebUI-created session and agent doesn't have a saved model yet
                            if (currentSessionId && isWebUICreatedSession(currentSessionId)) {
                                const existingAgentModel = getAgentModelForSession(currentSessionId, agentName);
                                if (!existingAgentModel) {
                                    // Initialize session with current agents list
                                    initializeNewWebUISession(currentSessionId, agents);
                                }
                            }
                        }
                    }

                    // Only set agent's default model if no session-specific model exists
                    // Check session store for existing agent-specific models first
                    if (agentName && typeof window !== "undefined") {
                        const sessionStore = (window as any).__zustand_session_store__;
                        if (sessionStore) {
                            const { currentSessionId, getAgentModelForSession } = sessionStore.getState();

                            // If there's a session-specific model for this agent, don't override with defaults
                            if (currentSessionId) {
                                const existingAgentModel = getAgentModelForSession(currentSessionId, agentName);

                                if (existingAgentModel) {
                                    // Agent already has a session-specific model, don't override
                                    return;
                                }
                            }
                        }
                        // No session-specific model found, apply agent defaults
                        const agent = agents.find((a: any) => a.name === agentName);
                        if (agent?.model?.providerID && agent?.model?.modelID) {
                            const agentProvider = providers.find((p: any) => p.id === agent.model!.providerID);
                            if (agentProvider) {
                                const agentModel = Array.isArray(agentProvider.models) ? agentProvider.models.find((m: any) => m.id === agent.model!.modelID) : null;

                                if (agentModel) {
                                    set({
                                        currentProviderId: agent.model!.providerID,
                                        currentModelId: agent.model!.modelID,
                                    });
                                }
                            }
                        }
                    }
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
                        console.log("Starting app initialization...");
                        // Check connection first
                        const isConnected = await get().checkConnection();
                        console.log("Connection check result:", isConnected);

                        if (!isConnected) {
                            console.log("Server not connected");
                            set({ isConnected: false });
                            return;
                        }

                        // Initialize the app
                        console.log("Initializing app...");
                        await opencodeClient.initApp();

                        // Load providers
                        console.log("Loading providers...");
                        await get().loadProviders();

                        // Load agents
                        console.log("Loading agents...");
                        await get().loadAgents();

                        set({ isInitialized: true, isConnected: true });
                        console.log("App initialized successfully");
                    } catch (error) {
                        console.error("Failed to initialize app:", error);
                        set({ isInitialized: false, isConnected: false });
                    }
                },

                // Get current provider object
                getCurrentProvider: () => {
                    const { providers, currentProviderId } = get();
                    return providers.find((p) => p.id === currentProviderId);
                },

                 // Get current model object
                 getCurrentModel: () => {
                     const provider = get().getCurrentProvider();
                     const { currentModelId } = get();
                     const models = provider?.models;
                     if (!Array.isArray(models)) return undefined;
                     return models.find((m: any) => m.id === currentModelId);
                 },

                // Get current agent object
                getCurrentAgent: () => {
                    const { agents, currentAgentName } = get();
                    if (!currentAgentName) return undefined;
                    return agents.find((a) => a.name === currentAgentName);
                },
            }),
            {
                name: "config-store",
                partialize: (state) => ({
                    currentProviderId: state.currentProviderId,
                    currentModelId: state.currentModelId,
                    currentAgentName: state.currentAgentName,
                    // Removed agentModelSelections - now using session-specific persistence
                }),
            },
        ),
        {
            name: "config-store",
        },
    ),
);
