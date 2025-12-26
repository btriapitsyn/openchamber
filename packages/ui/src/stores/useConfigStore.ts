import { create } from "zustand";
import type { StoreApi, UseBoundStore } from "zustand";
import { devtools, persist, createJSONStorage } from "zustand/middleware";
import type { Provider, Agent } from "@opencode-ai/sdk";
import { opencodeClient } from "@/lib/opencode/client";
import { scopeMatches, subscribeToConfigChanges } from "@/lib/configSync";
import type { ModelMetadata } from "@/types";
import { getSafeStorage } from "./utils/safeStorage";
import type { SessionStore } from "./types/sessionTypes";
import { filterVisibleAgents } from "./useAgentsStore";
import { isDesktopRuntime, getDesktopSettings } from "@/lib/desktop";
import { getRegisteredRuntimeAPIs } from "@/contexts/runtimeAPIRegistry";
import { updateDesktopSettings } from "@/lib/persistence";

const MODELS_DEV_API_URL = "https://models.dev/api.json";
const MODELS_DEV_PROXY_URL = "/api/openchamber/models-metadata";

const FALLBACK_PROVIDER_ID = "opencode";
const FALLBACK_MODEL_ID = "big-pickle";

interface OpenChamberDefaults {
    defaultModel?: string;
    defaultAgent?: string;
}

const fetchOpenChamberDefaults = async (): Promise<OpenChamberDefaults> => {
    try {
        // 1. Desktop runtime (Tauri)
        if (isDesktopRuntime()) {
            const settings = await getDesktopSettings();
            return {
                defaultModel: settings?.defaultModel,
                defaultAgent: settings?.defaultAgent,
            };
        }

        // 2. Runtime settings API (VSCode)
        const runtimeSettings = getRegisteredRuntimeAPIs()?.settings;
        if (runtimeSettings) {
            try {
                const result = await runtimeSettings.load();
                const data = result?.settings;
                if (data) {
                    return {
                        defaultModel: typeof data?.defaultModel === 'string' ? data.defaultModel : undefined,
                        defaultAgent: typeof data?.defaultAgent === 'string' ? data.defaultAgent : undefined,
                    };
                }
            } catch {
                // Fall through to fetch
            }
        }

        // 3. Fetch API (Web)
        const response = await fetch('/api/config/settings', {
            method: 'GET',
            headers: { Accept: 'application/json' },
        });
        if (!response.ok) {
            return {};
        }
        const data = await response.json();
        return {
            defaultModel: typeof data?.defaultModel === 'string' ? data.defaultModel : undefined,
            defaultAgent: typeof data?.defaultAgent === 'string' ? data.defaultAgent : undefined,
        };
    } catch {
        return {};
    }
};

const parseModelString = (modelString: string): { providerId: string; modelId: string } | null => {
    if (!modelString || typeof modelString !== 'string') {
        return null;
    }
    const parts = modelString.split('/');
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
        return null;
    }
    return { providerId: parts[0], modelId: parts[1] };
};

const normalizeProviderId = (value: string) => value?.toLowerCase?.() ?? '';

const isPrimaryMode = (mode?: string) => mode === "primary" || mode === "all" || mode === undefined || mode === null;

type ProviderModel = Provider["models"][string];
type ProviderWithModelList = Omit<Provider, "models"> & { models: ProviderModel[] };

interface ModelsDevModelEntry {
    id?: string;
    name?: string;
    tool_call?: boolean;
    reasoning?: boolean;
    temperature?: boolean;
    attachment?: boolean;
    modalities?: {
        input?: string[];
        output?: string[];
    };
    cost?: {
        input?: number;
        output?: number;
        cache_read?: number;
        cache_write?: number;
    };
    limit?: {
        context?: number;
        output?: number;
    };
    knowledge?: string;
    release_date?: string;
    last_updated?: string;
}

