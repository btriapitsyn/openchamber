import React from 'react';
import type { Part } from '@opencode-ai/sdk';

import AssistantTextPart from './parts/AssistantTextPart';
import UserTextPart from './parts/UserTextPart';
import ReasoningPart from './parts/ReasoningPart';
import ToolPart from './parts/ToolPart';
import { MessageFilesDisplay } from '../FileAttachment';
import type { ToolPart as ToolPartType } from '@opencode-ai/sdk';
import type { StreamPhase, ToolPopupContent } from './types';
import { cn } from '@/lib/utils';
import { isEmptyTextPart } from './partUtils';

type ToolReadiness = {
    displayable: boolean;
    completed: boolean;
    pending: boolean;
};

interface MessageBodyProps {
    messageId: string;
    parts: Part[];
    isUser: boolean;
    syntaxTheme: any;
    isMobile: boolean;
    copiedCode: string | null;
    onCopyCode: (code: string) => void;
    expandedTools: Set<string>;
    onToggleTool: (toolId: string) => void;
    onShowPopup: (content: ToolPopupContent) => void;
    streamPhase: StreamPhase;
    allowAnimation: boolean;
    onAssistantAnimationChunk: () => void;
    onAssistantAnimationComplete: () => void;
    onContentChange?: () => void;
    compactTopSpacing?: boolean;
    shouldShowHeader?: boolean;
    hasTextContent?: boolean;
    onCopyMessage?: () => void;
    copiedMessage?: boolean;
}

