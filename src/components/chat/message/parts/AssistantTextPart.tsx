import React from 'react';
import type { Part } from '@opencode-ai/sdk';
import { StreamingAnimatedText, type MarkdownComponentMap } from '../../StreamingAnimatedText';
import { createAssistantMarkdownComponents } from '../markdownPresets';
import type { StreamPhase } from '../types';
import { cn } from '@/lib/utils';
import type { ContentChangeReason } from '@/hooks/useChatScrollManager';

type PartWithText = Part & { text?: string; content?: string; value?: string; time?: { start?: number; end?: number } };

interface AssistantTextPartProps {
    part: Part;
    messageId: string;
    syntaxTheme: Record<string, React.CSSProperties>;
    isMobile: boolean;
    copiedCode: string | null;
    onCopyCode: (code: string) => void;
    streamPhase: StreamPhase;
    allowAnimation: boolean;
    onAnimationChunk: () => void;
    onAnimationComplete: () => void;
    onContentChange?: (reason?: ContentChangeReason) => void;
    shouldShowHeader?: boolean;
    hasTextContent?: boolean;
    onCopyMessage?: () => void;
    copiedMessage?: boolean;
    renderAsReasoning?: boolean;
}

const AssistantTextPart: React.FC<AssistantTextPartProps> = ({
    part,
    messageId,
    syntaxTheme,
    isMobile,
    copiedCode,
    onCopyCode,
    streamPhase,
    allowAnimation,
    onAnimationChunk,
    onAnimationComplete,
    onContentChange,
    renderAsReasoning = false,
}) => {
    const partWithText = part as PartWithText;
    const rawText = partWithText.text;
    const baseTextContent = typeof rawText === 'string' ? rawText : partWithText.content || partWithText.value || '';
    const textContent = React.useMemo(() => {
        if (!renderAsReasoning) {
            return baseTextContent;
        }
        const lines = baseTextContent.split(/\r?\n/);
        if (lines.length === 0) {
            return baseTextContent;
        }
        return lines.filter((line) => line.trim().length > 0).join('\n');
    }, [baseTextContent, renderAsReasoning]);
    const isStreamingPhase = streamPhase === 'streaming';

    // Hooks for reasoning-style expand/collapse functionality
    const [isExpanded, setIsExpanded] = React.useState(false);
    const [isClamped, setIsClamped] = React.useState(false);
    const blockquoteRef = React.useRef<HTMLQuoteElement>(null);

    const markdownComponents = React.useMemo<MarkdownComponentMap>(
        () =>
            createAssistantMarkdownComponents({
                syntaxTheme,
                isMobile,
                copiedCode,
                onCopyCode,
                allowAnimation,
            }),
        [syntaxTheme, isMobile, copiedCode, onCopyCode, allowAnimation]
    );

    // Check if text is actually clamped
    React.useEffect(() => {
        if (!blockquoteRef.current || isExpanded || !renderAsReasoning) {
            setIsClamped(false);
            return;
        }

        const element = blockquoteRef.current;
        // Check if content is being clamped
        const isTextClamped = element.scrollHeight > element.clientHeight;
        setIsClamped(isTextClamped);
    }, [textContent, isExpanded, renderAsReasoning]);

    // Call onContentChange when expanded changes (only for reasoning mode)
    React.useEffect(() => {
        if (renderAsReasoning && isExpanded !== undefined) {
            onContentChange?.('structural');
        }
    }, [isExpanded, onContentChange, renderAsReasoning]);

    if (isStreamingPhase) {
        return null;
    }

    // Check if part is finalized
    const time = partWithText.time;
    const isFinalized = time && typeof time.end !== 'undefined';

    // Skip rendering when no text has streamed yet
    if (!isFinalized && (!textContent || textContent.trim().length === 0)) {
        return null;
    }

    if (!textContent || textContent.trim().length === 0) {
        return null;
    }

    // Show as clickable if text is clamped OR already expanded (only for reasoning mode)
    const isClickable = renderAsReasoning && (isClamped || isExpanded);

    // Always use completed phase for finalized content
    if (renderAsReasoning) {
        return (
            <div className="my-1" key={part.id || `${messageId}-text`}>
                <div
                    className={cn(
                        "relative pl-[1.4375rem] pr-3 py-1.5",
                        'before:absolute before:left-[0.4375rem] before:top-[-0.25rem] before:bottom-[-0.25rem] before:w-px before:bg-border/80 before:content-[""]'
                    )}
                >

                    <blockquote
                        ref={blockquoteRef}
                        onClick={() => isClickable && setIsExpanded(!isExpanded)}
                        className={cn(
                            "whitespace-pre-wrap break-words typography-micro italic text-muted-foreground/70 transition-all duration-200",
                            isClickable && "cursor-pointer hover:text-muted-foreground",
                            !isExpanded && "line-clamp-2"
                        )}
                    >
                        {textContent}
                    </blockquote>
                </div>
            </div>
        );
    }

    return (
        <div className="group/assistant-text relative break-words" key={part.id || `${messageId}-text`}>
            <StreamingAnimatedText
                content={textContent}
                phase="completed"
                markdownComponents={markdownComponents}
                part={part}
                messageId={messageId}
                shouldAnimate={allowAnimation}
                onContentChange={() => onContentChange?.('text')}
                onAnimationTick={onAnimationChunk}
                onAnimationComplete={onAnimationComplete}
            />
        </div>
    );
};

export default AssistantTextPart;
