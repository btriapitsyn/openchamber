import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type { Session, Message, Part } from "@opencode-ai/sdk";
import type { Permission, PermissionResponse } from "@/types/permission";
import type { SessionStore, AttachedFile, EditPermissionMode } from "./types/sessionTypes";

// Import sub-stores
import { useSessionStore as useSessionManagementStore } from "./sessionStore";
import { useMessageStore } from "./messageStore";
import { useFileStore } from "./fileStore";
import { useContextStore } from "./contextStore";
import { usePermissionStore } from "./permissionStore";

// Re-export types for backward compatibility
export type { AttachedFile, EditPermissionMode };
export { MEMORY_LIMITS } from "./types/sessionTypes";

// Main composed session store that maintains the original interface
export const useSessionStore = create<SessionStore>()(
    devtools(
        (set, get) => ({
            // Initial state - will be populated by subscriptions
            sessions: [],
            currentSessionId: null,
            lastLoadedDirectory: null,
            messages: new Map(),
            sessionMemoryState: new Map(),
            messageStreamStates: new Map(),
            sessionCompactionUntil: new Map(),
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
            sessionAgentEditModes: new Map(),

                // Delegate actions to appropriate sub-stores
                getSessionAgentEditMode: (sessionId: string, agentName: string | undefined, defaultMode?: EditPermissionMode) => {
                    return useContextStore.getState().getSessionAgentEditMode(sessionId, agentName, defaultMode);
                },

                toggleSessionAgentEditMode: (sessionId: string, agentName: string | undefined, defaultMode?: EditPermissionMode) => {
                    return useContextStore.getState().toggleSessionAgentEditMode(sessionId, agentName, defaultMode);
                },

                setSessionAgentEditMode: (sessionId: string, agentName: string | undefined, mode: EditPermissionMode, defaultMode?: EditPermissionMode) => {
                    return useContextStore.getState().setSessionAgentEditMode(sessionId, agentName, mode, defaultMode);
                },

                loadSessions: () => useSessionManagementStore.getState().loadSessions(),
                createSession: async (title?: string) => {
                    const result = await useSessionManagementStore.getState().createSession(title);
                    // After creating session, ensure it becomes current
                    if (result) {
                        useSessionManagementStore.getState().setCurrentSession(result.id);
                    }
                    return result;
                },
                deleteSession: (id: string) => useSessionManagementStore.getState().deleteSession(id),
                updateSessionTitle: (id: string, title: string) => useSessionManagementStore.getState().updateSessionTitle(id, title),
                shareSession: (id: string) => useSessionManagementStore.getState().shareSession(id),
                unshareSession: (id: string) => useSessionManagementStore.getState().unshareSession(id),
                setCurrentSession: async (id: string | null) => {
                    const previousSessionId = get().currentSessionId;

                    // Clean up previous session if not streaming
                    if (previousSessionId && previousSessionId !== id) {
                        const memoryState = get().sessionMemoryState.get(previousSessionId);
                        if (!memoryState?.isStreaming) {
                            // Trim messages for the session we're leaving
                            get().trimToViewportWindow(previousSessionId);
                        }
                    }

                    // Update current session
                    useSessionManagementStore.getState().setCurrentSession(id);

                    // Load messages for new session if it exists
                    if (id) {
                        // Check if we already have messages for this session
                        const existingMessages = get().messages.get(id);
                        if (!existingMessages) {
                            // Only load messages if we don't have them yet
                            await get().loadMessages(id);
                        }
                    }
                },
                loadMessages: (sessionId: string) => useMessageStore.getState().loadMessages(sessionId),
                sendMessage: (content: string, providerID: string, modelID: string, agent?: string, attachments?: AttachedFile[]) => {
                    const currentSessionId = useSessionManagementStore.getState().currentSessionId;
                    return useMessageStore.getState().sendMessage(content, providerID, modelID, agent, currentSessionId || undefined, attachments);
                },
                abortCurrentOperation: () => {
                    const currentSessionId = useSessionManagementStore.getState().currentSessionId;
                    return useMessageStore.getState().abortCurrentOperation(currentSessionId || undefined);
                },
                addStreamingPart: (sessionId: string, messageId: string, part: Part, role?: string) => {
                    const currentSessionId = useSessionManagementStore.getState().currentSessionId;
                    return useMessageStore.getState().addStreamingPart(sessionId, messageId, part, role, currentSessionId || undefined);
                },
                completeStreamingMessage: (sessionId: string, messageId: string) => useMessageStore.getState().completeStreamingMessage(sessionId, messageId),
                markMessageStreamSettled: (messageId: string) => useMessageStore.getState().markMessageStreamSettled(messageId),
                updateMessageInfo: (sessionId: string, messageId: string, messageInfo: Record<string, unknown>) => useMessageStore.getState().updateMessageInfo(sessionId, messageId, messageInfo),
                updateSessionCompaction: (sessionId: string, compactingTimestamp?: number | null) => useMessageStore.getState().updateSessionCompaction(sessionId, compactingTimestamp ?? null),
                addPermission: (permission: Permission) => {
                    const contextData = {
                        currentAgentContext: useContextStore.getState().currentAgentContext,
                        sessionAgentSelections: useContextStore.getState().sessionAgentSelections,
                        getSessionAgentEditMode: useContextStore.getState().getSessionAgentEditMode,
                    };
                    return usePermissionStore.getState().addPermission(permission, contextData);
                },
                respondToPermission: (sessionId: string, permissionId: string, response: PermissionResponse) => usePermissionStore.getState().respondToPermission(sessionId, permissionId, response),
                clearError: () => useSessionManagementStore.getState().clearError(),
                getSessionsByDirectory: (directory: string) => useSessionManagementStore.getState().getSessionsByDirectory(directory),
                getLastMessageModel: (sessionId: string) => useMessageStore.getState().getLastMessageModel(sessionId),
                getCurrentAgent: (sessionId: string) => useContextStore.getState().getCurrentAgent(sessionId),
                syncMessages: (sessionId: string, messages: { info: Message; parts: Part[] }[]) => useMessageStore.getState().syncMessages(sessionId, messages),
                applySessionMetadata: (sessionId: string, metadata: Partial<Session>) => useSessionManagementStore.getState().applySessionMetadata(sessionId, metadata),

                // File attachment actions
                addAttachedFile: (file: File) => useFileStore.getState().addAttachedFile(file),
                addServerFile: (path: string, name: string, content?: string) => useFileStore.getState().addServerFile(path, name, content),
                removeAttachedFile: (id: string) => useFileStore.getState().removeAttachedFile(id),
                clearAttachedFiles: () => useFileStore.getState().clearAttachedFiles(),

                // Memory management actions
                updateViewportAnchor: (sessionId: string, anchor: number) => useMessageStore.getState().updateViewportAnchor(sessionId, anchor),
                trimToViewportWindow: (sessionId: string, targetSize?: number) => {
                    const currentSessionId = useSessionManagementStore.getState().currentSessionId;
                    return useMessageStore.getState().trimToViewportWindow(sessionId, targetSize, currentSessionId || undefined);
                },
                evictLeastRecentlyUsed: () => {
                    const currentSessionId = useSessionManagementStore.getState().currentSessionId;
                    return useMessageStore.getState().evictLeastRecentlyUsed(currentSessionId || undefined);
                },
                loadMoreMessages: (sessionId: string, direction: "up" | "down") => useMessageStore.getState().loadMoreMessages(sessionId, direction),

                // Session-specific model/agent persistence
                saveSessionModelSelection: (sessionId: string, providerId: string, modelId: string) => useContextStore.getState().saveSessionModelSelection(sessionId, providerId, modelId),
                getSessionModelSelection: (sessionId: string) => useContextStore.getState().getSessionModelSelection(sessionId),
                saveSessionAgentSelection: (sessionId: string, agentName: string) => useContextStore.getState().saveSessionAgentSelection(sessionId, agentName),
                getSessionAgentSelection: (sessionId: string) => useContextStore.getState().getSessionAgentSelection(sessionId),
                saveAgentModelForSession: (sessionId: string, agentName: string, providerId: string, modelId: string) => useContextStore.getState().saveAgentModelForSession(sessionId, agentName, providerId, modelId),
                getAgentModelForSession: (sessionId: string, agentName: string) => useContextStore.getState().getAgentModelForSession(sessionId, agentName),
                analyzeAndSaveExternalSessionChoices: (sessionId: string, agents: Record<string, unknown>[]) => {
                    const messages = useMessageStore.getState().messages;
                    return useContextStore.getState().analyzeAndSaveExternalSessionChoices(sessionId, agents, messages);
                },
                isOpenChamberCreatedSession: (sessionId: string) => useSessionManagementStore.getState().isOpenChamberCreatedSession(sessionId),
                markSessionAsOpenChamberCreated: (sessionId: string) => useSessionManagementStore.getState().markSessionAsOpenChamberCreated(sessionId),
                initializeNewOpenChamberSession: (sessionId: string, agents: Record<string, unknown>[]) => useSessionManagementStore.getState().initializeNewOpenChamberSession(sessionId, agents),
                getContextUsage: (contextLimit: number) => {
                    const currentSessionId = useSessionManagementStore.getState().currentSessionId;
                    if (!currentSessionId) return null;
                    const messages = useMessageStore.getState().messages;
                    return useContextStore.getState().getContextUsage(currentSessionId, contextLimit, messages);
                },
                updateSessionContextUsage: (sessionId: string, contextLimit: number) => {
                    const messages = useMessageStore.getState().messages;
                    return useContextStore.getState().updateSessionContextUsage(sessionId, contextLimit, messages);
                },
                initializeSessionContextUsage: (sessionId: string, contextLimit: number) => {
                    const messages = useMessageStore.getState().messages;
                    return useContextStore.getState().initializeSessionContextUsage(sessionId, contextLimit, messages);
                },
                debugSessionMessages: async (sessionId: string) => {
                    const messages = useMessageStore.getState().messages.get(sessionId) || [];
                    const session = useSessionManagementStore.getState().sessions.find(s => s.id === sessionId);
                    console.log(`Debug session ${sessionId}:`, {
                        session,
                        messageCount: messages.length,
                        messages: messages.map(m => ({
                            id: m.info.id,
                            role: m.info.role,
                            parts: m.parts.length,
                            tokens: (m.info as Record<string, unknown>).tokens
                        }))
                    });
                },
                pollForTokenUpdates: (sessionId: string, messageId: string, maxAttempts?: number) => {
                    const messages = useMessageStore.getState().messages;
                    return useContextStore.getState().pollForTokenUpdates(sessionId, messageId, messages, maxAttempts);
                },
                clearPendingUserMessage: (messageId: string) => useMessageStore.getState().clearPendingUserMessage(messageId),
            }),
        {
            name: "composed-session-store",
        }
    ),
);

