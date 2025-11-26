import React from 'react';
import { RiArrowDownLine } from '@remixicon/react';

import { ChatInput } from './ChatInput';
import { useSessionStore } from '@/stores/useSessionStore';
import { Skeleton } from '@/components/ui/skeleton';
import { OpenChamberGlyph } from '@/components/ui/OpenChamberGlyph';
import MessageList from './MessageList';
import { ScrollShadow } from '@heroui/scroll-shadow';
import { useChatScrollManager } from '@/hooks/useChatScrollManager';
import { useDeviceInfo } from '@/lib/device';
import { Button } from '@/components/ui/button';
import { OverlayScrollbar } from '@/components/ui/OverlayScrollbar';

export const ChatContainer: React.FC = () => {
    const {
        currentSessionId,
        messages,
        permissions,
        streamingMessageId,
        isLoading,
        loadMessages,
        loadMoreMessages,
        updateViewportAnchor,
        sessionMemoryState,
        isSyncing,
        messageStreamStates,
        trimToViewportWindow,
    } = useSessionStore();

    const { isMobile } = useDeviceInfo();

    const sessionMessages = React.useMemo(() => {
        // Trust store's message order - no sorting to avoid clock skew and ID-based ordering issues
        // Messages maintain server-provided chronological order
        return currentSessionId ? messages.get(currentSessionId) || [] : [];
    }, [currentSessionId, messages]);

    const sessionPermissions = React.useMemo(() => {
        return currentSessionId ? permissions.get(currentSessionId) || [] : [];
    }, [currentSessionId, permissions]);

    const {
        scrollRef,
        handleMessageContentChange,
        getAnimationHandlers,
        showScrollButton,
        scrollToBottom,
    } = useChatScrollManager({
        currentSessionId,
        sessionMessages,
        streamingMessageId,
        sessionMemoryState,
        updateViewportAnchor,
        isSyncing,
        isMobile,
        messageStreamStates,
        sessionPermissions,
        trimToViewportWindow,
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
                if (typeof window === 'undefined') {
                    scrollToBottom();
                } else {
                    window.requestAnimationFrame(() => {
                        scrollToBottom();
                    });
                }
            }
        };

        void load();
    }, [currentSessionId, loadMessages, messages, scrollToBottom]);

    if (!currentSessionId) {
        return (
            <div className="flex flex-col h-full bg-background">
                <div className="flex-1 flex items-center justify-center">
                    <div className="text-center space-y-4 px-4 w-full">
                        <div className="flex justify-center">
                            <OpenChamberGlyph width={120} height={120} className="text-muted-foreground" />
                        </div>
                        <p className="typography-markdown text-muted-foreground/70">
                            Start by creating a new session
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    if (isLoading && sessionMessages.length === 0 && !streamingMessageId) {
        const hasMessagesEntry = messages.has(currentSessionId);
        if (!hasMessagesEntry) {
            return (
                <div className="flex flex-col h-full bg-background gap-0">
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

    return (
        <div className="flex flex-col h-full bg-background">
            <div className="relative flex-1 min-h-0">

                <div className="absolute inset-0">
                    <ScrollShadow
                        className="absolute inset-0 overflow-y-auto overflow-x-hidden z-0 chat-scroll overlay-scrollbar-target"
                        ref={scrollRef}
                        style={{
                            contain: 'strict',
                            // Default shadow size for WebKit; can be overridden via CSS var if needed
                            ['--scroll-shadow-size' as string]: '48px',
                        }}
                        data-scroll-shadow="true"
                        data-scrollbar="chat"
                    >
                        <div className="relative z-0 min-h-full">
                            <MessageList
                                messages={sessionMessages}
                                permissions={sessionPermissions}
                                onMessageContentChange={handleMessageContentChange}
                                getAnimationHandlers={getAnimationHandlers}
                                hasMoreAbove={hasMoreAbove}
                                isLoadingOlder={isLoadingOlder}
                                onLoadOlder={handleLoadOlder}
                                scrollToBottom={scrollToBottom}
                            />
                        </div>
                    </ScrollShadow>
                    <OverlayScrollbar containerRef={scrollRef} />
                </div>
            </div>

            <div className="relative bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 z-10">
                {showScrollButton && (
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => scrollToBottom()}
                                className="rounded-full h-8 w-8 p-0 shadow-none bg-background/95 hover:bg-accent"
                                aria-label="Scroll to bottom"
                            >

                            <RiArrowDownLine className="h-4 w-4" />
                        </Button>
                    </div>
                )}
                <ChatInput scrollToBottom={scrollToBottom} />
            </div>
        </div>
    );
};
