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
                            messageId={messageId}
                            onContentChange={onContentChange}
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

        // Assemble in order: reasoning → tools → text
        rendered.push(...reasoningElements);
        rendered.push(...toolElements);
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
        onContentChange,
        expandedTools,
        onToggleTool,
        toolConnections,
        shouldShowHeader,
        hasTextContent,
        onCopyMessage,
        copiedMessage,
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
