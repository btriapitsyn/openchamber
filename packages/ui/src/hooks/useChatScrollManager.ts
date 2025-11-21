import React from 'react';
import type { Part } from '@opencode-ai/sdk';
import type { Permission } from '@/types/permission';

import { MessageFreshnessDetector } from '@/lib/messageFreshness';
import { ACTIVE_SESSION_WINDOW } from '@/stores/types/sessionTypes';

import { useScrollEngine } from './useScrollEngine';

type MessageStreamLifecycle = {
    phase: 'streaming' | 'cooldown' | 'completed';
    startedAt: number;
    lastUpdateAt: number;
    completedAt?: number;
};

export type ContentChangeReason = 'text' | 'structural' | 'permission';

interface ChatMessageRecord {
    info: Record<string, unknown>;
    parts: Part[];
}

interface SessionMemoryState {
    viewportAnchor: number;
    isStreaming: boolean;
    lastAccessedAt: number;
    backgroundMessageCount: number;
    totalAvailableMessages?: number;
    hasMoreAbove?: boolean;
    streamStartTime?: number;
    isZombie?: boolean;
}

interface UseChatScrollManagerOptions {
    currentSessionId: string | null;
    sessionMessages: ChatMessageRecord[];
    sessionPermissions: Permission[];
    streamingMessageId: string | null;
    sessionMemoryState: Map<string, SessionMemoryState>;
    updateViewportAnchor: (sessionId: string, anchor: number) => void;
    isSyncing: boolean;
    isMobile: boolean;
    messageStreamStates: Map<string, MessageStreamLifecycle>;
    trimToViewportWindow: (sessionId: string, targetSize?: number) => void;
}

export interface AnimationHandlers {
    onChunk: () => void;
    onComplete: () => void;
    onStreamingCandidate?: () => void;
    onAnimationStart?: () => void;
    onReservationCancelled?: () => void;
    onReasoningBlock?: () => void;
    onAnimatedHeightChange?: (height: number) => void;
}

interface UseChatScrollManagerResult {
    scrollRef: React.RefObject<HTMLDivElement | null>;
    handleMessageContentChange: (reason?: ContentChangeReason) => void;
    getAnimationHandlers: (messageId: string) => AnimationHandlers;
    showScrollButton: boolean;
    scrollToBottom: () => void;
}

const VIEWPORT_UPDATE_DELAY = 250;

