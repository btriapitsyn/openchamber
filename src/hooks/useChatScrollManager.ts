import React from 'react';
import type { Part } from '@opencode-ai/sdk';

import { MessageFreshnessDetector } from '@/lib/messageFreshness';

interface ChatMessageRecord {
    info: any;
    parts: Part[];
}

interface UseChatScrollManagerOptions {
    currentSessionId: string | null;
    sessionMessages: ChatMessageRecord[];
    streamingMessageId: string | null;
    sessionMemoryState: Map<string, any>;
    loadMoreMessages: (sessionId: string, direction: 'up' | 'down') => Promise<void>;
    updateViewportAnchor: (sessionId: string, anchor: number) => void;
    isSyncing: boolean;
    isMobile: boolean;
}

interface UseChatScrollManagerResult {
    scrollRef: { current: HTMLDivElement | null };
    isLoadingMore: boolean;
    handleMessageContentChange: () => void;
    showScrollButton: boolean;
    scrollToBottom: () => void;
}

export const useChatScrollManager = ({
    currentSessionId,
    sessionMessages,
    streamingMessageId,
    sessionMemoryState,
    loadMoreMessages,
    updateViewportAnchor,
    isSyncing,
    isMobile,
}: UseChatScrollManagerOptions): UseChatScrollManagerResult => {
    const scrollRef = React.useRef<HTMLDivElement | null>(null);
    const [shouldAutoScroll, setShouldAutoScroll] = React.useState(true);
    const [isLoadingMore, setIsLoadingMore] = React.useState(false);
    const [showScrollButton, setShowScrollButton] = React.useState(false);

    const lastMessageCountRef = React.useRef(sessionMessages.length);
    const lastSessionIdRef = React.useRef<string | null>(currentSessionId);
    const scrollUpdateTimeoutRef = React.useRef<NodeJS.Timeout | undefined>(undefined);
    const loadingMoreRef = React.useRef(false);
    const lastContentHeightRef = React.useRef(0);
    const contentGrowthTimeoutRef = React.useRef<NodeJS.Timeout | undefined>(undefined);
    const isContentGrowingRef = React.useRef(false);
    const streamingMessageIds = React.useRef(new Set<string>());
    const streamingCompletionTimeouts = React.useRef<{ [messageId: string]: NodeJS.Timeout }>({});
    const throttleTimeoutRef = React.useRef<NodeJS.Timeout | undefined>(undefined);
    const pendingScrollRef = React.useRef(false);
    const scrollDebounceRef = React.useRef<NodeJS.Timeout | undefined>(undefined);
    const userHasScrolledUpRef = React.useRef(false);
    const lastScrollTopRef = React.useRef(0);

    const scrollToBottom = React.useCallback(() => {
        if (!scrollRef.current || !shouldAutoScroll || pendingScrollRef.current) {
            return;
        }

        pendingScrollRef.current = true;
        requestAnimationFrame(() => {
            if (scrollRef.current && shouldAutoScroll) {
                scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
            }
            pendingScrollRef.current = false;
        });
    }, [shouldAutoScroll]);

    const isAtBottom = React.useCallback(() => {
        if (!scrollRef.current) return false;
        const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
        return scrollTop + clientHeight >= scrollHeight - 30;
    }, []);

    const forceScrollToBottom = React.useCallback(() => {
        if (!scrollRef.current) return;

        requestAnimationFrame(() => {
            if (scrollRef.current) {
                scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
                setShouldAutoScroll(true);
                userHasScrolledUpRef.current = false;
            }
        });
    }, []);

    const checkContentGrowth = React.useCallback(() => {
        if (!scrollRef.current) return;

        const currentHeight = scrollRef.current.scrollHeight;
        const hasGrown = currentHeight > lastContentHeightRef.current + 1;

        if (hasGrown) {
            lastContentHeightRef.current = currentHeight;
            isContentGrowingRef.current = true;

            if (contentGrowthTimeoutRef.current) {
                clearTimeout(contentGrowthTimeoutRef.current);
            }

            contentGrowthTimeoutRef.current = setTimeout(() => {
                isContentGrowingRef.current = false;
            }, streamingMessageId ? 3000 : 2000);
        }
    }, [streamingMessageId]);

    const updateStreamingVisualState = React.useCallback(() => {
        const newStreamingIds = new Set<string>();

        sessionMessages.forEach((message) => {
            if (
                message?.info?.role === 'assistant' &&
                (!message.info.time || !('completed' in message.info.time) || !message.info.time.completed)
            ) {
                newStreamingIds.add(message.info.id);

                if (streamingCompletionTimeouts.current[message.info.id]) {
                    clearTimeout(streamingCompletionTimeouts.current[message.info.id]);
                    delete streamingCompletionTimeouts.current[message.info.id];
                }
            } else if (
                message?.info?.role === 'assistant' &&
                streamingMessageIds.current.has(message.info.id)
            ) {
                if (!streamingCompletionTimeouts.current[message.info.id]) {
                    streamingCompletionTimeouts.current[message.info.id] = setTimeout(() => {
                        streamingMessageIds.current.delete(message.info.id);
                        delete streamingCompletionTimeouts.current[message.info.id];
                    }, 800);
                }
                newStreamingIds.add(message.info.id);
            }
        });

        streamingMessageIds.current = newStreamingIds;
    }, [sessionMessages]);

    const handleScroll = React.useCallback(() => {
        if (!currentSessionId || !scrollRef.current || sessionMessages.length === 0) {
            return;
        }

        const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
        const scrollFromBottom = scrollHeight - scrollTop - clientHeight;
        lastScrollTopRef.current = scrollTop;

        // Update scroll button visibility
        setShowScrollButton(scrollFromBottom > 100);

        if (scrollFromBottom > 50 && !userHasScrolledUpRef.current) {
            userHasScrolledUpRef.current = true;
            setShouldAutoScroll(false);
            return;
        }

        if (scrollFromBottom <= 50 && userHasScrolledUpRef.current) {
            userHasScrolledUpRef.current = false;
            setShouldAutoScroll(true);
            scrollToBottom();
            return;
        }

        if (scrollTop < 100 && !loadingMoreRef.current) {
            const memoryState = sessionMemoryState.get(currentSessionId);
            const hasMore =
                memoryState?.totalAvailableMessages &&
                sessionMessages.length < memoryState.totalAvailableMessages;

            if (hasMore) {
                loadingMoreRef.current = true;
                setIsLoadingMore(true);
                const prevScrollHeight = scrollHeight;
                const prevScrollTop = scrollTop;

                loadMoreMessages(currentSessionId, 'up').then(() => {
                    setTimeout(() => {
                        if (scrollRef.current) {
                            const newScrollHeight = scrollRef.current.scrollHeight;
                            const scrollDiff = newScrollHeight - prevScrollHeight;
                            scrollRef.current.scrollTop = prevScrollTop + scrollDiff;
                        }
                        loadingMoreRef.current = false;
                        setIsLoadingMore(false);
                    }, 50);
                });
            }
        }

        const scrollPercentage = (scrollTop + clientHeight / 2) / scrollHeight;
        const estimatedMessageIndex = Math.floor(scrollPercentage * sessionMessages.length);

        if (scrollUpdateTimeoutRef.current) {
            clearTimeout(scrollUpdateTimeoutRef.current);
        }
        scrollUpdateTimeoutRef.current = setTimeout(() => {
            updateViewportAnchor(currentSessionId, estimatedMessageIndex);
        }, 300);
    }, [
        currentSessionId,
        loadMoreMessages,
        sessionMessages,
        sessionMemoryState,
        scrollToBottom,
        updateViewportAnchor,
    ]);

    React.useEffect(() => {
        if (throttleTimeoutRef.current) {
            clearTimeout(throttleTimeoutRef.current);
        }

        throttleTimeoutRef.current = setTimeout(() => {
            checkContentGrowth();
            updateStreamingVisualState();
        }, streamingMessageId ? 16 : 50);

        return () => {
            if (throttleTimeoutRef.current) {
                clearTimeout(throttleTimeoutRef.current);
            }
        };
    }, [sessionMessages.length, checkContentGrowth, updateStreamingVisualState, streamingMessageId]);

    React.useEffect(() => {
        if (isSyncing) {
            lastMessageCountRef.current = sessionMessages.length;
            return;
        }

        const hasNewMessages = sessionMessages.length > lastMessageCountRef.current;

        if (hasNewMessages) {
            const newMessage = sessionMessages[sessionMessages.length - 1];

            if (newMessage?.info?.role === 'user') {
                setShouldAutoScroll(true);
                scrollToBottom();
            } else if (newMessage?.info?.role === 'assistant' && shouldAutoScroll) {
                scrollToBottom();
            }
        }

        if ((isContentGrowingRef.current || streamingMessageId) && shouldAutoScroll && isAtBottom() && !userHasScrolledUpRef.current) {
            scrollToBottom();
        }

        const streamingAssistantMessage = sessionMessages.find((msg) =>
            msg?.info?.role === 'assistant' && streamingMessageIds.current.has(msg.info.id)
        );

        if (streamingAssistantMessage && shouldAutoScroll && !userHasScrolledUpRef.current) {
            const scrollFromBottom = scrollRef.current
                ? scrollRef.current.scrollHeight - scrollRef.current.scrollTop - scrollRef.current.clientHeight
                : 0;

            if (scrollFromBottom < 100) {
                scrollToBottom();
            }
        }

        if (streamingMessageId && shouldAutoScroll && !userHasScrolledUpRef.current) {
            const scrollFromBottom = scrollRef.current
                ? scrollRef.current.scrollHeight - scrollRef.current.scrollTop - scrollRef.current.clientHeight
                : 0;

            if (scrollFromBottom < 50) {
                scrollToBottom();
            }
        }

        if (streamingMessageId && shouldAutoScroll && !userHasScrolledUpRef.current && scrollRef.current) {
            const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
            const distanceFromBottom = scrollHeight - scrollTop - clientHeight;

            if (distanceFromBottom > 10) {
                scrollToBottom();
            }
        }

        if (scrollRef.current && shouldAutoScroll && !userHasScrolledUpRef.current) {
            const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
            const distanceFromBottom = scrollHeight - scrollTop - clientHeight;

            if (distanceFromBottom > 3) {
                scrollToBottom();
            }
        }

        if (scrollRef.current && shouldAutoScroll && !userHasScrolledUpRef.current) {
            const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
            const distanceFromBottom = scrollHeight - scrollTop - clientHeight;

            if (distanceFromBottom > 1) {
                scrollToBottom();
            }
        }

        lastMessageCountRef.current = sessionMessages.length;
    }, [sessionMessages, shouldAutoScroll, isSyncing, scrollToBottom,  streamingMessageId]);

    React.useEffect(() => {
        if (throttleTimeoutRef.current) {
            clearTimeout(throttleTimeoutRef.current);
        }

        throttleTimeoutRef.current = setTimeout(() => {
            checkContentGrowth();
        }, 200);

        return () => {
            if (throttleTimeoutRef.current) {
                clearTimeout(throttleTimeoutRef.current);
            }
        };
    }, [sessionMessages, checkContentGrowth]);

    React.useEffect(() => {
        const scrollElement = scrollRef.current;
        if (scrollElement) {
            scrollElement.addEventListener('scroll', handleScroll, { passive: true });
            return () => {
                scrollElement.removeEventListener('scroll', handleScroll);
                if (contentGrowthTimeoutRef.current) {
                    clearTimeout(contentGrowthTimeoutRef.current);
                }
                Object.values(streamingCompletionTimeouts.current).forEach((timeout) => clearTimeout(timeout));
                streamingCompletionTimeouts.current = {};
                streamingMessageIds.current = new Set();
                if (throttleTimeoutRef.current) {
                    clearTimeout(throttleTimeoutRef.current);
                }
                if (scrollDebounceRef.current) {
                    clearTimeout(scrollDebounceRef.current);
                }
                userHasScrolledUpRef.current = false;
                lastScrollTopRef.current = 0;
                pendingScrollRef.current = false;
            };
        }
    }, [handleScroll]);

    React.useEffect(() => {
        if (currentSessionId !== lastSessionIdRef.current) {
            lastSessionIdRef.current = currentSessionId;

            if (currentSessionId) {
                const freshnessDetector = MessageFreshnessDetector.getInstance();
                freshnessDetector.recordSessionStart(currentSessionId);
            }

            setShouldAutoScroll(true);
            isContentGrowingRef.current = false;
            lastContentHeightRef.current = 0;
            if (contentGrowthTimeoutRef.current) {
                clearTimeout(contentGrowthTimeoutRef.current);
            }
        }

        if (currentSessionId && sessionMessages.length > 0 && shouldAutoScroll) {
            setTimeout(() => {
                scrollToBottom();
            }, 100);
        }
    }, [currentSessionId, sessionMessages.length, shouldAutoScroll, scrollToBottom]);

    const handleMessageContentChange = React.useCallback(() => {
        if (!scrollRef.current) return;

        const scrollFromBottom =
            scrollRef.current.scrollHeight - scrollRef.current.scrollTop - scrollRef.current.clientHeight;

        if (isMobile) {
            // На мобілках: більш агресивний автоскрол без перевірки isAtBottom()
            // бо touch scroll має затримки і може давати false negatives
            if (shouldAutoScroll && !userHasScrolledUpRef.current && scrollFromBottom < 100) {
                scrollToBottom();
            }
        } else {
            // На desktop: зберігаємо стару логіку з перевіркою isAtBottom()
            if (shouldAutoScroll && !userHasScrolledUpRef.current && isAtBottom() && scrollFromBottom < 30) {
                scrollToBottom();
            }
        }
    }, [scrollToBottom, shouldAutoScroll, isMobile, isAtBottom]);

    return {
        scrollRef,
        isLoadingMore,
        handleMessageContentChange,
        showScrollButton,
        scrollToBottom: forceScrollToBottom,
    };
};
