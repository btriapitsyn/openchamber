import React from 'react';
import type { Part } from '@opencode-ai/sdk';
import { StreamingAnimatedText, type MarkdownComponentMap } from '../../StreamingAnimatedText';
import { createAssistantMarkdownComponents } from '../markdownPresets';
import type { StreamPhase } from '../types';
import type { ContentChangeReason } from '@/hooks/useChatScrollManager';
import { ReasoningTimelineBlock, formatReasoningText } from './ReasoningPart';

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
        if (renderAsReasoning) {
            return formatReasoningText(baseTextContent);
        }
        return baseTextContent;
    }, [baseTextContent, renderAsReasoning]);
    const isStreamingPhase = streamPhase === 'streaming';

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

    if (isStreamingPhase) {
        return null;
    }

    // RiCheckLine if part is finalized
    const time = partWithText.time;
    const isFinalized = time && typeof time.end !== 'undefined';

    // Skip rendering when no text has streamed yet
    if (!isFinalized && (!textContent || textContent.trim().length === 0)) {
        return null;
    }

    if (!textContent || textContent.trim().length === 0) {
        return null;
    }

    // Always use completed phase for finalized content
    if (renderAsReasoning) {
        return (
            <ReasoningTimelineBlock
                key={part.id || `${messageId}-text`}
                text={textContent}
                variant="justification"
                onContentChange={onContentChange}
                blockId={part.id || `${messageId}-reasoning-text`}
            />
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