interface ModelsDevProviderEntry {
    id?: string;
    models?: Record<string, ModelsDevModelEntry | undefined>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null;

const isStringArray = (value: unknown): value is string[] =>
    Array.isArray(value) && value.every((item) => typeof item === "string");

const isModelsDevModelEntry = (value: unknown): value is ModelsDevModelEntry => {
    if (!isRecord(value)) {
        return false;
    }
    const candidate = value as ModelsDevModelEntry;
    if (candidate.modalities) {
        const { input, output } = candidate.modalities;
        if (input && !isStringArray(input)) {
            return false;
        }
        if (output && !isStringArray(output)) {
            return false;
        }
    }
    return true;
};

const isModelsDevProviderEntry = (value: unknown): value is ModelsDevProviderEntry => {
    if (!isRecord(value)) {
        return false;
    }
    const candidate = value as ModelsDevProviderEntry;
    return candidate.models === undefined || isRecord(candidate.models);
};

const buildModelMetadataKey = (providerId: string, modelId: string) => {
    const normalizedProvider = normalizeProviderId(providerId);
    if (!normalizedProvider || !modelId) {
        return '';
    }
    return `${normalizedProvider}/${modelId}`;
};

const transformModelsDevResponse = (payload: unknown): Map<string, ModelMetadata> => {
    const metadataMap = new Map<string, ModelMetadata>();

    if (!isRecord(payload)) {
        return metadataMap;
    }

    for (const [providerKey, providerValue] of Object.entries(payload)) {
        if (!isModelsDevProviderEntry(providerValue)) {
            continue;
        }

        const providerId = typeof providerValue.id === 'string' && providerValue.id.length > 0 ? providerValue.id : providerKey;
        const models = providerValue.models;
        if (!models || !isRecord(models)) {
            continue;
        }

        for (const [modelKey, modelValue] of Object.entries(models)) {
            if (!isModelsDevModelEntry(modelValue)) {
                continue;
            }

            const resolvedModelId =
                typeof modelKey === 'string' && modelKey.length > 0
                    ? modelKey
                    : modelValue.id;

            if (!resolvedModelId || typeof resolvedModelId !== 'string' || resolvedModelId.length === 0) {
                continue;
            }

            const metadata: ModelMetadata = {
                id: typeof modelValue.id === 'string' && modelValue.id.length > 0 ? modelValue.id : resolvedModelId,
                providerId,
                name: typeof modelValue.name === 'string' ? modelValue.name : undefined,
                tool_call: typeof modelValue.tool_call === 'boolean' ? modelValue.tool_call : undefined,
                reasoning: typeof modelValue.reasoning === 'boolean' ? modelValue.reasoning : undefined,
                temperature: typeof modelValue.temperature === 'boolean' ? modelValue.temperature : undefined,
                attachment: typeof modelValue.attachment === 'boolean' ? modelValue.attachment : undefined,
                modalities: modelValue.modalities
                    ? {
                          input: isStringArray(modelValue.modalities.input) ? modelValue.modalities.input : undefined,
                          output: isStringArray(modelValue.modalities.output) ? modelValue.modalities.output : undefined,
                      }
                    : undefined,
                cost: modelValue.cost,
                limit: modelValue.limit,
                knowledge: typeof modelValue.knowledge === 'string' ? modelValue.knowledge : undefined,
                release_date: typeof modelValue.release_date === 'string' ? modelValue.release_date : undefined,
                last_updated: typeof modelValue.last_updated === 'string' ? modelValue.last_updated : undefined,
            };

            const key = buildModelMetadataKey(providerId, resolvedModelId);
            if (key) {
                metadataMap.set(key, metadata);
            }
        }
    }

    return metadataMap;
};

const fetchModelsDevMetadata = async (): Promise<Map<string, ModelMetadata>> => {
    if (typeof fetch !== 'function') {
        return new Map();
    }

    const sources = [MODELS_DEV_PROXY_URL, MODELS_DEV_API_URL];

    for (const source of sources) {
        const controller = typeof AbortController !== 'undefined' ? new AbortController() : undefined;
        const timeout = controller ? setTimeout(() => controller.abort(), 8000) : undefined;

        try {
            const isAbsoluteUrl = /^https?:\/\//i.test(source);
            const requestInit: RequestInit = {
                signal: controller?.signal,
                headers: {
                    Accept: 'application/json',
                },
                cache: 'no-store',
            };

            if (isAbsoluteUrl) {
                requestInit.mode = 'cors';
            } else {
                requestInit.credentials = 'same-origin';
            }

            const response = await fetch(source, requestInit);

            if (!response.ok) {
                throw new Error(`Metadata request to ${source} returned status ${response.status}`);
            }

            const data = await response.json();
            return transformModelsDevResponse(data);
        } catch (error: unknown) {
            if ((error as Error)?.name === 'AbortError') {
                console.warn(`Model metadata request aborted (${source})`);
            } else {
                console.warn(`Failed to fetch model metadata from ${source}:`, error);
            }
        } finally {
            if (timeout) {
                clearTimeout(timeout);
            }
        }
    }

    return new Map();
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface ConfigStore {

    providers: ProviderWithModelList[];
    agents: Agent[];
    currentProviderId: string;
    currentModelId: string;
    currentAgentName: string | undefined;
    selectedProviderId: string;
    agentModelSelections: { [agentName: string]: { providerId: string; modelId: string } };
    defaultProviders: { [key: string]: string };
    isConnected: boolean;
    isInitialized: boolean;
    modelsMetadata: Map<string, ModelMetadata>;
    // OpenChamber settings-based defaults (take precedence over agent preferences)
    settingsDefaultModel: string | undefined; // format: "provider/model"
    settingsDefaultAgent: string | undefined;

    loadProviders: () => Promise<void>;
    loadAgents: () => Promise<boolean>;
    setProvider: (providerId: string) => void;
    setModel: (modelId: string) => void;
    setAgent: (agentName: string | undefined) => void;
    setSelectedProvider: (providerId: string) => void;
    setSettingsDefaultModel: (model: string | undefined) => void;
    setSettingsDefaultAgent: (agent: string | undefined) => void;
    saveAgentModelSelection: (agentName: string, providerId: string, modelId: string) => void;
    getAgentModelSelection: (agentName: string) => { providerId: string; modelId: string } | null;
    checkConnection: () => Promise<boolean>;
    initializeApp: () => Promise<void>;
    getCurrentProvider: () => ProviderWithModelList | undefined;
    getCurrentModel: () => ProviderModel | undefined;
    getCurrentAgent: () => Agent | undefined;
    getModelMetadata: (providerId: string, modelId: string) => ModelMetadata | undefined;
    // Returns only visible agents (excludes hidden internal agents like title, compaction, summary)
    getVisibleAgents: () => Agent[];
}

declare global {
    interface Window {
        __zustand_config_store__?: UseBoundStore<StoreApi<ConfigStore>>;
        __zustand_session_store__?: UseBoundStore<StoreApi<SessionStore>>;
    }
}

export const useConfigStore = create<ConfigStore>()(
    devtools(
        persist(
            (set, get) => ({

                providers: [],
                agents: [],
                currentProviderId: "",
                currentModelId: "",
                currentAgentName: undefined,
                selectedProviderId: "",
                agentModelSelections: {},
                defaultProviders: {},
                isConnected: false,
                isInitialized: false,
                modelsMetadata: new Map<string, ModelMetadata>(),
                settingsDefaultModel: undefined,
                settingsDefaultAgent: undefined,

                loadProviders: async () => {
                    const previousProviders = get().providers;
                    const previousDefaults = get().defaultProviders;
                    let lastError: unknown = null;

                    for (let attempt = 0; attempt < 3; attempt++) {
                        try {
                            const metadataPromise = fetchModelsDevMetadata();
                            const apiResult = await opencodeClient.getProviders();
                            const providers = Array.isArray(apiResult?.providers) ? apiResult.providers : [];
                            const defaults = apiResult?.default || {};

                            const processedProviders: ProviderWithModelList[] = providers.map((provider) => {
                                const modelRecord = provider.models ?? {};
                                const models: ProviderModel[] = Object.keys(modelRecord).map((modelId) => modelRecord[modelId]);
                                return {
                                    ...provider,
                                    models,
                                };
                            });

                            // Only store providers and defaults - model/agent selection handled in loadAgents
                            set({
                                providers: processedProviders,
                                defaultProviders: defaults,
                            });

                            const metadata = await metadataPromise;
                            if (metadata.size > 0) {
                                set({ modelsMetadata: metadata });
                            }
                            return;
                        } catch (error) {
                            lastError = error;
                            const waitMs = 200 * (attempt + 1);
                            await new Promise((resolve) => setTimeout(resolve, waitMs));
                        }
                    }

                    console.error("Failed to load providers:", lastError);
                    // Preserve previous state on failure instead of clearing it
                    set({
                        providers: previousProviders,
                        defaultProviders: previousDefaults,
                    });
                },

                setProvider: (providerId: string) => {
                    const { providers } = get();
                    const provider = providers.find((p) => p.id === providerId);

                    if (provider) {

                        const firstModel = provider.models[0];
                        const newModelId = firstModel?.id || "";

                        set({
                            currentProviderId: providerId,
                            currentModelId: newModelId,
                            selectedProviderId: providerId,
                        });
                    }
                },

                setModel: (modelId: string) => {
                    set({ currentModelId: modelId });
                },

                setSelectedProvider: (providerId: string) => {
                    set({ selectedProviderId: providerId });
                },

                saveAgentModelSelection: (agentName: string, providerId: string, modelId: string) => {
                    set((state) => ({
                        agentModelSelections: {
                            ...state.agentModelSelections,
                            [agentName]: { providerId, modelId },
                        },
                    }));
                },

                getAgentModelSelection: (agentName: string) => {
                    const { agentModelSelections } = get();
                    return agentModelSelections[agentName] || null;
                },

                loadAgents: async () => {
                    const previousAgents = get().agents;
                    let lastError: unknown = null;

                    for (let attempt = 0; attempt < 3; attempt++) {
                        try {
                            // Fetch agents and OpenChamber settings in parallel
                            const [agents, openChamberDefaults] = await Promise.all([
                                opencodeClient.listAgents(),
                                fetchOpenChamberDefaults(),
                            ]);
                            const safeAgents = Array.isArray(agents) ? agents : [];
                            set({
                                agents: safeAgents,
                                // Store settings defaults so setAgent can respect them
                                settingsDefaultModel: openChamberDefaults.defaultModel,
                                settingsDefaultAgent: openChamberDefaults.defaultAgent,
                            });

                            const { providers } = get();

                            if (safeAgents.length === 0) {
                                set({ currentAgentName: undefined });
                                return true;
                            }

                            // --- Agent Selection ---
                            // Priority: settings.defaultAgent → build → first primary → first agent
                            const primaryAgents = safeAgents.filter((agent) => isPrimaryMode(agent.mode));
                            const buildAgent = primaryAgents.find((agent) => agent.name === "build");
                            const fallbackAgent = buildAgent || primaryAgents[0] || safeAgents[0];

                            let resolvedAgent: Agent | undefined;

                            // Helper to validate model exists in providers
                            const validateModel = (providerId: string, modelId: string): boolean => {
                                const provider = providers.find((p) => p.id === providerId);
                                if (!provider) return false;
                                return provider.models.some((m) => m.id === modelId);
                            };

                            // Track invalid settings to clear
                            const invalidSettings: { defaultModel?: string; defaultAgent?: string } = {};

                            // 1. Check OpenChamber settings for default agent
                            if (openChamberDefaults.defaultAgent) {
                                const settingsAgent = safeAgents.find((agent) => agent.name === openChamberDefaults.defaultAgent);
                                if (settingsAgent) {
                                    resolvedAgent = settingsAgent;
                                } else {
                                    // Agent no longer exists - mark for clearing
                                    invalidSettings.defaultAgent = '';
                                }
                            }

                            // 2. Fall back to default logic
                            if (!resolvedAgent) {
                                resolvedAgent = fallbackAgent;
                            }

                            set({ currentAgentName: resolvedAgent.name });

                            // --- Model Selection ---
                            // Priority: settings.defaultModel → agent's preferred model → opencode/big-pickle
                            let resolvedProviderId: string | undefined;
                            let resolvedModelId: string | undefined;

                            // 1. Check OpenChamber settings for default model
                            if (openChamberDefaults.defaultModel) {
                                const parsed = parseModelString(openChamberDefaults.defaultModel);
                                if (parsed && validateModel(parsed.providerId, parsed.modelId)) {
                                    resolvedProviderId = parsed.providerId;
                                    resolvedModelId = parsed.modelId;
                                } else {
                                    // Model no longer exists - mark for clearing
                                    invalidSettings.defaultModel = '';
                                }
                            }

                            // 2. Fall back to agent's preferred model
                            if (!resolvedProviderId && resolvedAgent?.model?.providerID && resolvedAgent?.model?.modelID) {
                                if (validateModel(resolvedAgent.model.providerID, resolvedAgent.model.modelID)) {
                                    resolvedProviderId = resolvedAgent.model.providerID;
                                    resolvedModelId = resolvedAgent.model.modelID;
                                }
                            }

                            // 3. Fall back to opencode/big-pickle
                            if (!resolvedProviderId) {
                                if (validateModel(FALLBACK_PROVIDER_ID, FALLBACK_MODEL_ID)) {
                                    resolvedProviderId = FALLBACK_PROVIDER_ID;
                                    resolvedModelId = FALLBACK_MODEL_ID;
                                } else {
                                    // Last resort: first provider's first model
                                    const firstProvider = providers[0];
                                    if (firstProvider && firstProvider.models[0]) {
                                        resolvedProviderId = firstProvider.id;
                                        resolvedModelId = firstProvider.models[0].id;
                                    }
                                }
                            }

                            if (resolvedProviderId && resolvedModelId) {
                                set({
                                    currentProviderId: resolvedProviderId,
                                    currentModelId: resolvedModelId,
                                });
                            }

                            // Clear invalid settings from storage (best-effort cleanup)
                            if (Object.keys(invalidSettings).length > 0) {
                                // Also clear from store state
                                set({
                                    settingsDefaultModel: invalidSettings.defaultModel !== undefined ? undefined : get().settingsDefaultModel,
                                    settingsDefaultAgent: invalidSettings.defaultAgent !== undefined ? undefined : get().settingsDefaultAgent,
                                });
                                updateDesktopSettings(invalidSettings).catch(() => {
                                    // Ignore errors - best effort cleanup
                                });
                            }

                            return true;
                        } catch (error) {
                            lastError = error;
                            const waitMs = 200 * (attempt + 1);
                            await new Promise((resolve) => setTimeout(resolve, waitMs));
                        }
                    }

                    console.error("Failed to load agents:", lastError);
                    set({ agents: previousAgents });
                    return false;
                },

                setAgent: (agentName: string | undefined) => {
                    const { agents, providers, settingsDefaultModel } = get();

                    set({ currentAgentName: agentName });

                    if (agentName && typeof window !== "undefined") {

                        const sessionStore = window.__zustand_session_store__;
                        if (sessionStore) {
                            const sessionState = sessionStore.getState();
                            const { currentSessionId, isOpenChamberCreatedSession, initializeNewOpenChamberSession, getAgentModelForSession } = sessionState;

                            if (currentSessionId) {

                                sessionStore.setState((state) => {
                                    const newAgentContext = new Map(state.currentAgentContext);
                                    newAgentContext.set(currentSessionId, agentName);
                                    return { currentAgentContext: newAgentContext };
                                });
                            }

                            if (currentSessionId && isOpenChamberCreatedSession(currentSessionId)) {
                                const existingAgentModel = getAgentModelForSession(currentSessionId, agentName);
                                if (!existingAgentModel) {

                                    initializeNewOpenChamberSession(currentSessionId, agents);
                                }
                            }
                        }
                    }

                    if (agentName && typeof window !== "undefined") {
                        const sessionStore = window.__zustand_session_store__;
                        if (sessionStore) {
                            const { currentSessionId, getAgentModelForSession } = sessionStore.getState();

                            if (currentSessionId) {
                                const existingAgentModel = getAgentModelForSession(currentSessionId, agentName);

                                if (existingAgentModel) {

                                    return;
                                }
                            }
                        }

                        // If settings has a default model, use it instead of agent's preferred
                        if (settingsDefaultModel) {
                            const parsed = parseModelString(settingsDefaultModel);
                            if (parsed) {
                                const settingsProvider = providers.find((p) => p.id === parsed.providerId);
                                if (settingsProvider?.models.some((m) => m.id === parsed.modelId)) {
                                    set({
                                        currentProviderId: parsed.providerId,
                                        currentModelId: parsed.modelId,
                                    });
                                    return;
                                }
                            }
                        }

                        // Fall back to agent's preferred model
                        const agent = agents.find((candidate) => candidate.name === agentName);
                        if (agent?.model?.providerID && agent?.model?.modelID) {
                            const agentProvider = providers.find((provider) => provider.id === agent.model!.providerID);
                            if (agentProvider) {
                                const agentModel = agentProvider.models.find((model) => model.id === agent.model!.modelID);

                                if (agentModel) {
                                    set({
                                        currentProviderId: agent.model!.providerID,
                                        currentModelId: agent.model!.modelID,
                                        selectedProviderId: agent.model!.providerID,
                                    });
                                }
                            }
                        }
                    }
                },

                setSettingsDefaultModel: (model: string | undefined) => {
                    set({ settingsDefaultModel: model });
                },

                setSettingsDefaultAgent: (agent: string | undefined) => {
                    set({ settingsDefaultAgent: agent });
                },

                checkConnection: async () => {
                    const maxAttempts = 5;
                    let attempt = 0;
                    let lastError: unknown = null;

                    while (attempt < maxAttempts) {
                        try {
                            const isHealthy = await opencodeClient.checkHealth();
                            set({ isConnected: isHealthy });
                            return isHealthy;
                        } catch (error) {
                            lastError = error;
                            attempt += 1;
                            const delay = 400 * attempt;
                            await sleep(delay);
                        }
                    }

                    if (lastError) {
                        console.warn("[ConfigStore] Failed to reach OpenCode after retrying:", lastError);
                    }
                    set({ isConnected: false });
                    return false;
                },

                initializeApp: async () => {
                    try {
                        console.log("Starting app initialization...");

                        const isConnected = await get().checkConnection();
                        console.log("Connection check result:", isConnected);

                        if (!isConnected) {
                            console.log("Server not connected");
                            set({ isConnected: false });
                            return;
                        }

                        console.log("Initializing app...");
                        await opencodeClient.initApp();

                        console.log("Loading providers...");
                        await get().loadProviders();

                        console.log("Loading agents...");
                        await get().loadAgents();

                        set({ isInitialized: true, isConnected: true });
                        console.log("App initialized successfully");
                    } catch (error) {
                        console.error("Failed to initialize app:", error);
                        set({ isInitialized: false, isConnected: false });
                    }
                },

                getCurrentProvider: () => {
                    const { providers, currentProviderId } = get();
                    return providers.find((p) => p.id === currentProviderId);
                },

                getCurrentModel: () => {
                    const provider = get().getCurrentProvider();
                    const { currentModelId } = get();
                    if (!provider) {
                        return undefined;
                    }
                    return provider.models.find((model) => model.id === currentModelId);
                },

                getCurrentAgent: () => {
                    const { agents, currentAgentName } = get();
                    if (!currentAgentName) return undefined;
                    return agents.find((a) => a.name === currentAgentName);
                },
                getModelMetadata: (providerId: string, modelId: string) => {
                    const key = buildModelMetadataKey(providerId, modelId);
                    if (!key) {
                        return undefined;
                    }
                    const { modelsMetadata } = get();
                    return modelsMetadata.get(key);
                },
                getVisibleAgents: () => {
                    const { agents } = get();
                    return filterVisibleAgents(agents);
                },
            }),
            {
                name: "config-store",
                storage: createJSONStorage(() => getSafeStorage()),
                partialize: () => ({

                }),
            },
        ),
        {
            name: "config-store",
        },
    ),
);

if (typeof window !== "undefined") {
    window.__zustand_config_store__ = useConfigStore;
}

let unsubscribeConfigStoreChanges: (() => void) | null = null;

if (!unsubscribeConfigStoreChanges) {
    unsubscribeConfigStoreChanges = subscribeToConfigChanges(async (event) => {
        const tasks: Promise<void>[] = [];

        if (scopeMatches(event, "agents")) {
            const { loadAgents } = useConfigStore.getState();
            tasks.push(loadAgents().then(() => {}));
        }

        if (scopeMatches(event, "providers")) {
            const { loadProviders } = useConfigStore.getState();
            tasks.push(loadProviders());
        }

        if (tasks.length > 0) {
            await Promise.all(tasks);
        }
    });
}
