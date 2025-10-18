import React from 'react';
import type { Message, Part } from '@opencode-ai/sdk';

import ChatMessage from './ChatMessage';
import { PermissionCard } from './PermissionCard';
import type { Permission } from '@/types/permission';
import type { AnimationHandlers } from '@/hooks/useChatScrollManager';

interface MessageListProps {
    messages: { info: Message; parts: Part[] }[];
    permissions: Permission[];
    onMessageContentChange: () => void;
    getAnimationHandlers: (messageId: string) => AnimationHandlers;
    isLoadingMore: boolean;
}

const MessageList: React.FC<MessageListProps> = ({
    messages,
    permissions,
    onMessageContentChange,
    getAnimationHandlers,
    isLoadingMore,
}) => {
    return (
        <div>
            {isLoadingMore && (
                <div className="flex justify-center py-2">
                    <div className="animate-spin h-3 w-3 border-2 border-muted-foreground/30 border-t-transparent rounded-full" />
                </div>
            )}

            <div className="flex flex-col">
                {messages.map((message, index) => (
                    <ChatMessage
                        key={message.info.id}
                        message={message}
                        previousMessage={index > 0 ? messages[index - 1] : undefined}
                        nextMessage={index < messages.length - 1 ? messages[index + 1] : undefined}
                        onContentChange={onMessageContentChange}
                        animationHandlers={getAnimationHandlers(message.info.id)}
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
