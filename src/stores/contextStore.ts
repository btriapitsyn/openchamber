import { create } from "zustand";
import { devtools, persist, createJSONStorage } from "zustand/middleware";
import type { EditPermissionMode } from "./types/sessionTypes";
import { getAgentDefaultEditPermission } from "./utils/permissionUtils";
import { extractTokensFromMessage } from "./utils/tokenUtils";
import { getSafeStorage } from "./utils/safeStorage";

interface ContextUsage {
    totalTokens: number;
    percentage: number;
    contextLimit: number;
    lastMessageId?: string;
}

interface ContextState {
    // Session-specific model/agent persistence
    sessionModelSelections: Map<string, { providerId: string; modelId: string }>; // sessionId -> last model (for backward compat)
    sessionAgentSelections: Map<string, string>; // sessionId -> agentName
    // Agent-specific model selections within sessions
    sessionAgentModelSelections: Map<string, Map<string, { providerId: string; modelId: string }>>; // sessionId -> agentName -> model
    // Track current agent context for each session (for TUI message analysis)
    currentAgentContext: Map<string, string>; // sessionId -> current agent name
    // Store context usage per session (updated only when messages are complete)
    sessionContextUsage: Map<string, ContextUsage>; // sessionId -> context usage
    // Track edit permission overrides per session/agent
    sessionAgentEditModes: Map<string, Map<string, EditPermissionMode>>;
    hasHydrated: boolean;
}

interface ContextActions {
    // Session-specific model/agent persistence
    saveSessionModelSelection: (sessionId: string, providerId: string, modelId: string) => void;
    getSessionModelSelection: (sessionId: string) => { providerId: string; modelId: string } | null;
    saveSessionAgentSelection: (sessionId: string, agentName: string) => void;
    getSessionAgentSelection: (sessionId: string) => string | null;
    // Agent-specific model persistence within sessions
    saveAgentModelForSession: (sessionId: string, agentName: string, providerId: string, modelId: string) => void;
    getAgentModelForSession: (sessionId: string, agentName: string) => { providerId: string; modelId: string } | null;
    // External session analysis with immediate UI update
    analyzeAndSaveExternalSessionChoices: (sessionId: string, agents: any[], messages: Map<string, { info: any; parts: any[] }[]>) => Promise<Map<string, { providerId: string; modelId: string; timestamp: number }>>;
    // Get context usage for current session
    getContextUsage: (sessionId: string, contextLimit: number, messages: Map<string, { info: any; parts: any[] }[]>) => ContextUsage | null;
    // Update stored context usage for a session
    updateSessionContextUsage: (sessionId: string, contextLimit: number, messages: Map<string, { info: any; parts: any[] }[]>) => void;
    // Initialize context usage for a session if not stored or 0
    initializeSessionContextUsage: (sessionId: string, contextLimit: number, messages: Map<string, { info: any; parts: any[] }[]>) => void;
    // Poll for token updates in a message (handles async token population)
    pollForTokenUpdates: (sessionId: string, messageId: string, messages: Map<string, { info: any; parts: any[] }[]>, maxAttempts?: number) => void;
    // Get current agent for session
    getCurrentAgent: (sessionId: string) => string | undefined;
    // Edit permission management
    getSessionAgentEditMode: (sessionId: string, agentName: string | undefined, defaultMode?: EditPermissionMode) => EditPermissionMode;
    toggleSessionAgentEditMode: (sessionId: string, agentName: string | undefined, defaultMode?: EditPermissionMode) => void;
    setSessionAgentEditMode: (sessionId: string, agentName: string | undefined, mode: EditPermissionMode, defaultMode?: EditPermissionMode) => void;
}

type ContextStore = ContextState & ContextActions;

const EDIT_PERMISSION_SEQUENCE: EditPermissionMode[] = ['ask', 'allow', 'full'];

