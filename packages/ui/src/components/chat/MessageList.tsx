import React from 'react';
import type { Message, Part } from '@opencode-ai/sdk/v2';

import ChatMessage from './ChatMessage';
import { PermissionCard } from './PermissionCard';
import { QuestionCard } from './QuestionCard';
import type { PermissionRequest } from '@/types/permission';
import type { QuestionRequest } from '@/types/question';
import type { AnimationHandlers, ContentChangeReason } from '@/hooks/useChatScrollManager';
import { filterSyntheticParts } from '@/lib/messages/synthetic';
import { detectTurns, type Turn } from './hooks/useTurnGrouping';
import { TurnGroupingProvider, useMessageNeighbors, useTurnGroupingContextForMessage, useTurnGroupingContextStatic, useLastTurnMessageIds } from './contexts/TurnGroupingContext';

interface ChatMessageEntry {
    info: Message;
    parts: Part[];
}

interface MessageListProps {
    messages: ChatMessageEntry[];
    permissions: PermissionRequest[];
    questions: QuestionRequest[];
    onMessageContentChange: (reason?: ContentChangeReason) => void;
    getAnimationHandlers: (messageId: string) => AnimationHandlers;
    hasMoreAbove: boolean;
    isLoadingOlder: boolean;
    onLoadOlder: () => void;
    scrollToBottom?: (options?: { instant?: boolean; force?: boolean }) => void;
    scrollRef?: React.RefObject<HTMLDivElement | null>;
}

interface MessageRowProps {
    message: ChatMessageEntry;
    onContentChange: (reason?: ContentChangeReason) => void;
    animationHandlers: AnimationHandlers;
    scrollToBottom?: (options?: { instant?: boolean; force?: boolean }) => void;
}

// Static MessageRow - does NOT subscribe to dynamic context
// Used for messages NOT in the last turn - no re-renders during streaming
const StaticMessageRow = React.memo<MessageRowProps>(({
    message,
    onContentChange,
    animationHandlers,
    scrollToBottom,
}) => {
    const { previousMessage, nextMessage } = useMessageNeighbors(message.info.id);
    const turnGroupingContext = useTurnGroupingContextStatic(message.info.id);
    
    return (
        <ChatMessage
            message={message}
            previousMessage={previousMessage}
            nextMessage={nextMessage}
            onContentChange={onContentChange}
            animationHandlers={animationHandlers}
            scrollToBottom={scrollToBottom}
            turnGroupingContext={turnGroupingContext}
        />
    );
});

StaticMessageRow.displayName = 'StaticMessageRow';

// Dynamic MessageRow - subscribes to dynamic context for streaming state
// Used for messages in the LAST turn only
const DynamicMessageRow = React.memo<MessageRowProps>(({
    message,
    onContentChange,
    animationHandlers,
    scrollToBottom,
}) => {
    const { previousMessage, nextMessage } = useMessageNeighbors(message.info.id);
    const turnGroupingContext = useTurnGroupingContextForMessage(message.info.id);
    
    return (
        <ChatMessage
            message={message}
            previousMessage={previousMessage}
            nextMessage={nextMessage}
            onContentChange={onContentChange}
            animationHandlers={animationHandlers}
            scrollToBottom={scrollToBottom}
            turnGroupingContext={turnGroupingContext}
        />
    );
});

DynamicMessageRow.displayName = 'DynamicMessageRow';

interface TurnBlockProps {
    turn: Turn;
    onMessageContentChange: (reason?: ContentChangeReason) => void;
    getAnimationHandlers: (messageId: string) => AnimationHandlers;
    scrollToBottom?: (options?: { instant?: boolean; force?: boolean }) => void;
}

