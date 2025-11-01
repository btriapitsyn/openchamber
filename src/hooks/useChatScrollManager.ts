import React from 'react';
import type { Part } from '@opencode-ai/sdk';
import type { Permission } from '@/types/permission';

import { MessageFreshnessDetector } from '@/lib/messageFreshness';

import { useScrollEngine } from './useScrollEngine';

type MessageStreamLifecycle = {
    phase: 'streaming' | 'cooldown' | 'completed';
    startedAt: number;
    lastUpdateAt: number;
    completedAt?: number;
};

interface ChatMessageRecord {
    info: any;
    parts: Part[];
}

interface UseChatScrollManagerOptions {
    currentSessionId: string | null;
    sessionMessages: ChatMessageRecord[];
    sessionPermissions: Permission[];
    streamingMessageId: string | null;
    sessionMemoryState: Map<string, any>;
    loadMoreMessages: (sessionId: string, direction: 'up' | 'down') => Promise<void>;
    updateViewportAnchor: (sessionId: string, anchor: number) => void;
    isSyncing: boolean;
    isMobile: boolean;
    messageStreamStates: Map<string, MessageStreamLifecycle>;
}

export interface AnimationHandlers {
    onChunk: () => void;
    onComplete: () => void;
}

interface UseChatScrollManagerResult {
    scrollRef: React.RefObject<HTMLDivElement | null>;
    isLoadingMore: boolean;
    handleMessageContentChange: () => void;
    getAnimationHandlers: (messageId: string) => AnimationHandlers;
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
}: UseChatScrollManagerOptions): UseChatScrollManagerResult => {
    const scrollRef = React.useRef<HTMLDivElement | null>(null);
    const [isLoadingMore, setIsLoadingMore] = React.useState(false);

    const scrollEngine = useScrollEngine({ containerRef: scrollRef, isMobile });

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
                    scrollEngine.notifyContentMutation({ source: 'content' });
                }
            }
        }

        lastMessageCountRef.current = nextCount;
    }, [currentSessionId, forceScrollToBottom, isSyncing, scrollEngine, sessionMessages, updateViewportAnchor]);

    React.useEffect(() => {
        if (!streamingMessageId) {
            return;
        }

        scrollEngine.notifyContentMutation({ source: 'content' });
    }, [scrollEngine, streamingMessageId]);

    React.useEffect(() => {
        const previousStates = previousLifecycleStatesRef.current;
        const nextStates = messageStreamStates;

        previousStates.forEach((previousLifecycle, messageId) => {
            if (previousLifecycle.phase !== 'completed' && !nextStates.has(messageId)) {
                scrollEngine.notifyContentMutation({ source: 'lifecycle', isFinal: true });
            }
        });

        previousLifecycleStatesRef.current = new Map(nextStates);
    }, [messageStreamStates, scrollEngine]);

    const handleMessageContentChange = React.useCallback(() => {
        scrollEngine.notifyContentMutation({ source: 'content' });
    }, [scrollEngine]);

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

    const getAnimationHandlers = React.useCallback((messageId: string): AnimationHandlers => {
        const existing = animationHandlersRef.current.get(messageId);
        if (existing) {
            return existing;
        }

        const handlers: AnimationHandlers = {
            onChunk: () => scrollEngine.notifyContentMutation({ source: 'animation' }),
            onComplete: () => scrollEngine.notifyContentMutation({ source: 'animation', isFinal: true }),
        };

        animationHandlersRef.current.set(messageId, handlers);
        return handlers;
    }, [scrollEngine]);

    return {
        scrollRef,
        isLoadingMore,
        handleMessageContentChange,
        getAnimationHandlers,
        showScrollButton: scrollEngine.showScrollButton,
        scrollToBottom: scrollEngine.scrollToBottom,
    };
};
