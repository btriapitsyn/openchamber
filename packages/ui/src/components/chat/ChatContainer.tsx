import React from 'react';
import { RiArrowDownLine } from '@remixicon/react';

import { ChatInput } from './ChatInput';
import { useSessionStore } from '@/stores/useSessionStore';
import { useUIStore } from '@/stores/useUIStore';
import { Skeleton } from '@/components/ui/skeleton';
import ChatEmptyState from './ChatEmptyState';
import MessageList from './MessageList';
import { ScrollShadow } from '@/components/ui/ScrollShadow';
import { useChatScrollManager } from '@/hooks/useChatScrollManager';
import { useDeviceInfo } from '@/lib/device';
import { Button } from '@/components/ui/button';
import { OverlayScrollbar } from '@/components/ui/OverlayScrollbar';
import { TimelineDialog } from './TimelineDialog';

export const ChatContainer: React.FC = () => {
    const {
        currentSessionId,
        messages,
        permissions,
        questions,
        streamingMessageIds,
        isLoading,
        loadMessages,
        loadMoreMessages,
        updateViewportAnchor,
        updateActiveTurnAnchor,
        getActiveTurnAnchor,
        sessionMemoryState,
        openNewSessionDraft,
        isSyncing,
        messageStreamStates,
        trimToViewportWindow,
        sessionActivityPhase,
        newSessionDraft,
    } = useSessionStore();

    const {
        isTimelineDialogOpen,
        setTimelineDialogOpen,
    } = useUIStore();

    const streamingMessageId = React.useMemo(() => {
        if (!currentSessionId) return null;
        return streamingMessageIds.get(currentSessionId) ?? null;
    }, [currentSessionId, streamingMessageIds]);

    const { isMobile } = useDeviceInfo();
    const draftOpen = Boolean(newSessionDraft?.open);

    React.useEffect(() => {
        if (!currentSessionId && !draftOpen) {
            openNewSessionDraft();
        }
    }, [currentSessionId, draftOpen, openNewSessionDraft]);

    const sessionMessages = React.useMemo(() => {

        return currentSessionId ? messages.get(currentSessionId) || [] : [];
    }, [currentSessionId, messages]);

    const sessionPermissions = React.useMemo(() => {
        return currentSessionId ? permissions.get(currentSessionId) || [] : [];
    }, [currentSessionId, permissions]);

    const sessionQuestions = React.useMemo(() => {
        return currentSessionId ? questions.get(currentSessionId) || [] : [];
    }, [currentSessionId, questions]);

    const sessionBlockingCards = React.useMemo(() => {
        return [...sessionPermissions, ...sessionQuestions];
    }, [sessionPermissions, sessionQuestions]);

    const {
        scrollRef,
        handleMessageContentChange,
    getAnimationHandlers,
    showScrollButton,
    scrollToBottom,
        spacerHeight,
        pendingAnchorId,
        hasActiveAnchor,
    } = useChatScrollManager({
        currentSessionId,
        sessionMessages,
        streamingMessageId,
        sessionMemoryState,
        updateViewportAnchor,
        updateActiveTurnAnchor,
        getActiveTurnAnchor,
        isSyncing,
        isMobile,
        messageStreamStates,
        sessionPermissions: sessionBlockingCards,
        trimToViewportWindow,
        sessionActivityPhase,
    });

    const memoryState = React.useMemo(() => {
        if (!currentSessionId) {
            return null;
        }
        return sessionMemoryState.get(currentSessionId) ?? null;
    }, [currentSessionId, sessionMemoryState]);
    const hasMoreAbove = Boolean(memoryState?.hasMoreAbove);
    const [isLoadingOlder, setIsLoadingOlder] = React.useState(false);
    React.useEffect(() => {
        setIsLoadingOlder(false);
    }, [currentSessionId]);

    const handleLoadOlder = React.useCallback(async () => {
        if (!currentSessionId || isLoadingOlder) {
            return;
        }

        const container = scrollRef.current;
        const prevHeight = container?.scrollHeight ?? null;
        const prevTop = container?.scrollTop ?? null;

        setIsLoadingOlder(true);
        try {
            await loadMoreMessages(currentSessionId, 'up');
            if (container && prevHeight !== null && prevTop !== null) {
                const heightDiff = container.scrollHeight - prevHeight;
                container.scrollTop = prevTop + heightDiff;
            }
        } finally {
            setIsLoadingOlder(false);
        }
    }, [currentSessionId, isLoadingOlder, loadMoreMessages, scrollRef]);

    // Scroll to a specific message by ID (for timeline dialog)
    const scrollToMessage = React.useCallback((messageId: string) => {
        const container = scrollRef.current;
        if (!container) return;

        // Find the message element by looking for data-message-id attribute
        const messageElement = container.querySelector(`[data-message-id="${messageId}"]`) as HTMLElement;
        if (messageElement) {
            // Scroll to the message with some padding (50px from top)
            const containerRect = container.getBoundingClientRect();
            const messageRect = messageElement.getBoundingClientRect();
            const offset = 50;

            const scrollTop = messageRect.top - containerRect.top + container.scrollTop - offset;
            container.scrollTo({
                top: scrollTop,
                behavior: 'smooth'
            });
        }
    }, [scrollRef]);

    React.useEffect(() => {
        if (!currentSessionId) {
            return;
        }

        const hasSessionMessages = messages.has(currentSessionId);
        const existingMessages = hasSessionMessages ? messages.get(currentSessionId) ?? [] : [];

        if (existingMessages.length > 0) {
            return;
        }

        const load = async () => {
            try {
                await loadMessages(currentSessionId);
            } finally {
                const currentPhase = sessionActivityPhase?.get(currentSessionId) ?? 'idle';
                const isActivePhase = currentPhase === 'busy' || currentPhase === 'cooldown';
                const shouldSkipScroll = isActivePhase && hasActiveAnchor;

                if (!shouldSkipScroll) {
                    if (typeof window === 'undefined') {
                        scrollToBottom();
                    } else {
                        window.requestAnimationFrame(() => {
                            scrollToBottom();
                        });
                    }
                }
            }
        };

        void load();
    }, [currentSessionId, hasActiveAnchor, loadMessages, messages, scrollToBottom, sessionActivityPhase]);

    if (!currentSessionId && !draftOpen) {
        return (
            <div
                className="flex flex-col h-full bg-background"
                style={isMobile ? { paddingBottom: 'var(--oc-keyboard-inset, 0px)' } : undefined}
            >
                <ChatEmptyState />
            </div>
        );
    }

    if (!currentSessionId && draftOpen) {
        return (
            <div
                className="flex flex-col h-full bg-background transform-gpu"
                style={isMobile ? { paddingBottom: 'var(--oc-keyboard-inset, 0px)' } : undefined}
            >
                <div className="flex-1 flex items-center justify-center">
                    <ChatEmptyState />
                </div>
                <div className="relative bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 z-10">
                    <ChatInput scrollToBottom={scrollToBottom} />
                </div>
            </div>
        );
    }

    if (!currentSessionId) {
        return null;
    }

    if (isLoading && sessionMessages.length === 0 && !streamingMessageId) {
        const hasMessagesEntry = messages.has(currentSessionId);
        if (!hasMessagesEntry) {
            return (
                <div
                    className="flex flex-col h-full bg-background gap-0"
                    style={isMobile ? { paddingBottom: 'var(--oc-keyboard-inset, 0px)' } : undefined}
                >
                    <div className="flex-1 overflow-y-auto p-4 bg-background">
                        <div className="chat-column space-y-4">
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
                    <ChatInput scrollToBottom={scrollToBottom} />
                </div>
            );
        }
    }

    if (sessionMessages.length === 0 && !streamingMessageId) {
        return (
            <div
                className="flex flex-col h-full bg-background transform-gpu"
                style={isMobile ? { paddingBottom: 'var(--oc-keyboard-inset, 0px)' } : undefined}
            >
                <div className="flex-1 flex items-center justify-center">
                    <ChatEmptyState />
                </div>
                <div className="relative bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 z-10">
                    <ChatInput scrollToBottom={scrollToBottom} />
                </div>
            </div>
        );
    }

    return (
        <div
            className="flex flex-col h-full bg-background"
            style={isMobile ? { paddingBottom: 'var(--oc-keyboard-inset, 0px)' } : undefined}
        >
            <div className="relative flex-1 min-h-0">

                <div className="absolute inset-0">
                    <ScrollShadow
                        className="absolute inset-0 overflow-y-auto overflow-x-hidden z-0 chat-scroll overlay-scrollbar-target"
                        ref={scrollRef}
                        style={{
                            contain: 'strict',
                            ['--scroll-shadow-size' as string]: '48px',
                        }}
                        data-scroll-shadow="true"
                        data-scrollbar="chat"
                        hideBottomShadow={!!pendingAnchorId}
                    >
                        <div className="relative z-0 min-h-full">
                            <MessageList
                                messages={sessionMessages}
                                permissions={sessionPermissions}
                                questions={sessionQuestions}
                                onMessageContentChange={handleMessageContentChange}
                                getAnimationHandlers={getAnimationHandlers}
                                hasMoreAbove={hasMoreAbove}
                                isLoadingOlder={isLoadingOlder}
                                onLoadOlder={handleLoadOlder}
                                scrollToBottom={scrollToBottom}
                                pendingAnchorId={pendingAnchorId}
                            />
                            {}
                            {spacerHeight > 0 && hasActiveAnchor && (
                                <div
                                    data-role="active-turn-spacer"
                                    style={{ height: spacerHeight }}
                                    aria-hidden="true"
                                />
                            )}
                        </div>
                    </ScrollShadow>
                    <OverlayScrollbar containerRef={scrollRef} />
                </div>
            </div>

            <div className="relative bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 z-10">
                {showScrollButton && sessionMessages.length > 0 && (
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => scrollToBottom({ force: true })}
                                className="rounded-full h-8 w-8 p-0 shadow-none bg-background/95 hover:bg-accent"
                                aria-label="Scroll to bottom"
                            >

                            <RiArrowDownLine className="h-4 w-4" />
                        </Button>
                    </div>
                )}
                <ChatInput scrollToBottom={scrollToBottom} />
            </div>

            <TimelineDialog
                open={isTimelineDialogOpen}
                onOpenChange={setTimelineDialogOpen}
                onScrollToMessage={scrollToMessage}
            />
        </div>
    );
};
