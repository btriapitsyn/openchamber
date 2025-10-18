import React from 'react';
import type { Part } from '@opencode-ai/sdk';
import { Copy, Check } from '@phosphor-icons/react';

import { StreamingAnimatedText } from '../../StreamingAnimatedText';
import { StreamingPlaceholder } from '../StreamingPlaceholder';
import { createAssistantMarkdownComponents } from '../markdownPresets';
import type { StreamPhase, ToolPopupContent } from '../types';
import { Button } from '@/components/ui/button';

interface AssistantTextPartProps {
    part: Part;
    messageId: string;
    syntaxTheme: any;
    isMobile: boolean;
    copiedCode: string | null;
    onCopyCode: (code: string) => void;
    onShowPopup: (content: ToolPopupContent) => void;
    streamPhase: StreamPhase;
    allowAnimation: boolean;
    onAnimationChunk: () => void;
    onAnimationComplete: () => void;
    hasActiveReasoning?: boolean;
    hasToolParts?: boolean;
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
    onShowPopup,
    streamPhase,
    allowAnimation,
    onAnimationChunk,
    onAnimationComplete,
    hasActiveReasoning = false,
    hasToolParts = false,
    onContentChange,
    shouldShowHeader = true,
    hasTextContent = false,
    onCopyMessage,
    copiedMessage = false,
}) => {
    const rawText = (part as any).text;
    const textContent = typeof rawText === 'string' ? rawText : (part as any).content || (part as any).value || '';

    // Check if part is finalized
    const time = (part as any).time;
    const isFinalized = time && typeof time.end !== 'undefined';

    // Show placeholder during streaming phase only if there are no tool parts
    // Show even if reasoning is active (some models stream reasoning + text together)
    if (streamPhase === 'streaming') {
        if (!hasToolParts) {
            // Calculate character count from accumulated text (even if not finalized)
            const charCount = textContent ? textContent.length : 0;
            return <StreamingPlaceholder partType="text" characterCount={charCount} />;
        }
        return null;
    }

    // Don't show placeholder if reasoning is still active (but not streaming)
    // Unless we have actual text content accumulating
    if (!isFinalized) {
        const charCount = textContent ? textContent.length : 0;
        // Only show if we have some text or no active reasoning
        if (charCount > 0 || !hasActiveReasoning) {
            return <StreamingPlaceholder partType="text" characterCount={charCount} />;
        }
        return null;
    }

    // Empty finalized content should not render
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
                onShowPopup: (payload) => {
                    onShowPopup({
                        open: true,
                        title: payload.title,
                        content: payload.content,
                        language: payload.language,
                        isDiff: payload.isDiff,
                        diffHunks: payload.diffHunks,
                        metadata: payload.metadata,
                    });
                },
            }),
        [syntaxTheme, isMobile, copiedCode, onCopyCode, onShowPopup, allowAnimation]
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
