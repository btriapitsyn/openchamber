import React from 'react';
import type { Part } from '@opencode-ai/sdk';
import type { Permission } from '@/types/permission';

import { MessageFreshnessDetector } from '@/lib/messageFreshness';
import { ACTIVE_SESSION_WINDOW } from '@/stores/types/sessionTypes';

import { useScrollEngine, type NotifyOptions } from './useScrollEngine';

type MessageStreamLifecycle = {
    phase: 'streaming' | 'cooldown' | 'completed';
    startedAt: number;
    lastUpdateAt: number;
    completedAt?: number;
};

export type ContentChangeReason = 'text' | 'structural' | 'permission';

interface AnimationReservation {
    messageId: string;
    height: number;
    phase: 'reserved' | 'animating' | 'completed';
}

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
    loadMoreMessages: (sessionId: string, direction: 'up' | 'down') => Promise<void>;
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
}

interface UseChatScrollManagerResult {
    scrollRef: React.RefObject<HTMLDivElement | null>;
    isLoadingMore: boolean;
    handleMessageContentChange: (reason?: ContentChangeReason) => void;
    getAnimationHandlers: (messageId: string) => AnimationHandlers;
    animationSpacerHeight: number | null;
    showScrollButton: boolean;
    scrollToBottom: () => void;
}

const SCROLL_TOP_THRESHOLD = 96;
const VIEWPORT_UPDATE_DELAY = 250;

