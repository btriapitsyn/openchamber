import React from 'react';
import type { Part } from '@opencode-ai/sdk';

import { StreamingAnimatedText } from '../../StreamingAnimatedText';
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
}) => {
    const rawText = (part as any).text;
    const textContent = typeof rawText === 'string' ? rawText : (part as any).content || (part as any).value || '';

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

    const phase: StreamPhase = allowAnimation ? streamPhase : 'completed';

    return (
        <div className="break-words" key={part.id || `${messageId}-text`}>
            <StreamingAnimatedText
                content={textContent}
                phase={phase}
                markdownComponents={markdownComponents}
                part={part}
                onPhaseSettled={onPhaseSettled}
            />
        </div>
    );
};

export default React.memo(AssistantTextPart);
