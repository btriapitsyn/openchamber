import React from 'react';
import type { Message, Part } from '@opencode-ai/sdk';

import ChatMessage from './ChatMessage';
import { PermissionCard } from './PermissionCard';
import type { Permission } from '@/types/permission';
import type { AnimationHandlers, ContentChangeReason } from '@/hooks/useChatScrollManager';

interface MessageListProps {
    messages: { info: Message; parts: Part[] }[];
    permissions: Permission[];
    onMessageContentChange: (reason?: ContentChangeReason) => void;
    getAnimationHandlers: (messageId: string) => AnimationHandlers;
    hasMoreAbove: boolean;
    isLoadingOlder: boolean;
    onLoadOlder: () => void;
}

const MessageList: React.FC<MessageListProps> = ({
    messages,
    permissions,
    onMessageContentChange,
    getAnimationHandlers,
    hasMoreAbove,
    isLoadingOlder,
    onLoadOlder,
}) => {
    React.useEffect(() => {
        if (permissions.length === 0) {
            return;
        }
        onMessageContentChange('permission');
    }, [permissions, onMessageContentChange]);

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
                            className="text-xs uppercase tracking-wide text-muted-foreground/80 hover:text-foreground transition-colors"
                        >
                            Load older messages
                        </button>
                    )}
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
