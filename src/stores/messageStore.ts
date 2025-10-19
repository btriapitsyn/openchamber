import { create } from "zustand";
import { devtools, persist, createJSONStorage } from "zustand/middleware";
import type { Message, Part } from "@opencode-ai/sdk";
import { opencodeClient } from "@/lib/opencode/client";
import type { SessionMemoryState, MessageStreamLifecycle } from "./types/sessionTypes";
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

// PERFORMANCE: Timeout management using WeakMap instead of window globals
// WeakMap allows automatic garbage collection when messages are deleted
const timeoutRegistry = new Map<string, ReturnType<typeof setTimeout>>();
const lastContentRegistry = new Map<string, string>();

interface MessageState {
    messages: Map<string, { info: any; parts: Part[] }[]>;
    sessionMemoryState: Map<string, SessionMemoryState>;
    messageStreamStates: Map<string, MessageStreamLifecycle>;
    streamingMessageId: string | null;
    abortController: AbortController | null;
    lastUsedProvider: { providerID: string; modelID: string } | null;
    isSyncing: boolean;
    pendingUserMessageIds: Set<string>;
}

interface MessageActions {
    loadMessages: (sessionId: string) => Promise<void>;
    sendMessage: (content: string, providerID: string, modelID: string, agent?: string, currentSessionId?: string) => Promise<void>;
    abortCurrentOperation: (currentSessionId?: string) => Promise<void>;
    _addStreamingPartImmediate: (sessionId: string, messageId: string, part: Part, role?: string, currentSessionId?: string) => void;
    addStreamingPart: (sessionId: string, messageId: string, part: Part, role?: string, currentSessionId?: string) => void;
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

                // Load messages for a session
                loadMessages: async (sessionId: string, limit: number = MEMORY_LIMITS.VIEWPORT_MESSAGES) => {
                    // Don't set loading state for message loading - it conflicts with other operations
                    // Only show loading when there are no messages yet
                    const existingMessages = get().messages.get(sessionId);
                    if (!existingMessages) {
                        // Note: We can't set loading here as it's in session store
                        // The caller should handle loading state
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
                            };

                            clearLifecycleTimersForIds(removedIds);
                            const updatedLifecycle = removeLifecycleEntries(state.messageStreamStates, removedIds);
                            if (updatedLifecycle !== state.messageStreamStates) {
                                result.messageStreamStates = updatedLifecycle;
                            }

                            return result;
                        });
                    } catch (error) {
                        // Error handling should be done by caller
                        throw error;
                    }
                },

                // Send a message (handles both regular messages and commands)
                sendMessage: async (content: string, providerID: string, modelID: string, agent?: string, currentSessionId?: string) => {
                    if (!currentSessionId) {
                        throw new Error("No session selected");
                    }
                    if (!currentSessionId) {
                        throw new Error("No session selected");
                    }

                    // Check if this is a command and route to the appropriate endpoint
                    const isCommand = content.startsWith("/");

                    if (isCommand) {
                        // Parse command and arguments
                        const spaceIndex = content.indexOf(" ");
                        const command = spaceIndex === -1 ? content.substring(1) : content.substring(1, spaceIndex);
                        const commandArgs = spaceIndex === -1 ? "" : content.substring(spaceIndex + 1).trim();

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

                                return;
                            }

                            // For all other commands, fetch the template first
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
                            } else {
                                // If we can't get the template, show the raw command as fallback
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

                            await apiClient.session.command({
                                path: { id: currentSessionId },
                                body: requestBody,
                                query: directory ? { directory } : undefined,
                            });

                            return;
                        } catch (error) {
                            console.error("Command execution failed:", error);
                            throw error;
                        }
                    }

                    // Regular message handling continues below
                    // Store the provider/model for the assistant message that will follow
                    set({
                        lastUsedProvider: { providerID, modelID },
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

                        // Set abort controller BEFORE making the API call
                        set({
                            abortController: controller,
                        });

                        // Send to API
                        await opencodeClient.sendMessage({
                            id: currentSessionId,
                            providerID,
                            modelID,
                            text: content,
                            agent,
                            messageId,
                        });

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
                                abortController: null,
                            });
                            return; // Don't throw for gateway timeouts
                        } else if (error.message) {
                            errorMessage = error.message;
                        }

                        // Clear abort controller on error
                        set({
                            abortController: null,
                        });

                        // Re-throw so the caller can handle it
                        throw new Error(errorMessage);
                    }
                },

                // Abort current operation
                abortCurrentOperation: async (currentSessionId?: string) => {
                    if (!currentSessionId) {
                        return;
                    }
                    const { abortController, streamingMessageId } = get();

                    if (abortController) {
                        abortController.abort();
                    }

                    // Clear any pending timeouts using Map registry
                    if (streamingMessageId) {
                        const existingTimeout = timeoutRegistry.get(streamingMessageId);
                        if (existingTimeout) {
                            clearTimeout(existingTimeout);
                            timeoutRegistry.delete(streamingMessageId);
                            lastContentRegistry.delete(streamingMessageId);
                        }
                    }

                    if (currentSessionId) {
                        try {
                            await opencodeClient.abortSession(currentSessionId);
                            set({
                                streamingMessageId: null,
                                abortController: null,
                            });
                        } catch (error) {
                            console.error("Failed to abort session:", error);
                        }
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
                                    setTimeout(() => get().completeStreamingMessage(sessionId, messageId), 100);
                                }
                            }

                            lastContentRegistry.set(messageId, value);

                            const existingTimeout = timeoutRegistry.get(messageId);
                            if (existingTimeout) {
                                clearTimeout(existingTimeout);
                            }
                            const newTimeout = setTimeout(() => {
                                const currentState = get();
                                if (currentState.streamingMessageId === messageId) {
                                    get().completeStreamingMessage(sessionId, messageId);
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
                                    animationSettled: actualRole === "assistant" ? false : undefined,
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
                    set((state) => {
                        const newMessages = new Map(state.messages);
                        const normalizedMessages = messages.map((message) => {
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
                        },
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

                    return {
                        ...currentState,
                        lastUsedProvider: persistedState.lastUsedProvider ?? currentState.lastUsedProvider,
                        sessionMemoryState: restoredMemoryState,
                    };
                },
            }
        ),
        {
            name: "message-store",
        }
    )
);