// PERFORMANCE: Set up selective subscriptions to sub-stores with equality checks
// This reduces cascading updates by only propagating when state actually changes
useSessionManagementStore.subscribe((state, prevState) => {
    // Only update if state actually changed (reference equality for primitives, object identity for complex types)
    if (
        state.sessions === prevState.sessions &&
        state.currentSessionId === prevState.currentSessionId &&
        state.lastLoadedDirectory === prevState.lastLoadedDirectory &&
        state.isLoading === prevState.isLoading &&
        state.error === prevState.error &&
        state.webUICreatedSessions === prevState.webUICreatedSessions
    ) {
        return; // No change, skip update
    }

    useSessionStore.setState({
        sessions: state.sessions,
        currentSessionId: state.currentSessionId,
        lastLoadedDirectory: state.lastLoadedDirectory,
        isLoading: state.isLoading,
        error: state.error,
        webUICreatedSessions: state.webUICreatedSessions,
    });
});

useMessageStore.subscribe((state, prevState) => {
    // Only update if state actually changed
    if (
        state.messages === prevState.messages &&
        state.sessionMemoryState === prevState.sessionMemoryState &&
        state.messageStreamStates === prevState.messageStreamStates &&
        state.sessionCompactionUntil === prevState.sessionCompactionUntil &&
        state.streamingMessageId === prevState.streamingMessageId &&
        state.abortController === prevState.abortController &&
        state.lastUsedProvider === prevState.lastUsedProvider &&
        state.isSyncing === prevState.isSyncing &&
        state.pendingUserMessageIds === prevState.pendingUserMessageIds
    ) {
        return; // No change, skip update
    }

    useSessionStore.setState({
        messages: state.messages,
        sessionMemoryState: state.sessionMemoryState,
        messageStreamStates: state.messageStreamStates,
        sessionCompactionUntil: state.sessionCompactionUntil,
        streamingMessageId: state.streamingMessageId,
        abortController: state.abortController,
        lastUsedProvider: state.lastUsedProvider,
        isSyncing: state.isSyncing,
        pendingUserMessageIds: state.pendingUserMessageIds,
    });
});