export const useChatScrollManager = ({
    currentSessionId,
    sessionMessages,
    sessionPermissions,
    streamingMessageId,
    sessionMemoryState,
    updateViewportAnchor,
    isSyncing,
    isMobile,
    messageStreamStates,
    trimToViewportWindow,
}: UseChatScrollManagerOptions): UseChatScrollManagerResult => {
    const scrollRef = React.useRef<HTMLDivElement | null>(null);
    const scrollEngine = useScrollEngine({ containerRef: scrollRef, isMobile });
    const isPinned = scrollEngine.isPinned;

    const viewportAnchorTimeoutRef = React.useRef<number | null>(null);
    const lastSessionIdRef = React.useRef<string | null>(null);
    const lastMessageCountRef = React.useRef<number>(sessionMessages.length);
    const previousLifecycleStatesRef = React.useRef<Map<string, MessageStreamLifecycle>>(new Map());
    const pendingInitialAutoScrollRef = React.useRef(false);

    const flushIfPinned = React.useCallback(() => {
        if (!scrollEngine.isPinned || scrollEngine.isManualOverrideActive()) {
            return;
        }
        scrollEngine.flushToBottom();
    }, [scrollEngine]);

    const cleanViewportAnchorTimeout = React.useCallback(() => {
        if (viewportAnchorTimeoutRef.current !== null && typeof window !== 'undefined') {
            window.clearTimeout(viewportAnchorTimeoutRef.current);
            viewportAnchorTimeoutRef.current = null;
        }
    }, []);

    const handleViewportAnchorUpdate = React.useCallback(
        (container: HTMLDivElement) => {
            if (!currentSessionId) return;

            const { scrollTop, scrollHeight, clientHeight } = container;
            const position = (scrollTop + clientHeight / 2) / Math.max(scrollHeight, 1);
            const estimatedIndex = Math.floor(position * sessionMessages.length);

            cleanViewportAnchorTimeout();
            if (typeof window === 'undefined') {
                updateViewportAnchor(currentSessionId, estimatedIndex);
                return;
            }

            viewportAnchorTimeoutRef.current = window.setTimeout(() => {
                updateViewportAnchor(currentSessionId, estimatedIndex);
                viewportAnchorTimeoutRef.current = null;
            }, VIEWPORT_UPDATE_DELAY);
        },
        [cleanViewportAnchorTimeout, currentSessionId, sessionMessages.length, updateViewportAnchor]
    );


    const handleScrollEvent = React.useCallback(() => {
        const container = scrollRef.current;
        if (!container || !currentSessionId) {
            return;
        }

        scrollEngine.handleScroll();
        handleViewportAnchorUpdate(container);
    }, [
        currentSessionId,
        handleViewportAnchorUpdate,
        scrollEngine,
    ]);

    React.useEffect(() => {
        const container = scrollRef.current;
        if (!container) return;

        const onScroll = () => handleScrollEvent();

        container.addEventListener('scroll', onScroll, { passive: true });

        return () => {
            container.removeEventListener('scroll', onScroll);
            cleanViewportAnchorTimeout();
        };
    }, [cleanViewportAnchorTimeout, handleScrollEvent]);

    React.useEffect(() => {
        if (currentSessionId && currentSessionId !== lastSessionIdRef.current) {
            lastSessionIdRef.current = currentSessionId;
            MessageFreshnessDetector.getInstance().recordSessionStart(currentSessionId);
            pendingInitialAutoScrollRef.current = true;
            lastMessageCountRef.current = 0;

            scrollEngine.scrollToBottom();
        }
    }, [currentSessionId, scrollEngine]);

    React.useEffect(() => {
        if (!currentSessionId) {
            return;
        }

        if (!pendingInitialAutoScrollRef.current) {
            return;
        }

        if (sessionMessages.length === 0) {
            return;
        }

        pendingInitialAutoScrollRef.current = false;

        const performScroll = () => {
            scrollEngine.flushToBottom();
            const anchorIndex = Math.max(0, sessionMessages.length - 1);
            updateViewportAnchor(currentSessionId, anchorIndex);
        };

        if (typeof window === 'undefined') {
            performScroll();
        } else {
            window.requestAnimationFrame(() => {
                window.requestAnimationFrame(performScroll);
            });
        }
    }, [currentSessionId, scrollEngine, sessionMessages.length, updateViewportAnchor]);

    React.useEffect(() => {
        if (isSyncing) {
            lastMessageCountRef.current = sessionMessages.length;
            return;
        }

        const previousCount = lastMessageCountRef.current;
        const nextCount = sessionMessages.length;

        if (nextCount > previousCount) {
            if (pendingInitialAutoScrollRef.current) {
                pendingInitialAutoScrollRef.current = false;

                if (currentSessionId) {
                    const anchorIndex = Math.max(0, nextCount - 1);
                    updateViewportAnchor(currentSessionId, anchorIndex);
                }

                const runFlush = () => {
                    scrollEngine.flushToBottom();
                };

                if (typeof window === 'undefined') {
                    runFlush();
                } else {
                    window.requestAnimationFrame(runFlush);
                }
            } else {
                const newMessage = sessionMessages[nextCount - 1];

                if (newMessage?.info?.role === 'user') {
                    scrollEngine.scrollToBottom({ instant: true });
                } else {
                    flushIfPinned();
                }
            }
        }

        lastMessageCountRef.current = nextCount;
    }, [currentSessionId, flushIfPinned, isPinned, isSyncing, scrollEngine, sessionMessages, updateViewportAnchor]);

    React.useEffect(() => {
        if (!streamingMessageId) {
            return;
        }

        flushIfPinned();
    }, [flushIfPinned, streamingMessageId]);

    React.useEffect(() => {
        const previousStates = previousLifecycleStatesRef.current;
        const nextStates = messageStreamStates;

        previousStates.forEach((previousLifecycle, messageId) => {
            if (previousLifecycle.phase !== 'completed' && !nextStates.has(messageId)) {
                flushIfPinned();
            }
        });

        previousLifecycleStatesRef.current = new Map(nextStates);
    }, [flushIfPinned, messageStreamStates]);

    const handleMessageContentChange = React.useCallback((reason: ContentChangeReason = 'text') => {
        if (reason === 'structural') {
            if (!scrollEngine.isPinned || scrollEngine.isManualOverrideActive()) {
                return;
            }
            scrollEngine.scrollToBottom({ instant: true });
            return;
        }

        flushIfPinned();
    }, [flushIfPinned, scrollEngine]);

    const animationHandlersRef = React.useRef<Map<string, AnimationHandlers>>(new Map());
    const previousPermissionIdsRef = React.useRef<string[]>(sessionPermissions.map((permission) => permission.id));

    React.useEffect(() => {
        const previousIds = previousPermissionIdsRef.current;
        const nextIds = sessionPermissions.map((permission) => permission.id);

        const hasNewPermission = nextIds.some((id) => !previousIds.includes(id));
        previousPermissionIdsRef.current = nextIds;

        if (!hasNewPermission) {
            return;
        }

        flushIfPinned();
    }, [flushIfPinned, sessionPermissions]);

    React.useEffect(() => {
        // Auto-trim when near the bottom to prevent unbounded lists during long sessions
        if (!currentSessionId) {
            return;
        }

        if (!isPinned) {
            return;
        }

        const limit = ACTIVE_SESSION_WINDOW;
        const messageCount = sessionMessages.length;

        if (messageCount <= limit) {
            return;
        }

        const memoryState = sessionMemoryState.get(currentSessionId);
        if (!memoryState || memoryState.isStreaming) {
            return;
        }

        const anchor = typeof memoryState.viewportAnchor === 'number' ? memoryState.viewportAnchor : messageCount - 1;
        const bottomThreshold = Math.max(0, messageCount - Math.ceil(limit / 3));

        if (anchor < bottomThreshold) {
            return;
        }

        trimToViewportWindow(currentSessionId, limit);
    }, [
        currentSessionId,
        sessionMessages.length,
        sessionMemoryState,
        trimToViewportWindow,
        isPinned,
    ]);

    const getAnimationHandlers = React.useCallback((messageId: string): AnimationHandlers => {
        const existing = animationHandlersRef.current.get(messageId);
        if (existing) {
            return existing;
        }

        const handlers: AnimationHandlers = {
            onChunk: () => {
                // Legacy handler - no longer used for autoscroll
            },
            onComplete: () => {
                // Legacy handler - no longer used for autoscroll
            },
            onStreamingCandidate: () => {
                // Legacy handler - no longer used for autoscroll
            },
            onAnimationStart: () => {
                // Legacy handler - no longer used for autoscroll
            },
            onAnimatedHeightChange: () => {
                // Legacy handler - no longer used for autoscroll
            },
            onReservationCancelled: () => {
                // Legacy handler - no longer used for autoscroll
            },
            onReasoningBlock: () => {
                // Legacy handler - no longer used for autoscroll
            },
        };

        animationHandlersRef.current.set(messageId, handlers);
        return handlers;
    }, []);

    return {
        scrollRef,
        handleMessageContentChange,
        getAnimationHandlers,
        showScrollButton: scrollEngine.showScrollButton,
        scrollToBottom: scrollEngine.scrollToBottom,
    };
};