const MessageBody: React.FC<MessageBodyProps> = ({
    messageId,
    parts,
    isUser,
    syntaxTheme,
    isMobile,
    copiedCode,
    onCopyCode,
    expandedTools,
    onToggleTool,
    onShowPopup,
    streamPhase,
    allowAnimation,
    onAssistantAnimationChunk,
    onAssistantAnimationComplete,
    onContentChange,
    compactTopSpacing = false,
    shouldShowHeader = true,
    hasTextContent = false,
    onCopyMessage,
    copiedMessage = false,
}) => {
    // Filter out empty text parts
    const visibleParts = React.useMemo(() => {
        return parts.filter((part) => !isEmptyTextPart(part));
    }, [parts]);

    const toolStatus = React.useMemo(() => {
        const readiness = new Map<string, ToolReadiness>();
        let toolCount = 0;
        let completedCount = 0;
        let hasPending = false;

        parts.forEach((part) => {
            if (part.type !== 'tool') {
                return;
            }

            const toolPart = part as ToolPartType;
            const toolState = (toolPart as any).state || {};
            const startTime = toolState?.time?.start;
            const endTime = toolState?.time?.end;
            const hasValidTime = typeof startTime === 'number' && typeof endTime === 'number' && endTime > startTime;
            const isPending = toolState?.status === 'pending';

            readiness.set(toolPart.id, {
                displayable: Boolean(hasValidTime || isPending),
                completed: Boolean(hasValidTime),
                pending: Boolean(isPending),
            });

            toolCount += 1;
            if (hasValidTime) {
                completedCount += 1;
            }
            if (isPending) {
                hasPending = true;
            }
        });

        return {
            hasTools: toolCount > 0,
            toolCount,
            completedCount,
            readiness,
            hasPending,
        };
    }, [parts]);


    // Calculate tool connections for vertical line rendering
    const toolConnections = React.useMemo(() => {
        const connections: Record<string, { hasPrev: boolean; hasNext: boolean }> = {};
        const toolParts = parts.filter((p): p is ToolPartType => {
            if (p.type !== 'tool') {
                return false;
            }
            const readiness = toolStatus.readiness.get(p.id);
            return readiness?.displayable === true;
        });

        toolParts.forEach((toolPart, index) => {
            connections[toolPart.id] = {
                hasPrev: index > 0,
                hasNext: index < toolParts.length - 1,
            };
        });

        return connections;
    }, [parts, toolStatus]);

    const renderedParts = React.useMemo(() => {
        const rendered: React.ReactNode[] = [];

        // Create array of parts with their end times for sorting
        const partsWithTime: Array<{
            part: Part;
            index: number;
            endTime: number | null;
            element: React.ReactNode;
        }> = [];

        visibleParts.forEach((part, index) => {
            let endTime: number | null = null;
            let element: React.ReactNode | null = null;

            switch (part.type) {
                case 'text':
                    if (isUser) {
                        element = (
                            <UserTextPart
                                key={`user-text-${index}`}
                                part={part}
                                messageId={messageId}
                                isMobile={isMobile}
                            />
                        );
                        // User text parts don't have explicit time
                        endTime = null;
                    } else {
                        const hasEndTime = typeof (part as any).time?.end === 'number';
                        const shouldCoordinateWithTools =
                            toolStatus.hasTools && toolStatus.toolCount > 0 && !toolStatus.hasPending;
                        const toolsAreCompleted = shouldCoordinateWithTools
                            ? toolStatus.completedCount === toolStatus.toolCount
                            : true;

                        if (shouldCoordinateWithTools && (!hasEndTime || !toolsAreCompleted)) {
                            break;
                        }

                        const allowTextAnimation = shouldCoordinateWithTools ? false : allowAnimation;
                        const effectiveStreamPhase = shouldCoordinateWithTools ? 'completed' : streamPhase;

                        element = (
                            <AssistantTextPart
                                key={`assistant-text-${index}`}
                                part={part}
                                messageId={messageId}
                                syntaxTheme={syntaxTheme}
                                isMobile={isMobile}
                                copiedCode={copiedCode}
                                onCopyCode={onCopyCode}
                                streamPhase={effectiveStreamPhase}
                                allowAnimation={allowTextAnimation}
                                onAnimationChunk={onAssistantAnimationChunk}
                                onAnimationComplete={onAssistantAnimationComplete}
                                onContentChange={onContentChange}
                                shouldShowHeader={shouldShowHeader}
                                hasTextContent={hasTextContent}
                                onCopyMessage={onCopyMessage}
                                copiedMessage={copiedMessage}
                            />
                        );
                        endTime = hasEndTime ? (part as any).time?.end || null : null;
                    }
                    break;

                case 'reasoning': {
                    const reasoningPart = part as any;
                    // Only show reasoning when it has finished (has end time)
                    const hasEndTime = reasoningPart.time && typeof reasoningPart.time.end !== 'undefined';
                    const shouldShowReasoning = hasEndTime;
                    
                    if (shouldShowReasoning) {
                        element = (
                            <ReasoningPart
                                key={`reasoning-${index}`}
                                part={part}
                                messageId={messageId}
                                onContentChange={onContentChange}
                            />
                        );
                        endTime = reasoningPart.time?.end || null;
                    }
                    break;
                }

                case 'tool': {
                    const toolPart = part as ToolPartType;
                    const connection = toolConnections[toolPart.id];
                    const readiness = toolStatus.readiness.get(toolPart.id);
                    const shouldShowTool = readiness?.displayable === true;
                    
                    if (shouldShowTool) {
                        const toolState = (toolPart as any).state;
                        element = (
                            <ToolPart
                                key={`tool-${toolPart.id}`}
                                part={toolPart}
                                isExpanded={expandedTools.has(toolPart.id)}
                                onToggle={onToggleTool}
                                syntaxTheme={syntaxTheme}
                                isMobile={isMobile}
                                onContentChange={onContentChange}
                                hasPrevTool={connection?.hasPrev ?? false}
                                hasNextTool={connection?.hasNext ?? false}
                            />
                        );
                        endTime = readiness?.completed ? toolState?.time?.end || null : null;
                    }
                    break;
                }

                default:
                    break;
            }

            if (element) {
                partsWithTime.push({
                    part,
                    index,
                    endTime,
                    element
                });
            }
        });

        // Sort by end time (null times go last)
        partsWithTime.sort((a, b) => {
            if (a.endTime === null && b.endTime === null) {
                // Both null - maintain original order
                return a.index - b.index;
            }
            if (a.endTime === null) {
                // a has no time, goes after b
                return 1;
            }
            if (b.endTime === null) {
                // b has no time, goes after a
                return -1;
            }
            // Both have times - sort by end time
            return a.endTime - b.endTime;
        });

        // Assemble in sorted order
        partsWithTime.forEach(({ element }) => {
            rendered.push(element);
        });

        return rendered;
    }, [
        visibleParts,
        messageId,
        isUser,
        syntaxTheme,
        isMobile,
        copiedCode,
        onCopyCode,
        onShowPopup,
        streamPhase,
        allowAnimation,
        onAssistantAnimationChunk,
        onAssistantAnimationComplete,
        onContentChange,
        expandedTools,
        onToggleTool,
        toolConnections,
        toolStatus,
        shouldShowHeader,
        hasTextContent,
        onCopyMessage,
        copiedMessage,
    ]);


    return (
        <div
            className={cn(
                'w-full overflow-hidden px-3',
                compactTopSpacing && '-mt-1'
            )}
            style={{
                minHeight: '2rem',
                contain: 'layout',
                transform: 'translateZ(0)',
            }}
        >
            <div className="leading-normal overflow-hidden text-foreground/90">
                {renderedParts}
                <MessageFilesDisplay files={parts} onShowPopup={onShowPopup} />
            </div>
        </div>
    );
};

export default React.memo(MessageBody);
