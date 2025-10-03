import React, { useState, useEffect, useRef, useMemo } from 'react';
import { AnimatedMarkdown } from 'flowtoken';
import 'flowtoken/dist/styles.css';
import type { Part } from '@opencode-ai/sdk';

interface StreamingAnimatedTextProps {
    content: string;
    phase: 'completed';
    markdownComponents: any;
    part?: Part;
    onPhaseSettled?: () => void;
    shouldAnimate?: boolean;
    onContentChange?: () => void;
}

/**
 * Renders finalized content with line-by-line incremental display.
 * FlowToken tracks previous content and animates only new lines with word-by-word animation.
 */
export const StreamingAnimatedText: React.FC<StreamingAnimatedTextProps> = ({
    content,
    markdownComponents,
    part,
    onPhaseSettled,
    shouldAnimate = true,
    onContentChange,
}) => {
    const [displayedContent, setDisplayedContent] = useState('');
    const linesRef = useRef<string[]>([]);
    const currentLineIndexRef = useRef(0);
    const intervalRef = useRef<NodeJS.Timeout | null>(null);

    const componentKey = useMemo(() =>
        part?.id ? `flow-${part.id}` : 'flow-default',
        [part?.id]
    );

    // Split content into lines and reset state when part changes
    useEffect(() => {
        linesRef.current = content.split('\n');
        currentLineIndexRef.current = 0;

        // If animation disabled, show all content immediately
        if (!shouldAnimate) {
            setDisplayedContent(content);
            onPhaseSettled?.();
            return;
        }

        setDisplayedContent('');

        // Clear any existing interval
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
    }, [part?.id, content, shouldAnimate, onPhaseSettled]);

    // Incrementally add lines (only if animation enabled)
    useEffect(() => {
        if (!shouldAnimate) {
            return;
        }

        if (currentLineIndexRef.current >= linesRef.current.length) {
            // All lines displayed, notify settled
            onPhaseSettled?.();
            return;
        }

        intervalRef.current = setInterval(() => {
            if (currentLineIndexRef.current < linesRef.current.length) {
                const newContent = linesRef.current
                    .slice(0, currentLineIndexRef.current + 1)
                    .join('\n');
                setDisplayedContent(newContent);
                currentLineIndexRef.current++;

                // Notify about content change for autoscroll
                onPhaseSettled?.();
                onContentChange?.();
            } else {
                // Animation complete
                if (intervalRef.current) {
                    clearInterval(intervalRef.current);
                    intervalRef.current = null;
                }
                onPhaseSettled?.();
            }
        }, 100); // 100ms between lines

        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        };
    }, [content, onPhaseSettled, shouldAnimate]);

    return (
        <div className="break-words flowtoken-animated">
            <AnimatedMarkdown
                key={componentKey}
                content={displayedContent}
                sep="diff"
                animation="blurAndSharpen"
                animationDuration="0.25s"
                animationTimingFunction="ease-in-out"
                customComponents={markdownComponents}
            />
        </div>
    );
};
