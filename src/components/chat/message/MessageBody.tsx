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
import { FadeInOnReveal } from './FadeInOnReveal';

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

    const toolParts = React.useMemo(() => {
        return visibleParts.filter((part): part is ToolPartType => part.type === 'tool');
    }, [visibleParts]);

    const assistantTextParts = React.useMemo(() => {
        if (isUser) {
            return [] as Part[];
        }
        return visibleParts.filter((part) => part.type === 'text');
    }, [visibleParts, isUser]);

    const hasPendingTools = React.useMemo(() => {
        return toolParts.some((toolPart) => {
            const state = (toolPart as any).state ?? {};
            return state?.status === 'pending';
        });
    }, [toolParts]);

    const isToolFinalized = React.useCallback((toolPart: ToolPartType) => {
        const state = (toolPart as any).state ?? {};
        const status = state?.status;
        if (status === 'pending' || status === 'running' || status === 'started') {
            return false;
        }
        const time = state?.time ?? {};
        const endTime = typeof time?.end === 'number' ? time.end : undefined;
        const startTime = typeof time?.start === 'number' ? time.start : undefined;
        if (typeof endTime !== 'number') {
            return false;
        }
        if (typeof startTime === 'number' && endTime < startTime) {
            return false;
        }
        return true;
    }, []);

    const allToolsFinalized = React.useMemo(() => {
        if (toolParts.length === 0) {
            return true;
        }
        if (hasPendingTools) {
            return false;
        }
        return toolParts.every((toolPart) => isToolFinalized(toolPart));
    }, [toolParts, hasPendingTools, isToolFinalized]);

    const assistantTextReady = React.useMemo(() => {
        if (assistantTextParts.length === 0) {
            return true;
        }
        return assistantTextParts.every((part) => typeof (part as any).time?.end === 'number');
    }, [assistantTextParts]);

    const stepState = React.useMemo(() => {
        let stepStarts = 0;
        let stepFinishes = 0;
        visibleParts.forEach((part) => {
            if (part.type === 'step-start') {
                stepStarts += 1;
            } else if (part.type === 'step-finish') {
                stepFinishes += 1;
            }
        });
        return {
            stepStarts,
            stepFinishes,
            hasOpenStep: stepStarts > stepFinishes,
        };
    }, [visibleParts]);

    const hasOpenStep = stepState.hasOpenStep;

    const shouldCoordinateRendering = React.useMemo(() => {
        if (isUser) {
            return false;
        }
        if (assistantTextParts.length === 0 || toolParts.length === 0) {
            return hasOpenStep;
        }
        return true;
    }, [isUser, assistantTextParts.length, toolParts.length, hasOpenStep]);

    const shouldHoldAssistantText =
        shouldCoordinateRendering && (!assistantTextReady || !allToolsFinalized || hasPendingTools || hasOpenStep);
    const shouldHoldTools =
        shouldCoordinateRendering && (hasPendingTools || hasOpenStep || !allToolsFinalized);

    // Calculate tool connections for vertical line rendering
    const toolConnections = React.useMemo(() => {
        const connections: Record<string, { hasPrev: boolean; hasNext: boolean }> = {};
        const displayableTools = toolParts.filter((toolPart) => {
            if (shouldHoldTools) {
                return false;
            }
            return isToolFinalized(toolPart);
        });

        displayableTools.forEach((toolPart, index) => {
            connections[toolPart.id] = {
                hasPrev: index > 0,
                hasNext: index < displayableTools.length - 1,
            };
        });

        return connections;
    }, [toolParts, shouldHoldTools, isToolFinalized]);

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
                            <FadeInOnReveal key={`user-text-${index}`}>
                                <UserTextPart
                                    part={part}
                                    messageId={messageId}
                                    isMobile={isMobile}
                                />
                            </FadeInOnReveal>
                        );
                        endTime = null;
                    } else {
                        if (shouldHoldAssistantText) {
                            break;
                        }

                        const hasEndTime = typeof (part as any).time?.end === 'number';
                        if (!hasEndTime) {
                            break;
                        }

                        const allowTextAnimation = shouldCoordinateRendering ? false : allowAnimation;
                        const effectiveStreamPhase = shouldCoordinateRendering ? 'completed' : streamPhase;

                        element = (
                            <FadeInOnReveal key={`assistant-text-${index}`}>
                                <AssistantTextPart
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
                            </FadeInOnReveal>
                        );
                        endTime = (part as any).time?.end || null;
                    }
                    break;

                case 'reasoning': {
                    const reasoningPart = part as any;
                    const hasEndTime = reasoningPart.time && typeof reasoningPart.time.end !== 'undefined';
                    const shouldShowReasoning = hasEndTime && !shouldHoldAssistantText;

                    if (shouldShowReasoning) {
                        element = (
                            <FadeInOnReveal key={`reasoning-${index}`}>
                                <ReasoningPart
                                    part={part}
                                    messageId={messageId}
                                    onContentChange={onContentChange}
                                />
                            </FadeInOnReveal>
                        );
                        endTime = reasoningPart.time?.end || null;
                    }
                    break;
                }

                case 'tool': {
                    const toolPart = part as ToolPartType;
                    const connection = toolConnections[toolPart.id];
                    const toolState = (toolPart as any).state ?? {};
                    const status = toolState?.status;
                    const isPending = status === 'pending';
                    const isFinalized = isToolFinalized(toolPart);
                    const shouldShowTool = !shouldHoldTools && (isPending || isFinalized);

                    if (shouldShowTool) {
                        element = (
                            <FadeInOnReveal key={`tool-${toolPart.id}`}>
                                <ToolPart
                                    part={toolPart}
                                    isExpanded={expandedTools.has(toolPart.id)}
                                    onToggle={onToggleTool}
                                    syntaxTheme={syntaxTheme}
                                    isMobile={isMobile}
                                    onContentChange={onContentChange}
                                    hasPrevTool={connection?.hasPrev ?? false}
                                    hasNextTool={connection?.hasNext ?? false}
                                />
                            </FadeInOnReveal>
                        );
                        endTime = isFinalized ? toolState?.time?.end || null : null;
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
        streamPhase,
        allowAnimation,
        onAssistantAnimationChunk,
        onAssistantAnimationComplete,
        onContentChange,
        expandedTools,
        onToggleTool,
        toolConnections,
        shouldCoordinateRendering,
        shouldHoldAssistantText,
        shouldHoldTools,
        isToolFinalized,
        shouldShowHeader,
        hasTextContent,
        onCopyMessage,
        copiedMessage,
    ]);


    return (
        <div
            className={cn(
                'w-full overflow-hidden px-3',
                compactTopSpacing && '-mt-0.5'
            )}
            style={{
                minHeight: '2rem',
                contain: 'layout',
                transform: 'translateZ(0)',
            }}
        >
            <div className="leading-normal overflow-hidden text-foreground/90 [&_p:last-child]:mb-0 [&_ul:last-child]:mb-0 [&_ol:last-child]:mb-0">
                {renderedParts}
                <MessageFilesDisplay files={parts} onShowPopup={onShowPopup} />
            </div>
        </div>
    );
};

export default React.memo(MessageBody);