export const useChatScrollManager = ({
    currentSessionId,
    sessionMessages,
    sessionPermissions,
    streamingMessageId,
    sessionMemoryState,
    loadMoreMessages,
    updateViewportAnchor,
    isSyncing,
    isMobile,
    messageStreamStates,
    trimToViewportWindow,
}: UseChatScrollManagerOptions): UseChatScrollManagerResult => {
    const scrollRef = React.useRef<HTMLDivElement | null>(null);
    const [isLoadingMore, setIsLoadingMore] = React.useState(false);

    const scrollEngine = useScrollEngine({ containerRef: scrollRef, isMobile });
    const isPinned = scrollEngine.isPinned;

    const forceScrollToBottom = React.useCallback(() => {
        const container = scrollRef.current;
        if (!container) {
            return;
        }
        const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
        container.scrollTop = maxScrollTop;
    }, []);

    const loadMoreLockRef = React.useRef(false);
    const viewportAnchorTimeoutRef = React.useRef<number | null>(null);
    const lastSessionIdRef = React.useRef<string | null>(null);
    const lastMessageCountRef = React.useRef<number>(sessionMessages.length);
    const previousLifecycleStatesRef = React.useRef<Map<string, MessageStreamLifecycle>>(new Map());
    const pendingInitialAutoScrollRef = React.useRef(false);
    const [animationReservation, setAnimationReservation] = React.useState<AnimationReservation | null>(null);
    const [autoScrollLocked, setAutoScrollLocked] = React.useState(false);
    const autoScrollLockedRef = React.useRef(false);

    const notifyWhenUnlocked = React.useCallback((options?: NotifyOptions) => {
        if (autoScrollLockedRef.current) {
            return;
        }
        scrollEngine.notifyContentMutation(options);
    }, [scrollEngine]);

    const setAutoScrollLockedState = React.useCallback((locked: boolean) => {
        autoScrollLockedRef.current = locked;
        setAutoScrollLocked(locked);
    }, []);

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

    const restoreScrollAfterPrepend = React.useCallback((
        container: HTMLDivElement,
        previousScrollHeight: number,
        previousScrollTop: number
    ) => {
        if (typeof window === 'undefined') {
            container.scrollTop = previousScrollTop + (container.scrollHeight - previousScrollHeight);
            return;
        }

        window.requestAnimationFrame(() => {
            const newScrollHeight = container.scrollHeight;
            const diff = newScrollHeight - previousScrollHeight;
            container.scrollTop = previousScrollTop + diff;
        });
    }, []);

    const requestAnimationReservation = React.useCallback((messageId: string) => {
        if (animationReservation && animationReservation.messageId !== messageId && animationReservation.phase !== 'completed') {
            return;
        }

        if (!scrollEngine.isPinned) {
            return;
        }

        const container = scrollRef.current;
        if (!container) {
            return;
        }

        const viewportHeight = container.clientHeight;
        if (viewportHeight <= 0) {
            return;
        }

        const height = Math.max(0, Math.round(viewportHeight * 0.4));

        setAnimationReservation((prev) => {
            if (prev && prev.messageId === messageId && prev.phase !== 'completed') {
                return prev;
            }

            return {
                messageId,
                height,
                phase: 'reserved',
            };
        });

        setAutoScrollLockedState(true);

        const target = Math.max(0, container.scrollHeight - container.clientHeight);
        container.scrollTo({ top: target, behavior: 'auto' });
    }, [animationReservation, scrollEngine.isPinned, setAutoScrollLockedState]);

    const markAnimationStarted = React.useCallback((messageId: string) => {
        setAnimationReservation((prev) => {
            if (!prev || prev.messageId !== messageId) {
                return prev;
            }
            if (prev.phase === 'animating') {
                return prev;
            }
            return { ...prev, phase: 'animating' };
        });
    }, []);

    const markAnimationCompleted = React.useCallback((messageId: string) => {
        setAnimationReservation((prev) => {
            if (!prev || prev.messageId !== messageId) {
                return prev;
            }
            if (prev.phase === 'completed') {
                return prev;
            }
            return { ...prev, phase: 'completed' };
        });
    }, []);

    const handleScrollEvent = React.useCallback(() => {
        const container = scrollRef.current;
        if (!container || !currentSessionId) {
            return;
        }

        scrollEngine.handleScroll();

        if (container.scrollTop <= SCROLL_TOP_THRESHOLD && !loadMoreLockRef.current) {
            const memoryState = sessionMemoryState.get(currentSessionId);
            const hasMore =
                memoryState?.totalAvailableMessages &&
                sessionMessages.length < memoryState.totalAvailableMessages;

            if (hasMore) {
                loadMoreLockRef.current = true;
                setIsLoadingMore(true);

                const prevHeight = container.scrollHeight;
                const prevTop = container.scrollTop;

                loadMoreMessages(currentSessionId, 'up')
                    .then(() => {
                        restoreScrollAfterPrepend(container, prevHeight, prevTop);
                    })
                    .finally(() => {
                        loadMoreLockRef.current = false;
                        setIsLoadingMore(false);
                    });
            }
        }

        handleViewportAnchorUpdate(container);
    }, [
        currentSessionId,
        loadMoreMessages,
        restoreScrollAfterPrepend,
        handleViewportAnchorUpdate,
        sessionMemoryState,
        sessionMessages.length,
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

            if (typeof window === 'undefined') {
                scrollEngine.scrollToBottom();
                forceScrollToBottom();
            } else {
                window.requestAnimationFrame(() => {
                    scrollEngine.scrollToBottom();
                    forceScrollToBottom();
                });
            }
        }
    }, [currentSessionId, scrollEngine, forceScrollToBottom]);

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
            forceScrollToBottom();
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
    }, [currentSessionId, scrollEngine, sessionMessages.length, updateViewportAnchor, forceScrollToBottom]);

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
                    forceScrollToBottom();
                };

                if (typeof window === 'undefined') {
                    runFlush();
                } else {
                    window.requestAnimationFrame(runFlush);
                }
            } else {
                const newMessage = sessionMessages[nextCount - 1];

                if (newMessage?.info?.role === 'user') {
                    scrollEngine.scrollToBottom();
                    if (scrollEngine.isPinned) {
                        forceScrollToBottom();
                    }
                } else {
                    if (scrollEngine.isPinned) {
                        scrollEngine.flushToBottom();
                        forceScrollToBottom();
                    } else {
                        const parts = Array.isArray(newMessage?.parts) ? newMessage.parts : [];
                        const hasStructuralParts = parts.some((part) => part.type === 'tool' || part.type === 'reasoning');
                        if (hasStructuralParts) {
                            notifyWhenUnlocked({ source: 'content' });
                        }
                    }
                }
            }
        }

        lastMessageCountRef.current = nextCount;
    }, [currentSessionId, forceScrollToBottom, isPinned, isSyncing, notifyWhenUnlocked, scrollEngine, sessionMessages, updateViewportAnchor]);

    React.useEffect(() => {
        if (!streamingMessageId) {
            return;
        }

        notifyWhenUnlocked({ source: 'content' });
    }, [notifyWhenUnlocked, streamingMessageId]);

    React.useEffect(() => {
        const previousStates = previousLifecycleStatesRef.current;
        const nextStates = messageStreamStates;

        previousStates.forEach((previousLifecycle, messageId) => {
            if (previousLifecycle.phase !== 'completed' && !nextStates.has(messageId)) {
                notifyWhenUnlocked({ source: 'lifecycle', isFinal: true });
            }
        });

        previousLifecycleStatesRef.current = new Map(nextStates);
    }, [messageStreamStates, notifyWhenUnlocked]);

    React.useEffect(() => {
        if (!animationReservation) {
            if (autoScrollLocked) {
                setAutoScrollLockedState(false);
            }
            return;
        }

        if (animationReservation.phase !== 'completed') {
            return;
        }

        if (!scrollEngine.isPinned) {
            return;
        }

        setAnimationReservation(null);
        setAutoScrollLockedState(false);
    }, [animationReservation, autoScrollLocked, scrollEngine.isPinned, scrollEngine.showScrollButton, setAutoScrollLockedState]);

    React.useEffect(() => {
        if (!animationReservation || animationReservation.phase === 'completed') {
            return;
        }
        const container = scrollRef.current;
        if (!container) {
            return;
        }
        const target = Math.max(0, container.scrollHeight - container.clientHeight);
        container.scrollTo({ top: target, behavior: 'auto' });
    }, [animationReservation]);

    React.useEffect(() => {
        setAnimationReservation(null);
        setAutoScrollLockedState(false);
    }, [currentSessionId, setAutoScrollLockedState]);

    const handleMessageContentChange = React.useCallback((reason: ContentChangeReason = 'text') => {
        if (reason === 'text') {
            return;
        }

        const immediate = reason === 'permission';
        notifyWhenUnlocked({ source: 'content', immediate });
    }, [notifyWhenUnlocked]);

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

        if (scrollEngine.isPinned) {
            scrollEngine.flushToBottom();
        }
    }, [scrollEngine, sessionPermissions]);

    React.useEffect(() => {
        // Auto-trim when near the bottom to prevent unbounded lists during long sessions
        if (!currentSessionId) {
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

        if (isLoadingMore) {
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
        isLoadingMore,
        sessionMessages.length,
        sessionMemoryState,
        trimToViewportWindow,
    ]);

    const getAnimationHandlers = React.useCallback((messageId: string): AnimationHandlers => {
        const existing = animationHandlersRef.current.get(messageId);
        if (existing) {
            return existing;
        }

        const handlers: AnimationHandlers = {
            onChunk: () => handleMessageContentChange('text'),
            onComplete: () => {
                markAnimationCompleted(messageId);
            },
            onStreamingCandidate: () => requestAnimationReservation(messageId),
            onAnimationStart: () => markAnimationStarted(messageId),
            onReservationCancelled: () => {
                setAnimationReservation((prev) => {
                    if (!prev || prev.messageId !== messageId) {
                        return prev;
                    }
                    if (prev.phase === 'completed') {
                        return prev;
                    }
                    setAutoScrollLockedState(false);
                    return null;
                });
            },
            onReasoningBlock: () => {
                setAnimationReservation((prev) => {
                    if (!prev || prev.messageId !== messageId) {
                        return prev;
                    }
                    setAutoScrollLockedState(false);
                    return null;
                });
            },
        };

        animationHandlersRef.current.set(messageId, handlers);
        return handlers;
    }, [handleMessageContentChange, markAnimationCompleted, markAnimationStarted, requestAnimationReservation, scrollEngine]);

    return {
        scrollRef,
        isLoadingMore,
        handleMessageContentChange,
        getAnimationHandlers,
        animationSpacerHeight: animationReservation && animationReservation.phase !== 'completed'
            ? animationReservation.height
            : null,
        showScrollButton: scrollEngine.showScrollButton,
        scrollToBottom: scrollEngine.scrollToBottom,
    };
};
