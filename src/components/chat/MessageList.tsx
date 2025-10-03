import React from 'react';
import type { Message, Part } from '@opencode-ai/sdk';

import ChatMessage from './ChatMessage';
import { PermissionCard } from './PermissionCard';
import type { Permission } from '@/types/permission';

interface MessageListProps {
    messages: { info: Message; parts: Part[] }[];
    permissions: Permission[];
    onMessageContentChange: () => void;
    isLoadingMore: boolean;
}

const MessageList: React.FC<MessageListProps> = ({
    messages,
    permissions,
    onMessageContentChange,
    isLoadingMore,
}) => {
    return (
        <div className="max-w-5xl mx-auto pb-2">
            {isLoadingMore && (
                <div className="flex justify-center py-2">
                    <div className="animate-spin h-3 w-3 border-2 border-muted-foreground/30 border-t-transparent rounded-full" />
                </div>
            )}

            <div className="flex flex-col">
                {messages.map((message, index) => {
                    const previousMessage = index > 0 ? messages[index - 1] : null;
                    const isAssistant = message.info.role === 'assistant';
                    const showHeader = !isAssistant || previousMessage?.info.role === 'user';

                    return (
                        <ChatMessage
                            key={message.info.id}
                            message={message}
                            onContentChange={onMessageContentChange}
                            showHeader={showHeader}
                        />
                    );
                })}
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
