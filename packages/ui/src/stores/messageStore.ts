/* eslint-disable @typescript-eslint/no-explicit-any */
import { create } from "zustand";
import { devtools, persist, createJSONStorage } from "zustand/middleware";
import type { Message, Part } from "@opencode-ai/sdk";
import { opencodeClient } from "@/lib/opencode/client";
import { isFullySyntheticMessage } from "@/lib/messages/synthetic";
import type { SessionMemoryState, MessageStreamLifecycle, AttachedFile } from "./types/sessionTypes";
import { MEMORY_LIMITS } from "./types/sessionTypes";
import {
    touchStreamingLifecycle,
    markLifecycleCooldown,
    markLifecycleCompleted,
    removeLifecycleEntries,
    clearLifecycleTimersForIds,
    scheduleLifecycleCompletion
} from "./utils/streamingUtils";
import { extractTextFromPart, normalizeStreamingPart } from "./utils/messageUtils";
import { getSafeStorage } from "./utils/safeStorage";
import { useFileStore } from "./fileStore";
import { useSessionStore } from "./sessionStore";

// Batching system for streaming updates
interface QueuedPart {
    sessionId: string;
    messageId: string;
    part: Part;
    role?: string;
    currentSessionId?: string;
}

let batchQueue: QueuedPart[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const BATCH_WINDOW_MS = 50;
const COMPACTION_WINDOW_MS = 30_000;

// PERFORMANCE: Timeout management using WeakMap instead of window globals
// WeakMap allows automatic garbage collection when messages are deleted
const timeoutRegistry = new Map<string, ReturnType<typeof setTimeout>>();
const lastContentRegistry = new Map<string, string>();

const MIN_SORTABLE_LENGTH = 10;

const extractSortableId = (id: unknown): string | null => {
    if (typeof id !== "string") {
        return null;
    }
    const trimmed = id.trim();
    if (!trimmed) {
        return null;
    }
    const underscoreIndex = trimmed.indexOf("_");
    const candidate = underscoreIndex >= 0 ? trimmed.slice(underscoreIndex + 1) : trimmed;
    if (!candidate || candidate.length < MIN_SORTABLE_LENGTH) {
        return null;
    }
    return candidate;
};

const isIdNewer = (id: string, referenceId: string): boolean => {
    const currentSortable = extractSortableId(id);
    const referenceSortable = extractSortableId(referenceId);
    if (!currentSortable || !referenceSortable) {
        return true; // If we can't compare safely, allow it
    }
    if (currentSortable.length !== referenceSortable.length) {
        return true; // Mixed formats, do not block
    }
    return currentSortable > referenceSortable;
};

const computeMaxTrimmedHeadId = (removed: Array<{ info: any }>, previous?: string): string | undefined => {
    let maxId = previous;
    let maxSortable = previous ? extractSortableId(previous) : null;

    for (const entry of removed) {
        const candidateId = entry?.info?.id;
        const candidateSortable = extractSortableId(candidateId);
        if (!candidateId || !candidateSortable) {
            continue;
        }
        if (!maxSortable || candidateSortable > maxSortable) {
            maxSortable = candidateSortable;
            maxId = candidateId;
        }
    }

    return maxId;
};

const resolveSessionDirectory = async (sessionId: string | null | undefined): Promise<string | undefined> => {
    if (!sessionId) {
        return undefined;
    }

    try {
        const sessionStore = useSessionStore.getState();
        const metadata = sessionStore.getWorktreeMetadata(sessionId);
        if (metadata?.path) {
            return metadata.path;
        }

        const session = sessionStore.sessions.find((entry) => entry.id === sessionId) as { directory?: string } | undefined;
        const sessionDirectory =
            typeof session?.directory === 'string' && session.directory.length > 0 ? session.directory : undefined;

        return sessionDirectory;
    } catch (error) {
        console.warn('Failed to resolve session directory override:', error);
        return undefined;
    }
};

const executeWithSessionDirectory = async <T>(sessionId: string | null | undefined, operation: () => Promise<T>): Promise<T> => {
    const directoryOverride = await resolveSessionDirectory(sessionId);
    if (directoryOverride) {
        return opencodeClient.withDirectory(directoryOverride, operation);
    }
    return operation();
};

interface SessionAbortRecord {
    timestamp: number;
    acknowledged: boolean;
}

interface MessageState {
    messages: Map<string, { info: any; parts: Part[] }[]>;
    sessionMemoryState: Map<string, SessionMemoryState>;
    messageStreamStates: Map<string, MessageStreamLifecycle>;
    streamingMessageId: string | null;
    abortController: AbortController | null;
    lastUsedProvider: { providerID: string; modelID: string } | null;
    isSyncing: boolean;
    pendingUserMessageIds: Set<string>;
    pendingAssistantParts: Map<string, { sessionId: string; parts: Part[] }>;
    sessionCompactionUntil: Map<string, number>;
    sessionAbortFlags: Map<string, SessionAbortRecord>;
}


interface MessageActions {
    loadMessages: (sessionId: string) => Promise<void>;
    sendMessage: (content: string, providerID: string, modelID: string, agent?: string, currentSessionId?: string, attachments?: AttachedFile[]) => Promise<void>;
    abortCurrentOperation: (currentSessionId?: string) => Promise<void>;
    _addStreamingPartImmediate: (sessionId: string, messageId: string, part: Part, role?: string, currentSessionId?: string) => void;
    addStreamingPart: (sessionId: string, messageId: string, part: Part, role?: string, currentSessionId?: string) => void;
    forceCompleteMessage: (sessionId: string | null | undefined, messageId: string, source?: "timeout" | "cooldown") => void;
    completeStreamingMessage: (sessionId: string, messageId: string) => void;
    markMessageStreamSettled: (messageId: string) => void;
    updateMessageInfo: (sessionId: string, messageId: string, messageInfo: any) => void;
    syncMessages: (sessionId: string, messages: { info: Message; parts: Part[] }[]) => void;
    updateViewportAnchor: (sessionId: string, anchor: number) => void;
    trimToViewportWindow: (sessionId: string, targetSize?: number, currentSessionId?: string) => void;
    evictLeastRecentlyUsed: (currentSessionId?: string) => void;
    loadMoreMessages: (sessionId: string, direction: "up" | "down") => Promise<void>;
    getLastMessageModel: (sessionId: string) => { providerID?: string; modelID?: string } | null;
    clearPendingUserMessage: (messageId: string) => void;
    updateSessionCompaction: (sessionId: string, compactingTimestamp: number | null | undefined) => void;
    acknowledgeSessionAbort: (sessionId: string) => void;
}

type MessageStore = MessageState & MessageActions;

export const useMessageStore = create<MessageStore>()(
    devtools(
        persist(
            (set, get) => ({
                // Initial State
                messages: new Map(),
                sessionMemoryState: new Map(),
                messageStreamStates: new Map(),
                streamingMessageId: null,
                abortController: null,
                lastUsedProvider: null,
                isSyncing: false,
                pendingUserMessageIds: new Set(),
                pendingAssistantParts: new Map(),
                sessionCompactionUntil: new Map(),
                sessionAbortFlags: new Map(),

                // Load messages for a session
                loadMessages: async (sessionId: string, limit: number = MEMORY_LIMITS.VIEWPORT_MESSAGES) => {
                        const allMessages = await executeWithSessionDirectory(sessionId, () => opencodeClient.getSessionMessages(sessionId));
                        const watermark = get().sessionMemoryState.get(sessionId)?.trimmedHeadMaxId;

                        // Only keep the last N messages (show most recent), respecting head-trim watermark
                        const afterWatermark = watermark
                            ? allMessages.filter((message) => {
                                  const messageId = message?.info?.id;
                                  if (!messageId) return true;
                                  return isIdNewer(messageId, watermark);
                              })
                            : allMessages;
                        const messagesToKeep = afterWatermark.slice(-limit);

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

                            // Merge pending user messages to prevent them from being wiped out by server sync
                            const previousMessages = state.messages.get(sessionId) || [];
                            const pendingMessages = previousMessages.filter(
                                (msg) => state.pendingUserMessageIds.has(msg.info.id)
                            );
                            
                            const serverIds = new Set(normalizedMessages.map((m) => m.info.id));
                            const uniquePending = pendingMessages.filter((msg) => !serverIds.has(msg.info.id));
                            
                            // Merge and sort
                            const mergedMessages = [...normalizedMessages, ...uniquePending].sort(
                                (a, b) => (a.info.time?.created || 0) - (b.info.time?.created || 0)
                            );

                            const previousIds = new Set(previousMessages.map((msg) => msg.info.id));
                            const nextIds = new Set(mergedMessages.map((msg) => msg.info.id));
                            const removedIds: string[] = [];
                            previousIds.forEach((id) => {
                                if (!nextIds.has(id)) {
                                    removedIds.push(id);
                                }
                            });

                            newMessages.set(sessionId, mergedMessages);

                            // Initialize memory state with viewport at the bottom
                            const newMemoryState = new Map(state.sessionMemoryState);
                            const previousMemoryState = state.sessionMemoryState.get(sessionId);
                            newMemoryState.set(sessionId, {
                                viewportAnchor: mergedMessages.length - 1, // Anchor at bottom
                                isStreaming: false,
                                lastAccessedAt: Date.now(),
                                backgroundMessageCount: 0,
                                totalAvailableMessages: allMessages.length + uniquePending.length, // Track total for UI
                                hasMoreAbove: allMessages.length > messagesToKeep.length, // Can load more if we didn't get all
                                trimmedHeadMaxId: previousMemoryState?.trimmedHeadMaxId,
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
                            };

                        clearLifecycleTimersForIds(removedIds);
                        const updatedLifecycle = removeLifecycleEntries(state.messageStreamStates, removedIds);
                        if (updatedLifecycle !== state.messageStreamStates) {
                            result.messageStreamStates = updatedLifecycle;
                        }

                        if (removedIds.length > 0) {
                            const nextPendingParts = new Map(state.pendingAssistantParts);
                            let pendingChanged = false;
                            removedIds.forEach((id) => {
                                if (nextPendingParts.delete(id)) {
                                    pendingChanged = true;
                                }
                            });
                            if (pendingChanged) {
                                result.pendingAssistantParts = nextPendingParts;
                            }
                        }

                        return result;

                        });
                },

                

                // Send a message (handles both regular messages and commands)
                sendMessage: async (content: string, providerID: string, modelID: string, agent?: string, currentSessionId?: string, attachments?: AttachedFile[]) => {
                    if (!currentSessionId) {
                        throw new Error("No session selected");
                    }

                    const sessionId = currentSessionId;

                    if (get().sessionAbortFlags.has(sessionId)) {
                        set((state) => {
                            const nextAbortFlags = new Map(state.sessionAbortFlags);
                            nextAbortFlags.delete(sessionId);
                            return { sessionAbortFlags: nextAbortFlags };
                        });
                    }

                    await executeWithSessionDirectory(sessionId, async () => {
                        try {
                            const isCommand = content.startsWith("/");

                            if (isCommand) {
                                const spaceIndex = content.indexOf(" ");
                                const command = spaceIndex === -1 ? content.substring(1) : content.substring(1, spaceIndex);
                                const commandArgs = spaceIndex === -1 ? "" : content.substring(spaceIndex + 1).trim();

                                try {
                                    const apiClient = opencodeClient.getApiClient();
                                    const directory = opencodeClient.getDirectory();

                                    if (command === "init") {
                                        const messageId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

                                        await apiClient.session.init({
                                            path: { id: sessionId },
                                            body: {
                                                messageID: messageId,
                                                providerID,
                                                modelID,
                                            },
                                            query: directory ? { directory } : undefined,
                                        });

                                        return;
                                    }

                                    if (command === "summarize") {
                                        await apiClient.session.summarize({
                                            path: { id: sessionId },
                                            body: {
                                                providerID,
                                                modelID,
                                            },
                                            query: directory ? { directory } : undefined,
                                        });

                                        return;
                                    }

                                    const commandDetails = await opencodeClient.getCommandDetails(command);

                                    const pushCommandMessage = (text: string) => {
                                        const userMessageId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
                                        const userMessage = {
                                            info: {
                                                id: userMessageId,
                                                sessionID: sessionId,
                                                role: "user" as const,
                                                time: {
                                                    created: Date.now(),
                                                },
                                            } as Message,
                                            parts: [
                                                {
                                                    type: "text",
                                                    text,
                                                    id: `part-${Date.now()}`,
                                                    sessionID: sessionId,
                                                    messageID: userMessageId,
                                                } as Part,
                                            ],
                                        };

                                        set((state) => {
                                            const sessionMessages = state.messages.get(sessionId) || [];
                                            const newMessages = new Map(state.messages);
                                            newMessages.set(sessionId, [...sessionMessages, userMessage]);
                                            return { messages: newMessages };
                                        });
                                    };

                                    if (commandDetails?.template) {
                                        const expandedTemplate = commandDetails.template.replace(/\$ARGUMENTS/g, commandArgs);
                                        pushCommandMessage(expandedTemplate);
                                    } else {
                                        pushCommandMessage(content);
                                    }

                                    const requestBody: any = {
                                        command,
                                        arguments: commandArgs || "",
                                    };

                                    if (agent) {
                                        requestBody.agent = agent;
                                    }
                                    if (providerID && modelID) {
                                        requestBody.model = `${providerID}/${modelID}`;
                                    }

                                    await apiClient.session.command({
                                        path: { id: sessionId },
                                        body: requestBody,
                                        query: directory ? { directory } : undefined,
                                    });

                                    return;
                                } catch (error) {
                                    console.error("Command execution failed:", error);
                                    throw error;
                                }
                            }

                            set({
                                lastUsedProvider: { providerID, modelID },
                            });

                            set((state) => {
                                const memoryState = state.sessionMemoryState.get(sessionId) || {
                                    viewportAnchor: 0,
                                    isStreaming: false,
                                    lastAccessedAt: Date.now(),
                                    backgroundMessageCount: 0,
                                };

                                const newMemoryState = new Map(state.sessionMemoryState);
                                newMemoryState.set(sessionId, {
                                    ...memoryState,
                                    isStreaming: true,
                                    streamStartTime: Date.now(),
                                });
                                return { sessionMemoryState: newMemoryState };
                            });

                            const timestamp = Date.now();
                            const messageId = `msg_${timestamp}_${Math.random().toString(36).substring(2, 9)}`;
                            const userParts: Part[] = [];

                            if (content.trim()) {
                                userParts.push({
                                    type: "text",
                                    text: content,
                                    id: `part-${timestamp}`,
                                    sessionID: sessionId,
                                    messageID: messageId,
                                } as Part);
                            }

                            const attachmentParts = (attachments ?? []).map((file, index) => ({
                                type: "file",
                                mime: file.mimeType,
                                filename: file.filename,
                                url: file.dataUrl,
                                id: `part-${timestamp}-file-${index}`,
                                sessionID: sessionId,
                                messageID: messageId,
                            } as Part));

                            if (attachmentParts.length > 0) {
                                userParts.push(...attachmentParts);
                            }

                            const userMessage = {
                                info: {
                                    id: messageId,
                                    sessionID: sessionId,
                                    role: "user",
                                    time: {
                                        created: timestamp,
                                    },
                                    userMessageMarker: true,
                                    clientRole: "user",
                                    providerID: providerID || undefined,
                                    modelID: modelID || undefined,
                                    ...(agent ? { mode: agent } : {}),
                                },
                                parts: userParts,
                            };

                            set((state) => {
                                const sessionMessages = state.messages.get(sessionId) || [];
                                const newMessages = new Map(state.messages);

                                const safeUserMessage = {
                                    ...userMessage,
                                    info: {
                                        ...userMessage.info,
                                        role: "user",
                                        userMessageMarker: true,
                                    },
                                };

                                const updatedMessages = [...sessionMessages, safeUserMessage];
                                newMessages.set(sessionId, updatedMessages);

                                const newPending = new Set(state.pendingUserMessageIds);
                                newPending.add(messageId);

                                return { messages: newMessages, pendingUserMessageIds: newPending };
                            });

                            try {
                                const controller = new AbortController();
                                set({
                                    abortController: controller,
                                });

                                const filePayloads = (attachments ?? []).map((file) => ({
                                    type: "file" as const,
                                    mime: file.mimeType,
                                    filename: file.filename,
                                    url: file.dataUrl,
                                }));

                                await opencodeClient.sendMessage({
                                    id: sessionId,
                                    providerID,
                                    modelID,
                                    text: content,
                                    agent,
                                    messageId,
                                    files: filePayloads.length > 0 ? filePayloads : undefined,
                                });

                                if (filePayloads.length > 0) {
                                    try {
                                        useFileStore.getState().clearAttachedFiles();
                                    } catch (clearError) {
                                        console.error("Failed to clear attached files after send", clearError);
                                    }
                                }
                            } catch (error: any) {
                                console.error("SendMessage error:", error);

                                let errorMessage = "Failed to send message";

                                if (error.name === "AbortError") {
                                    errorMessage = "Request timed out. The message may still be processing.";
                                } else if (error.message?.includes("504") || error.message?.includes("Gateway")) {
                                    errorMessage = "Gateway timeout - your message is being processed. Please wait for response.";
                                    set({
                                        abortController: null,
                                    });
                                    return;
                                } else if (error.message) {
                                    errorMessage = error.message;
                                }

                                set({
                                    abortController: null,
                                });

                                throw new Error(errorMessage);
                            }
                        } catch (error: any) {
                            console.error("SendMessage error:", error);

                            let errorMessage = "Failed to send message";

                            if (error.name === "AbortError") {
                                errorMessage = "Request timed out. The message may still be processing.";
                            } else if (error.response?.status === 401) {
                                errorMessage = "Session not found or unauthorized. Please refresh the page.";
                            } else if (error.response?.status === 502) {
                                errorMessage = "OpenCode is restarting. Please wait a moment and try again.";
                            } else if (error.message?.includes("504") || error.message?.includes("Gateway")) {
                                errorMessage = "Gateway timeout - your message is being processed. Please wait for response.";
                            } else if (error.message) {
                                errorMessage = error.message;
                            }

                            set({
                                abortController: null,
                            });

                            throw new Error(errorMessage);
                        }
                    });
                },
// Abort current operation
                abortCurrentOperation: async (currentSessionId?: string) => {
                    if (!currentSessionId) {
                        return;
                    }

                    const { abortController, messageStreamStates, streamingMessageId, messages: storeMessages } = get();

                    abortController?.abort();

                    const activeIds = new Set<string>();
                    if (streamingMessageId) {
                        activeIds.add(streamingMessageId);
                    }
                    messageStreamStates.forEach((_lifecycle, id) => {
                        activeIds.add(id);
                    });

                    if (activeIds.size === 0) {
                        const sessionMessages = currentSessionId ? storeMessages.get(currentSessionId) ?? [] : [];
                        let fallbackAssistantId: string | null = null;
                        for (let index = sessionMessages.length - 1; index >= 0; index -= 1) {
                            const message = sessionMessages[index];
                            if (!message || message.info.role !== 'assistant') {
                                continue;
                            }

                            if (!fallbackAssistantId) {
                                fallbackAssistantId = message.info.id;
                            }

                            const hasWorkingPart = (message.parts ?? []).some((part) => {
                                return part.type === 'reasoning' || part.type === 'tool' || part.type === 'step-start';
                            });
                            if (hasWorkingPart) {
                                activeIds.add(message.info.id);
                                break;
                            }
                        }

                        if (activeIds.size === 0 && fallbackAssistantId) {
                            activeIds.add(fallbackAssistantId);
                        }
                    }

                    // Clear pending text coalescing timers
                    for (const id of activeIds) {
                        const timeout = timeoutRegistry.get(id);
                        if (timeout) {
                            clearTimeout(timeout);
                            timeoutRegistry.delete(id);
                            lastContentRegistry.delete(id);
                        }
                    }

                    if (activeIds.size > 0) {
                        clearLifecycleTimersForIds(activeIds);
                    }

                    const abortTimestamp = Date.now();

                    set((state) => {
                        const updatedStates = removeLifecycleEntries(state.messageStreamStates, activeIds);

                        const sessionMessages = state.messages.get(currentSessionId) ?? [];
                        let messagesChanged = false;
                        let updatedMessages = state.messages;

                        if (sessionMessages.length > 0 && activeIds.size > 0) {
                            const updatedSessionMessages = sessionMessages.map((message) => {
                                if (!activeIds.has(message.info.id) && activeIds.size > 0) {
                                    return message;
                                }

                                const updatedParts = (message.parts ?? []).map((part) => {
                                    if (part.type === 'reasoning') {
                                        const reasoningPart = part as any;
                                        const time = { ...(reasoningPart.time ?? {}) };
                                        if (typeof time.end !== 'number') {
                                            time.end = abortTimestamp;
                                        }
                                        return {
                                            ...reasoningPart,
                                            time,
                                        } as Part;
                                    }

                                    if (part.type === 'tool') {
                                        const toolPart = part as any;
                                        const stateData = { ...(toolPart.state ?? {}) };
                                        if (stateData.status === 'running' || stateData.status === 'pending') {
                                            stateData.status = 'aborted';
                                        }
                                        return {
                                            ...toolPart,
                                            state: stateData,
                                        } as Part;
                                    }

                                    if (part.type === 'step-start') {
                                        const stepPart = part as any;
                                        return {
                                            ...stepPart,
                                            type: 'step-finish',
                                            aborted: true,
                                        } as Part;
                                    }

                                    return part;
                                });

                                messagesChanged = true;
                                return {
                                    ...message,
                                    info: {
                                        ...message.info,
                                        abortedAt: abortTimestamp,
                                        streaming: false,
                                        status: 'aborted',
                                    },
                                    parts: updatedParts,
                                };
                            });

                            if (messagesChanged) {
                                updatedMessages = new Map(state.messages);
                                updatedMessages.set(currentSessionId, updatedSessionMessages);
                            }
                        }
                        const memoryState = state.sessionMemoryState.get(currentSessionId);
                        let nextMemoryState = state.sessionMemoryState;
                        if (memoryState) {
                            const updatedMemory = new Map(state.sessionMemoryState);
                            updatedMemory.set(currentSessionId, {
                                ...memoryState,
                                isStreaming: false,
                                streamStartTime: undefined,
                                isZombie: false,
                            });
                            nextMemoryState = updatedMemory;
                        }

                        const nextAbortFlags = new Map(state.sessionAbortFlags);
                        nextAbortFlags.set(currentSessionId, {
                            timestamp: abortTimestamp,
                            acknowledged: false,
                        });

                        return {
                            messageStreamStates: updatedStates,
                            sessionMemoryState: nextMemoryState,
                            streamingMessageId: null,
                            abortController: null,
                            sessionAbortFlags: nextAbortFlags,
                            ...(messagesChanged ? { messages: updatedMessages } : {}),
                        };
                    });

                    try {
                        await executeWithSessionDirectory(currentSessionId, () => opencodeClient.abortSession(currentSessionId));
                    } catch (error) {
                        console.error("Failed to abort session:", error);
                    }
                },

                // Internal unbatched version - processes parts immediately
                _addStreamingPartImmediate: (sessionId: string, messageId: string, part: Part, role?: string, currentSessionId?: string) => {
                    const stateSnapshot = get();
                    let existingMessagesSnapshot = stateSnapshot.messages.get(sessionId) || [];
                    let existingMessageSnapshot = existingMessagesSnapshot.find((m) => m.info.id === messageId);

                    // Check if this is the first part from server for a user message we sent
                    // If we have a temp_ pending message and server sends real messageID, replace it
                    if (!existingMessageSnapshot && role === 'user') {
                        const tempMessage = existingMessagesSnapshot.find((m) =>
                            m.info.id.startsWith('temp_') &&
                            stateSnapshot.pendingUserMessageIds.has(m.info.id)
                        );

                        if (tempMessage) {
                            // Replace temp message ID with real server ID
                            const oldTempId = tempMessage.info.id;

                            set((state) => {
                                const newMessages = new Map(state.messages);
                                const sessionMsgs = newMessages.get(sessionId) || [];
                                const updatedMsgs = sessionMsgs.map((msg) =>
                                    msg.info.id === oldTempId
                                        ? { ...msg, info: { ...msg.info, id: messageId } }
                                        : msg
                                );
                                newMessages.set(sessionId, updatedMsgs);

                                const newPending = new Set(state.pendingUserMessageIds);
                                newPending.delete(oldTempId);
                                newPending.add(messageId);

                                return { messages: newMessages, pendingUserMessageIds: newPending };
                            });

                            // Refresh snapshot after replacement
                            const newState = get();
                            existingMessagesSnapshot = newState.messages.get(sessionId) || [];
                            existingMessageSnapshot = existingMessagesSnapshot.find((m) => m.info.id === messageId);
                        }
                    }

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

                        const finalizeAbortState = (result: Partial<MessageState>): Partial<MessageState> => {
                            const shouldClearAbortFlag =
                                (actualRole === 'assistant' || actualRole === 'user') &&
                                state.sessionAbortFlags.has(sessionId);
                            if (!shouldClearAbortFlag) {
                                return result;
                            }
                            const nextAbortFlags = new Map(state.sessionAbortFlags);
                            nextAbortFlags.delete(sessionId);
                            return {
                                ...result,
                                sessionAbortFlags: nextAbortFlags,
                            };
                        };

                        const maintainTimeouts = (text: string) => {
                            const value = text || '';
                            const lastContent = lastContentRegistry.get(messageId);

                            if (value && lastContent === value) {
                                const currentState = get();
                                if (currentState.streamingMessageId === messageId) {
                                    const existingTimeout = timeoutRegistry.get(messageId);
                                    if (existingTimeout) {
                                        clearTimeout(existingTimeout);
                                        timeoutRegistry.delete(messageId);
                                    }
                                    setTimeout(() => {
                                        const store = get();
                                        if (typeof store.forceCompleteMessage === "function") {
                                            store.forceCompleteMessage(sessionId, messageId, "timeout");
                                        }
                                        store.completeStreamingMessage(sessionId, messageId);
                                    }, 100);
                                }
                            }

                            lastContentRegistry.set(messageId, value);

                            const existingTimeout = timeoutRegistry.get(messageId);
                            if (existingTimeout) {
                                clearTimeout(existingTimeout);
                            }
                            const newTimeout = setTimeout(() => {
                                const store = get();
                                if (typeof store.forceCompleteMessage === "function") {
                                    store.forceCompleteMessage(sessionId, messageId, "timeout");
                                }
                                if (store.streamingMessageId === messageId) {
                                    store.completeStreamingMessage(sessionId, messageId);
                                }
                                timeoutRegistry.delete(messageId);
                                lastContentRegistry.delete(messageId);
                            }, 8000);
                            timeoutRegistry.set(messageId, newTimeout);
                        };

                        const isBackgroundSession = sessionId !== currentSessionId;
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

                        // CRITICAL: For assistant messages, always aggregate under existing message ID
                        // This matches TUI behavior where all parts belong to the same assistant turn
                        if (actualRole === 'assistant' && messageIndex !== -1) {
                            // Existing assistant message - add part to it (this is the correct path)
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

                            updates.messageStreamStates = touchStreamingLifecycle(state.messageStreamStates, messageId);

                            if (!state.streamingMessageId && !state.pendingUserMessageIds.has(messageId)) {
                                updates.streamingMessageId = messageId;
                                (window as any).__messageTracker?.(messageId, 'streamingId_set');
                            }

                            if ((normalizedPart as any).type === 'text') {
                                maintainTimeouts((normalizedPart as any).text || '');
                            } else {
                                maintainTimeouts('');
                            }

                            return finalizeAbortState({ messages: newMessages, ...updates });
                        }

                        if (messageIndex === -1) {
                            if (actualRole === 'user') {
                                (window as any).__messageTracker?.(messageId, 'skipped_new_user_message');
                                return state;
                            }

                            // Only create new message for the first part of a new assistant turn
                            const normalizedPart = normalizeStreamingPart(part);
                            (window as any).__messageTracker?.(messageId, `part_type:${(normalizedPart as any).type || 'unknown'}`);

                            if ((normalizedPart as any).type === 'text') {
                                maintainTimeouts((normalizedPart as any).text || '');
                            } else {
                                maintainTimeouts('');
                            }

                            const pendingEntry = state.pendingAssistantParts.get(messageId);
                            const pendingParts = pendingEntry ? [...pendingEntry.parts] : [];
                            const pendingIndex = pendingParts.findIndex((existing) => existing.id === normalizedPart.id);

                            if (pendingIndex !== -1) {
                                pendingParts[pendingIndex] = normalizedPart;
                            } else {
                                pendingParts.push(normalizedPart);
                            }

                            const newPending = new Map(state.pendingAssistantParts);
                            newPending.set(messageId, { sessionId, parts: pendingParts });

                            const placeholderInfo = {
                                id: messageId,
                                sessionID: sessionId,
                                role: actualRole as "user" | "assistant",
                                clientRole: actualRole,
                                providerID: state.lastUsedProvider?.providerID || "",
                                modelID: state.lastUsedProvider?.modelID || "",
                                time: {
                                    created: Date.now(),
                                },
                                animationSettled: actualRole === "assistant" ? false : undefined,
                                streaming: actualRole === "assistant" ? true : undefined,
                            } as Message;

                            const placeholderMessage = {
                                info: placeholderInfo,
                                parts: pendingParts,
                            };

                            // Append new message at the end (server maintains chronological order)
                            // No sorting needed - messages arrive in correct order from server/streaming
                            const nextMessages = [...messagesArray, placeholderMessage];

                            const newMessages = new Map(state.messages);
                            newMessages.set(sessionId, nextMessages);

                            if (actualRole === 'assistant') {
                                updates.messageStreamStates = touchStreamingLifecycle(state.messageStreamStates, messageId);

                                if (!state.streamingMessageId && !state.pendingUserMessageIds.has(messageId)) {
                                    updates.streamingMessageId = messageId;
                                    (window as any).__messageTracker?.(messageId, 'streamingId_set');
                                }
                            }

                            return finalizeAbortState({
                                messages: newMessages,
                                pendingAssistantParts: newPending,
                                ...updates,
                            });
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
                            }

                            if ((normalizedPart as any).type === 'text') {
                                maintainTimeouts((normalizedPart as any).text || '');
                            } else {
                                maintainTimeouts('');
                            }

                            return finalizeAbortState({ messages: newMessages, ...updates });
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

                // Public batched version - collects parts and processes in batches
                addStreamingPart: (sessionId: string, messageId: string, part: Part, role?: string, currentSessionId?: string) => {
                    // Add to batch queue
                    batchQueue.push({ sessionId, messageId, part, role, currentSessionId });

                    // Schedule flush if not already scheduled
                    if (!flushTimer) {
                        flushTimer = setTimeout(() => {
                            const itemsToProcess = [...batchQueue];
                            batchQueue = [];
                            flushTimer = null;

                            // Process all queued parts sequentially using the immediate version
                            // This ensures each part is processed with the latest state
                            const store = get();
                            for (const { sessionId, messageId, part, role, currentSessionId } of itemsToProcess) {
                                store._addStreamingPartImmediate(sessionId, messageId, part, role, currentSessionId);
                            }
                        }, BATCH_WINDOW_MS);
                    }
                },

                forceCompleteMessage: (sessionId: string | null | undefined, messageId: string, source: "timeout" | "cooldown" = "timeout") => {
                    const resolveSessionId = (state: MessageState): string | null => {
                        if (sessionId) {
                            return sessionId;
                        }
                        for (const [candidateId, sessionMessages] of state.messages.entries()) {
                            if (sessionMessages.some((msg) => msg.info.id === messageId)) {
                                return candidateId;
                            }
                        }
                        return null;
                    };

                    set((state) => {
                        const targetSessionId = resolveSessionId(state);
                        if (!targetSessionId) {
                            return state;
                        }

                        const sessionMessages = state.messages.get(targetSessionId) ?? [];
                        const messageIndex = sessionMessages.findIndex((msg) => msg.info.id === messageId);
                        if (messageIndex === -1) {
                            return state;
                        }

                        const message = sessionMessages[messageIndex];
                        if (!message) {
                            return state;
                        }

                        const now = Date.now();
                        const existingInfo = message.info as any;
                        const existingCompleted = typeof existingInfo?.time?.completed === "number" && existingInfo.time.completed > 0;

                        let infoChanged = false;
                        const updatedInfo: Record<string, any> = { ...existingInfo };

                        if (!existingCompleted) {
                            updatedInfo.time = {
                                ...(existingInfo.time ?? {}),
                                completed: now,
                            };
                            infoChanged = true;
                        }

                        if (updatedInfo.status !== "completed") {
                            updatedInfo.status = "completed";
                            infoChanged = true;
                        }

                        if (updatedInfo.streaming) {
                            updatedInfo.streaming = false;
                            infoChanged = true;
                        }

                        let partsChanged = false;
                        const updatedParts = message.parts.map((part) => {
                            if (!part) {
                                return part;
                            }

                            if (part.type === "tool") {
                                const existingState = (part as any).state;
                                if (!existingState) {
                                    return part;
                                }

                                const status = existingState.status;
                                const needsStatusUpdate = status === "running" || status === "pending" || status === "started";
                                const needsEndTimestamp = !existingState.time || typeof existingState.time?.end !== "number";

                                if (needsStatusUpdate || needsEndTimestamp) {
                                    const nextState: Record<string, any> = { ...existingState };
                                    if (needsStatusUpdate) {
                                        nextState.status = "completed";
                                    }
                                    if (needsEndTimestamp) {
                                        nextState.time = {
                                            ...(existingState.time ?? {}),
                                            end: now,
                                        };
                                    }
                                    partsChanged = true;
                                    return {
                                        ...part,
                                        state: nextState,
                                    } as Part;
                                }
                                return part;
                            }

                            if (part.type === "reasoning") {
                                const reasoningTime = (part as any).time;
                                if (!reasoningTime || typeof reasoningTime.end !== "number") {
                                    partsChanged = true;
                                    return {
                                        ...part,
                                        time: {
                                            ...(reasoningTime ?? {}),
                                            end: now,
                                        },
                                    } as Part;
                                }
                                return part;
                            }

                            if (part.type === "text") {
                                const textTime = (part as any).time;
                                if (textTime && typeof textTime.end !== "number") {
                                    partsChanged = true;
                                    return {
                                        ...part,
                                        time: {
                                            ...textTime,
                                            end: now,
                                        },
                                    } as Part;
                                }
                                return part;
                            }

                            return part;
                        });

                        if (!infoChanged && !partsChanged) {
                            return state;
                        }

                        (window as any).__messageTracker?.(messageId, `force_complete:${source}`);

                        const updatedMessage = {
                            ...message,
                            info: updatedInfo as Message,
                            parts: partsChanged ? updatedParts : message.parts,
                        };

                        const nextSessionMessages = [...sessionMessages];
                        nextSessionMessages[messageIndex] = updatedMessage;

                        const nextMessages = new Map(state.messages);
                        nextMessages.set(targetSessionId, nextSessionMessages);

                        return { messages: nextMessages };
                    });
                },

                markMessageStreamSettled: (messageId: string) => {
                    set((state) => {
                        const completed = markLifecycleCompleted(state.messageStreamStates, messageId);
                        const lifecycle = completed.get(messageId);
                        const next = new Map(completed);

                        if (!lifecycle || lifecycle.phase === 'completed') {
                            next.delete(messageId);
                        }

                        let updatedMessages = state.messages;
                        let messagesModified = false;

                        state.messages.forEach((sessionMessages, sessionId) => {
                            if (messagesModified) return;
                            const idx = sessionMessages.findIndex((msg) => msg.info.id === messageId);
                            if (idx === -1) return;

                            const message = sessionMessages[idx];
                            if ((message.info as any)?.animationSettled) {
                                return;
                            }

                            const updatedMessage = {
                                ...message,
                                info: {
                                    ...message.info,
                                    animationSettled: true,
                                },
                            };

                            const sessionArray = [...sessionMessages];
                            sessionArray[idx] = updatedMessage;

                            const newMessages = new Map(state.messages);
                            newMessages.set(sessionId, sessionArray);
                            updatedMessages = newMessages;
                            messagesModified = true;
                        });

                        const updates: Partial<MessageState> & { messageStreamStates: Map<string, MessageStreamLifecycle> } = {
                            messageStreamStates: next,
                            ...(messagesModified ? { messages: updatedMessages } : {}),
                        } as any;

                        return updates;
                    });
                    clearLifecycleTimersForIds([messageId]);
                },

                // Update message info (for agent, provider, model metadata)
                updateMessageInfo: (sessionId: string, messageId: string, messageInfo: any) => {
                    set((state) => {
                        const sessionMessages = state.messages.get(sessionId) ?? [];
                        const normalizedSessionMessages = [...sessionMessages];

                        const messageIndex = normalizedSessionMessages.findIndex((msg) => msg.info.id === messageId);
                        const pendingEntry = state.pendingAssistantParts.get(messageId);

                        const mergeParts = (existingParts: Part[] = [], incomingParts: Part[] = []) => {
                            if (!incomingParts.length) {
                                return existingParts;
                            }
                            const merged = [...existingParts];
                            incomingParts.forEach((incomingPart) => {
                                const idx = merged.findIndex((part) => part.id === incomingPart.id);
                                if (idx === -1) {
                                    merged.push(incomingPart);
                                } else {
                                    merged[idx] = incomingPart;
                                }
                            });
                            return merged;
                        };

                        const ensureClientRole = (info: any) => {

                            if (!info) {
                                return info;
                            }
                            const clientRole = info.clientRole ?? info.role;
                            const userMarker = clientRole === 'user' ? true : info.userMessageMarker;
                            return {
                                ...info,
                                clientRole,
                                ...(userMarker ? { userMessageMarker: true } : {}),
                            };
                        };

                        if (messageIndex === -1) {
                            if (normalizedSessionMessages.length > 0) {
                                const firstMessage = normalizedSessionMessages[0];
                                const firstInfo = firstMessage?.info as any;
                                const firstCreated = typeof firstInfo?.time?.created === 'number' ? firstInfo.time.created : null;
                                const firstId = typeof firstInfo?.id === 'string' ? firstInfo.id : null;

                                const incomingInfoToCompare = messageInfo as any;
                                const incomingCreated = typeof incomingInfoToCompare?.time?.created === 'number'
                                    ? incomingInfoToCompare.time.created
                                    : null;
                                const incomingId = typeof incomingInfoToCompare?.id === 'string' ? incomingInfoToCompare.id : messageId;

                                let isOlderThanViewport = false;
                                if (incomingCreated !== null && firstCreated !== null) {
                                    isOlderThanViewport = incomingCreated < firstCreated;
                                }
                                if (!isOlderThanViewport && incomingId && firstId) {
                                    isOlderThanViewport = incomingId.localeCompare(firstId) < 0;
                                }

                                if (isOlderThanViewport) {
                                    (window as any).__messageTracker?.(messageId, 'skipped_evicted_message_update');
                                    return state;
                                }
                            }

                            const incomingInfo = ensureClientRole(messageInfo);
                            if (!incomingInfo || incomingInfo.role !== 'assistant') {
                                return state;
                            }

                            const pendingParts = pendingEntry?.parts ?? [];
                            const newMessage = {
                                info: {
                                    ...incomingInfo,
                                    animationSettled: (incomingInfo as any)?.animationSettled ?? false,
                                } as Message,
                                parts: pendingParts.length > 0 ? [...pendingParts] : [],
                            };

                            const newMessages = new Map(state.messages);
                            // Append new message at the end (server maintains chronological order)
                            const appended = [...normalizedSessionMessages, newMessage];
                            newMessages.set(sessionId, appended);

                            const updates: Partial<MessageState> = {
                                messages: newMessages,
                            };

                            if (pendingEntry) {
                                const newPending = new Map(state.pendingAssistantParts);
                                newPending.delete(messageId);
                                updates.pendingAssistantParts = newPending;
                            }

                            return updates;
                        }

                        const existingMessage = normalizedSessionMessages[messageIndex];

                        // Check if this is a user message using multiple indicators
                        const existingInfo = existingMessage.info as any;
                        const isUserMessage =
                            existingInfo.userMessageMarker === true ||
                            existingInfo.clientRole === 'user' ||
                            existingInfo.role === 'user' ||
                            state.pendingUserMessageIds.has(messageId);

                        // For user messages, preserve critical fields and prevent role overwrite
                        if (isUserMessage) {
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
                            const updatedSessionMessages = [...normalizedSessionMessages];
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
                            updatedInfo.role = existingMessage.info.role;
                        }

                        updatedInfo.clientRole = updatedInfo.clientRole ?? existingMessage.info.clientRole ?? existingMessage.info.role;
                        if (updatedInfo.clientRole === "user") {
                            updatedInfo.userMessageMarker = true;
                        }

                        const mergedParts = pendingEntry?.parts
                            ? mergeParts(existingMessage.parts, pendingEntry.parts)
                            : existingMessage.parts;

                        const updatedMessage = {
                            ...existingMessage,
                            info: updatedInfo,
                            parts: mergedParts,
                        };

                        const newMessages = new Map(state.messages);
                        const updatedSessionMessages = [...normalizedSessionMessages];
                        updatedSessionMessages[messageIndex] = updatedMessage;
                        newMessages.set(sessionId, updatedSessionMessages);

                        const updates: Partial<MessageState> = {
                            messages: newMessages,
                        };

                        if (pendingEntry) {
                            const newPending = new Map(state.pendingAssistantParts);
                            newPending.delete(messageId);
                            updates.pendingAssistantParts = newPending;
                        }

                        return updates;
                    });
                },

                // Complete streaming message
                completeStreamingMessage: (sessionId: string, messageId: string) => {
                    const state = get();

                    (window as any).__messageTracker?.(messageId, `completion_called_current:${state.streamingMessageId}`);

                    if (typeof state.forceCompleteMessage === "function") {
                        state.forceCompleteMessage(sessionId, messageId, "cooldown");
                    }

                    // Check if this is the lexicographically latest assistant message
                    const sessionMessages = state.messages.get(sessionId) || [];
                    const assistantMessages = sessionMessages
                        .filter((msg) => msg.info.role === 'assistant' && !isFullySyntheticMessage(msg.parts))
                        .sort((a, b) => (a.info.id || "").localeCompare(b.info.id || ""));
                    
                    const latestAssistantMessageId = assistantMessages.length > 0 
                        ? assistantMessages[assistantMessages.length - 1].info.id 
                        : null;
                    
                    const isLatestAssistant = messageId === latestAssistantMessageId;

                    const shouldClearStreamingId = state.streamingMessageId === messageId;
                    if (shouldClearStreamingId) {
                        (window as any).__messageTracker?.(messageId, 'streamingId_cleared');
                    } else {
                        (window as any).__messageTracker?.(messageId, 'streamingId_NOT_cleared_different_id');
                    }
                    
                    // Only clear streaming ID if this is the latest assistant message
                    // This matches TUI behavior where only the latest message completion matters
                    const shouldActuallyClearStreamingId = shouldClearStreamingId && isLatestAssistant;

                    const lifecycleAfterCompletion = markLifecycleCooldown(state.messageStreamStates, messageId);

                    const updates: Record<string, any> = {};
                    if (shouldActuallyClearStreamingId) {
                        updates.streamingMessageId = null;
                        updates.abortController = null;
                    }
                    if (lifecycleAfterCompletion !== state.messageStreamStates) {
                        updates.messageStreamStates = lifecycleAfterCompletion;
                    }

                    if (Object.keys(updates).length > 0) {
                        set(updates);
                    }

                    if (state.pendingAssistantParts.has(messageId)) {
                        set((currentState) => {
                            if (!currentState.pendingAssistantParts.has(messageId)) {
                                return currentState;
                            }
                            const nextPending = new Map(currentState.pendingAssistantParts);
                            nextPending.delete(messageId);
                            return { pendingAssistantParts: nextPending };
                        });
                    }

                    const lifecycleState = get().messageStreamStates.get(messageId);
                    if (lifecycleState?.phase === 'cooldown') {
                        scheduleLifecycleCompletion(messageId, get, sessionId);
                    } else {
                        clearLifecycleTimersForIds([messageId]);
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
                },

                syncMessages: (sessionId: string, messages: { info: Message; parts: Part[] }[]) => {
                    const watermark = get().sessionMemoryState.get(sessionId)?.trimmedHeadMaxId;
                    const messagesFiltered = watermark
                        ? messages.filter((message) => {
                              const messageId = message?.info?.id;
                              if (!messageId) return true;
                              // Only block if we can compare safely; otherwise keep
                              return isIdNewer(messageId, watermark);
                          })
                        : messages;

                    set((state) => {
                        const newMessages = new Map(state.messages);
                        const normalizedMessages = messagesFiltered.map((message) => {
                            const infoWithMarker = {
                                ...message.info,
                                clientRole: (message.info as any)?.clientRole ?? message.info.role,
                                userMessageMarker: message.info.role === "user" ? true : (message.info as any)?.userMessageMarker,
                                animationSettled:
                                    message.info.role === "assistant"
                                        ? (message.info as any)?.animationSettled ?? true
                                        : (message.info as any)?.animationSettled,
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

                        if (removedIds.length > 0) {
                            const nextPendingParts = new Map(state.pendingAssistantParts);
                            let pendingChanged = false;
                            removedIds.forEach((id) => {
                                if (nextPendingParts.delete(id)) {
                                    pendingChanged = true;
                                }
                            });
                            if (pendingChanged) {
                                result.pendingAssistantParts = nextPendingParts;
                            }
                        }

                        // Mark this as a sync update, not a new message
                        return result;
                    });

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

                updateSessionCompaction: (sessionId: string, compactingTimestamp: number | null | undefined) => {
                    set((state) => {
                        const nextCompaction = new Map(state.sessionCompactionUntil);

                        if (!compactingTimestamp || compactingTimestamp <= 0) {
                            if (!nextCompaction.has(sessionId)) {
                                return state;
                            }
                            nextCompaction.delete(sessionId);
                            return { sessionCompactionUntil: nextCompaction };
                        }

                        const deadline = compactingTimestamp + COMPACTION_WINDOW_MS;
                        const existingDeadline = nextCompaction.get(sessionId);
                        if (existingDeadline === deadline) {
                            return state;
                        }

                        nextCompaction.set(sessionId, deadline);
                        return { sessionCompactionUntil: nextCompaction };
                    });
                },

                acknowledgeSessionAbort: (sessionId: string) => {
                    if (!sessionId) {
                        return;
                    }

                    set((state) => {
                        const record = state.sessionAbortFlags.get(sessionId);
                        if (!record || record.acknowledged) {
                            return state;
                        }

                        const nextAbortFlags = new Map(state.sessionAbortFlags);
                        nextAbortFlags.set(sessionId, { ...record, acknowledged: true });
                        return { sessionAbortFlags: nextAbortFlags } as Partial<MessageState>;
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

                trimToViewportWindow: (sessionId: string, targetSize: number = MEMORY_LIMITS.VIEWPORT_MESSAGES, currentSessionId?: string) => {
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
                    if (memoryState.isStreaming && sessionId === currentSessionId) {
                        return;
                    }

                    // Calculate window boundaries
                    const anchor = memoryState.viewportAnchor || sessionMessages.length - 1;
                    let start = Math.max(0, anchor - Math.floor(targetSize / 2));
                    const end = Math.min(sessionMessages.length, start + targetSize);

                    // Adjust if we're at the boundaries
                    if (end === sessionMessages.length && end - start < targetSize) {
                        start = Math.max(0, end - targetSize);
                    }

                    // Trim messages
                    const trimmedMessages = sessionMessages.slice(start, end);
                    const removedOlder = sessionMessages.slice(0, start);
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
                            trimmedHeadMaxId: computeMaxTrimmedHeadId(removedOlder, memoryState.trimmedHeadMaxId),
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

                evictLeastRecentlyUsed: (currentSessionId?: string) => {
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
                    const evictable = sessionsWithMemory.filter(([id, memState]) => id !== currentSessionId && !memState.isStreaming);

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

                        const nextPendingParts = new Map(state.pendingAssistantParts);
                        let pendingChanged = false;
                        nextPendingParts.forEach((entry, messageId) => {
                            if (entry.sessionId === lruSessionId) {
                                nextPendingParts.delete(messageId);
                                pendingChanged = true;
                            }
                        });
                        if (pendingChanged) {
                            result.pendingAssistantParts = nextPendingParts;
                        }

                        const nextCompaction = new Map(state.sessionCompactionUntil);
                        if (nextCompaction.delete(lruSessionId)) {
                            result.sessionCompactionUntil = nextCompaction;
                        }

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

                        // Fetch all messages again (API doesn't support pagination yet)
                        const allMessages = await executeWithSessionDirectory(sessionId, () => opencodeClient.getSessionMessages(sessionId));

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
                },

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
            }),
            {
                name: "message-store",
                storage: createJSONStorage(() => getSafeStorage()),
                partialize: (state: MessageStore) => ({
                    lastUsedProvider: state.lastUsedProvider,
                    sessionMemoryState: Array.from(state.sessionMemoryState.entries()).map(([sessionId, memory]) => [
                        sessionId,
                        {
                            viewportAnchor: memory.viewportAnchor,
                            isStreaming: memory.isStreaming,
                            lastAccessedAt: memory.lastAccessedAt,
                            backgroundMessageCount: memory.backgroundMessageCount,
                            totalAvailableMessages: memory.totalAvailableMessages,
                            hasMoreAbove: memory.hasMoreAbove,
                            trimmedHeadMaxId: memory.trimmedHeadMaxId,
                        },
                    ]),
                    sessionAbortFlags: Array.from(state.sessionAbortFlags.entries()).map(([sessionId, record]) => [
                        sessionId,
                        { timestamp: record.timestamp, acknowledged: record.acknowledged },
                    ]),
                }),
                merge: (persistedState: any, currentState: MessageStore): MessageStore => {
                    if (!persistedState) {
                        return currentState;
                    }

                    let restoredMemoryState = currentState.sessionMemoryState;
                    if (Array.isArray(persistedState.sessionMemoryState)) {
                        restoredMemoryState = new Map<string, SessionMemoryState>(
                            persistedState.sessionMemoryState.map((entry: [string, SessionMemoryState]) => entry)
                        );
                    }

                    let restoredAbortFlags = currentState.sessionAbortFlags;
                    if (Array.isArray(persistedState.sessionAbortFlags)) {
                        restoredAbortFlags = new Map<string, SessionAbortRecord>(persistedState.sessionAbortFlags);
                    }

                    return {
                        ...currentState,
                        lastUsedProvider: persistedState.lastUsedProvider ?? currentState.lastUsedProvider,
                        sessionMemoryState: restoredMemoryState,
                        sessionAbortFlags: restoredAbortFlags,
                    };
                },
            }
        ),
        {
            name: "message-store",
        }
    )
);