useFileStore.subscribe((state, prevState) => {
    if (state.attachedFiles === prevState.attachedFiles) {
        return; // No change, skip update
    }

    useSessionStore.setState({
        attachedFiles: state.attachedFiles,
    });
});

useContextStore.subscribe((state, prevState) => {
    if (
        state.sessionModelSelections === prevState.sessionModelSelections &&
        state.sessionAgentSelections === prevState.sessionAgentSelections &&
        state.sessionAgentModelSelections === prevState.sessionAgentModelSelections &&
        state.currentAgentContext === prevState.currentAgentContext &&
        state.sessionContextUsage === prevState.sessionContextUsage &&
        state.sessionAgentEditModes === prevState.sessionAgentEditModes
    ) {
        return; // No change, skip update
    }

    useSessionStore.setState({
        sessionModelSelections: state.sessionModelSelections,
        sessionAgentSelections: state.sessionAgentSelections,
        sessionAgentModelSelections: state.sessionAgentModelSelections,
        currentAgentContext: state.currentAgentContext,
        sessionContextUsage: state.sessionContextUsage,
        sessionAgentEditModes: state.sessionAgentEditModes,
    });
});

usePermissionStore.subscribe((state, prevState) => {
    if (state.permissions === prevState.permissions) {
        return; // No change, skip update
    }

    useSessionStore.setState({
        permissions: state.permissions,
    });
});

