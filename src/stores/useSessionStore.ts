import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";
import type { Session, Message, Part } from "@opencode-ai/sdk";
import { opencodeClient } from "@/lib/opencode/client";
import type { Permission, PermissionResponse } from "@/types/permission";

// Type for attached files in the UI
export interface AttachedFile {
    id: string;
    file: File;
    dataUrl: string;
    mimeType: string;
    filename: string;
    size: number;
    source: "local" | "server"; // Track where file came from
    serverPath?: string; // Path on server for server files
}

// Check if message is a tool/incomplete message that should not hide context display
const isToolOrIncompleteMessage = (message: { info: Message; parts: Part[] }): boolean => {
    // Check if message has tool parts
    const hasToolParts = message.parts.some(part => (part as any).type === 'tool');

    // Check if message has reasoning parts
    const hasReasoningParts = message.parts.some(part => (part as any).type === 'reasoning');

    // Check if message has step-finish part (indicates completion)
    const hasStepFinish = message.parts.some(part => (part as any).type === 'step-finish');

    // Tool, reasoning, or messages without step-finish should not hide display
    return hasToolParts || hasReasoningParts || !hasStepFinish;
};

// Shared utility function for extracting tokens from messages
const extractTokensFromMessage = (message: { info: Message; parts: Part[] }): number => {
    const tokens = (message.info as any).tokens;

    if (tokens) {
        if (typeof tokens === 'number') {
            return tokens;
        } else if (typeof tokens === 'object' && tokens !== null) {
            // Calculate base tokens
            const baseTokens = (tokens.input || 0) + (tokens.output || 0) + (tokens.reasoning || 0);

            // Handle cache tokens intelligently
            if (tokens.cache && typeof tokens.cache === 'object') {
                const cacheRead = tokens.cache.read || 0;
                const cacheWrite = tokens.cache.write || 0;
                const totalCache = cacheRead + cacheWrite;

                // If cache is larger than base tokens, add cache (separate counting)
                // If cache is smaller/equal, it's already included in input/output
                if (totalCache > baseTokens) {
                    return baseTokens + totalCache;
                }
            }

            return baseTokens;
        }
    }

    // Fallback: check parts for tokens
    const tokenParts = message.parts.filter(p => (p as any).tokens);
    if (tokenParts.length > 0) {
        const partTokens = (tokenParts[0] as any).tokens;
        if (typeof partTokens === 'number') {
            return partTokens;
        } else if (typeof partTokens === 'object' && partTokens !== null) {
            const baseTokens = (partTokens.input || 0) + (partTokens.output || 0) + (partTokens.reasoning || 0);

            if (partTokens.cache && typeof partTokens.cache === 'object') {
                const cacheRead = partTokens.cache.read || 0;
                const cacheWrite = partTokens.cache.write || 0;
                const totalCache = cacheRead + cacheWrite;

                if (totalCache > baseTokens) {
                    return baseTokens + totalCache;
                }
            }

            return baseTokens;
        }
    }

    return 0;
};

// Smart context usage update function - only polls when tokens are missing
const smartUpdateContextUsage = (get: any, set: any, sessionId: string, contextLimit: number) => {
    const sessionMessages = get().messages.get(sessionId) || [];
    const assistantMessages = sessionMessages.filter((m: any) => m.info.role === 'assistant');

    if (assistantMessages.length === 0) return;

    const lastAssistantMessage = assistantMessages[assistantMessages.length - 1];
    const totalTokens = extractTokensFromMessage(lastAssistantMessage);

    // Update cache immediately
    const percentage = contextLimit > 0 ? (totalTokens / contextLimit) * 100 : 0;
    set((state: any) => {
        const newContextUsage = new Map(state.sessionContextUsage);
        newContextUsage.set(sessionId, {
            totalTokens,
            percentage: Math.min(percentage, 100),
            contextLimit,
        });
        return { sessionContextUsage: newContextUsage };
    });

    // ONLY start polling if tokens are zero (async population expected)
    if (totalTokens === 0) {
        get().pollForTokenUpdates(sessionId, lastAssistantMessage.info.id);
    }
};

// Memory management configuration
export const MEMORY_LIMITS = {
    MAX_SESSIONS: 5, // LRU cache for sessions
    VIEWPORT_MESSAGES: 30, // Messages around viewport during normal state
    STREAMING_BUFFER: Infinity, // No limit during active streaming
    BACKGROUND_STREAMING_BUFFER: 100, // Limit for background sessions
    ZOMBIE_TIMEOUT: 10 * 60 * 1000, // 10 minutes zombie stream protection
};

// Session memory state for tracking
interface SessionMemoryState {
    viewportAnchor: number; // Index of message at viewport center
    isStreaming: boolean;
    streamStartTime?: number;
    lastAccessedAt: number; // For LRU tracking
    backgroundMessageCount: number; // New messages while session in background
    isZombie?: boolean; // Timeout protection flag
    totalAvailableMessages?: number; // Total messages available on server
    hasMoreAbove?: boolean; // Can load more messages by scrolling up
}

type MessageStreamPhase = 'streaming' | 'cooldown' | 'completed';

interface MessageStreamLifecycle {
    phase: MessageStreamPhase;
    startedAt: number;
    lastUpdateAt: number;
    completedAt?: number;
}

const touchStreamingLifecycle = (
    source: Map<string, MessageStreamLifecycle>,
    messageId: string
): Map<string, MessageStreamLifecycle> => {
    const now = Date.now();
    const existing = source.get(messageId);

    const next = new Map(source);
    next.set(messageId, {
        phase: 'streaming',
        startedAt: existing?.startedAt ?? now,
        lastUpdateAt: now,
    });

    return next;
};

const markLifecycleCooldown = (
    source: Map<string, MessageStreamLifecycle>,
    messageId: string
): Map<string, MessageStreamLifecycle> => {
    const existing = source.get(messageId);
    if (!existing) {
        return source;
    }
    if (existing.phase === 'cooldown') {
        return source;
    }

    const now = Date.now();
    const next = new Map(source);
    next.set(messageId, {
        ...existing,
        phase: 'cooldown',
        completedAt: now,
    });

    return next;
};

const markLifecycleCompleted = (
    source: Map<string, MessageStreamLifecycle>,
    messageId: string
): Map<string, MessageStreamLifecycle> => {
    const existing = source.get(messageId);
    if (!existing) {
        return source;
    }
    if (existing.phase === 'completed') {
        return source;
    }

    const completion = existing.completedAt ?? Date.now();
    const next = new Map(source);
    next.set(messageId, {
        ...existing,
        phase: 'completed',
        completedAt: completion,
    });

    return next;
};

const removeLifecycleEntries = (
    source: Map<string, MessageStreamLifecycle>,
    ids: Iterable<string>
): Map<string, MessageStreamLifecycle> => {
    const idsArray = Array.from(ids);
    const shouldClone = idsArray.some((id) => source.has(id));

    if (!shouldClone) {
        return source;
    }

    const next = new Map(source);
    idsArray.forEach((id) => {
        next.delete(id);
    });

    return next;
};

const extractTextFromDelta = (delta: any): string => {
    if (!delta) return '';
    if (typeof delta === 'string') return delta;
    if (Array.isArray(delta)) {
        return delta.map((item) => extractTextFromDelta(item)).join('');
    }
    if (typeof delta === 'object') {
        if (typeof delta.text === 'string') {
            return delta.text;
        }
        if (Array.isArray(delta.content)) {
            return delta.content.map((item: any) => extractTextFromDelta(item)).join('');
        }
    }
    return '';
};

const extractTextFromPart = (part: any): string => {
    if (!part) return '';
    if (typeof part.text === 'string') return part.text;
    if (Array.isArray(part.text)) {
        return part.text.map((item: any) => (typeof item === 'string' ? item : extractTextFromPart(item))).join('');
    }
    const deltaText = extractTextFromDelta(part.delta);
    if (deltaText) return deltaText;
    if (typeof part.content === 'string') return part.content;
    if (Array.isArray(part.content)) {
        return part.content
            .map((item: any) => {
                if (typeof item === 'string') return item;
                if (item && typeof item === 'object') {
                    return item.text || extractTextFromDelta(item.delta) || '';
                }
                return '';
            })
            .join('');
    }
    return '';
};

const normalizeStreamingPart = (incoming: Part, existing?: Part): Part => {
    const normalized: any = { ...incoming };
    normalized.type = normalized.type || 'text';

    if (normalized.type === 'text') {
        const existingText = existing && typeof (existing as any).text === 'string' ? (existing as any).text : '';
        const directText = typeof normalized.text === 'string' ? normalized.text : '';
        const deltaText = extractTextFromDelta((incoming as any).delta);

        if (directText) {
            normalized.text = directText;
        } else if (deltaText) {
            normalized.text = existingText ? `${existingText}${deltaText}` : deltaText;
        } else if (existingText) {
            normalized.text = existingText;
        } else {
            normalized.text = '';
        }

        delete normalized.delta;
    }

    return normalized as Part;
};

const STREAMING_COMPLETION_DELAY_MS = 1600;
const lifecycleCompletionTimers = new Map<string, ReturnType<typeof setTimeout>>();

const clearLifecycleCompletionTimer = (messageId: string) => {
    const timer = lifecycleCompletionTimers.get(messageId);
    if (timer) {
        clearTimeout(timer);
        lifecycleCompletionTimers.delete(messageId);
    }
};

const scheduleLifecycleCompletion = (
    messageId: string,
    get: () => SessionStore
) => {
    clearLifecycleCompletionTimer(messageId);
    const timer = setTimeout(() => {
        lifecycleCompletionTimers.delete(messageId);
        const state = get();
        const lifecycle = state.messageStreamStates.get(messageId);
        if (!lifecycle || lifecycle.phase === 'completed') {
            return;
        }
        state.markMessageStreamSettled(messageId);
    }, STREAMING_COMPLETION_DELAY_MS);

    lifecycleCompletionTimers.set(messageId, timer);
};

const clearLifecycleTimersForIds = (ids: Iterable<string>) => {
    for (const id of ids) {
        clearLifecycleCompletionTimer(id);
    }
};

