import React from 'react';
import type { Part } from '@opencode-ai/sdk';

import { StreamingAnimatedText } from '../../StreamingAnimatedText';
import { StreamingPlaceholder } from '../StreamingPlaceholder';
import { createAssistantMarkdownComponents } from '../markdownPresets';
import type { StreamPhase, ToolPopupContent } from '../types';

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
    onPhaseSettled: () => void;
    hasActiveReasoning?: boolean;
    onContentChange?: () => void;
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
    onPhaseSettled,
    hasActiveReasoning = false,
    onContentChange,
}) => {
    const rawText = (part as any).text;
    const textContent = typeof rawText === 'string' ? rawText : (part as any).content || (part as any).value || '';

    // Check if part is finalized
    const time = (part as any).time;
    const isFinalized = time && typeof time.end !== 'undefined';

    // Don't show placeholder if reasoning is still active
    if (!isFinalized) {
        if (hasActiveReasoning) {
            return null;
        }
        return <StreamingPlaceholder partType="text" />;
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

    // Always use completed phase for finalized content
    return (
        <div className="break-words" key={part.id || `${messageId}-text`}>
            <StreamingAnimatedText
                content={textContent}
                phase="completed"
                markdownComponents={markdownComponents}
                part={part}
                onPhaseSettled={onPhaseSettled}
                shouldAnimate={allowAnimation}
                onContentChange={onContentChange}
            />
        </div>
    );
};

export default React.memo(AssistantTextPart);
