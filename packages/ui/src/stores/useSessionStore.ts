import { create } from "zustand";
import type { StoreApi, UseBoundStore } from "zustand";
import { devtools } from "zustand/middleware";
import type { Session, Message, Part } from "@opencode-ai/sdk";
import type { Permission, PermissionResponse } from "@/types/permission";
import type { SessionStore, AttachedFile, EditPermissionMode } from "./types/sessionTypes";
import { ACTIVE_SESSION_WINDOW, MEMORY_LIMITS } from "./types/sessionTypes";

import { useSessionStore as useSessionManagementStore } from "./sessionStore";
import { useMessageStore } from "./messageStore";
import { useFileStore } from "./fileStore";
import { useContextStore } from "./contextStore";
import { usePermissionStore } from "./permissionStore";
import { opencodeClient } from "@/lib/opencode/client";
import { useDirectoryStore } from "./useDirectoryStore";
import { useConfigStore } from "./useConfigStore";
import { EXECUTION_FORK_META_TEXT } from "@/lib/messages/executionMeta";
import { flattenAssistantTextParts } from "@/lib/messages/messageText";

export type { AttachedFile, EditPermissionMode };
export { MEMORY_LIMITS, ACTIVE_SESSION_WINDOW } from "./types/sessionTypes";

declare global {
    interface Window {
        __zustand_session_store__?: UseBoundStore<StoreApi<SessionStore>>;
    }
}

const normalizePath = (value?: string | null): string | null => {
    if (typeof value !== "string") {
        return null;
    }
    const trimmed = value.trim();
    if (!trimmed) {
        return null;
    }
    const replaced = trimmed.replace(/\\/g, "/");
    if (replaced === "/") {
        return "/";
    }
    return replaced.length > 1 ? replaced.replace(/\/+$/, "") : replaced;
};

const resolveSessionDirectory = (
    sessions: Session[],
    sessionId: string | null | undefined,
    getWorktreeMetadata: (id: string) => { path?: string } | undefined,
): string | null => {
    if (!sessionId) {
        return null;
    }
    const metadataPath = getWorktreeMetadata(sessionId)?.path;
    if (typeof metadataPath === "string" && metadataPath.trim().length > 0) {
        return normalizePath(metadataPath);
    }

    const target = sessions.find((session) => session.id === sessionId) as { directory?: string | null } | undefined;
    if (!target) {
        return null;
    }
    return normalizePath(target.directory ?? null);
};

