import React from 'react';
import type { Part } from '@opencode-ai/sdk';

import AssistantTextPart from './parts/AssistantTextPart';
import UserTextPart from './parts/UserTextPart';
import ReasoningPart from './parts/ReasoningPart';
import ToolPart from './parts/ToolPart';
import { WorkingPlaceholder } from './parts/WorkingPlaceholder';
import { MessageFilesDisplay } from '../FileAttachment';
import type { ToolPart as ToolPartType } from '@opencode-ai/sdk';
import type { StreamPhase, ToolPopupContent } from './types';
import { cn } from '@/lib/utils';
import { isEmptyTextPart } from './partUtils';

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

    // Analyze parts for working placeholder logic
    const { hasActiveReasoning, hasToolParts, hasRunningTools, lastToolFinishTime, hasTextPart, hasReasoningParts, lastReasoningFinishTime } = React.useMemo(() => {
        let activeReasoning = false;
        let toolParts = false;
        let runningTools = false;
        let latestToolFinishTime: number | null = null;
        let textPart = false;
        let reasoningParts = false;
        let latestReasoningFinishTime: number | null = null;

        visibleParts.forEach((part) => {
            if (part.type === 'reasoning') {
                reasoningParts = true;
                const time = (part as any).time;
                if (!time || typeof time.end === 'undefined') {
                    activeReasoning = true;
                } else {
                    // Reasoning is finished
                    const endTime = time.end;
                    if (endTime && (latestReasoningFinishTime === null || endTime > latestReasoningFinishTime)) {
                        latestReasoningFinishTime = endTime;
                    }
                }
            } else if (part.type === 'tool') {
                toolParts = true;
                const toolPart = part as ToolPartType;
                const isRunning = toolPart.state.status === 'running';
                const isFinished = toolPart.state.status === 'completed' || toolPart.state.status === 'error';

                if (isRunning) {
                    runningTools = true;
                }

                if (isFinished && 'time' in toolPart.state && toolPart.state.time) {
                    const endTime = (toolPart.state.time as any).end;
                    if (endTime && (latestToolFinishTime === null || endTime > latestToolFinishTime)) {
                        latestToolFinishTime = endTime;
                    }
                }
            } else if (part.type === 'text') {
                const content = (part as any).text || (part as any).content || (part as any).value || '';
                if (typeof content === 'string' && content.trim().length > 0) {
                    textPart = true;
                }
            }
        });

        return {
            hasActiveReasoning: activeReasoning,
            hasToolParts: toolParts,
            hasRunningTools: runningTools,
            lastToolFinishTime: latestToolFinishTime,
            hasTextPart: textPart,
            hasReasoningParts: reasoningParts,
            lastReasoningFinishTime: latestReasoningFinishTime,
        };
    }, [visibleParts]);

    // Determine if working placeholder should be shown
    const shouldShowWorkingPlaceholder = React.useMemo(() => {
        // Only for assistant messages during streaming
        if (isUser || streamPhase !== 'streaming') {
            return false;
        }

        // Don't show if text part exists (text will show "Forming the response")
        if (hasTextPart) {
            return false;
        }

        // Show if we have reasoning or tools that are either running or recently finished
        const hasWorkingParts = hasReasoningParts || hasToolParts;
        const isCurrentlyWorking = hasActiveReasoning || hasRunningTools;
        const hasRecentlyFinished = lastReasoningFinishTime !== null || lastToolFinishTime !== null;

        return hasWorkingParts && (isCurrentlyWorking || hasRecentlyFinished);
    }, [isUser, streamPhase, hasTextPart, hasReasoningParts, hasToolParts, hasActiveReasoning, hasRunningTools, lastReasoningFinishTime, lastToolFinishTime]);

    // Calculate tool connections for vertical line rendering
    const toolConnections = React.useMemo(() => {
        const connections: Record<string, { hasPrev: boolean; hasNext: boolean }> = {};
        const toolParts = visibleParts.filter((p): p is ToolPartType => p.type === 'tool');

        toolParts.forEach((toolPart, index) => {
            connections[toolPart.id] = {
                hasPrev: index > 0,
                hasNext: index < toolParts.length - 1,
            };
        });

        return connections;
    }, [visibleParts]);

    const renderedParts = React.useMemo(() => {
        const rendered: React.ReactNode[] = [];
        const toolElements: React.ReactNode[] = [];
        const textElements: React.ReactNode[] = [];
        const reasoningElements: React.ReactNode[] = [];

        visibleParts.forEach((part, index) => {
            switch (part.type) {
                case 'text':
                    if (isUser) {
                        textElements.push(
                            <UserTextPart
                                key={`user-text-${index}`}
                                part={part}
                                messageId={messageId}
                                isMobile={isMobile}
                            />
                        );
                    } else {
                        textElements.push(
                            <AssistantTextPart
                                key={`assistant-text-${index}`}
                                part={part}
                                messageId={messageId}
                                syntaxTheme={syntaxTheme}
                                isMobile={isMobile}
                                copiedCode={copiedCode}
                                onCopyCode={onCopyCode}
                                onShowPopup={onShowPopup}
                                streamPhase={streamPhase}
                                allowAnimation={allowAnimation}
                                onAnimationChunk={onAssistantAnimationChunk}
                                onAnimationComplete={onAssistantAnimationComplete}
                                hasActiveReasoning={hasActiveReasoning}
                                hasToolParts={hasToolParts}
                                onContentChange={onContentChange}
                                shouldShowHeader={shouldShowHeader}
                                hasTextContent={hasTextContent}
                                onCopyMessage={onCopyMessage}
                                copiedMessage={copiedMessage}
                            />
                        );
                    }
                    break;

                case 'reasoning':
                    reasoningElements.push(
                        <ReasoningPart
                            key={`reasoning-${index}`}
                            part={part}
                            onContentChange={onContentChange}
                            isMobile={isMobile}
                            onShowPopup={onShowPopup}
                            syntaxTheme={syntaxTheme}
                            copiedCode={copiedCode}
                            onCopyCode={onCopyCode}
                        />
                    );
                    break;

                case 'tool': {
                    const toolPart = part as ToolPartType;
                    const connection = toolConnections[toolPart.id];
                    toolElements.push(
                        <ToolPart
                            key={`tool-${toolPart.id}`}
                            part={toolPart}
                            isExpanded={expandedTools.has(toolPart.id)}
                            onToggle={onToggleTool}
                            syntaxTheme={syntaxTheme}
                            isMobile={isMobile}
                            onShowPopup={onShowPopup}
                            onContentChange={onContentChange}
                            hasPrevTool={connection?.hasPrev ?? false}
                            hasNextTool={connection?.hasNext ?? false}
                        />
                    );
                    break;
                }

                default:
                    break;
            }
        });

        // Assemble in order: reasoning → tools → working placeholder → text
        rendered.push(...reasoningElements);
        rendered.push(...toolElements);

        // Add working placeholder after tools, before text (only for assistant during streaming)
        if (shouldShowWorkingPlaceholder) {
            // Use the most recent finish time from either reasoning or tools
            const combinedFinishTime =
                lastReasoningFinishTime !== null && lastToolFinishTime !== null
                    ? Math.max(lastReasoningFinishTime, lastToolFinishTime)
                    : lastReasoningFinishTime ?? lastToolFinishTime;

            const isCurrentlyWorking = hasActiveReasoning || hasRunningTools;

            rendered.push(
                <WorkingPlaceholder
                    key={`working-${messageId}`}
                    hasRunningTools={isCurrentlyWorking}
                    lastToolFinishTime={combinedFinishTime}
                    persistenceMs={2000}
                />
            );
        }

        rendered.push(...textElements);

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
        hasActiveReasoning,
        hasToolParts,
        onContentChange,
        expandedTools,
        onToggleTool,
        toolConnections,
        shouldShowHeader,
        hasTextContent,
        onCopyMessage,
        copiedMessage,
        shouldShowWorkingPlaceholder,
        hasRunningTools,
        lastToolFinishTime,
        lastReasoningFinishTime,
        hasActiveReasoning,
    ]);

    return (
        <div
            className={cn(
                'w-full overflow-hidden pl-3',
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
                <MessageFilesDisplay files={parts} />
            </div>
        </div>
    );
};

export default React.memo(MessageBody);
