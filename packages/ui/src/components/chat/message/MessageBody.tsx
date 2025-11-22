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
import { Button } from '@/components/ui/button';
import { RiCheckLine, RiFileCopyLine } from '@remixicon/react';
import type { ContentChangeReason } from '@/hooks/useChatScrollManager';

interface MessageBodyProps {
    messageId: string;
    parts: Part[];
    isUser: boolean;
    isMessageCompleted: boolean;

    syntaxTheme: { [key: string]: React.CSSProperties };

    isMobile: boolean;
    hasTouchInput?: boolean;
    copiedCode: string | null;
    onCopyCode: (code: string) => void;
    expandedTools: Set<string>;
    onToggleTool: (toolId: string) => void;
    onShowPopup: (content: ToolPopupContent) => void;
    streamPhase: StreamPhase;
    allowAnimation: boolean;
    onAssistantAnimationChunk: () => void;
    onAssistantAnimationComplete: () => void;
    onContentChange?: (reason?: ContentChangeReason, messageId?: string) => void;

    compactTopSpacing?: boolean;
    shouldShowHeader?: boolean;
    hasTextContent?: boolean;
    onCopyMessage?: () => void;
    copiedMessage?: boolean;
    onAuxiliaryContentComplete?: () => void;
    showReasoningTraces?: boolean;
}