interface SessionStore {
    // State
    sessions: Session[];
    currentSessionId: string | null;
    messages: Map<string, { info: any; parts: Part[] }[]>;
    sessionMemoryState: Map<string, SessionMemoryState>; // Track memory state per session
    messageStreamStates: Map<string, MessageStreamLifecycle>;
    permissions: Map<string, Permission[]>; // sessionId -> permissions
    attachedFiles: AttachedFile[]; // Files attached to current message
    isLoading: boolean;
    error: string | null;
    streamingMessageId: string | null;
    abortController: AbortController | null;
    lastUsedProvider: { providerID: string; modelID: string } | null; // Track last used provider/model
    isSyncing: boolean; // Track when messages are being synced from external source
    pendingUserMessageIds: Set<string>; // Track locally optimistically rendered user messages

    // Session-specific model/agent persistence
    sessionModelSelections: Map<string, { providerId: string; modelId: string }>; // sessionId -> last model (for backward compat)
    sessionAgentSelections: Map<string, string>; // sessionId -> agentName
    // Agent-specific model selections within sessions
    sessionAgentModelSelections: Map<string, Map<string, { providerId: string; modelId: string }>>; // sessionId -> agentName -> model
    // Track WebUI-created sessions for proper initialization
    webUICreatedSessions: Set<string>; // sessionIds created by WebUI
     // Track current agent context for each session (for TUI message analysis)
     currentAgentContext: Map<string, string>; // sessionId -> current agent name
     // Store context usage per session (updated only when messages are complete)
     sessionContextUsage: Map<string, { totalTokens: number; percentage: number; contextLimit: number }>; // sessionId -> context usage

    // Actions
    loadSessions: () => Promise<void>;
    createSession: (title?: string) => Promise<Session | null>;
    deleteSession: (id: string) => Promise<boolean>;
    updateSessionTitle: (id: string, title: string) => Promise<void>;
    shareSession: (id: string) => Promise<Session | null>;
    unshareSession: (id: string) => Promise<Session | null>;
    setCurrentSession: (id: string | null) => void;
    loadMessages: (sessionId: string) => Promise<void>;
    sendMessage: (content: string, providerID: string, modelID: string, agent?: string) => Promise<void>;
    abortCurrentOperation: () => Promise<void>;
    addStreamingPart: (sessionId: string, messageId: string, part: Part, role?: string) => void;
    completeStreamingMessage: (sessionId: string, messageId: string) => void;
    markMessageStreamSettled: (messageId: string) => void;
    updateMessageInfo: (sessionId: string, messageId: string, messageInfo: any) => void;
    addPermission: (permission: Permission) => void;
    respondToPermission: (sessionId: string, permissionId: string, response: PermissionResponse) => Promise<void>;
    clearError: () => void;
    getSessionsByDirectory: (directory: string) => Session[];
    getLastMessageModel: (sessionId: string) => { providerID?: string; modelID?: string } | null;
    syncMessages: (sessionId: string, messages: { info: Message; parts: Part[] }[]) => void;

    // File attachment actions
    addAttachedFile: (file: File) => Promise<void>;
    addServerFile: (path: string, name: string, content?: string) => Promise<void>;
    removeAttachedFile: (id: string) => void;
    clearAttachedFiles: () => void;

    // Memory management actions
    updateViewportAnchor: (sessionId: string, anchor: number) => void;
    trimToViewportWindow: (sessionId: string, targetSize?: number) => void;
    evictLeastRecentlyUsed: () => void;
    loadMoreMessages: (sessionId: string, direction: "up" | "down") => Promise<void>;

    // Session-specific model/agent persistence
    saveSessionModelSelection: (sessionId: string, providerId: string, modelId: string) => void;
    getSessionModelSelection: (sessionId: string) => { providerId: string; modelId: string } | null;
    saveSessionAgentSelection: (sessionId: string, agentName: string) => void;
    getSessionAgentSelection: (sessionId: string) => string | null;
    // Agent-specific model persistence within sessions
    saveAgentModelForSession: (sessionId: string, agentName: string, providerId: string, modelId: string) => void;
    getAgentModelForSession: (sessionId: string, agentName: string) => { providerId: string; modelId: string } | null;
    // External session analysis with immediate UI update
    analyzeAndSaveExternalSessionChoices: (sessionId: string, agents: any[]) => Promise<Map<string, { providerId: string; modelId: string; timestamp: number }>>;
    // Check if session was created by WebUI or external (TUI/API)
    isWebUICreatedSession: (sessionId: string) => boolean;
    // Mark session as WebUI created
    markSessionAsWebUICreated: (sessionId: string) => void;
    // New WebUI session initialization
    initializeNewWebUISession: (sessionId: string, agents: any[]) => void;
     // Get context usage for current session
     getContextUsage: (contextLimit: number) => { totalTokens: number; percentage: number; contextLimit: number } | null;
     // Update stored context usage for a session
     updateSessionContextUsage: (sessionId: string, contextLimit: number) => void;
     // Initialize context usage for a session if not stored or 0
     initializeSessionContextUsage: (sessionId: string, contextLimit: number) => void;
     // Debug method to inspect messages for a specific session
     debugSessionMessages: (sessionId: string) => Promise<void>;
     // Poll for token updates in a message (handles async token population)
     pollForTokenUpdates: (sessionId: string, messageId: string, maxAttempts?: number) => void;
     // Remove a pending user message marker once confirmed by server
     clearPendingUserMessage: (messageId: string) => void;
 }


