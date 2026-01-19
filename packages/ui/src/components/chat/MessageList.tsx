import React from 'react';
import type { Message, Part } from '@opencode-ai/sdk/v2';

import ChatMessage from './ChatMessage';
import { PermissionCard } from './PermissionCard';
import { QuestionCard } from './QuestionCard';
import type { PermissionRequest } from '@/types/permission';
import type { QuestionRequest } from '@/types/question';
import type { AnimationHandlers, ContentChangeReason } from '@/hooks/useChatScrollManager';
import { filterSyntheticParts } from '@/lib/messages/synthetic';
import { useTurnGrouping } from './hooks/useTurnGrouping';

interface MessageListProps {
    messages: { info: Message; parts: Part[] }[];
    permissions: PermissionRequest[];
    questions: QuestionRequest[];
    onMessageContentChange: (reason?: ContentChangeReason) => void;
    getAnimationHandlers: (messageId: string) => AnimationHandlers;
    hasMoreAbove: boolean;
    isLoadingOlder: boolean;
    onLoadOlder: () => void;
    scrollToBottom?: (options?: { instant?: boolean; force?: boolean; clearAnchor?: boolean }) => void;
    pendingAnchorId?: string | null;
}

const MessageList: React.FC<MessageListProps> = ({
    messages,
    permissions,
    questions,
    onMessageContentChange,
    getAnimationHandlers,
    hasMoreAbove,
    isLoadingOlder,
    onLoadOlder,
    scrollToBottom,
    pendingAnchorId,
}) => {
    React.useEffect(() => {
        if (permissions.length === 0 && questions.length === 0) {
            return;
        }
        onMessageContentChange('permission');
    }, [permissions, questions, onMessageContentChange]);

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
            .map((message) => {
                const filteredParts = filterSyntheticParts(message.parts);
                // Optimization: If parts haven't changed, return the original message object.
                // This preserves referential equality and prevents unnecessary re-renders of ChatMessage (which is memoized).
                if (filteredParts === message.parts) {
                    return message;
                }
                return {
                    ...message,
                    parts: filteredParts,
                };
            });
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

            {(questions.length > 0 || permissions.length > 0) && (
                <div>
                    {questions.map((question) => (
                        <QuestionCard key={question.id} question={question} />
                    ))}
                    {permissions.map((permission) => (
                        <PermissionCard key={permission.id} permission={permission} />
                    ))}
                </div>
            )}
        </div>
    );
};

export default React.memo(MessageList);
