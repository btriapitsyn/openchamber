import React from 'react';
import type { Part } from '@opencode-ai/sdk';
import { Copy, Check } from '@phosphor-icons/react';

import { StreamingAnimatedText } from '../../StreamingAnimatedText';
import { createAssistantMarkdownComponents } from '../markdownPresets';
import type { StreamPhase } from '../types';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';


interface AssistantTextPartProps {
    part: Part;
    messageId: string;
    syntaxTheme: any;
    isMobile: boolean;
    copiedCode: string | null;
    onCopyCode: (code: string) => void;
    streamPhase: StreamPhase;
    allowAnimation: boolean;
    onAnimationChunk: () => void;
    onAnimationComplete: () => void;
    onContentChange?: () => void;
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
    shouldShowHeader = true,
    hasTextContent = false,
    onCopyMessage,
    copiedMessage = false,
    renderAsReasoning = false,
}) => {
    const rawText = (part as any).text;
    const textContent = typeof rawText === 'string' ? rawText : (part as any).content || (part as any).value || '';
    const isStreamingPhase = streamPhase === 'streaming';

    if (isStreamingPhase) {
        return null;
    }

    // Check if part is finalized
    const time = (part as any).time;
    const isFinalized = time && typeof time.end !== 'undefined';

    // Skip rendering when no text has streamed yet
    if (!isFinalized && (!textContent || textContent.trim().length === 0)) {
        return null;
    }

    if (!textContent || textContent.trim().length === 0) {
        return null;
    }


    const markdownComponents = React.useMemo(
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

    // Always use completed phase for finalized content
    if (renderAsReasoning) {
        return (
            <div className="my-1 pl-1" key={part.id || `${messageId}-text`}>
                <div
                    className={cn(
                        "relative pl-[1.875rem] pr-3 py-1.5",
                        'before:absolute before:left-[0.875rem] before:top-[-0.25rem] before:bottom-[-0.25rem] before:w-px before:bg-border/80 before:content-[\"\"]'
                    )}
                >
                    <div className="whitespace-pre-wrap break-words typography-micro italic text-muted-foreground/70">
                        {textContent}
                    </div>
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
                onContentChange={onContentChange}
                onAnimationTick={onAnimationChunk}
                onAnimationComplete={onAnimationComplete}
            />
        </div>
    );
};

export default AssistantTextPart;