export const useSessionStore = create<SessionStore>()(
    devtools(
        persist(
            (set, get) => ({
                // Initial State
                sessions: [],
                currentSessionId: null,
                messages: new Map(),
                sessionMemoryState: new Map(),
                messageStreamStates: new Map(),
                permissions: new Map(),
                attachedFiles: [],
                isLoading: false,
                error: null,
                streamingMessageId: null,
                abortController: null,
                lastUsedProvider: null,
                isSyncing: false,
                pendingUserMessageIds: new Set(),
                sessionModelSelections: new Map(),
                sessionAgentSelections: new Map(),
                sessionAgentModelSelections: new Map(),
                 webUICreatedSessions: new Set(),
                 currentAgentContext: new Map(),
                 sessionContextUsage: new Map(),

                // Load all sessions
                loadSessions: async () => {
                    set({ isLoading: true, error: null });
                    try {
                        const sessions = await opencodeClient.listSessions();
                        set({ sessions, isLoading: false });
                    } catch (error) {
                        set({
                            error: error instanceof Error ? error.message : "Failed to load sessions",
                            isLoading: false,
                        });
                    }
                },

                // Create new session
                createSession: async (title?: string) => {
                    set({ error: null });
                    try {
                        // Directory is now handled globally by the OpenCode client
                        const session = await opencodeClient.createSession({ title });

                        // Initialize empty messages for the new session immediately
                        set((state) => {
                            const newMessages = new Map(state.messages);
                            newMessages.set(session.id, []);

                            // Initialize memory state for new session
                            const newMemoryState = new Map(state.sessionMemoryState);
                            newMemoryState.set(session.id, {
                                viewportAnchor: 0,
                                isStreaming: false,
                                lastAccessedAt: Date.now(),
                                backgroundMessageCount: 0,
                                totalAvailableMessages: 0,
                                hasMoreAbove: false,
                            });

                            // Mark this session as WebUI created
                            const newWebUICreatedSessions = new Set(state.webUICreatedSessions);
                            newWebUICreatedSessions.add(session.id);

                            return {
                                sessions: [...state.sessions, session],
                                currentSessionId: session.id,
                                messages: newMessages,
                                sessionMemoryState: newMemoryState,
                                webUICreatedSessions: newWebUICreatedSessions,
                                isLoading: false, // Ensure loading is false
                            };
                        });

                        // Initialize the new session with agent defaults (will be done by config store when agents are available)
                        // This ensures WebUI-created sessions start with proper defaults

                        return session;
                    } catch (error) {
                        set({
                            error: error instanceof Error ? error.message : "Failed to create session",
                            isLoading: false,
                        });
                        return null;
                    }
                },

                // Delete session
                deleteSession: async (id: string) => {
                    set({ isLoading: true, error: null });
                    try {
                        const success = await opencodeClient.deleteSession(id);
                        if (success) {
                            set((state) => {
                                const removedMessages = state.messages.get(id) || [];
                                const removedIds = removedMessages.map((message) => message.info.id);

                                const newSessions = state.sessions.filter((s) => s.id !== id);
                                const newMessages = new Map(state.messages);
                                newMessages.delete(id);

                                const result: Record<string, any> = {
                                    sessions: newSessions,
                                    messages: newMessages,
                                    currentSessionId: state.currentSessionId === id ? null : state.currentSessionId,
                                    isLoading: false,
                                };

                        clearLifecycleTimersForIds(removedIds);

                        const updatedLifecycle = removeLifecycleEntries(state.messageStreamStates, removedIds);
                                if (updatedLifecycle !== state.messageStreamStates) {
                                    result.messageStreamStates = updatedLifecycle;
                                }

                                return result;
                            });
                        }
                        return success;
                    } catch (error) {
                        set({
                            error: error instanceof Error ? error.message : "Failed to delete session",
                            isLoading: false,
                        });
                        return false;
                    }
                },

                // Update session title
                updateSessionTitle: async (id: string, title: string) => {
                    try {
                        const updatedSession = await opencodeClient.updateSession(id, title);
                        set((state) => ({
                            sessions: state.sessions.map((s) => (s.id === id ? updatedSession : s)),
                        }));
                    } catch (error) {
                        set({
                            error: error instanceof Error ? error.message : "Failed to update session title",
                        });
                    }
                },

                // Share session
                shareSession: async (id: string) => {
                    try {
                        const apiClient = opencodeClient.getApiClient();
                        const directory = opencodeClient.getDirectory();
                        const response = await apiClient.session.share({
                            path: { id },
                            query: directory ? { directory } : undefined,
                        });

                        // Update the session in the store if successful
                        if (response.data) {
                            set((state) => ({
                                sessions: state.sessions.map((s) => (s.id === id ? response.data : s)),
                            }));
                            return response.data;
                        }
                        return null;
                    } catch (error) {
                        set({
                            error: error instanceof Error ? error.message : "Failed to share session",
                        });
                        return null;
                    }
                },

                // Unshare session
                unshareSession: async (id: string) => {
                    try {
                        const apiClient = opencodeClient.getApiClient();
                        const directory = opencodeClient.getDirectory();
                        const response = await apiClient.session.unshare({
                            path: { id },
                            query: directory ? { directory } : undefined,
                        });

                        // Update the session in the store to remove the share property
                        if (response.data) {
                            set((state) => ({
                                sessions: state.sessions.map((s) => (s.id === id ? response.data : s)),
                            }));
                            return response.data;
                        }
                        return null;
                    } catch (error) {
                        set({
                            error: error instanceof Error ? error.message : "Failed to unshare session",
                        });
                        return null;
                    }
                },

                // Set current session
                setCurrentSession: (id: string | null) => {
                    const state = get();
                    const previousSessionId = state.currentSessionId;

                    // Clean up previous session if not streaming
                    if (previousSessionId && previousSessionId !== id) {
                        const previousMemoryState = state.sessionMemoryState.get(previousSessionId);
                        if (!previousMemoryState?.isStreaming) {
                            // Trim messages for the session we're leaving
                            get().trimToViewportWindow(previousSessionId);
                        }
                    }

                    // Update lastAccessedAt for the new session
                    if (id) {
                        const memoryState = state.sessionMemoryState.get(id) || {
                            viewportAnchor: 0,
                            isStreaming: false,
                            lastAccessedAt: Date.now(),
                            backgroundMessageCount: 0,
                        };

                        set((state) => {
                            const newMemoryState = new Map(state.sessionMemoryState);
                            newMemoryState.set(id, {
                                ...memoryState,
                                lastAccessedAt: Date.now(),
                                backgroundMessageCount: 0, // Reset count when viewing session
                            });
                            return {
                                currentSessionId: id,
                                error: null,
                                sessionMemoryState: newMemoryState,
                            };
                        });

                        // Check if we need to evict old sessions
                        get().evictLeastRecentlyUsed();

                         // Check if we already have messages for this session
                         const existingMessages = get().messages.get(id);
                         if (!existingMessages) {
                             // Only load messages if we don't have them yet
                             get().loadMessages(id);
                         } else {
// Update context usage if messages exist
                               try {
                                   // Safely get config store with fallback
                                   const configStore = (window as any).__zustand_config_store__;
                                   if (configStore && typeof configStore.getState === 'function') {
                                       const currentModel = configStore.getState().getCurrentModel();
                                       const contextLimit = currentModel?.limit?.context || 0;
                                       if (contextLimit > 0) {
                                           get().updateSessionContextUsage(id, contextLimit);
                                       }
                                   }
                               } catch (error) {
                                   // Don't crash - continue without context usage
                               }
                         }
                    } else {
                        set({ currentSessionId: id, error: null });
                    }
                },

                // Load messages for a session
                loadMessages: async (sessionId: string, limit: number = MEMORY_LIMITS.VIEWPORT_MESSAGES) => {
                    // Don't set loading state for message loading - it conflicts with other operations
                    // Only show loading when there are no messages yet
                    const existingMessages = get().messages.get(sessionId);
                    if (!existingMessages) {
                        set({ isLoading: true, error: null });
                    }

                    try {
                        const allMessages = await opencodeClient.getSessionMessages(sessionId);

                        // Only keep the last N messages (show most recent)
                        const messagesToKeep = allMessages.slice(-limit);

                        set((state) => {
                            const newMessages = new Map(state.messages);
                            const normalizedMessages = messagesToKeep.map((message) => {
                                const infoWithMarker = {
                                    ...message.info,
                                    clientRole: (message.info as any)?.clientRole ?? message.info.role,
                                    userMessageMarker: message.info.role === "user" ? true : (message.info as any)?.userMessageMarker,
                                } as any;

                                return {
                                    ...message,
                                    info: infoWithMarker,
                                };
                            });

                            const previousMessages = state.messages.get(sessionId) || [];
                            const previousIds = new Set(previousMessages.map((msg) => msg.info.id));
                            const nextIds = new Set(normalizedMessages.map((msg) => msg.info.id));
                            const removedIds: string[] = [];
                            previousIds.forEach((id) => {
                                if (!nextIds.has(id)) {
                                    removedIds.push(id);
                                }
                            });

                            newMessages.set(sessionId, normalizedMessages);

                            // Initialize memory state with viewport at the bottom
                            const newMemoryState = new Map(state.sessionMemoryState);
                            newMemoryState.set(sessionId, {
                                viewportAnchor: messagesToKeep.length - 1, // Anchor at bottom
                                isStreaming: false,
                                lastAccessedAt: Date.now(),
                                backgroundMessageCount: 0,
                                totalAvailableMessages: allMessages.length, // Track total for UI
                                hasMoreAbove: allMessages.length > messagesToKeep.length, // Can load more if we didn't get all
                            });

                            const newPending = new Set(state.pendingUserMessageIds);
                            normalizedMessages.forEach((message) => {
                                if (message.info?.clientRole === "user") {
                                    newPending.delete(message.info.id);
                                }
                            });

                            const result: Record<string, any> = {
                                messages: newMessages,
                                sessionMemoryState: newMemoryState,
                                pendingUserMessageIds: newPending,
                                isLoading: false,
                            };

                            clearLifecycleTimersForIds(removedIds);
                            const updatedLifecycle = removeLifecycleEntries(state.messageStreamStates, removedIds);
                            if (updatedLifecycle !== state.messageStreamStates) {
                                result.messageStreamStates = updatedLifecycle;
                            }

                            return result;
                        });

// Update context usage after loading messages
                          try {
                              // Safely get config store with fallback
                              const configStore = (window as any).__zustand_config_store__;
                              if (configStore && typeof configStore.getState === 'function') {
                                  const currentModel = configStore.getState().getCurrentModel();
                                  const contextLimit = currentModel?.limit?.context || 0;
                                  if (contextLimit > 0) {
                                      get().updateSessionContextUsage(sessionId, contextLimit);
                                  }
                              }
                          } catch (error) {
                              // Don't crash - continue without context usage
                          }
                     } catch (error) {
                         set({
                             error: error instanceof Error ? error.message : "Failed to load messages",
                             isLoading: false,
                         });
                     }
                },

                // Send a message (handles both regular messages and commands)
                sendMessage: async (content: string, providerID: string, modelID: string, agent?: string) => {
                    const { currentSessionId, attachedFiles } = get();
                    if (!currentSessionId) {
                        set({ error: "No session selected" });
                        return;
                    }

                    // Check if this is a command and route to the appropriate endpoint
                    const isCommand = content.startsWith("/");

                    if (isCommand) {
                        // Parse command and arguments
                        const spaceIndex = content.indexOf(" ");
                        const command = spaceIndex === -1 ? content.substring(1) : content.substring(1, spaceIndex);
                        const commandArgs = spaceIndex === -1 ? "" : content.substring(spaceIndex + 1).trim();

                        set({ isLoading: true, error: null });

                        try {
                            const apiClient = opencodeClient.getApiClient();
                            const directory = opencodeClient.getDirectory();

                            // Handle system commands with their specific endpoints
                            if (command === "init") {
                                // Generate a unique message ID for the init command
                                const messageId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

                                // Don't show user message, just wait for assistant stream
                                await apiClient.session.init({
                                    path: { id: currentSessionId },
                                    body: {
                                        messageID: messageId,
                                        providerID: providerID,
                                        modelID: modelID,
                                    },
                                    query: directory ? { directory } : undefined,
                                });

                                set({ attachedFiles: [], isLoading: false });
                                return;
                            }

                            if (command === "summarize") {
                                // Don't show user message, just wait for assistant stream
                                await apiClient.session.summarize({
                                    path: { id: currentSessionId },
                                    body: {
                                        providerID: providerID,
                                        modelID: modelID,
                                    },
                                    query: directory ? { directory } : undefined,
                                });

                                set({ attachedFiles: [], isLoading: false });
                                return;
                            }

                            // For all other commands, fetch the template first
                            console.log(`Fetching template for command: ${command}`);
                            const commandDetails = await opencodeClient.getCommandDetails(command);

                            // Create the user message showing the command template
                            if (commandDetails && commandDetails.template) {
                                // Expand the template by replacing placeholders with actual arguments
                                let expandedTemplate = commandDetails.template;

                                // Replace the official OpenCode placeholder pattern
                                // As per OpenCode documentation: https://opencode.ai/docs/commands/
                                expandedTemplate = expandedTemplate.replace(/\$ARGUMENTS/g, commandArgs);

                                // Show the expanded template as the user message
                                const userMessageId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
                                const userMessage = {
                                    info: {
                                        id: userMessageId,
                                        sessionID: currentSessionId,
                                        role: "user" as const,
                                        time: {
                                            created: Date.now(),
                                        },
                                    } as Message,
                                    parts: [
                                        {
                                            type: "text",
                                            text: expandedTemplate,
                                            id: `part-${Date.now()}`,
                                            sessionID: currentSessionId,
                                            messageID: userMessageId,
                                        } as Part,
                                    ],
                                };

                                // Add the user message to the store in correct chronological order
                                set((state) => {
                                    const sessionMessages = state.messages.get(currentSessionId) || [];
                                    const newMessages = new Map(state.messages);
                                    // Insert message in correct chronological order
                                    const sortedMessages = [...sessionMessages, userMessage].sort((a, b) => a.info.time.created - b.info.time.created);
                                    newMessages.set(currentSessionId, sortedMessages);
                                    return { messages: newMessages };
                                });

                                console.log(`Template expanded for /${command}:`, expandedTemplate.substring(0, 100) + "...");
                            } else {
                                // If we can't get the template, show the raw command as fallback
                                console.warn(`Could not fetch template for command: ${command}, showing raw command`);
                                const userMessageId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
                                const userMessage = {
                                    info: {
                                        id: userMessageId,
                                        sessionID: currentSessionId,
                                        role: "user" as const,
                                        time: {
                                            created: Date.now(),
                                        },
                                    } as Message,
                                    parts: [
                                        {
                                            type: "text",
                                            text: content, // Show the original command
                                            id: `part-${Date.now()}`,
                                            sessionID: currentSessionId,
                                            messageID: userMessageId,
                                        } as Part,
                                    ],
                                };

                                set((state) => {
                                    const sessionMessages = state.messages.get(currentSessionId) || [];
                                    const newMessages = new Map(state.messages);
                                    // Insert message in correct chronological order
                                    const sortedMessages = [...sessionMessages, userMessage].sort((a, b) => a.info.time.created - b.info.time.created);
                                    newMessages.set(currentSessionId, sortedMessages);
                                    return { messages: newMessages };
                                });
                            }

                            // Now execute the command
                            const requestBody: any = {
                                command: command,
                                arguments: commandArgs || "", // Ensure arguments is always a string
                            };

                            // Only add optional fields if they have values
                            if (agent) {
                                requestBody.agent = agent;
                            }
                            // Model field expects format "provider/model"
                            if (providerID && modelID) {
                                requestBody.model = `${providerID}/${modelID}`;
                            }

                            const response = await apiClient.session.command({
                                path: { id: currentSessionId },
                                body: requestBody,
                                query: directory ? { directory } : undefined,
                            });

                            // Log the response to see what we're getting
                            console.log("Command response:", response.data);

                            // Clear attached files after successful command
                            set({ attachedFiles: [], isLoading: false });

                            return;
                        } catch (error) {
                            console.error("Command execution failed:", error);
                            set({
                                error: error instanceof Error ? error.message : "Failed to execute command",
                                isLoading: false,
                            });
                            throw error;
                        }
                    }

                    // Regular message handling continues below
                    // Don't set isLoading here - we'll set streamingMessageId instead
                    // Store the provider/model for the assistant message that will follow
                    set({
                        error: null,
                        lastUsedProvider: { providerID, modelID },
                    });

                    // Save session-specific model and agent selections
                    set((state) => {
                        const newModelSelections = new Map(state.sessionModelSelections);
                        newModelSelections.set(currentSessionId, { providerId: providerID, modelId: modelID });

                        const newAgentSelections = new Map(state.sessionAgentSelections);
                        const newAgentContext = new Map(state.currentAgentContext);
                        if (agent) {
                            newAgentSelections.set(currentSessionId, agent);
                            newAgentContext.set(currentSessionId, agent);
                        }

                        return {
                            sessionModelSelections: newModelSelections,
                            sessionAgentSelections: newAgentSelections,
                            currentAgentContext: newAgentContext,
                        };
                    });

                    // Mark session as streaming
                    set((state) => {
                        const memoryState = state.sessionMemoryState.get(currentSessionId) || {
                            viewportAnchor: 0,
                            isStreaming: false,
                            lastAccessedAt: Date.now(),
                            backgroundMessageCount: 0,
                        };

                        const newMemoryState = new Map(state.sessionMemoryState);
                        newMemoryState.set(currentSessionId, {
                            ...memoryState,
                            isStreaming: true,
                            streamStartTime: Date.now(),
                        });
                        return { sessionMemoryState: newMemoryState };
                    });

                    // Build parts array with text and file parts
                    const timestamp = Date.now();
                    const messageId = `msg_${timestamp}_${Math.random().toString(36).substring(2, 9)}`;
                    const userParts: Part[] = [];

                    // Add text part if there's content
                    if (content.trim()) {
                        userParts.push({
                            type: "text",
                            text: content,
                            id: `part-${timestamp}`,
                            sessionID: currentSessionId,
                            messageID: messageId,
                        } as Part);
                    }

                    // Add file parts for attached files (for display purposes)
                    attachedFiles.forEach((file, index) => {
                        userParts.push({
                            type: "file",
                            id: `part-file-${timestamp}-${index}`,
                            sessionID: currentSessionId,
                            messageID: messageId,
                            mime: file.mimeType,
                            filename: file.filename,
                            url: file.dataUrl,
                        } as Part);
                    });

                    // Create user message explicitly without any assistant-specific fields
                        const userMessage = {
                        info: {
                            id: messageId,
                            sessionID: currentSessionId,
                            role: "user",
                            time: {
                                created: timestamp,
                            },
                            userMessageMarker: true,
                            clientRole: "user",
                            // Explicitly ensure NO provider/model fields
                            providerID: undefined,
                            modelID: undefined,
                        },
                        parts: userParts,
                    };


                    // Add user message immediately in correct chronological order
                    set((state) => {
                        const sessionMessages = state.messages.get(currentSessionId) || [];
                        const newMessages = new Map(state.messages);

                        // CRITICAL: Force user message role to be correct
                        const safeUserMessage = {
                            ...userMessage,
                            info: {
                                ...userMessage.info,
                                role: "user", // Force role to be user
                                userMessageMarker: true, // Ensure marker exists
                            },
                        };

                        const updatedMessages = [...sessionMessages, safeUserMessage];
                        newMessages.set(currentSessionId, updatedMessages);

                        const newPending = new Set(state.pendingUserMessageIds);
                        newPending.add(messageId);

                        return { messages: newMessages, pendingUserMessageIds: newPending };
                    });

                    try {
                        // Create abort controller for this operation
                        const controller = new AbortController();
                        
                        // Set loading state and abort controller BEFORE making the API call
                        set({
                            abortController: controller,
                            isLoading: true,
                            error: null, // Clear any previous errors
                        });

                        // Send to API with files included
                        // The improved sendMessage method now handles retries and timeouts internally
                        await opencodeClient.sendMessage({
                            id: currentSessionId,
                            providerID,
                            modelID,
                            text: content,
                            agent,
                            messageId,
                            files: attachedFiles.map((f) => ({
                                type: "file" as const,
                                mime: f.mimeType,
                                filename: f.filename,
                                url: f.dataUrl,
                            })),
                        });

                        // Clear attached files after successful send
                        set({ attachedFiles: [] });

                        // Trim messages for current session after sending
                        // This helps clean up any accumulated messages before the response
                        setTimeout(() => {
                            get().trimToViewportWindow(currentSessionId);
                        }, 200);

                        // Note: isLoading will be cleared when streaming starts or completes
                        // The EventSource will handle streaming updates and clear loading state
                        
                    } catch (error: any) {
                        console.error("SendMessage error:", error);

                        // Handle different error types
                        let errorMessage = "Failed to send message";

                        if (error.name === 'AbortError') {
                            errorMessage = "Request timed out. The message may still be processing.";
                        } else if (error.message?.includes('504') || error.message?.includes('Gateway')) {
                            errorMessage = "Gateway timeout - your message is being processed. Please wait for response.";
                            // Don't set error for gateway timeouts - rely on EventSource
                            set({
                                isLoading: false,
                                abortController: null,
                            });
                            return; // Don't throw for gateway timeouts
                        } else if (error.message) {
                            errorMessage = error.message;
                        }

                        // Clear loading state and abort controller on error
                        set({
                            error: errorMessage,
                            isLoading: false,
                            abortController: null,
                        });

                        // Re-throw so the caller can handle it
                        throw error;
                    }
                },

                // Abort current operation
                abortCurrentOperation: async () => {
                    const { currentSessionId, abortController, streamingMessageId } = get();

                    if (abortController) {
                        abortController.abort();
                    }

                    // Clear any pending timeouts
                    if (streamingMessageId) {
                        const timeoutKey = `timeout-${streamingMessageId}`;
                        if ((window as any)[timeoutKey]) {
                            clearTimeout((window as any)[timeoutKey]);
                            delete (window as any)[timeoutKey];
                        }
                    }

                    if (currentSessionId) {
                        try {
                            await opencodeClient.abortSession(currentSessionId);
                            set({
                                streamingMessageId: null,
                                abortController: null,
                                isLoading: false,
                            });
                        } catch (error) {
                            console.error("Failed to abort session:", error);
                        }
                    }
                },

                // Add streaming part to a message
                addStreamingPart: (sessionId: string, messageId: string, part: Part, role?: string) => {
                    const stateSnapshot = get();
                    const existingMessagesSnapshot = stateSnapshot.messages.get(sessionId) || [];
                    const existingMessageSnapshot = existingMessagesSnapshot.find((m) => m.info.id === messageId);
                    const actualRole = role || existingMessageSnapshot?.info.role || "assistant";

                    if (stateSnapshot.pendingUserMessageIds.has(messageId)) {
                        (window as any).__messageTracker?.(messageId, 'skipped_pending_user');
                        return;
                    }

                    const incomingText = extractTextFromPart(part);

                    if (actualRole === 'assistant' && !stateSnapshot.streamingMessageId) {
                        set({ streamingMessageId: messageId });
                        (window as any).__messageTracker?.(messageId, 'streamingId_set_EARLY');
                    }

                    if ((part as any).type === "file") {
                        (window as any).__messageTracker?.(messageId, 'skipped_file_part');
                        return;
                    }

                    const memoryStateSnapshot = get().sessionMemoryState.get(sessionId);
                    if (memoryStateSnapshot?.streamStartTime) {
                        const streamDuration = Date.now() - memoryStateSnapshot.streamStartTime;
                        if (streamDuration > MEMORY_LIMITS.ZOMBIE_TIMEOUT) {
                            if (!memoryStateSnapshot.isZombie) {
                                set((state) => {
                                    const newMemoryState = new Map(state.sessionMemoryState);
                                    newMemoryState.set(sessionId, {
                                        ...memoryStateSnapshot,
                                        isZombie: true,
                                    });
                                    return { sessionMemoryState: newMemoryState };
                                });
                            }

                            setTimeout(() => {
                                const store = get();
                                store.completeStreamingMessage(sessionId, messageId);
                            }, 0);
                            (window as any).__messageTracker?.(messageId, 'skipped_zombie_stream');
                            return;
                        }
                    }

                    set((state) => {
                        const sessionMessages = state.messages.get(sessionId) || [];
                        const messagesArray = [...sessionMessages];

                        const maintainTimeouts = (text: string) => {
                            const value = text || '';
                            const lastContentKey = `lastContent-${messageId}`;
                            const lastContent = (window as any)[lastContentKey];

                            if (value && lastContent === value) {
                                const currentState = get();
                                if (currentState.streamingMessageId === messageId) {
                                    const timeoutKey = `timeout-${messageId}`;
                                    if ((window as any)[timeoutKey]) {
                                        clearTimeout((window as any)[timeoutKey]);
                                        delete (window as any)[timeoutKey];
                                    }
                                    setTimeout(() => get().completeStreamingMessage(sessionId, messageId), 100);
                                }
                            }

                            (window as any)[lastContentKey] = value;

                            const timeoutKey = `timeout-${messageId}`;
                            if ((window as any)[timeoutKey]) {
                                clearTimeout((window as any)[timeoutKey]);
                            }
                            (window as any)[timeoutKey] = setTimeout(() => {
                                const currentState = get();
                                if (currentState.streamingMessageId === messageId) {
                                    get().completeStreamingMessage(sessionId, messageId);
                                }
                                delete (window as any)[timeoutKey];
                            }, 8000);
                        };

                        const isBackgroundSession = sessionId !== state.currentSessionId;
                        const memoryState = state.sessionMemoryState.get(sessionId);
                        if (isBackgroundSession && memoryState?.isStreaming) {
                            if (messagesArray.length >= MEMORY_LIMITS.BACKGROUND_STREAMING_BUFFER) {
                                messagesArray.shift();
                            }

                            const newMemoryState = new Map(state.sessionMemoryState);
                            newMemoryState.set(sessionId, {
                                ...memoryState,
                                backgroundMessageCount: (memoryState.backgroundMessageCount || 0) + 1,
                            });
                            state.sessionMemoryState = newMemoryState;
                        }

                        if (actualRole === 'assistant') {
                            const currentMemoryState = state.sessionMemoryState.get(sessionId);
                            if (currentMemoryState) {
                                const now = Date.now();
                                const nextMemoryState = new Map(state.sessionMemoryState);
                                nextMemoryState.set(sessionId, {
                                    ...currentMemoryState,
                                    isStreaming: true,
                                    streamStartTime: currentMemoryState.streamStartTime ?? now,
                                    lastAccessedAt: now,
                                    isZombie: false,
                                });
                                state.sessionMemoryState = nextMemoryState;
                            }
                        }

                        const updates: any = {};

                        if (incomingText) {
                            const duplicateUserMessage = messagesArray.find(
                                (m) =>
                                    m.info.role === "user" &&
                                    m.parts.some((p) => extractTextFromPart(p) === incomingText)
                            );
                            if (duplicateUserMessage) {
                                (window as any).__messageTracker?.(messageId, 'skipped_duplicate_user_text');
                                return state;
                            }
                        }

                        const messageIndex = messagesArray.findIndex((m) => m.info.id === messageId);

                        if (messageIndex !== -1) {
                            const existingMessage = messagesArray[messageIndex];
                            if (existingMessage.info.role === 'user') {
                                (window as any).__messageTracker?.(messageId, 'skipped_user_message_update');
                                return state;
                            }
                        }

                        if (messageIndex === -1) {
                            if (actualRole === 'user') {
                                (window as any).__messageTracker?.(messageId, 'skipped_new_user_message');
                                return state;
                            }

                            const { lastUsedProvider } = state;
                            const normalizedPart = normalizeStreamingPart(part);
                            (window as any).__messageTracker?.(messageId, `part_type:${(normalizedPart as any).type || 'unknown'}`);

                            if ((normalizedPart as any).type === 'text') {
                                maintainTimeouts((normalizedPart as any).text || '');
                            } else {
                                maintainTimeouts('');
                            }

                            const newMessage = {
                                info: {
                                    id: messageId,
                                    sessionID: sessionId,
                                    role: actualRole as "user" | "assistant",
                                    clientRole: actualRole,
                                    providerID: lastUsedProvider?.providerID || "",
                                    modelID: lastUsedProvider?.modelID || "",
                                    time: {
                                        created: Date.now(),
                                    },
                                } as any as Message,
                                parts: [normalizedPart],
                            };

                            const appended = [...messagesArray, newMessage];
                            const deduped = appended.filter(
                                (msg, idx, arr) => arr.findIndex((m) => m.info.id === msg.info.id) === idx
                            );

                            const newMessages = new Map(state.messages);
                            newMessages.set(sessionId, deduped);

                            if (actualRole === 'assistant') {
                                updates.messageStreamStates = touchStreamingLifecycle(state.messageStreamStates, messageId);
                            }

                            if (actualRole === 'assistant' && !state.streamingMessageId && !state.pendingUserMessageIds.has(messageId)) {
                                updates.streamingMessageId = messageId;
                                (window as any).__messageTracker?.(messageId, 'streamingId_set');
                                if (state.isLoading) {
                                    updates.isLoading = false;
                                }
                            }

                            return { messages: newMessages, ...updates };
                        } else {
                            const existingMessage = messagesArray[messageIndex];
                            const existingPartIndex = existingMessage.parts.findIndex((p) => p.id === part.id);

                            const normalizedPart = normalizeStreamingPart(
                                part,
                                existingPartIndex !== -1 ? existingMessage.parts[existingPartIndex] : undefined
                            );
                            (window as any).__messageTracker?.(messageId, `part_type:${(normalizedPart as any).type || 'unknown'}`);

                            const updatedMessage = { ...existingMessage };
                            if (existingPartIndex !== -1) {
                                updatedMessage.parts = updatedMessage.parts.map((p, idx) =>
                                    idx === existingPartIndex ? normalizedPart : p
                                );
                            } else {
                                updatedMessage.parts = [...updatedMessage.parts, normalizedPart];
                            }

                            const updatedMessages = [...messagesArray];
                            updatedMessages[messageIndex] = updatedMessage;

                            const newMessages = new Map(state.messages);
                            newMessages.set(sessionId, updatedMessages);

                            if (updatedMessage.info.role === "assistant") {
                                updates.messageStreamStates = touchStreamingLifecycle(state.messageStreamStates, messageId);
                            }

                            if (!state.streamingMessageId && updatedMessage.info.role === "assistant" && !state.pendingUserMessageIds.has(messageId)) {
                                updates.streamingMessageId = messageId;
                                (window as any).__messageTracker?.(messageId, 'streamingId_set');
                                if (state.isLoading) {
                                    updates.isLoading = false;
                                }
                            }

                            if ((normalizedPart as any).type === 'text') {
                                maintainTimeouts((normalizedPart as any).text || '');
                            } else {
                                maintainTimeouts('');
                            }

                            return { messages: newMessages, ...updates };
                        }
                    });

                    const partType = (part as any)?.type;
                    if (partType === 'step-finish' && actualRole !== 'user') {
                        setTimeout(() => {
                            const store = get();
                            store.completeStreamingMessage(sessionId, messageId);
                        }, 0);
                    }
                },
                markMessageStreamSettled: (messageId: string) => {
                    set((state) => {
                        const existing = state.messageStreamStates.get(messageId);
                        if (!existing) {
                            return state;
                        }

                        const completed = markLifecycleCompleted(state.messageStreamStates, messageId);
                        const lifecycle = completed.get(messageId);
                        const next = new Map(completed);

                        if (!lifecycle || lifecycle.phase === 'completed') {
                            next.delete(messageId);
                        }

                        return { messageStreamStates: next };
                    });
                    clearLifecycleCompletionTimer(messageId);
                },

                // Update message info (for agent, provider, model metadata)
                updateMessageInfo: (sessionId: string, messageId: string, messageInfo: any) => {

                    set((state) => {
                        const sessionMessages = state.messages.get(sessionId);
                        if (!sessionMessages) return state;

                        const messageIndex = sessionMessages.findIndex((msg) => msg.info.id === messageId);
                        if (messageIndex === -1) return state;

                        const existingMessage = sessionMessages[messageIndex];

                        // Check if this is a user message using multiple indicators
                        const existingInfo = existingMessage.info as any;
                        const isUserMessage =
                            existingInfo.userMessageMarker === true ||
                            existingInfo.clientRole === 'user' ||
                            existingInfo.role === 'user' ||
                            state.pendingUserMessageIds.has(messageId);

                        // For user messages, preserve critical fields and prevent role overwrite
                        if (isUserMessage) {
                            console.warn('[CRITICAL] Preserving user message markers for:', messageId);

                            // Only allow safe updates for user messages (e.g., timestamp updates)
                            // but preserve all user markers
                            const updatedInfo = {
                                ...existingMessage.info,
                                ...messageInfo,
                                // Force preserve user markers
                                role: 'user',
                                clientRole: 'user',
                                userMessageMarker: true,
                                // Remove any assistant-specific fields that may have been added
                                providerID: existingInfo.providerID || undefined,
                                modelID: existingInfo.modelID || undefined,
                            } as any;

                            const updatedMessage = {
                                ...existingMessage,
                                info: updatedInfo
                            };

                            const newMessages = new Map(state.messages);
                            const updatedSessionMessages = [...sessionMessages];
                            updatedSessionMessages[messageIndex] = updatedMessage;
                            newMessages.set(sessionId, updatedSessionMessages);

                            return { messages: newMessages };
                        }

                        // For assistant messages, allow normal updates
                        const updatedInfo = {
                            ...existingMessage.info,
                            ...messageInfo,
                        } as any;

                        // Ensure role doesn't change unexpectedly for assistant messages
                        if (messageInfo.role && messageInfo.role !== existingMessage.info.role) {
                            console.warn('[CRITICAL] Preventing role change for message:', messageId, 'from', existingMessage.info.role, 'to', messageInfo.role);
                            updatedInfo.role = existingMessage.info.role;
                        }

                        updatedInfo.clientRole = updatedInfo.clientRole ?? existingMessage.info.clientRole ?? existingMessage.info.role;
                        if (updatedInfo.clientRole === "user") {
                            updatedInfo.userMessageMarker = true;
                        }

                        const updatedMessage = {
                            ...existingMessage,
                            info: updatedInfo
                        };

                        const newMessages = new Map(state.messages);
                        const updatedSessionMessages = [...sessionMessages];
                        updatedSessionMessages[messageIndex] = updatedMessage;
                        newMessages.set(sessionId, updatedSessionMessages);

                        return { messages: newMessages };
                    });
                },

                 // Complete streaming message
                 completeStreamingMessage: (sessionId: string, messageId: string) => {
                     const state = get();

                     (window as any).__messageTracker?.(messageId, `completion_called_current:${state.streamingMessageId}`);

                     const shouldClearStreamingId = state.streamingMessageId === messageId;
                     if (shouldClearStreamingId) {
                         (window as any).__messageTracker?.(messageId, 'streamingId_cleared');
                     } else {
                         (window as any).__messageTracker?.(messageId, 'streamingId_NOT_cleared_different_id');
                     }

                     const lifecycleAfterCompletion = markLifecycleCooldown(state.messageStreamStates, messageId);

                     const updates: Record<string, any> = {};
                     if (shouldClearStreamingId) {
                         updates.streamingMessageId = null;
                         updates.abortController = null;
                         updates.isLoading = false;
                     }
                     if (lifecycleAfterCompletion !== state.messageStreamStates) {
                         updates.messageStreamStates = lifecycleAfterCompletion;
                     }

                      if (Object.keys(updates).length > 0) {
                          set(updates);
                      }

                      const lifecycleState = get().messageStreamStates.get(messageId);
                      if (lifecycleState?.phase === 'cooldown') {
                          scheduleLifecycleCompletion(messageId, get);
                      } else {
                          clearLifecycleCompletionTimer(messageId);
                      }

                      // Update memory state - mark as not streaming
                      set((state) => {
                          const memoryState = state.sessionMemoryState.get(sessionId);
                          if (!memoryState) return state;

                          const newMemoryState = new Map(state.sessionMemoryState);
                          newMemoryState.set(sessionId, {
                              ...memoryState,
                              isStreaming: false,
                              streamStartTime: undefined,
                              isZombie: false,
                              lastAccessedAt: Date.now(),
                          });
                          return { sessionMemoryState: newMemoryState };
                      });


// Update context usage for the session
                       try {
                           const sessionMessages = state.messages.get(sessionId) || [];
                           const assistantMessages = sessionMessages.filter(m => m.info.role === 'assistant');
                           if (assistantMessages.length > 0) {
                               const lastAssistantMessage = assistantMessages[assistantMessages.length - 1];
                               const totalTokens = extractTokensFromMessage(lastAssistantMessage);

                               // Get context limit
                               const configStore = (window as any).__zustand_config_store__;
                               if (configStore && typeof configStore.getState === 'function') {
                                   const currentModel = configStore.getState().getCurrentModel();
                                   const contextLimit = currentModel?.limit?.context || 0;
                                   if (contextLimit > 0) {
                                       // Update cache immediately
                                       get().updateSessionContextUsage(sessionId, contextLimit);

                                       // Only start polling if tokens are zero
                                       if (totalTokens === 0) {
                                           get().pollForTokenUpdates(sessionId, lastAssistantMessage.info.id);
                                       }
                                   }
                               }
                           }
                       } catch (error) {
                           // Don't crash - continue without context usage update
                       }

                     // Trim messages if this is the current session
                     if (sessionId === state.currentSessionId) {
                         // Small delay to ensure all updates are complete
                         setTimeout(() => {
                             get().trimToViewportWindow(sessionId);
                         }, 100);
                     }
                 },

                // Add permission request
                addPermission: (permission: Permission) => {
                    set((state) => {
                        const sessionPermissions = state.permissions.get(permission.sessionID) || [];
                        const newPermissions = new Map(state.permissions);
                        newPermissions.set(permission.sessionID, [...sessionPermissions, permission]);
                        return { permissions: newPermissions };
                    });
                },

                // Respond to permission request
                respondToPermission: async (sessionId: string, permissionId: string, response: PermissionResponse) => {
                    try {
                        await opencodeClient.respondToPermission(sessionId, permissionId, response);

                        // Remove permission from store after responding
                        set((state) => {
                            const sessionPermissions = state.permissions.get(sessionId) || [];
                            const updatedPermissions = sessionPermissions.filter((p) => p.id !== permissionId);
                            const newPermissions = new Map(state.permissions);
                            newPermissions.set(sessionId, updatedPermissions);
                            return { permissions: newPermissions };
                        });
                    } catch (error) {
                        set({
                            error: error instanceof Error ? error.message : "Failed to respond to permission",
                        });
                        throw error;
                    }
                },

                // Clear error
                clearError: () => {
                    set({ error: null });
                },

                // Get sessions by directory
                // Get model info from last message in session
                getLastMessageModel: (sessionId: string) => {
                    const { messages } = get();
                    const sessionMessages = messages.get(sessionId);

                    if (!sessionMessages || sessionMessages.length === 0) {
                        return null;
                    }

                    // Find the last assistant message (which has model info)
                    for (let i = sessionMessages.length - 1; i >= 0; i--) {
                        const message = sessionMessages[i];
                        if (message.info.role === "assistant" && "providerID" in message.info && "modelID" in message.info) {
                            return {
                                providerID: (message.info as any).providerID,
                                modelID: (message.info as any).modelID,
                            };
                        }
                    }

                    return null;
                },

                getSessionsByDirectory: (directory: string) => {
                    const { sessions } = get();

                    // For now, show all sessions until we can properly track directories
                    // The backend accepts directory as a parameter but doesn't return it in session data
                    // TODO: Request backend to include directory/path info in session responses
                    return sessions;
                },

                // File attachment methods
                addAttachedFile: async (file: File) => {
                    try {
                        // Check if we already have this file attached (by name and size)
                        const { attachedFiles } = get();
                        const isDuplicate = attachedFiles.some((f) => f.filename === file.name && f.size === file.size);
                        if (isDuplicate) {
                            console.log(`File "${file.name}" is already attached`);
                            return;
                        }

                        // Check file size (10MB limit)
                        const maxSize = 10 * 1024 * 1024; // 10MB
                        if (file.size > maxSize) {
                            set({ error: `File "${file.name}" is too large. Maximum size is 10MB.` });
                            return;
                        }

                        // Validate file type (basic check for common types)
                        const allowedTypes = [
                            "text/",
                            "application/json",
                            "application/xml",
                            "application/pdf",
                            "image/",
                            "video/",
                            "audio/",
                            "application/javascript",
                            "application/typescript",
                            "application/x-python",
                            "application/x-ruby",
                            "application/x-sh",
                            "application/yaml",
                            "application/octet-stream", // For unknown types
                        ];

                        const isAllowed = allowedTypes.some((type) => file.type.startsWith(type) || file.type === type || file.type === "");

                        if (!isAllowed && file.type !== "") {
                            console.warn(`File type "${file.type}" might not be supported`);
                        }

                        // Read file as data URL
                        const reader = new FileReader();
                        const dataUrl = await new Promise<string>((resolve, reject) => {
                            reader.onload = () => resolve(reader.result as string);
                            reader.onerror = reject;
                            reader.readAsDataURL(file);
                        });

                        // Extract just the filename from the path (in case of full path)
                        const extractFilename = (fullPath: string) => {
                            // Handle both forward slashes and backslashes
                            const parts = fullPath.replace(/\\/g, "/").split("/");
                            return parts[parts.length - 1] || fullPath;
                        };

                        const attachedFile: AttachedFile = {
                            id: `file-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
                            file,
                            dataUrl,
                            mimeType: file.type || "application/octet-stream",
                            filename: extractFilename(file.name),
                            size: file.size,
                            source: "local", // Default to local file
                        };

                        set((state) => ({
                            attachedFiles: [...state.attachedFiles, attachedFile],
                            error: null, // Clear any previous errors
                        }));
                    } catch (error) {
                        set({
                            error: error instanceof Error ? error.message : "Failed to attach file",
                        });
                    }
                },

                addServerFile: async (path: string, name: string, content?: string) => {
                    try {
                        const { attachedFiles } = get();

                        // Check for duplicates
                        const isDuplicate = attachedFiles.some((f) => f.serverPath === path && f.source === "server");
                        if (isDuplicate) {
                            console.log(`Server file "${name}" is already attached`);
                            return;
                        }

                        // If content is not provided, we'll fetch it from the server using the API
                        let fileContent = content;
                        if (!fileContent) {
                            try {
                                // Use the OpenCode API to read the file
                                const tempClient = opencodeClient.getApiClient();

                                // Split the full path into directory and filename
                                const lastSlashIndex = path.lastIndexOf("/");
                                const directory = lastSlashIndex > 0 ? path.substring(0, lastSlashIndex) : "/";
                                const filename = lastSlashIndex > 0 ? path.substring(lastSlashIndex + 1) : path;

                                const response = await tempClient.file.read({
                                    query: {
                                        path: filename, // Just the filename
                                        directory: directory, // The directory context
                                    },
                                });

                                // The response.data is of type FileContent which has a content property
                                if (response.data && "content" in response.data) {
                                    fileContent = response.data.content;
                                } else {
                                    fileContent = "";
                                }
                            } catch (error) {
                                console.error("Failed to read server file:", error);
                                // For binary files or errors, just mark it as attached without content
                                fileContent = `[File: ${name}]`;
                            }
                        }

                        // Create a File object from the server content
                        const blob = new Blob([fileContent || ""], { type: "text/plain" });
                        const file = new File([blob], name, { type: "text/plain" });

                        // Create data URL for preview (handle Unicode properly)
                        const encoder = new TextEncoder();
                        const data = encoder.encode(fileContent || "");
                        const base64 = btoa(String.fromCharCode(...data));
                        const dataUrl = `data:text/plain;base64,${base64}`;

                        const attachedFile: AttachedFile = {
                            id: `server-file-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
                            file,
                            dataUrl,
                            mimeType: "text/plain",
                            filename: name,
                            size: blob.size,
                            source: "server",
                            serverPath: path,
                        };

                        set((state) => ({
                            attachedFiles: [...state.attachedFiles, attachedFile],
                            error: null,
                        }));
                    } catch (error) {
                        set({
                            error: error instanceof Error ? error.message : "Failed to attach server file",
                        });
                    }
                },

                removeAttachedFile: (id: string) => {
                    set((state) => ({
                        attachedFiles: state.attachedFiles.filter((f) => f.id !== id),
                    }));
                },

                clearAttachedFiles: () => {
                    set({ attachedFiles: [] });
                },

                // Sync messages from external source (e.g., TUI)
                syncMessages: (sessionId: string, messages: { info: Message; parts: Part[] }[]) => {
                    set((state) => {
                        const newMessages = new Map(state.messages);
                        const normalizedMessages = messages.map((message) => {
                            const infoWithMarker = {
                                ...message.info,
                                clientRole: (message.info as any)?.clientRole ?? message.info.role,
                                userMessageMarker: message.info.role === "user" ? true : (message.info as any)?.userMessageMarker,
                            } as any;

                            return {
                                ...message,
                                info: infoWithMarker,
                            };
                        });

                        const previousMessages = state.messages.get(sessionId) || [];
                        const previousIds = new Set(previousMessages.map((msg) => msg.info.id));
                        const nextIds = new Set(normalizedMessages.map((msg) => msg.info.id));
                        const removedIds: string[] = [];
                        previousIds.forEach((id) => {
                            if (!nextIds.has(id)) {
                                removedIds.push(id);
                            }
                        });

                        newMessages.set(sessionId, normalizedMessages);
                        const newPending = new Set(state.pendingUserMessageIds);
                        normalizedMessages.forEach((message) => {
                            if (message.info?.clientRole === "user") {
                                newPending.delete(message.info.id);
                            }
                        });

                        const result: Record<string, any> = {
                            messages: newMessages,
                            pendingUserMessageIds: newPending,
                            isSyncing: true,
                        };

                        clearLifecycleTimersForIds(removedIds);
                        const updatedLifecycle = removeLifecycleEntries(state.messageStreamStates, removedIds);
                        if (updatedLifecycle !== state.messageStreamStates) {
                            result.messageStreamStates = updatedLifecycle;
                        }

                        // Mark this as a sync update, not a new message
                        return result;
                    });

// Update context usage for the session
                     try {
                         const assistantMessages = messages.filter(m => m.info.role === 'assistant');
                         if (assistantMessages.length > 0) {
                             const lastAssistantMessage = assistantMessages[assistantMessages.length - 1];
                             // Safely get config store with fallback
                             const configStore = (window as any).__zustand_config_store__;
                             if (configStore && typeof configStore.getState === 'function') {
                                 const currentModel = configStore.getState().getCurrentModel();
                                 const contextLimit = currentModel?.limit?.context || 0;
                                 if (contextLimit > 0) {
                                     get().updateSessionContextUsage(sessionId, contextLimit);
                                 }
                             }
                         }
                     } catch (error) {
                         // Silently handle config store access errors - don't crash the sync
                     }

                    // Clear sync flag after a brief moment
                    setTimeout(() => {
                        set({ isSyncing: false });
                    }, 100);
                },

                clearPendingUserMessage: (messageId: string) => {
                    set((state) => {
                        if (!state.pendingUserMessageIds.has(messageId)) {
                            return state;
                        }
                        const newPending = new Set(state.pendingUserMessageIds);
                        newPending.delete(messageId);
                        return { pendingUserMessageIds: newPending };
                    });
                },

                // Memory management functions
                updateViewportAnchor: (sessionId: string, anchor: number) => {
                    set((state) => {
                        const memoryState = state.sessionMemoryState.get(sessionId) || {
                            viewportAnchor: 0,
                            isStreaming: false,
                            lastAccessedAt: Date.now(),
                            backgroundMessageCount: 0,
                        };

                        const newMemoryState = new Map(state.sessionMemoryState);
                        newMemoryState.set(sessionId, { ...memoryState, viewportAnchor: anchor });
                        return { sessionMemoryState: newMemoryState };
                    });
                },

                trimToViewportWindow: (sessionId: string, targetSize: number = MEMORY_LIMITS.VIEWPORT_MESSAGES) => {
                    const state = get();
                    const sessionMessages = state.messages.get(sessionId);
                    if (!sessionMessages || sessionMessages.length <= targetSize) {
                        return;
                    }

                    const memoryState = state.sessionMemoryState.get(sessionId) || {
                        viewportAnchor: sessionMessages.length - 1,
                        isStreaming: false,
                        lastAccessedAt: Date.now(),
                        backgroundMessageCount: 0,
                    };

                    // Don't trim if actively streaming
                    if (memoryState.isStreaming && sessionId === state.currentSessionId) {
                        return;
                    }

                    // Calculate window boundaries
                    const anchor = memoryState.viewportAnchor || sessionMessages.length - 1;
                    let start = Math.max(0, anchor - Math.floor(targetSize / 2));
                    let end = Math.min(sessionMessages.length, start + targetSize);

                    // Adjust if we're at the boundaries
                    if (end === sessionMessages.length && end - start < targetSize) {
                        start = Math.max(0, end - targetSize);
                    }

                    // Trim messages
                    const trimmedMessages = sessionMessages.slice(start, end);
                    const trimmedIds = new Set(trimmedMessages.map((message) => message.info.id));
                    const removedIds = sessionMessages
                        .filter((message) => !trimmedIds.has(message.info.id))
                        .map((message) => message.info.id);

                    set((state) => {
                        const newMessages = new Map(state.messages);
                        newMessages.set(sessionId, trimmedMessages);

                        // Update viewport anchor to new relative position
                        const newMemoryState = new Map(state.sessionMemoryState);
                        const updatedMemoryState = {
                            ...memoryState,
                            viewportAnchor: anchor - start,
                        };
                        newMemoryState.set(sessionId, updatedMemoryState);

                        const result: Record<string, any> = {
                            messages: newMessages,
                            sessionMemoryState: newMemoryState,
                        };

                        clearLifecycleTimersForIds(removedIds);
                        const updatedLifecycle = removeLifecycleEntries(state.messageStreamStates, removedIds);
                        if (updatedLifecycle !== state.messageStreamStates) {
                            result.messageStreamStates = updatedLifecycle;
                        }

                        return result;
                    });
                },

                evictLeastRecentlyUsed: () => {
                    const state = get();
                    const sessionCount = state.messages.size;

                    // Only evict if we exceed the limit
                    if (sessionCount <= MEMORY_LIMITS.MAX_SESSIONS) return;

                    // Build array of sessions with their memory state
                    const sessionsWithMemory: Array<[string, SessionMemoryState]> = [];
                    state.messages.forEach((_, sessionId) => {
                        const memoryState = state.sessionMemoryState.get(sessionId) || {
                            viewportAnchor: 0,
                            isStreaming: false,
                            lastAccessedAt: 0,
                            backgroundMessageCount: 0,
                        };
                        sessionsWithMemory.push([sessionId, memoryState]);
                    });

                    // Filter out current session and streaming sessions
                    const evictable = sessionsWithMemory.filter(([id, memState]) => id !== state.currentSessionId && !memState.isStreaming);

                    if (evictable.length === 0) return; // Nothing to evict

                    // Find least recently used
                    evictable.sort((a, b) => a[1].lastAccessedAt - b[1].lastAccessedAt);
                    const lruSessionId = evictable[0][0];

                    // Remove from cache
                    set((state) => {
                        const removedMessages = state.messages.get(lruSessionId) || [];
                        const removedIds = removedMessages.map((message) => message.info.id);

                        const newMessages = new Map(state.messages);
                        const newMemoryState = new Map(state.sessionMemoryState);

                        newMessages.delete(lruSessionId);
                        newMemoryState.delete(lruSessionId);

                        const result: Record<string, any> = {
                            messages: newMessages,
                            sessionMemoryState: newMemoryState,
                        };

                        clearLifecycleTimersForIds(removedIds);
                        const updatedLifecycle = removeLifecycleEntries(state.messageStreamStates, removedIds);
                        if (updatedLifecycle !== state.messageStreamStates) {
                            result.messageStreamStates = updatedLifecycle;
                        }

                        return result;
                    });
                },

                // Load more messages when scrolling
                loadMoreMessages: async (sessionId: string, direction: "up" | "down" = "up") => {
                    const state = get();
                    const currentMessages = state.messages.get(sessionId);
                    const memoryState = state.sessionMemoryState.get(sessionId);

                    if (!currentMessages || !memoryState) {
                        return;
                    }

                    // Check if we have more messages to load
                    if (memoryState.totalAvailableMessages && currentMessages.length >= memoryState.totalAvailableMessages) {
                        return;
                    }

                    try {
                        // Fetch all messages again (API doesn't support pagination yet)
                        const allMessages = await opencodeClient.getSessionMessages(sessionId);

                        if (direction === "up" && currentMessages.length > 0) {
                            // Find where our current messages start in the full list
                            const firstCurrentMessage = currentMessages[0];
                            const indexInAll = allMessages.findIndex((m) => m.info.id === firstCurrentMessage.info.id);

                            if (indexInAll > 0) {
                                // Load N more messages before current ones
                                const loadCount = Math.min(MEMORY_LIMITS.VIEWPORT_MESSAGES, indexInAll);
                                const newMessages = allMessages.slice(indexInAll - loadCount, indexInAll);

                                set((state) => {
                                    const updatedMessages = [...newMessages, ...currentMessages];
                                    const newMessagesMap = new Map(state.messages);
                                    newMessagesMap.set(sessionId, updatedMessages);

                                    // Update memory state
                                    const newMemoryState = new Map(state.sessionMemoryState);
                                    newMemoryState.set(sessionId, {
                                        ...memoryState,
                                        viewportAnchor: memoryState.viewportAnchor + newMessages.length, // Adjust anchor
                                        hasMoreAbove: indexInAll - loadCount > 0,
                                        totalAvailableMessages: allMessages.length,
                                    });

                                    return {
                                        messages: newMessagesMap,
                                        sessionMemoryState: newMemoryState,
                                    };
                                });
                            } else if (indexInAll === 0) {
                                // Update memory state to indicate no more messages above
                                set((state) => {
                                    const newMemoryState = new Map(state.sessionMemoryState);
                                    newMemoryState.set(sessionId, {
                                        ...memoryState,
                                        hasMoreAbove: false,
                                    });
                                    return { sessionMemoryState: newMemoryState };
                                });
                            }
                        }
                    } catch (error) {
                        // Silent fail - user won't notice
                    }
                },

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
                analyzeAndSaveExternalSessionChoices: async (sessionId: string, agents: any[]) => {
                    const { messages } = get();
                    const sessionMessages = messages.get(sessionId) || [];

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
                        // Strategy 1: Check if message has agent property (WebUI messages)
                        if ("agent" in messageInfo && messageInfo.agent) {
                            return messageInfo.agent;
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
                            for (let i = messageIndex - 1; i >= 0; i--) {
                                const prevMessage = assistantMessages[i];
                                const prevInfo = prevMessage.info as any;
                                if (prevInfo.providerID === messageInfo.providerID && prevInfo.modelID === messageInfo.modelID) {
                                    // Same model was used - check if we already processed this agent
                                    if (prevInfo.agent) {
                                        return prevInfo.agent;
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

                    // Analyze assistant messages for agent/provider/model usage
                    const assistantMessages = sessionMessages.filter((m) => m.info.role === "assistant").sort((a, b) => a.info.time.created - b.info.time.created);

                    for (let messageIndex = 0; messageIndex < assistantMessages.length; messageIndex++) {
                        const message = assistantMessages[messageIndex];
                        const { info } = message;
                        const infoAny = info as any; // Cast to access runtime properties

                        if (infoAny.providerID && infoAny.modelID) {
                            const agentName = extractAgentFromMessage(infoAny, messageIndex);

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

                    // Save discovered choices as WebUI selections using existing method
                    const { saveAgentModelForSession } = get();
                    for (const [agentName, choice] of agentLastChoices) {
                        saveAgentModelForSession(sessionId, agentName, choice.providerId, choice.modelId);
                    }

                    return agentLastChoices;
                },

                // Initialize new WebUI session with agent defaults
                initializeNewWebUISession: (sessionId: string, agents: any[]) => {
                    const { saveAgentModelForSession, markSessionAsWebUICreated } = get();

                    // Mark session as WebUI created
                    markSessionAsWebUICreated(sessionId);

                    // Save agent defaults as initial selections for new WebUI sessions
                    for (const agent of agents.filter((a: any) => a.mode === "primary")) {
                        if (agent.model?.providerID && agent.model?.modelID) {
                            saveAgentModelForSession(sessionId, agent.name, agent.model.providerID, agent.model.modelID);
                        }
                    }
                },

                // Check if session was created by WebUI or external (TUI/API)
                isWebUICreatedSession: (sessionId: string) => {
                    const { webUICreatedSessions } = get();
                    return webUICreatedSessions.has(sessionId);
                },

                // Mark session as WebUI created
                markSessionAsWebUICreated: (sessionId: string) => {
                    set((state) => {
                        const newWebUICreatedSessions = new Set(state.webUICreatedSessions);
                        newWebUICreatedSessions.add(sessionId);
                        return {
                            webUICreatedSessions: newWebUICreatedSessions,
                        };
                    });
                },

// Get context usage for current session - cache-first approach
                  getContextUsage: (contextLimit: number) => {
                      const { currentSessionId, sessionContextUsage, messages } = get();
                      if (!currentSessionId || contextLimit === 0) return null;

                      const sessionMessages = messages.get(currentSessionId) || [];
                      const assistantMessages = sessionMessages.filter(m => m.info.role === 'assistant');

                      if (assistantMessages.length === 0) return null;

                      const lastAssistantMessage = assistantMessages[assistantMessages.length - 1];
                      const lastMessageId = lastAssistantMessage.info.id;

                      // Check cache - use if same message, recalculate percentage if context limit changed
                      const cachedUsage = sessionContextUsage.get(currentSessionId);
                      if (cachedUsage && (cachedUsage as any).lastMessageId === lastMessageId) {
                          // Same message - check if context limit changed
                          if (cachedUsage.contextLimit !== contextLimit && cachedUsage.totalTokens > 0) {
                              // Context limit changed - recalculate percentage with cached tokens
                              const newPercentage = (cachedUsage.totalTokens / contextLimit) * 100;
                              return {
                                  totalTokens: cachedUsage.totalTokens,
                                  percentage: Math.min(newPercentage, 100),
                                  contextLimit,
                                  lastMessageId,
                              } as any;
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
                      const result = {
                          totalTokens,
                          percentage: Math.min(percentage, 100),
                          contextLimit,
                          lastMessageId, // Track which message this calculation is based on
                      } as any;

                       // Update cache immediately

                        // Cache update will be handled by caller in useEffect

                       return result;
                   },

// Update stored context usage for a session
                  updateSessionContextUsage: (sessionId: string, contextLimit: number) => {
                      const sessionMessages = get().messages.get(sessionId) || [];
                      let totalTokens = 0;

                       // Calculate cumulative tokens from ALL messages (user + assistant)
                       for (const message of sessionMessages) {
                           const messageTokens = extractTokensFromMessage(message);
                           totalTokens += messageTokens;
                       }

                       // Only update if there are tokens
                       if (totalTokens === 0) return;

                       const percentage = contextLimit > 0 ? (totalTokens / contextLimit) * 100 : 0;

                       set((state) => {
                           const newContextUsage = new Map(state.sessionContextUsage);
                           newContextUsage.set(sessionId, {
                               totalTokens,
                               percentage: Math.min(percentage, 100),
                               contextLimit,
                           });
                           return { sessionContextUsage: newContextUsage };
                       });
                  },

                 // Initialize context usage for a session if not stored or 0
                 initializeSessionContextUsage: (sessionId: string, contextLimit: number) => {
                     const state = get();
                     const existingUsage = state.sessionContextUsage.get(sessionId);

                     // Only initialize if not stored or totalTokens is 0
                     if (!existingUsage || existingUsage.totalTokens === 0) {
                         get().updateSessionContextUsage(sessionId, contextLimit);
                     }
                 },

                  // Debug method to inspect messages for a specific session
                  debugSessionMessages: async (sessionId: string) => {
                      try {
                          const messages = await opencodeClient.getSessionMessages(sessionId);

                          // Log assistant messages specifically
                          const assistantMessages = messages.filter(m => m.info.role === 'assistant');

                          if (assistantMessages.length > 0) {
                              const lastMessage = assistantMessages[assistantMessages.length - 1];
                              console.log('🔍 Last Assistant Message Token Debug:');
                              console.log('Message ID:', lastMessage.info.id);
                              console.log('Raw tokens from info:', (lastMessage.info as any).tokens);
                              console.log('Extracted total tokens:', extractTokensFromMessage(lastMessage));

                              // Check if tokens are in parts
                              const tokenParts = lastMessage.parts.filter(p => (p as any).tokens);
                              if (tokenParts.length > 0) {
                                  console.log('Tokens found in parts:', tokenParts.map(p => (p as any).tokens));
                              }

                              // Show full message structure
                              console.log('Full message info:', lastMessage.info);
                              console.log('Message parts count:', lastMessage.parts.length);
                          } else {
                              console.log('ℹ️ No assistant messages found in session');
                          }
                      } catch (error) {
                          console.error('❌ Error debugging session messages:', error);
                      }
                  },

                 // Poll for token updates in a message (handles async token population)
                 pollForTokenUpdates: (sessionId: string, messageId: string, maxAttempts: number = 10) => {
                     let attempts = 0;

                     const poll = () => {
                         attempts++;
                         const state = get();
                         const sessionMessages = state.messages.get(sessionId) || [];
                         const message = sessionMessages.find(m => m.info.id === messageId);

                         if (message && message.info.role === 'assistant') {
                             const totalTokens = extractTokensFromMessage(message);

                             if (totalTokens > 0) {
                                 // Found tokens, update cache and stop
                                 const configStore = (window as any).__zustand_config_store__;
                                 if (configStore?.getState) {
                                     const currentModel = configStore.getState().getCurrentModel();
                                     const contextLimit = currentModel?.limit?.context || 0;
                                     if (contextLimit > 0) {
                                         get().updateSessionContextUsage(sessionId, contextLimit);
                                     }
                                 }
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
            }),
            {
                name: "session-storage",
                 partialize: (state) => ({
                     currentSessionId: state.currentSessionId,
                     sessions: state.sessions,
                     sessionModelSelections: Array.from(state.sessionModelSelections.entries()),
                     sessionAgentSelections: Array.from(state.sessionAgentSelections.entries()),
                     // Convert nested Map to array for persistence
                     sessionAgentModelSelections: Array.from(state.sessionAgentModelSelections.entries()).map(([sessionId, agentMap]) => [sessionId, Array.from(agentMap.entries())]),
                     webUICreatedSessions: Array.from(state.webUICreatedSessions),
                     currentAgentContext: Array.from(state.currentAgentContext.entries()),
                     sessionContextUsage: Array.from(state.sessionContextUsage.entries()),
                 }),
                 // Add merge function to properly restore Maps from arrays
                 merge: (persistedState: any, currentState) => {
                     // Restore nested Map structure
                     const agentModelSelections = new Map();
                     if (persistedState?.sessionAgentModelSelections) {
                         persistedState.sessionAgentModelSelections.forEach(([sessionId, agentArray]: [string, any[]]) => {
                             agentModelSelections.set(sessionId, new Map(agentArray));
                         });
                     }

                     return {
                         ...currentState,
                         ...(persistedState as object),
                         sessionModelSelections: new Map(persistedState?.sessionModelSelections || []),
                         sessionAgentSelections: new Map(persistedState?.sessionAgentSelections || []),
                         sessionAgentModelSelections: agentModelSelections,
                         webUICreatedSessions: new Set(persistedState?.webUICreatedSessions || []),
                         currentAgentContext: new Map(persistedState?.currentAgentContext || []),
                         sessionContextUsage: new Map(persistedState?.sessionContextUsage || []),
                     };
                 },
            },
        ),
        {
            name: "session-store",
        },
    ),
);

// Expose store reference for cross-store communication
if (typeof window !== "undefined") {
    (window as any).__zustand_session_store__ = useSessionStore;
}