const TurnBlock: React.FC<TurnBlockProps> = ({
    turn,
    onMessageContentChange,
    getAnimationHandlers,
    scrollToBottom,
}) => {
    const lastTurnMessageIds = useLastTurnMessageIds();

    const renderMessage = React.useCallback(
        (message: ChatMessageEntry) => {
            const role = (message.info as { clientRole?: string | null | undefined }).clientRole ?? message.info.role;
            const isInLastTurn = role !== 'user' && lastTurnMessageIds.has(message.info.id);
            const RowComponent = isInLastTurn ? DynamicMessageRow : StaticMessageRow;

            return (
                <RowComponent
                    key={message.info.id}
                    message={message}
                    onContentChange={onMessageContentChange}
                    animationHandlers={getAnimationHandlers(message.info.id)}
                    scrollToBottom={scrollToBottom}
                />
            );
        },
        [getAnimationHandlers, lastTurnMessageIds, onMessageContentChange, scrollToBottom]
    );

    return (
        <section className="relative w-full" data-turn-id={turn.turnId}>
            <div className="sticky top-0 z-20 relative bg-[var(--surface-background)] [overflow-anchor:none]">
                <div className="relative z-10">
                    {renderMessage(turn.userMessage)}
                </div>
                <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-0 top-full z-0 h-8 bg-gradient-to-b from-[var(--surface-background)] to-transparent"
                />
            </div>

            <div className="relative z-0">
                {turn.assistantMessages.map((message) => renderMessage(message))}
            </div>
        </section>
    );
};

TurnBlock.displayName = 'TurnBlock';

// Inner component that renders messages with access to context hooks
const MessageListContent: React.FC<{
    turns: Turn[];
    ungroupedMessages: ChatMessageEntry[];
    onMessageContentChange: (reason?: ContentChangeReason) => void;
    getAnimationHandlers: (messageId: string) => AnimationHandlers;
    scrollToBottom?: (options?: { instant?: boolean; force?: boolean }) => void;
}> = ({ turns, ungroupedMessages, onMessageContentChange, getAnimationHandlers, scrollToBottom }) => {
    const lastTurnMessageIds = useLastTurnMessageIds();

    const renderUngroupedMessage = React.useCallback(
        (message: ChatMessageEntry) => {
            const role = (message.info as { clientRole?: string | null | undefined }).clientRole ?? message.info.role;
            const isInLastTurn = role !== 'user' && lastTurnMessageIds.has(message.info.id);
            const RowComponent = isInLastTurn ? DynamicMessageRow : StaticMessageRow;

            return (
                <RowComponent
                    key={message.info.id}
                    message={message}
                    onContentChange={onMessageContentChange}
                    animationHandlers={getAnimationHandlers(message.info.id)}
                    scrollToBottom={scrollToBottom}
                />
            );
        },
        [getAnimationHandlers, lastTurnMessageIds, onMessageContentChange, scrollToBottom]
    );
    
    return (
        <>
            {ungroupedMessages.map((message) => renderUngroupedMessage(message))}

            {turns.map((turn) => (
                <TurnBlock
                    key={turn.turnId}
                    turn={turn}
                    onMessageContentChange={onMessageContentChange}
                    getAnimationHandlers={getAnimationHandlers}
                    scrollToBottom={scrollToBottom}
                />
            ))}
        </>
    );
};

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

    const { turns, ungroupedMessages } = React.useMemo(() => {
        const groupedTurns = detectTurns(displayMessages);
        const groupedMessageIds = new Set<string>();

        groupedTurns.forEach((turn) => {
            groupedMessageIds.add(turn.userMessage.info.id);
            turn.assistantMessages.forEach((message) => {
                groupedMessageIds.add(message.info.id);
            });
        });

        const ungrouped = displayMessages.filter((message) => !groupedMessageIds.has(message.info.id));

        return {
            turns: groupedTurns,
            ungroupedMessages: ungrouped,
        };
    }, [displayMessages]);

    return (
        <TurnGroupingProvider messages={displayMessages}>
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

                <MessageListContent
                    turns={turns}
                    ungroupedMessages={ungroupedMessages}
                    onMessageContentChange={onMessageContentChange}
                    getAnimationHandlers={getAnimationHandlers}
                    scrollToBottom={scrollToBottom}
                />

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

                {/* Bottom spacer - always 10% of viewport height */}
                <div className="flex-shrink-0" style={{ height: '10vh' }} aria-hidden="true" />
            </div>
        </TurnGroupingProvider>
    );
};

export default React.memo(MessageList);
