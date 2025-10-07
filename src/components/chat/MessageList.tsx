import React from 'react';
import type { Message, Part } from '@opencode-ai/sdk';

import ChatMessage from './ChatMessage';
import { PermissionCard } from './PermissionCard';
import type { Permission } from '@/types/permission';
import type { AnimationHandlers } from '@/hooks/useChatScrollManager';
import { useSessionStore } from '@/stores/useSessionStore';
import { deriveMessageRole } from './message/messageRole';
import { filterVisibleParts, isEmptyTextPart, isFinalizedTextPart } from './message/partUtils';
import type { MessageGroupingContext, GroupablePart, GroupStatus } from './message/toolGrouping';
import type { ToolPart as ToolPartType } from '@/types/tool';

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
    const pendingUserMessageIds = useSessionStore((state) => state.pendingUserMessageIds);

    const messageGrouping = React.useMemo(() => {
        const grouping = new Map<string, MessageGroupingContext>();

        type BurstAccumulator = {
            id: string;
            messageIds: string[];
            messageIdSet: Set<string>;
            aggregatedParts: GroupablePart[];
            hiddenIndicesMap: Map<string, number[]>;
            hasText: boolean;
            anchorId: string;
            textMessageIds: Set<string>;
            toolConnections: Record<string, { hasPrev: boolean; hasNext: boolean }>;
        };

        let currentBurst: BurstAccumulator | null = null;

        const finalizeBurst = (burst: BurstAccumulator, statusOverride?: GroupStatus) => {
            if (burst.messageIds.length === 0 || burst.aggregatedParts.length === 0) {
                return;
            }

            const anchorId = burst.anchorId ?? burst.messageIds[0];
            if (!anchorId) {
                return;
            }

            const status: GroupStatus = statusOverride ?? (burst.hasText ? 'finished' : 'working');
            const partsSnapshot = burst.aggregatedParts.slice();
            const toolSequence = burst.aggregatedParts.filter((part): part is ToolPartType => part.type === 'tool');
            const toolConnections: Record<string, { hasPrev: boolean; hasNext: boolean }> = {};
            toolSequence.forEach((toolPart, index) => {
                toolConnections[toolPart.id] = {
                    hasPrev: index > 0,
                    hasNext: index < toolSequence.length - 1,
                };
            });
            burst.toolConnections = toolConnections;

            burst.messageIds.forEach((messageId) => {
                const hidden = burst.hiddenIndicesMap.get(messageId) ?? [];
                const context: MessageGroupingContext = {};
                if (hidden.length > 0) {
                    context.hiddenPartIndices = hidden;
                }

                const hasText = burst.textMessageIds.has(messageId);
                const isAnchor = messageId === anchorId;

                if (isAnchor) {
                    context.group = {
                        groupId: burst.id,
                        parts: partsSnapshot,
                        status,
                        toolConnections,
                    };
                    context.suppressMessage = false;
                } else if (!hasText) {
                    context.suppressMessage = true;
                }

                if (!isAnchor && hasText) {
                    context.suppressMessage = false;
                }
                context.toolConnections = toolConnections;

                grouping.set(messageId, context);
            });
        };

        const ensureBurst = (messageId: string): BurstAccumulator => {
            if (!currentBurst) {
                currentBurst = {
                    id: `${messageId}-burst`,
                    messageIds: [],
                    messageIdSet: new Set<string>(),
                    aggregatedParts: [],
                    hiddenIndicesMap: new Map<string, number[]>(),
                    hasText: false,
                    anchorId: messageId,
                    textMessageIds: new Set<string>(),
                    toolConnections: {},
                };
            }
            if (!currentBurst.messageIdSet.has(messageId)) {
                currentBurst.messageIdSet.add(messageId);
                currentBurst.messageIds.push(messageId);
            }
            return currentBurst;
        };

        messages.forEach((message) => {
            const role = deriveMessageRole(message.info, pendingUserMessageIds);
            const isUser = role.isUser;
            const visibleParts = filterVisibleParts(message.parts);
            const hasNonEmptyText = visibleParts.some((part) => part.type === 'text' && !isEmptyTextPart(part));
            const groupableIndices: number[] = [];

            visibleParts.forEach((part, index) => {
                if (part.type === 'tool' || part.type === 'reasoning') {
                    groupableIndices.push(index);
                }
            });

            if (isUser) {
                if (currentBurst) {
                    finalizeBurst(currentBurst, 'finished');
                    currentBurst = null;
                }
                return;
            }

            if (!currentBurst && groupableIndices.length === 0) {
                return;
            }

            const burst = ensureBurst(message.info.id);
            burst.hiddenIndicesMap.set(message.info.id, groupableIndices);

            groupableIndices.forEach((index) => {
                const part = visibleParts[index];
                burst.aggregatedParts.push(part as GroupablePart);
            });

            if (hasNonEmptyText) {
                burst.hasText = true;
                burst.textMessageIds.add(message.info.id);
                finalizeBurst(burst);
                currentBurst = null;
            }
        });

        if (currentBurst) {
            const burst = currentBurst as BurstAccumulator;
            const status: GroupStatus = burst.hasText ? 'finished' : 'working';
            finalizeBurst(burst, status);
            currentBurst = null;
        }

        return grouping;
    }, [messages, pendingUserMessageIds]);

    return (
        <div className="max-w-5xl mx-auto pb-2">
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
                        groupingContext={messageGrouping.get(message.info.id)}
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