// Initialize with current state
useSessionStore.setState({
    sessions: useSessionManagementStore.getState().sessions,
    currentSessionId: useSessionManagementStore.getState().currentSessionId,
    lastLoadedDirectory: useSessionManagementStore.getState().lastLoadedDirectory,
    isLoading: useSessionManagementStore.getState().isLoading,
    error: useSessionManagementStore.getState().error,
    webUICreatedSessions: useSessionManagementStore.getState().webUICreatedSessions,
    messages: useMessageStore.getState().messages,
    sessionMemoryState: useMessageStore.getState().sessionMemoryState,
    messageStreamStates: useMessageStore.getState().messageStreamStates,
    sessionCompactionUntil: useMessageStore.getState().sessionCompactionUntil,
    streamingMessageId: useMessageStore.getState().streamingMessageId,
    abortController: useMessageStore.getState().abortController,
    lastUsedProvider: useMessageStore.getState().lastUsedProvider,
    isSyncing: useMessageStore.getState().isSyncing,
    pendingUserMessageIds: useMessageStore.getState().pendingUserMessageIds,
    permissions: usePermissionStore.getState().permissions,
    attachedFiles: useFileStore.getState().attachedFiles,
    sessionModelSelections: useContextStore.getState().sessionModelSelections,
    sessionAgentSelections: useContextStore.getState().sessionAgentSelections,
    sessionAgentModelSelections: useContextStore.getState().sessionAgentModelSelections,
    currentAgentContext: useContextStore.getState().currentAgentContext,
    sessionContextUsage: useContextStore.getState().sessionContextUsage,
    sessionAgentEditModes: useContextStore.getState().sessionAgentEditModes,
});

// Expose store reference for cross-store communication
if (typeof window !== "undefined") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__zustand_session_store__ = useSessionStore;
}