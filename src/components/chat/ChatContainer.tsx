import React from 'react';
import { ArrowDown } from 'iconoir-react';

import { ChatInput } from './ChatInput';
import { ModelControls } from './ModelControls';
import { useSessionStore } from '@/stores/useSessionStore';
import { Skeleton } from '@/components/ui/skeleton';
import { OpenCodeLogo } from '@/components/ui/OpenCodeLogo';
import ChatEmptyState from './ChatEmptyState';
import MessageList from './MessageList';
import { useChatScrollManager } from '@/hooks/useChatScrollManager';
import { useAssistantTyping } from '@/hooks/useAssistantTyping';
import { useDeviceInfo } from '@/lib/device';
import { Button } from '@/components/ui/button';

export const ChatContainer: React.FC = () => {
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
        isSyncing,
        messageStreamStates,
    } = useSessionStore();

    const { isMobile } = useDeviceInfo();

    const sessionMessages = React.useMemo(() => {
        const unsortedMessages = currentSessionId ? messages.get(currentSessionId) || [] : [];
        const sorted = [...unsortedMessages].sort((a, b) => {
            const timeDiff = a.info.time.created - b.info.time.created;
            if (timeDiff !== 0) return timeDiff;

            const aIsUser = a.info.role === 'user' || (a.info as any)?.userMessageMarker;
            const bIsUser = b.info.role === 'user' || (b.info as any)?.userMessageMarker;

            if (aIsUser && !bIsUser) return -1;
            if (!aIsUser && bIsUser) return 1;
            return 0;
        });
        return sorted;
    }, [currentSessionId, messages]);

    const sessionPermissions = React.useMemo(() => {
        return currentSessionId ? permissions.get(currentSessionId) || [] : [];
    }, [currentSessionId, permissions]);

    const { scrollRef, isLoadingMore, handleMessageContentChange, showScrollButton, scrollToBottom } = useChatScrollManager({
        currentSessionId,
        sessionMessages,
        streamingMessageId,
        sessionMemoryState,
        loadMoreMessages,
        updateViewportAnchor,
        isSyncing,
        isMobile,
        messageStreamStates,
    });

    const { isTyping: showAssistantTyping } = useAssistantTyping({
        messages: sessionMessages,
        messageStreamStates,
    });

    React.useEffect(() => {
        if (currentSessionId && (!messages.has(currentSessionId) || messages.get(currentSessionId)?.length === 0)) {
            loadMessages(currentSessionId);
        }
    }, [currentSessionId, messages, loadMessages]);

    if (!currentSessionId) {
        return (
            <div className="flex flex-col h-full bg-background">
                <div className="flex-1 flex items-center justify-center">
                    <div className="text-center space-y-4 px-4 w-full">
                        <div className="flex justify-center">
                            <OpenCodeLogo width={300} height={52} className="text-muted-foreground" />
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
            <div
                className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 relative z-0"
                ref={scrollRef}
                style={{ contain: 'strict' }}
            >
                {sessionMessages.length === 0 ? (
                    <ChatEmptyState />
                ) : (
                    <MessageList
                        messages={sessionMessages}
                        permissions={sessionPermissions}
                        onMessageContentChange={handleMessageContentChange}
                        isLoadingMore={isLoadingMore}
                    />
                )}
            </div>

            <div className="relative border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 z-10">
                {showScrollButton && (
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={scrollToBottom}
                            className="rounded-full h-8 w-8 p-0 shadow-lg bg-background/95 hover:bg-accent"
                            aria-label="Scroll to bottom"
                        >
                            <ArrowDown className="h-4 w-4" />
                        </Button>
                    </div>
                )}
                <ModelControls typingIndicator={showAssistantTyping} />
                <ChatInput />
            </div>
        </div>
    );
};
