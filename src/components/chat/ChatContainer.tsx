import React from 'react';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { ModelControls } from './ModelControls';
import { PermissionCard } from './PermissionCard';
import { useSessionStore } from '@/stores/useSessionStore';
import { MessageFreshnessDetector } from '@/lib/messageFreshness';
import { Skeleton } from '@/components/ui/skeleton';


import { OpenCodeLogo } from '@/components/ui/OpenCodeLogo';

export const ChatContainer: React.FC = () => {
    const scrollRef = React.useRef<HTMLDivElement>(null);
    const {
        currentSessionId,
        messages,
        permissions,
        streamingMessageId,
        isLoading,
        loadMessages,
        updateViewportAnchor,
        loadMoreMessages,
        sessionMemoryState,
        isSyncing
    } = useSessionStore();

    const sessionMessages = React.useMemo(() => {
        return currentSessionId ? messages.get(currentSessionId) || [] : [];
    }, [currentSessionId, messages]);

    const sessionPermissions = React.useMemo(() => {
        return currentSessionId ? permissions.get(currentSessionId) || [] : [];
    }, [currentSessionId, permissions]);

    // Simple state management
    const [shouldAutoScroll, setShouldAutoScroll] = React.useState(true);
    const [isLoadingMore, setIsLoadingMore] = React.useState(false);

    const lastMessageCountRef = React.useRef(sessionMessages.length);
    const lastSessionIdRef = React.useRef(currentSessionId);
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
    const userHasScrolledUpRef = React.useRef(false); // Simple flag: has user scrolled up?
    const lastScrollTopRef = React.useRef(0); // Track if user is moving up vs down
    const userIsActivelyScrollingRef = React.useRef(false); // Temp flag during user interaction

    // Optimized scroll to bottom function with throttling
    const scrollToBottom = React.useCallback(() => {
        if (!scrollRef.current || !shouldAutoScroll || pendingScrollRef.current) {
            return;
        }

        pendingScrollRef.current = true;
        // Use requestAnimationFrame for more precise timing
        requestAnimationFrame(() => {
            if (scrollRef.current && shouldAutoScroll) {
                scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
            }
            pendingScrollRef.current = false;
        });
    }, [shouldAutoScroll]);

    // Check if user is at bottom
    const isAtBottom = () => {
        if (!scrollRef.current) return false;
        const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
        return scrollTop + clientHeight >= scrollHeight - 20;
    };





    // Throttled content growth detection
    const checkContentGrowth = React.useCallback(() => {
        if (!scrollRef.current) return;

        const currentHeight = scrollRef.current.scrollHeight;
        const hasGrown = currentHeight > lastContentHeightRef.current + 1; // +1 for more sensitivity

        if (hasGrown) {
            lastContentHeightRef.current = currentHeight;
            isContentGrowingRef.current = true;

            // Clear existing timeout
            if (contentGrowthTimeoutRef.current) {
                clearTimeout(contentGrowthTimeoutRef.current);
            }

            // Set timeout to detect when growth stops
            contentGrowthTimeoutRef.current = setTimeout(() => {
                isContentGrowingRef.current = false;
            }, streamingMessageId ? 1000 : 2000); // Shorter timeout during streaming

            // Removed direct scrollToBottom() call - let auto-scroll effect handle it
            // This prevents scroll lock during user interaction
        }


    }, [shouldAutoScroll]);

    // Update streaming visual state for message indicators
    const updateStreamingVisualState = React.useCallback(() => {
        const newStreamingIds = new Set<string>();

        sessionMessages.forEach(message => {
            if (message?.info?.role === 'assistant' &&
                (!message.info.time ||
                    !('completed' in message.info.time) ||
                    !message.info.time.completed)) {
                newStreamingIds.add(message.info.id);

                // Clear any existing completion timeout for this message
                if (streamingCompletionTimeouts.current[message.info.id]) {
                    clearTimeout(streamingCompletionTimeouts.current[message.info.id]);
                    delete streamingCompletionTimeouts.current[message.info.id];
                }
            } else if (message?.info?.role === 'assistant' &&
                streamingMessageIds.current.has(message.info.id)) {
                // Message just completed - delay removing from streaming state
                if (!streamingCompletionTimeouts.current[message.info.id]) {
                    streamingCompletionTimeouts.current[message.info.id] = setTimeout(() => {
                        streamingMessageIds.current.delete(message.info.id);
                        delete streamingCompletionTimeouts.current[message.info.id];
                    }, 800); // 800ms delay to prevent visual flickering
                }
                // Keep it in streaming state temporarily
                newStreamingIds.add(message.info.id);
            }
        });

        streamingMessageIds.current = newStreamingIds;
    }, [sessionMessages]);

    // Handle scroll events - simple rule: once you scroll up, you stay in control
    const handleScroll = React.useCallback(() => {
        if (currentSessionId && scrollRef.current && sessionMessages.length > 0) {
            const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;

            const userIsAtBottom = isAtBottom();
            const scrollFromBottom = scrollHeight - scrollTop - clientHeight;

            // Detect if user is actively scrolling upward (even small movements)
            const isScrollingUp = scrollTop < lastScrollTopRef.current - 1; // Small threshold for upward movement
            lastScrollTopRef.current = scrollTop;

            // User scrolled up - disable auto-scroll completely until they return to bottom
            // Use both movement detection and distance threshold
            if ((scrollFromBottom > 30 || isScrollingUp) && shouldAutoScroll && !userHasScrolledUpRef.current) {
                userHasScrolledUpRef.current = true;
                setShouldAutoScroll(false);
                return;
            }

            // User returned to bottom - re-enable auto-scroll
            // Use same threshold as onContentChange (50px)
            if (scrollFromBottom < 50 && userHasScrolledUpRef.current) {
                userHasScrolledUpRef.current = false;
                setShouldAutoScroll(true);
                return;
            }



            // Load more messages near top
            if (scrollTop < 100 && !loadingMoreRef.current) {
                const memoryState = sessionMemoryState.get(currentSessionId);
                const hasMore = memoryState?.totalAvailableMessages &&
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

            // Update viewport anchor
            const scrollPercentage = (scrollTop + clientHeight / 2) / scrollHeight;
            const estimatedMessageIndex = Math.floor(scrollPercentage * sessionMessages.length);

            if (scrollUpdateTimeoutRef.current) {
                clearTimeout(scrollUpdateTimeoutRef.current);
            }
            scrollUpdateTimeoutRef.current = setTimeout(() => {
                updateViewportAnchor(currentSessionId, estimatedMessageIndex);
            }, 300);
        }
    }, [currentSessionId, sessionMessages, loadMoreMessages, updateViewportAnchor, sessionMemoryState, shouldAutoScroll]);

    // Throttled effect for message changes
    // Note: Intentionally not including checkContentGrowth/updateStreamingVisualState in deps to prevent infinite loops
    React.useEffect(() => {
        if (throttleTimeoutRef.current) {
            clearTimeout(throttleTimeoutRef.current);
        }

        throttleTimeoutRef.current = setTimeout(() => {
            checkContentGrowth();
            updateStreamingVisualState();
        }, streamingMessageId ? 16 : 50); // Even faster updates during streaming (16ms vs 50ms)

        return () => {
            if (throttleTimeoutRef.current) {
                clearTimeout(throttleTimeoutRef.current);
            }
        };
    }, [sessionMessages.length, checkContentGrowth, updateStreamingVisualState]);

    // Auto-scroll logic
    React.useEffect(() => {
        if (isSyncing) {
            lastMessageCountRef.current = sessionMessages.length;
            return;
        }

        const hasNewMessages = sessionMessages.length > lastMessageCountRef.current;

        if (hasNewMessages) {
            const newMessage = sessionMessages[sessionMessages.length - 1];

            if (newMessage?.info?.role === 'user') {
                // User sent message - always enable auto-scroll and scroll to bottom
                setShouldAutoScroll(true);
                scrollToBottom();
            } else if (newMessage?.info?.role === 'assistant' && shouldAutoScroll) {
                // Assistant message and auto-scroll enabled
                scrollToBottom();
            }
        }

        // Continue scrolling if content growing and auto-scroll enabled
        // BUT only if user hasn't scrolled up (simple rule: once you scroll up, you control)
        if (isContentGrowingRef.current && shouldAutoScroll && isAtBottom() && !userHasScrolledUpRef.current) {
            scrollToBottom();
        }

        // Special handling for assistant messages during streaming
        // If we have a streaming assistant message and auto-scroll is enabled, scroll more aggressively
        const streamingAssistantMessage = sessionMessages.find(msg =>
            msg?.info?.role === 'assistant' &&
            streamingMessageIds.current.has(msg.info.id)
        );

        if (streamingAssistantMessage && shouldAutoScroll && !userHasScrolledUpRef.current) {
            // For streaming assistant messages, scroll even if not at bottom (within 100px)
            const scrollFromBottom = scrollRef.current ?
                scrollRef.current.scrollHeight - scrollRef.current.scrollTop - scrollRef.current.clientHeight : 0;

            if (scrollFromBottom < 100) {
                scrollToBottom();
            }
        }

        // Additional check: if we're streaming and auto-scroll enabled, ensure we're at bottom
        if (streamingMessageId && shouldAutoScroll && !userHasScrolledUpRef.current) {
            const scrollFromBottom = scrollRef.current ?
                scrollRef.current.scrollHeight - scrollRef.current.scrollTop - scrollRef.current.clientHeight : 0;

            if (scrollFromBottom < 50) {
                scrollToBottom();
            }
        }

        // Extra aggressive scrolling for streaming messages - check more frequently
        if (streamingMessageId && shouldAutoScroll && !userHasScrolledUpRef.current && scrollRef.current) {
            const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
            const distanceFromBottom = scrollHeight - scrollTop - clientHeight;

            // If we're more than 10px from bottom during streaming, scroll
            if (distanceFromBottom > 10) {
                scrollToBottom();
            }
        }

        // Additional check for any layout shifts during animation
        if (scrollRef.current && shouldAutoScroll && !userHasScrolledUpRef.current) {
            const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
            const distanceFromBottom = scrollHeight - scrollTop - clientHeight;

            // If we're more than 3px from bottom, scroll immediately
            if (distanceFromBottom > 3) {
                scrollToBottom();
            }
        }

        // One more check with even smaller threshold for very small layout shifts
        if (scrollRef.current && shouldAutoScroll && !userHasScrolledUpRef.current) {
            const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
            const distanceFromBottom = scrollHeight - scrollTop - clientHeight;

            // If we're more than 1px from bottom, scroll
            if (distanceFromBottom > 1) {
                scrollToBottom();
            }
        }

        lastMessageCountRef.current = sessionMessages.length;
    }, [sessionMessages, shouldAutoScroll, isSyncing, scrollToBottom]);

    // Heavily throttled effect for content updates during streaming
    // Note: Intentionally not including checkContentGrowth in deps to prevent excessive re-renders
    React.useEffect(() => {
        if (throttleTimeoutRef.current) {
            clearTimeout(throttleTimeoutRef.current);
        }

        throttleTimeoutRef.current = setTimeout(() => {
            checkContentGrowth();
        }, 200); // 200ms throttle for content updates

        return () => {
            if (throttleTimeoutRef.current) {
                clearTimeout(throttleTimeoutRef.current);
            }
        };
    }, [messages]);

    // Set up scroll listener
    React.useEffect(() => {
        const scrollElement = scrollRef.current;
        if (scrollElement) {
            scrollElement.addEventListener('scroll', handleScroll, { passive: true });
            return () => {
                scrollElement.removeEventListener('scroll', handleScroll);
                if (contentGrowthTimeoutRef.current) {
                    clearTimeout(contentGrowthTimeoutRef.current);
                }
                // Clear all timeouts
                Object.values(streamingCompletionTimeouts.current).forEach(timeout => clearTimeout(timeout));
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

    // Load messages when needed
    React.useEffect(() => {
        if (currentSessionId && (!messages.has(currentSessionId) || messages.get(currentSessionId)?.length === 0)) {
            loadMessages(currentSessionId);
        }
    }, [currentSessionId, messages, loadMessages]);



    // Handle session changes - record timing early to prevent existing messages from animating
    React.useEffect(() => {
        if (currentSessionId !== lastSessionIdRef.current) {
            lastSessionIdRef.current = currentSessionId;

            // Record session start time for message freshness detection
            // Do this BEFORE any messages are processed to ensure proper freshness detection
            if (currentSessionId) {
                const freshnessDetector = MessageFreshnessDetector.getInstance();
                freshnessDetector.recordSessionStart(currentSessionId);
            }

            setShouldAutoScroll(true); // Always enable auto-scroll for new sessions
            isContentGrowingRef.current = false; // Reset content growth state
            lastContentHeightRef.current = 0; // Reset height tracking
            if (contentGrowthTimeoutRef.current) {
                clearTimeout(contentGrowthTimeoutRef.current);
            }
        }

        // Scroll to bottom for new sessions with messages
        if (currentSessionId && sessionMessages.length > 0 && shouldAutoScroll) {
            setTimeout(() => {
                scrollToBottom();
            }, 100);
        }
    }, [currentSessionId, sessionMessages.length, shouldAutoScroll, scrollToBottom]);

    if (!currentSessionId) {
        return (
            <div className="flex flex-col h-full bg-background">
                <div className="flex-1 flex items-center justify-center">
                    <div className="text-center space-y-4 px-4 w-full">
                        <div className="flex justify-center">
                            <OpenCodeLogo width={300} height={52} className="text-muted-foreground" />
                        </div>
                        <p className="typography-base text-muted-foreground/70">
                            Start by creating a new session
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    // Only show loading skeletons if we're loading an existing session with messages
    // For new sessions, we know there are no messages, so skip the loading state
    if (isLoading && sessionMessages.length === 0 && !streamingMessageId) {
        // Check if this is likely a new session by checking if messages Map has an entry
        const hasMessagesEntry = messages.has(currentSessionId);
        if (!hasMessagesEntry) {
            // This is likely the initial load of an existing session
            return (
        <div className="flex flex-col h-full bg-background gap-0">
                    <div className="flex-1 overflow-y-auto p-4 bg-background">
                        <div className="space-y-4 max-w-4xl mx-auto">
                            {[1, 2, 3].map((i) => (
                                <div key={i} className="flex gap-3 p-4">
                                    <Skeleton className="h-8 w-8 rounded-full" />
                                    <div className="flex-1 space-y-2">
                                        <Skeleton className="h-4 w-24" />
                                        <Skeleton className="h-20 w-full" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                    <ChatInput />
                </div>
            );
        }
    }

    return (
        <div className="flex flex-col h-full bg-background">
            <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 relative z-0" ref={scrollRef} style={{ contain: 'strict' }}>
                {sessionMessages.length === 0 ? (
                    <div className="flex items-center justify-center h-full min-h-[400px]">
                        <div className="text-center space-y-6 px-4 w-full">
                            <div className="flex justify-center">
                                <OpenCodeLogo width={300} height={52} className="opacity-80" />
                            </div>
                            <h3 className="typography-xl font-semibold text-muted-foreground/60">Start a New Conversation</h3>
                        </div>
                    </div>
                ) : (
                    <div className="max-w-5xl mx-auto pb-2">
                        {/* Subtle loading indicator when fetching older messages */}
                        {isLoadingMore && (
                            <div className="flex justify-center py-2">
                                <div className="animate-spin h-3 w-3 border-2 border-muted-foreground/30 border-t-transparent rounded-full" />
                            </div>
                        )}

                        <div className="flex flex-col">
                            {sessionMessages.map((message, index: number) => (
                                <ChatMessage
                                    key={message.info.id}
                                    message={message}
                                    isStreaming={streamingMessageIds.current.has(message.info.id)}
                                    onContentChange={() => {
                                        // Trigger scroll update when animated content changes
                                        // BUT only if user is at bottom AND hasn't scrolled up
                                        // Double-check with both isAtBottom() and distance threshold
                                        const scrollFromBottom = scrollRef.current ? scrollRef.current.scrollHeight - scrollRef.current.scrollTop - scrollRef.current.clientHeight : 0;
                                        if (shouldAutoScroll && !userHasScrolledUpRef.current && isAtBottom() && scrollFromBottom < 10) {
                                            scrollToBottom();
                                        }
                                    }}
                                    isUserScrolling={userHasScrolledUpRef.current}

                                />
                            ))}
                        </div>

                        {/* Permission Requests - Match tool container width */}
                        {sessionPermissions.length > 0 && (
                            <div>
                                {sessionPermissions.map((permission) => (
                                    <PermissionCard
                                        key={permission.id}
                                        permission={permission}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            <div className="relative border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 z-10">
                <ModelControls />
                <ChatInput />
            </div>
        </div>
    );
};