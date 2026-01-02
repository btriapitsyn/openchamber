import React from 'react';
import type { Message, Part } from '@opencode-ai/sdk';

import ChatMessage from './ChatMessage';
import { PermissionCard } from './PermissionCard';
import type { Permission } from '@/types/permission';
import type { AnimationHandlers, ContentChangeReason } from '@/hooks/useChatScrollManager';
import { filterSyntheticParts } from '@/lib/messages/synthetic';
import { useTurnGrouping } from './hooks/useTurnGrouping';

interface MessageListProps {
    messages: { info: Message; parts: Part[] }[];
    permissions: Permission[];
    onMessageContentChange: (reason?: ContentChangeReason) => void;
    getAnimationHandlers: (messageId: string) => AnimationHandlers;
    hasMoreAbove: boolean;
    isLoadingOlder: boolean;
    onLoadOlder: () => void;
    scrollToBottom?: (options?: { instant?: boolean; force?: boolean }) => void;
    pendingAnchorId?: string | null;
}

const MessageList: React.FC<MessageListProps> = ({
    messages,
    permissions,
    onMessageContentChange,
    getAnimationHandlers,
    hasMoreAbove,
    isLoadingOlder,
    onLoadOlder,
    scrollToBottom,
    pendingAnchorId,
}) => {
    React.useEffect(() => {
        if (permissions.length === 0) {
            return;
        }
        onMessageContentChange('permission');
    }, [permissions, onMessageContentChange]);

    const displayMessages = React.useMemo(() => {
        const seenIds = new Set<string>();
        return messages
            .filter((message) => {
                const messageId = message.info?.id;
                if (typeof messageId === 'string') {
                    if (seenIds.has(messageId)) {
                        return false;
                    }
                    seenIds.add(messageId);
                }
                return true;
            })
            .map((message) => ({
                ...message,
                parts: filterSyntheticParts(message.parts),
            }));
    }, [messages]);

    const { getContextForMessage } = useTurnGrouping(displayMessages);

    return (
        <div>
            {hasMoreAbove && (
                <div className="flex justify-center py-3">
                    {isLoadingOlder ? (
                        <span className="text-xs uppercase tracking-wide text-muted-foreground/80">
                            Loading…
                        </span>
                    ) : (
                        <button
                            type="button"
                            onClick={onLoadOlder}
                            className="text-xs uppercase tracking-wide text-muted-foreground/80 hover:text-foreground"
                        >
                            Load older messages
                        </button>
                    )}
                </div>
            )}

            <div className="flex flex-col">
                {displayMessages.map((message, index) => (
                    <ChatMessage
                        key={message.info.id}
                        message={message}
                        previousMessage={index > 0 ? displayMessages[index - 1] : undefined}
                        nextMessage={index < displayMessages.length - 1 ? displayMessages[index + 1] : undefined}
                        onContentChange={onMessageContentChange}
                        animationHandlers={getAnimationHandlers(message.info.id)}
                        scrollToBottom={scrollToBottom}
                        isPendingAnchor={pendingAnchorId === message.info.id}
                        turnGroupingContext={getContextForMessage(message.info.id)}
                    />
                ))}

            </div>

            {permissions.length > 0 && (
                <div>
                    {permissions.map((permission) => (
                        <PermissionCard key={permission.id} permission={permission} />
                    ))}
                </div>
            )}
        </div>
    );
};

export default React.memo(MessageList);