const MessageBody: React.FC<MessageBodyProps> = ({
    messageId,
    parts,
    isUser,
    isMessageCompleted,

    syntaxTheme,
    isMobile,
    hasTouchInput,
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
    showReasoningTraces = false,
}) => {
    // Only render assistant content after completion; user content always renders
    if (!isUser && !isMessageCompleted) {
        return null;
    }

    const [copyHintVisible, setCopyHintVisible] = React.useState(false);
    const copyHintTimeoutRef = React.useRef<number | null>(null);

    const canCopyMessage = Boolean(onCopyMessage);
    const isMessageCopied = Boolean(copiedMessage);
    const isTouchContext = Boolean(hasTouchInput ?? isMobile);
    // Filter out empty text parts (synthetic filtering handled upstream)
    const visibleParts = React.useMemo(() => {
        return parts.filter((part) => !isEmptyTextPart(part));
    }, [parts]);

    const toolParts = React.useMemo(() => {
        return visibleParts.filter((part): part is ToolPartType => part.type === 'tool');
    }, [visibleParts]);

    // Render assistant text as justification only when the same message includes tool parts
    const renderTextAsJustification = !isUser && toolParts.length > 0 && showReasoningTraces;

    const hasCopyableText = Boolean(hasTextContent);

    const clearCopyHintTimeout = React.useCallback(() => {
        if (copyHintTimeoutRef.current !== null && typeof window !== 'undefined') {
            window.clearTimeout(copyHintTimeoutRef.current);
            copyHintTimeoutRef.current = null;
        }
    }, []);

    const revealCopyHint = React.useCallback(() => {
        if (!isTouchContext || !canCopyMessage || !hasCopyableText || typeof window === 'undefined') {
            return;
        }

        clearCopyHintTimeout();
        setCopyHintVisible(true);
        copyHintTimeoutRef.current = window.setTimeout(() => {
            setCopyHintVisible(false);
            copyHintTimeoutRef.current = null;
        }, 1800);
    }, [canCopyMessage, clearCopyHintTimeout, hasCopyableText, isTouchContext]);

    React.useEffect(() => {
        if (!hasCopyableText) {
            setCopyHintVisible(false);
            clearCopyHintTimeout();
        }
    }, [clearCopyHintTimeout, hasCopyableText]);

    const handleCopyButtonClick = React.useCallback(
        (event: React.MouseEvent<HTMLButtonElement>) => {
            if (!onCopyMessage || !hasCopyableText) {
                return;
            }

            event.stopPropagation();
            event.preventDefault();
            onCopyMessage();

            if (isTouchContext) {
                revealCopyHint();
            }
        },
        [hasCopyableText, isTouchContext, onCopyMessage, revealCopyHint]
    );

    React.useEffect(() => {
        return () => {
            clearCopyHintTimeout();
        };
    }, [clearCopyHintTimeout]);

    const toolConnections = React.useMemo(() => {
        const connections: Record<string, { hasPrev: boolean; hasNext: boolean }> = {};
        toolParts.forEach((tp, idx) => {
            connections[tp.id] = {
                hasPrev: idx > 0,
                hasNext: idx < toolParts.length - 1,
            };
        });
        return connections;
    }, [toolParts]);

    const renderedParts = React.useMemo(() => {
        const rendered: React.ReactNode[] = [];

        visibleParts.forEach((part, index) => {
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
                    } else {
                        const allowTextAnimation = allowAnimation;
                        const effectiveStreamPhase = streamPhase;
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
                                    renderAsReasoning={renderTextAsJustification}
                                />
                            </FadeInOnReveal>
                        );
                    }
                    break;

                case 'reasoning': {
                    if (!showReasoningTraces) {
                        break;
                    }
                    element = (
                        <FadeInOnReveal key={`reasoning-${index}`}>
                            <ReasoningPart
                                part={part}
                                messageId={messageId}
                                onContentChange={onContentChange}
                            />
                        </FadeInOnReveal>
                    );
                    break;
                }

                case 'tool': {
                    const toolPart = part as ToolPartType;
                    const connection = toolConnections[toolPart.id];

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
                    break;
                }

                default:
                    break;
            }

            if (element) {
                rendered.push(element);
            }
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
        shouldShowHeader,
        hasTextContent,
        onCopyMessage,
        copiedMessage,
        showReasoningTraces,
        renderTextAsJustification,
    ]);


    return (
        <div
            className={cn(
                'relative w-full group/message',
                compactTopSpacing && '-mt-0.5'
            )}
            style={{
                contain: 'layout',
                transform: 'translateZ(0)',
            }}
            onTouchStart={isTouchContext && canCopyMessage && hasCopyableText ? revealCopyHint : undefined}
        >
            {canCopyMessage && (
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    data-visible={copyHintVisible || isMessageCopied ? 'true' : undefined}
                    className={cn(
                        'absolute z-10 flex h-7 w-7 items-center justify-center rounded-full border border-border/40 shadow-none bg-background/95 supports-[backdrop-filter]:bg-background/80 hover:bg-accent transition-colors duration-150',
                        'opacity-0 pointer-events-none disabled:opacity-0 disabled:pointer-events-none disabled:text-muted-foreground/40',
                        hasCopyableText && 'group-hover/message:opacity-100 group-hover/message:pointer-events-auto focus-visible:opacity-100 focus-visible:pointer-events-auto',
                        (copyHintVisible || isMessageCopied) && 'opacity-100 pointer-events-auto'
                    )}
                    style={{ insetInlineEnd: isUser ? '0.28rem' : '0.32rem', insetBlockStart: isUser ? '-0.46rem' : '0.34rem' }}
                    disabled={!hasCopyableText}
                    aria-label="Copy message text"
                    aria-hidden={!hasCopyableText}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={handleCopyButtonClick}
                    onFocus={() => {
                        if (hasCopyableText) {
                            setCopyHintVisible(true);
                        }
                    }}
                    onBlur={() => {
                        if (!isMessageCopied) {
                            setCopyHintVisible(false);
                        }
                    }}
                >
                    {isMessageCopied ? (
                        <RiCheckLine className="h-3.5 w-3.5" style={{ color: 'var(--status-success)' }} />
                    ) : (
                        <RiFileCopyLine className="h-3.5 w-3.5" />
                    )}
                </Button>
            )}
            <div className="px-3">
                <div className="leading-normal overflow-hidden text-foreground/90 [&_p:last-child]:mb-0 [&_ul:last-child]:mb-0 [&_ol:last-child]:mb-0">
                    {renderedParts}
                </div>
                <MessageFilesDisplay files={parts} onShowPopup={onShowPopup} />
            </div>
        </div>
    );
};

export default React.memo(MessageBody);
