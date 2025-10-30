import React from 'react';
import type { Part } from '@opencode-ai/sdk';
import { Copy, Check } from '@phosphor-icons/react';

import { StreamingAnimatedText } from '../../StreamingAnimatedText';
import { createAssistantMarkdownComponents } from '../markdownPresets';
import type { StreamPhase } from '../types';
import { Button } from '@/components/ui/button';


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

    // Show inline copy button when header is hidden and we have text content
    const showInlineCopyButton = !shouldShowHeader && hasTextContent && onCopyMessage;

    // Always use completed phase for finalized content
    return (
        <div className="group/assistant-text relative break-words" key={part.id || `${messageId}-text`}>
            {showInlineCopyButton && (
                <div className="absolute -right-2 -top-1 z-10">
                    <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 opacity-0 group-hover/assistant-text:opacity-100 transition-opacity"
                        onClick={onCopyMessage}
                        title="Copy message text"
                    >
                        {copiedMessage ? (
                            <Check className="h-3.5 w-3.5" style={{ color: 'var(--status-success)' }} weight="bold" />
                        ) : (
                            <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                    </Button>
                </div>
            )}
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