export const useSessionStore = create<SessionStore>()(
    devtools(
        (set, get) => ({

            sessions: [],
            currentSessionId: null,
            lastLoadedDirectory: null,
            messages: new Map(),
            sessionMemoryState: new Map(),
            messageStreamStates: new Map(),
            sessionCompactionUntil: new Map(),
            sessionAbortFlags: new Map(),
            permissions: new Map(),
            attachedFiles: [],
            isLoading: false,
            error: null,
            streamingMessageIds: new Map(),
            abortControllers: new Map(),
            lastUsedProvider: null,
            isSyncing: false,
            sessionModelSelections: new Map(),
            sessionAgentSelections: new Map(),
            sessionAgentModelSelections: new Map(),
            webUICreatedSessions: new Set(),
            worktreeMetadata: new Map(),
            availableWorktrees: [],
            currentAgentContext: new Map(),
            sessionContextUsage: new Map(),
            sessionAgentEditModes: new Map(),
            abortPromptSessionId: null,
            abortPromptExpiresAt: null,
            sessionActivityPhase: new Map(),
            userSummaryTitles: new Map(),
            pendingInputText: null,

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
                createSession: async (title?: string, directoryOverride?: string | null, parentID?: string | null) => {
                    const result = await useSessionManagementStore.getState().createSession(title, directoryOverride, parentID);

                    if (result?.id) {
                        await get().setCurrentSession(result.id);
                    }
                    return result;
                },
                createSessionFromAssistantMessage: async (sourceMessageId: string) => {
                    if (!sourceMessageId) {
                        return;
                    }

                    const messageStore = useMessageStore.getState();
                    const { messages, lastUsedProvider } = messageStore;
                    let sourceEntry: { info: Message; parts: Part[] } | undefined;
                    let sourceSessionId: string | undefined;

                    messages.forEach((messageList, sessionId) => {
                        const found = messageList.find((entry) => entry.info?.id === sourceMessageId);
                        if (found && !sourceEntry) {
                            sourceEntry = found;
                            sourceSessionId = sessionId;
                        }
                    });

                    if (!sourceEntry || sourceEntry.info.role !== "assistant") {
                        return;
                    }

                    const assistantPlanText = flattenAssistantTextParts(sourceEntry.parts);
                    if (!assistantPlanText.trim()) {
                        return;
                    }

                    const sessionManagementStore = useSessionManagementStore.getState();
                    const directory = resolveSessionDirectory(
                        sessionManagementStore.sessions,
                        sourceSessionId ?? null,
                        sessionManagementStore.getWorktreeMetadata,
                    );

                    const session = await get().createSession(undefined, directory ?? null, null);
                    if (!session) {
                        return;
                    }

                    const { currentProviderId, currentModelId, currentAgentName } = useConfigStore.getState();
                    const providerID = currentProviderId || lastUsedProvider?.providerID;
                    const modelID = currentModelId || lastUsedProvider?.modelID;

                    if (!providerID || !modelID) {
                        return;
                    }

                    await opencodeClient.sendMessage({
                        id: session.id,
                        providerID,
                        modelID,
                        text: assistantPlanText,
                        prefaceText: EXECUTION_FORK_META_TEXT,
                        agent: currentAgentName ?? undefined,
                    });
                },
                deleteSession: (id: string, options) => useSessionManagementStore.getState().deleteSession(id, options),
                deleteSessions: (ids: string[], options) => useSessionManagementStore.getState().deleteSessions(ids, options),
                updateSessionTitle: (id: string, title: string) => useSessionManagementStore.getState().updateSessionTitle(id, title),
                shareSession: (id: string) => useSessionManagementStore.getState().shareSession(id),
                unshareSession: (id: string) => useSessionManagementStore.getState().unshareSession(id),
                setCurrentSession: async (id: string | null) => {
                    const previousSessionId = get().currentSessionId;

                    const sessionDirectory = resolveSessionDirectory(
                        useSessionManagementStore.getState().sessions,
                        id,
                        useSessionManagementStore.getState().getWorktreeMetadata
                    );
                    const fallbackDirectory = opencodeClient.getDirectory() ?? useDirectoryStore.getState().currentDirectory ?? null;
                    const resolvedDirectory = sessionDirectory ?? fallbackDirectory;

                    try {
                        opencodeClient.setDirectory(resolvedDirectory ?? undefined);
                    } catch (error) {
                        console.warn("Failed to set OpenCode directory for session switch:", error);
                    }

                    if (previousSessionId && previousSessionId !== id) {
                        const memoryState = get().sessionMemoryState.get(previousSessionId);
                        if (!memoryState?.isStreaming) {

                            const previousMessages = get().messages.get(previousSessionId) || [];
                            if (previousMessages.length > 0) {
                                get().updateViewportAnchor(previousSessionId, previousMessages.length - 1);
                            }

                            get().trimToViewportWindow(previousSessionId, MEMORY_LIMITS.VIEWPORT_MESSAGES);
                        }
                    }

                    useSessionManagementStore.getState().setCurrentSession(id);

                    if (id) {

                        const existingMessages = get().messages.get(id);
                        if (!existingMessages) {

                            await get().loadMessages(id);
                        }

                        get().trimToViewportWindow(id, ACTIVE_SESSION_WINDOW);
                    }

                    get().evictLeastRecentlyUsed();
                },
                loadMessages: (sessionId: string) => useMessageStore.getState().loadMessages(sessionId),
                sendMessage: (content: string, providerID: string, modelID: string, agent?: string, attachments?: AttachedFile[], agentMentionName?: string) => {
                    const currentSessionId = useSessionManagementStore.getState().currentSessionId;
                    return useMessageStore.getState().sendMessage(content, providerID, modelID, agent, currentSessionId || undefined, attachments, agentMentionName);
                },
                abortCurrentOperation: () => {
                    const currentSessionId = useSessionManagementStore.getState().currentSessionId;
                    return useMessageStore.getState().abortCurrentOperation(currentSessionId || undefined);
                },
                armAbortPrompt: (durationMs = 3000) => {
                    const sessionId = useSessionManagementStore.getState().currentSessionId;
                    if (!sessionId) {
                        return null;
                    }
                    const expiresAt = Date.now() + durationMs;
                    set({ abortPromptSessionId: sessionId, abortPromptExpiresAt: expiresAt });
                    return expiresAt;
                },
                clearAbortPrompt: () => {
                    set({ abortPromptSessionId: null, abortPromptExpiresAt: null });
                },
                acknowledgeSessionAbort: (sessionId: string) => {
                    if (!sessionId) {
                        return;
                    }
                    useMessageStore.getState().acknowledgeSessionAbort(sessionId);
                },
                addStreamingPart: (sessionId: string, messageId: string, part: Part, role?: string) => {
                    const currentSessionId = useSessionManagementStore.getState().currentSessionId;

                    const effectiveCurrent = currentSessionId || sessionId;
                    return useMessageStore.getState().addStreamingPart(sessionId, messageId, part, role, effectiveCurrent);
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

                addAttachedFile: (file: File) => useFileStore.getState().addAttachedFile(file),
                addServerFile: (path: string, name: string, content?: string) => useFileStore.getState().addServerFile(path, name, content),
                removeAttachedFile: (id: string) => useFileStore.getState().removeAttachedFile(id),
                clearAttachedFiles: () => useFileStore.getState().clearAttachedFiles(),

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
                setWorktreeMetadata: (sessionId: string, metadata) => useSessionManagementStore.getState().setWorktreeMetadata(sessionId, metadata),
                setSessionDirectory: (sessionId: string, directory: string | null) => useSessionManagementStore.getState().setSessionDirectory(sessionId, directory),
                getWorktreeMetadata: (sessionId: string) => useSessionManagementStore.getState().getWorktreeMetadata(sessionId),
                getContextUsage: (contextLimit: number, outputLimit: number) => {
                    const currentSessionId = useSessionManagementStore.getState().currentSessionId;
                    if (!currentSessionId) return null;
                    const messages = useMessageStore.getState().messages;
                    return useContextStore.getState().getContextUsage(currentSessionId, contextLimit, outputLimit, messages);
                },
                updateSessionContextUsage: (sessionId: string, contextLimit: number, outputLimit: number) => {
                    const messages = useMessageStore.getState().messages;
                    return useContextStore.getState().updateSessionContextUsage(sessionId, contextLimit, outputLimit, messages);
                },
                initializeSessionContextUsage: (sessionId: string, contextLimit: number, outputLimit: number) => {
                    const messages = useMessageStore.getState().messages;
                    return useContextStore.getState().initializeSessionContextUsage(sessionId, contextLimit, outputLimit, messages);
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
                updateSession: (session: Session) => useSessionManagementStore.getState().updateSession(session),

                revertToMessage: async (sessionId: string, messageId: string) => {
                    // Get the message text before reverting
                    const messages = useMessageStore.getState().messages.get(sessionId) || [];
                    const targetMessage = messages.find((m) => m.info.id === messageId);
                    let messageText = '';

                    if (targetMessage && targetMessage.info.role === 'user') {
                        // Extract text from user message parts
                        const textParts = targetMessage.parts.filter((p) => p.type === 'text');
                        messageText = textParts
                            .map((p) => {
                                const part = p as { text?: string; content?: string };
                                return part.text || part.content || '';
                            })
                            .join('\n')
                            .trim();
                    }

                    // Call revert API
                    const updatedSession = await opencodeClient.revertSession(sessionId, messageId);

                    // Update session in store (this stores the revert.messageID)
                    useSessionManagementStore.getState().updateSession(updatedSession);

                    // Filter out reverted messages from the store
                    // Messages with ID >= revert.messageID should be removed
                    const currentMessages = useMessageStore.getState().messages.get(sessionId) || [];
                    const revertMessageId = updatedSession.revert?.messageID;

                    if (revertMessageId) {
                        // Find the index of the revert message
                        const revertIndex = currentMessages.findIndex((m) => m.info.id === revertMessageId);
                        if (revertIndex !== -1) {
                            // Keep only messages before the revert point
                            const filteredMessages = currentMessages.slice(0, revertIndex);
                            useMessageStore.getState().syncMessages(sessionId, filteredMessages);
                        }
                    }

                    // Set pending input text for ChatInput to consume
                    if (messageText) {
                        set({ pendingInputText: messageText });
                    }
                },

                setPendingInputText: (text: string | null) => {
                    set({ pendingInputText: text });
                },

                consumePendingInputText: () => {
                    const text = get().pendingInputText;
                    if (text !== null) {
                        set({ pendingInputText: null });
                    }
                    return text;
                },
            }),
        {
            name: "composed-session-store",
        }
    ),
);

useSessionManagementStore.subscribe((state, prevState) => {

    if (
        state.sessions === prevState.sessions &&
        state.currentSessionId === prevState.currentSessionId &&
        state.lastLoadedDirectory === prevState.lastLoadedDirectory &&
        state.isLoading === prevState.isLoading &&
        state.error === prevState.error &&
        state.webUICreatedSessions === prevState.webUICreatedSessions &&
        state.worktreeMetadata === prevState.worktreeMetadata &&
        state.availableWorktrees === prevState.availableWorktrees
    ) {
        return;
    }

    useSessionStore.setState({
        sessions: state.sessions,
        currentSessionId: state.currentSessionId,
        lastLoadedDirectory: state.lastLoadedDirectory,
        isLoading: state.isLoading,
        error: state.error,
        webUICreatedSessions: state.webUICreatedSessions,
        worktreeMetadata: state.worktreeMetadata,
        availableWorktrees: state.availableWorktrees,
    });
});

useMessageStore.subscribe((state, prevState) => {

    if (
        state.messages === prevState.messages &&
        state.sessionMemoryState === prevState.sessionMemoryState &&
        state.messageStreamStates === prevState.messageStreamStates &&
        state.sessionCompactionUntil === prevState.sessionCompactionUntil &&
        state.sessionAbortFlags === prevState.sessionAbortFlags &&
        state.streamingMessageIds === prevState.streamingMessageIds &&
        state.abortControllers === prevState.abortControllers &&
        state.lastUsedProvider === prevState.lastUsedProvider &&
        state.isSyncing === prevState.isSyncing
    ) {
        return;
    }

    const userSummaryTitles = new Map<string, { title: string; createdAt: number | null }>();
    state.messages.forEach((messageList, sessionId) => {
        if (!Array.isArray(messageList) || messageList.length === 0) {
            return;
        }
        for (let index = messageList.length - 1; index >= 0; index -= 1) {
            const entry = messageList[index];
            if (!entry || !entry.info) {
                continue;
            }
            const info = entry.info as Message & {
                summary?: { title?: string | null } | null;
                time?: { created?: number | null };
            };
            if (info.role === "user") {
                const title = info.summary?.title;
                if (typeof title === "string") {
                    const trimmed = title.trim();
                    if (trimmed.length > 0) {
                        const createdAt =
                            info.time && typeof info.time.created === "number"
                                ? info.time.created
                                : null;
                        userSummaryTitles.set(sessionId, { title: trimmed, createdAt });
                        break;
                    }
                }
            }
        }
    });

    useSessionStore.setState({
        messages: state.messages,
        sessionMemoryState: state.sessionMemoryState,
        messageStreamStates: state.messageStreamStates,
        sessionCompactionUntil: state.sessionCompactionUntil,
        sessionAbortFlags: state.sessionAbortFlags,
        streamingMessageIds: state.streamingMessageIds,
        abortControllers: state.abortControllers,
        lastUsedProvider: state.lastUsedProvider,
        isSyncing: state.isSyncing,
        userSummaryTitles,
    });
});

useFileStore.subscribe((state, prevState) => {
    if (state.attachedFiles === prevState.attachedFiles) {
        return;
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
        return;
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
        return;
    }

    useSessionStore.setState({
        permissions: state.permissions,
    });
});

useSessionStore.setState({
    sessions: useSessionManagementStore.getState().sessions,
    currentSessionId: useSessionManagementStore.getState().currentSessionId,
    lastLoadedDirectory: useSessionManagementStore.getState().lastLoadedDirectory,
    isLoading: useSessionManagementStore.getState().isLoading,
    error: useSessionManagementStore.getState().error,
    webUICreatedSessions: useSessionManagementStore.getState().webUICreatedSessions,
    worktreeMetadata: useSessionManagementStore.getState().worktreeMetadata,
    availableWorktrees: useSessionManagementStore.getState().availableWorktrees,
    messages: useMessageStore.getState().messages,
    sessionMemoryState: useMessageStore.getState().sessionMemoryState,
    messageStreamStates: useMessageStore.getState().messageStreamStates,
    sessionCompactionUntil: useMessageStore.getState().sessionCompactionUntil,
    sessionAbortFlags: useMessageStore.getState().sessionAbortFlags,
    streamingMessageIds: useMessageStore.getState().streamingMessageIds,
    abortControllers: useMessageStore.getState().abortControllers,
    lastUsedProvider: useMessageStore.getState().lastUsedProvider,
    isSyncing: useMessageStore.getState().isSyncing,
    permissions: usePermissionStore.getState().permissions,
    attachedFiles: useFileStore.getState().attachedFiles,
    sessionModelSelections: useContextStore.getState().sessionModelSelections,
    sessionAgentSelections: useContextStore.getState().sessionAgentSelections,
    sessionAgentModelSelections: useContextStore.getState().sessionAgentModelSelections,
    currentAgentContext: useContextStore.getState().currentAgentContext,
    sessionContextUsage: useContextStore.getState().sessionContextUsage,
    sessionAgentEditModes: useContextStore.getState().sessionAgentEditModes,
    abortPromptSessionId: null,
    abortPromptExpiresAt: null,
});

if (typeof window !== "undefined") {
    window.__zustand_session_store__ = useSessionStore;
}
