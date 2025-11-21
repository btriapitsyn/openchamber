import React, { useMemo } from 'react';
import { AnimatedMarkdown } from 'flowtoken';
import 'flowtoken/dist/styles.css';
import type { Part } from '@opencode-ai/sdk';

export type MarkdownComponent = React.ComponentType<Record<string, unknown>>;
export type MarkdownComponentMap = Record<string, MarkdownComponent>;

interface StreamingAnimatedTextProps {
    content: string;
    phase: 'completed';
    markdownComponents: MarkdownComponentMap;
    part?: Part;
    messageId: string;
    shouldAnimate?: boolean;
    onContentChange?: () => void;
    onAnimationTick?: () => void;
    onAnimationComplete?: () => void;
}

export const StreamingAnimatedText: React.FC<StreamingAnimatedTextProps> = ({
    content,
    markdownComponents,
    part,
    messageId,
}) => {
    const componentKey = useMemo(() => {
        const signature = part?.id ? `part-${part.id}` : `message-${messageId}`;
        return `flow-${signature}`;
    }, [messageId, part?.id]);

    return (
        <div className="break-words flowtoken-animated">
            <AnimatedMarkdown
                key={componentKey}
                content={content}
                sep="diff"
                animation="fadeIn"
                animationDuration="0.15s"
                animationTimingFunction="ease-out"
                customComponents={markdownComponents}
            />
        </div>
    );
};