export const useContextStore = create<ContextStore>()(
    devtools(
        persist(
            (set, get) => ({
                // Initial State
                sessionModelSelections: new Map(),
                sessionAgentSelections: new Map(),
                sessionAgentModelSelections: new Map(),
                currentAgentContext: new Map(),
                sessionContextUsage: new Map(),
                sessionAgentEditModes: new Map(),
                hasHydrated: typeof window === "undefined",

                // Session-specific model/agent persistence
                saveSessionModelSelection: (sessionId: string, providerId: string, modelId: string) => {
                    set((state) => {
                        const newSelections = new Map(state.sessionModelSelections);
                        newSelections.set(sessionId, { providerId, modelId });
                        return { sessionModelSelections: newSelections };
                    });
                },

                getSessionModelSelection: (sessionId: string) => {
                    const { sessionModelSelections } = get();
                    return sessionModelSelections.get(sessionId) || null;
                },

                saveSessionAgentSelection: (sessionId: string, agentName: string) => {
                    set((state) => {
                        const newSelections = new Map(state.sessionAgentSelections);
                        newSelections.set(sessionId, agentName);
                        return { sessionAgentSelections: newSelections };
                    });
                },

                getSessionAgentSelection: (sessionId: string) => {
                    const { sessionAgentSelections } = get();
                    return sessionAgentSelections.get(sessionId) || null;
                },

                // Agent-specific model persistence within sessions
                saveAgentModelForSession: (sessionId: string, agentName: string, providerId: string, modelId: string) => {
                    set((state) => {
                        const newSelections = new Map(state.sessionAgentModelSelections);

                        // Get or create the agent map for this session
                        let agentMap = newSelections.get(sessionId);
                        if (!agentMap) {
                            agentMap = new Map();
                        } else {
                            // Clone the existing map to ensure immutability
                            agentMap = new Map(agentMap);
                        }

                        // Set the model for this agent
                        agentMap.set(agentName, { providerId, modelId });

                        // Update the session map
                        newSelections.set(sessionId, agentMap);

                        return { sessionAgentModelSelections: newSelections };
                    });
                },

                getAgentModelForSession: (sessionId: string, agentName: string) => {
                    const { sessionAgentModelSelections } = get();
                    const agentMap = sessionAgentModelSelections.get(sessionId);
                    if (!agentMap) return null;
                    return agentMap.get(agentName) || null;
                },

                // Analyze external session messages and save agent model choices with immediate UI update
                analyzeAndSaveExternalSessionChoices: async (sessionId: string, agents: any[], messages: Map<string, { info: any; parts: any[] }[]>) => {
                    const { saveAgentModelForSession } = get();

                    const agentLastChoices = new Map<
                        string,
                        {
                            providerId: string;
                            modelId: string;
                            timestamp: number;
                        }
                    >();

                    // Enhanced agent inference with multiple fallback strategies
                    const extractAgentFromMessage = (messageInfo: any, messageIndex: number): string | null => {
                        // Strategy 1: Check if message has mode field with agent name
                        if ("mode" in messageInfo && messageInfo.mode && typeof messageInfo.mode === "string") {
                            const modeAgent = agents.find((a) => a.name === messageInfo.mode);
                            if (modeAgent) {
                                return messageInfo.mode;
                            }
                        }

                        // Strategy 2: Infer from model combination (exact match)
                        if (messageInfo.providerID && messageInfo.modelID) {
                            const matchingAgent = agents.find((agent) => agent.model?.providerID === messageInfo.providerID && agent.model?.modelID === messageInfo.modelID);
                            if (matchingAgent) {
                                return matchingAgent.name;
                            }
                        }

                        // Strategy 3: Use current agent context for this session
                        const { currentAgentContext } = get();
                        const contextAgent = currentAgentContext.get(sessionId);
                        if (contextAgent && agents.find((a) => a.name === contextAgent)) {
                            return contextAgent;
                        }

                        // Strategy 4: Analyze message sequence for agent patterns (non-recursive)
                        if (messageIndex > 0 && messageInfo.providerID && messageInfo.modelID) {
                            // Look at previous messages to see if there's a pattern
                            const sessionMessages = messages.get(sessionId) || [];
                            const assistantMessages = sessionMessages.filter((m) => m.info.role === "assistant").sort((a, b) => a.info.time.created - b.info.time.created);

                            for (let i = messageIndex - 1; i >= 0; i--) {
                                const prevMessage = assistantMessages[i];
                                const prevInfo = prevMessage.info as any;
                                if (prevInfo.providerID === messageInfo.providerID && prevInfo.modelID === messageInfo.modelID) {
                                    // Same model was used - check mode field first
                                    if (prevInfo.mode && typeof prevInfo.mode === "string") {
                                        const prevModeAgent = agents.find((a) => a.name === prevInfo.mode);
                                        if (prevModeAgent) {
                                            return prevInfo.mode;
                                        }
                                    }
                                    // Try model-based inference on previous message
                                    const prevMatchingAgent = agents.find((agent) => agent.model?.providerID === prevInfo.providerID && agent.model?.modelID === prevInfo.modelID);
                                    if (prevMatchingAgent) {
                                        return prevMatchingAgent.name;
                                    }
                                }
                            }
                        }

                        // Strategy 5: Default fallback to 'build' agent for TUI messages
                        if (messageInfo.providerID && messageInfo.modelID) {
                            const buildAgent = agents.find((a) => a.name === "build");
                            if (buildAgent) {
                                return "build";
                            }
                        }

                        return null;
                    };

                    // Analyze ALL messages (user + assistant) for agent/provider/model usage
                    const sessionMessages = messages.get(sessionId) || [];
                    // Sort all messages by creation time to get the latest choices
                    const allMessages = sessionMessages.filter((m: any) => m.info.role === "assistant" || m.info.role === "user").sort((a: any, b: any) => a.info.time.created - b.info.time.created);
                    const assistantMessages = sessionMessages.filter((m: any) => m.info.role === "assistant").sort((a: any, b: any) => a.info.time.created - b.info.time.created);

                    for (let messageIndex = 0; messageIndex < allMessages.length; messageIndex++) {
                        const message = allMessages[messageIndex];
                        const { info } = message;
                        const infoAny = info as any; // Cast to access runtime properties

                        if (infoAny.providerID && infoAny.modelID) {
                            const agentName = extractAgentFromMessage(infoAny, assistantMessages.indexOf(message));

                            // Verify agent exists in current agent list
                            if (agentName && agents.find((a) => a.name === agentName)) {
                                const choice = {
                                    providerId: infoAny.providerID,
                                    modelId: infoAny.modelID,
                                    timestamp: info.time.created,
                                };

                                // Only save if we don't already have this agent or if this is a newer timestamp
                                const existing = agentLastChoices.get(agentName);
                                if (!existing || choice.timestamp > existing.timestamp) {
                                    agentLastChoices.set(agentName, choice);
                                }
                            }
                        }
                    }

                    // Save discovered choices as OpenChamber selections using existing method
                    for (const [agentName, choice] of agentLastChoices) {
                        saveAgentModelForSession(sessionId, agentName, choice.providerId, choice.modelId);
                    }

                    return agentLastChoices;
                },

                // Get context usage for current session - cache-first approach
                getContextUsage: (sessionId: string, contextLimit: number, messages: Map<string, { info: any; parts: any[] }[]>) => {
                    if (!sessionId || contextLimit === 0) return null;

                    const sessionMessages = messages.get(sessionId) || [];
                    const assistantMessages = sessionMessages.filter(m => m.info.role === 'assistant');

                    if (assistantMessages.length === 0) return null;

                    const lastAssistantMessage = assistantMessages[assistantMessages.length - 1];
                    const lastMessageId = lastAssistantMessage.info.id;

                    const scheduleUsageUpdate = (usage: ContextUsage) => {
                        const runUpdate = () => {
                            set((state) => {
                                const existing = state.sessionContextUsage.get(sessionId) as ContextUsage | undefined;
                        if (
                            existing &&
                            existing.totalTokens === usage.totalTokens &&
                            existing.percentage === usage.percentage &&
                            existing.contextLimit === usage.contextLimit &&
                            existing.lastMessageId === usage.lastMessageId
                        ) {
                            return state;
                        }

                                const newContextUsage = new Map(state.sessionContextUsage);
                                newContextUsage.set(sessionId, usage);
                                return { sessionContextUsage: newContextUsage };
                            });
                        };

                        if (typeof queueMicrotask === 'function') {
                            queueMicrotask(runUpdate);
                        } else if (typeof window !== 'undefined') {
                            window.setTimeout(runUpdate, 0);
                        } else {
                            setTimeout(runUpdate, 0);
                        }
                    };

                    // Check cache - use if same message, recalculate percentage if context limit changed
                    const cachedUsage = get().sessionContextUsage.get(sessionId) as ContextUsage | undefined;
                    if (cachedUsage && cachedUsage.lastMessageId === lastMessageId) {
                        // Same message - check if context limit changed
                        if (cachedUsage.contextLimit !== contextLimit && cachedUsage.totalTokens > 0) {
                            // Context limit changed - recalculate percentage with cached tokens
                            const newPercentage = (cachedUsage.totalTokens / contextLimit) * 100;
                            const recalculated: ContextUsage = {
                                totalTokens: cachedUsage.totalTokens,
                                percentage: Math.min(newPercentage, 100),
                                contextLimit,
                                lastMessageId,
                            };
                            scheduleUsageUpdate(recalculated);
                            return recalculated;
                        } else if (cachedUsage.contextLimit === contextLimit && cachedUsage.totalTokens > 0) {
                            // Same message and same context limit - return cached
                            return cachedUsage;
                        }
                    }

                    // Recalculate from latest message
                    const totalTokens = extractTokensFromMessage(lastAssistantMessage);

                    // If no tokens, ignore and return cached value (or null if no cache)
                    if (totalTokens === 0) {
                        return cachedUsage || null;
                    }

                    const percentage = (totalTokens / contextLimit) * 100;
                    const result: ContextUsage = {
                        totalTokens,
                        percentage: Math.min(percentage, 100),
                        contextLimit,
                        lastMessageId, // Track which message this calculation is based on
                    };

                    scheduleUsageUpdate(result);

                    return result;
                },

                // Update stored context usage for a session
                updateSessionContextUsage: (sessionId: string, contextLimit: number, messages: Map<string, { info: any; parts: any[] }[]>) => {
                    const sessionMessages = messages.get(sessionId) || [];
                    const assistantMessages = sessionMessages.filter(m => m.info.role === 'assistant');

                    if (assistantMessages.length === 0) return;

                    const lastAssistantMessage = assistantMessages[assistantMessages.length - 1];
                    const totalTokens = extractTokensFromMessage(lastAssistantMessage);

                    // Only update if there are tokens
                    if (totalTokens === 0) return;

                    const percentage = contextLimit > 0 ? (totalTokens / contextLimit) * 100 : 0;

                    set((state) => {
                        const newContextUsage = new Map(state.sessionContextUsage);
                        newContextUsage.set(sessionId, {
                            totalTokens,
                            percentage: Math.min(percentage, 100),
                            contextLimit,
                            lastMessageId: lastAssistantMessage.info.id,
                        });
                        return { sessionContextUsage: newContextUsage };
                    });
                },

                // Initialize context usage for a session if not stored or 0
                initializeSessionContextUsage: (sessionId: string, contextLimit: number, messages: Map<string, { info: any; parts: any[] }[]>) => {
                    const state = get();
                    const existingUsage = state.sessionContextUsage.get(sessionId);

                    // Only initialize if not stored or totalTokens is 0
                    if (!existingUsage || existingUsage.totalTokens === 0) {
                        get().updateSessionContextUsage(sessionId, contextLimit, messages);
                    }
                },

                // Poll for token updates in a message (handles async token population)
                pollForTokenUpdates: (sessionId: string, messageId: string, messages: Map<string, { info: any; parts: any[] }[]>, maxAttempts: number = 10) => {
                    let attempts = 0;

                    const poll = () => {
                        attempts++;
                        const sessionMessages = messages.get(sessionId) || [];
                        const message = sessionMessages.find(m => m.info.id === messageId);

                        if (message && message.info.role === 'assistant') {
                            const totalTokens = extractTokensFromMessage(message);

                            if (totalTokens > 0) {
                                // Found tokens, update cache and stop
                                get().updateSessionContextUsage(sessionId, 0, messages); // contextLimit will be handled by caller
                                return; // Stop polling
                            }
                        }

                        if (attempts < maxAttempts) {
                            setTimeout(poll, 1000); // Poll every 1 second
                        }
                    };

                    // Start polling after a short delay
                    setTimeout(poll, 2000);
                },

                getCurrentAgent: (sessionId: string) => {
                    const { currentAgentContext } = get();
                    return currentAgentContext.get(sessionId);
                },

                getSessionAgentEditMode: (sessionId: string, agentName: string | undefined, defaultMode: EditPermissionMode = getAgentDefaultEditPermission(agentName)) => {
                    if (!sessionId || !agentName) {
                        return defaultMode;
                    }

                    const sessionMap = get().sessionAgentEditModes.get(sessionId);
                    const override = sessionMap?.get(agentName);
                    return override ?? defaultMode;
                },

                setSessionAgentEditMode: (sessionId: string, agentName: string | undefined, mode: EditPermissionMode, defaultMode: EditPermissionMode = getAgentDefaultEditPermission(agentName)) => {
                    if (!sessionId || !agentName) {
                        return;
                    }

                    const normalizedDefault: EditPermissionMode = defaultMode ?? 'ask';
                    if (normalizedDefault === 'deny' || mode === 'deny') {
                        return;
                    }

                    if (!EDIT_PERMISSION_SEQUENCE.includes(mode)) {
                        return;
                    }

                    set((state) => {
                        const nextMap = new Map(state.sessionAgentEditModes);
                        const agentMap = new Map(nextMap.get(sessionId) ?? new Map());

                        if (mode === normalizedDefault) {
                            agentMap.delete(agentName);
                            if (agentMap.size === 0) {
                                nextMap.delete(sessionId);
                            } else {
                                nextMap.set(sessionId, agentMap);
                            }
                        } else {
                            agentMap.set(agentName, mode);
                            nextMap.set(sessionId, agentMap);
                        }

                        return { sessionAgentEditModes: nextMap };
                    });
                },

                toggleSessionAgentEditMode: (sessionId: string, agentName: string | undefined, defaultMode: EditPermissionMode = getAgentDefaultEditPermission(agentName)) => {
                    if (!sessionId || !agentName) {
                        return;
                    }

                    const normalizedDefault: EditPermissionMode = defaultMode ?? 'ask';
                    if (normalizedDefault === 'deny') {
                        return;
                    }

                    const currentMode = get().getSessionAgentEditMode(sessionId, agentName, normalizedDefault);
                    const currentIndex = EDIT_PERMISSION_SEQUENCE.indexOf(currentMode);
                    const fallbackIndex = EDIT_PERMISSION_SEQUENCE.indexOf(normalizedDefault);
                    const baseIndex = currentIndex >= 0 ? currentIndex : (fallbackIndex >= 0 ? fallbackIndex : 0);
                    const nextIndex = (baseIndex + 1) % EDIT_PERMISSION_SEQUENCE.length;
                    const nextMode = EDIT_PERMISSION_SEQUENCE[nextIndex];

                    get().setSessionAgentEditMode(sessionId, agentName, nextMode, normalizedDefault);
                },
            }),
            {
                name: "context-store",
                storage: createJSONStorage(() => getSafeStorage()),
                partialize: (state) => ({
                    sessionModelSelections: Array.from(state.sessionModelSelections.entries()),
                    sessionAgentSelections: Array.from(state.sessionAgentSelections.entries()),
                    sessionAgentModelSelections: Array.from(state.sessionAgentModelSelections.entries()).map(([sessionId, agentMap]) => [sessionId, Array.from(agentMap.entries())]),
                    currentAgentContext: Array.from(state.currentAgentContext.entries()),
                    sessionContextUsage: Array.from(state.sessionContextUsage.entries()),
                    sessionAgentEditModes: Array.from(state.sessionAgentEditModes.entries()).map(([sessionId, agentMap]) => [sessionId, Array.from(agentMap.entries())]),
                }),
                merge: (persistedState: any, currentState) => {
                    // Restore nested Map structure
                    const agentModelSelections = new Map();
                    if (persistedState?.sessionAgentModelSelections) {
                        persistedState.sessionAgentModelSelections.forEach(([sessionId, agentArray]: [string, any[]]) => {
                            agentModelSelections.set(sessionId, new Map(agentArray));
                        });
                    }

                    const agentEditModes = new Map();
                    if (persistedState?.sessionAgentEditModes) {
                        persistedState.sessionAgentEditModes.forEach(([sessionId, agentArray]: [string, any[]]) => {
                            agentEditModes.set(sessionId, new Map(agentArray));
                        });
                    }

                    return {
                        ...currentState,
                        ...(persistedState as object),
                        sessionModelSelections: new Map(persistedState?.sessionModelSelections || []),
                        sessionAgentSelections: new Map(persistedState?.sessionAgentSelections || []),
                        sessionAgentModelSelections: agentModelSelections,
                        currentAgentContext: new Map(persistedState?.currentAgentContext || []),
                        sessionContextUsage: new Map(persistedState?.sessionContextUsage || []),
                        sessionAgentEditModes: agentEditModes,
                        hasHydrated: true,
                    };
                },
            }
        ),
        {
            name: "context-store",
        }
    )
);
