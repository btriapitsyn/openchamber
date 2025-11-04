import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { AnimatedMarkdown } from 'flowtoken';
import 'flowtoken/dist/styles.css';
import type { Part } from '@opencode-ai/sdk';

interface StreamingAnimatedTextProps {
    content: string;
    phase: 'completed';
    markdownComponents: Record<string, React.ComponentType<unknown>>;
    part?: Part;
    messageId: string;
    shouldAnimate?: boolean;
    onContentChange?: () => void;
    onAnimationTick?: () => void;
    onAnimationComplete?: () => void;
}

const scheduleAfterPaint = (callback: () => void) => {
    if (typeof queueMicrotask === 'function') {
        queueMicrotask(callback);
        return;
    }
    if (typeof window !== 'undefined') {
        window.setTimeout(callback, 0);
        return;
    }
    setTimeout(callback, 0);
};

export const StreamingAnimatedText: React.FC<StreamingAnimatedTextProps> = ({
    content,
    markdownComponents,
    part,
    messageId,
    shouldAnimate = true,
    onContentChange,
    onAnimationTick,
    onAnimationComplete,
}) => {
    const [displayedContent, setDisplayedContent] = useState('');

    const intervalRef = useRef<number | null>(null);
    const completionNotifiedRef = useRef(false);
    const previousSignatureRef = useRef<string | null>(null);
    const previousContentRef = useRef<string>('');

    const componentKey = useMemo(() => {
        const signature = part?.id ? `part-${part.id}` : `message-${messageId}`;
        return `flow-${signature}`;
    }, [messageId, part?.id]);

    const notifyTick = useCallback(() => {
        scheduleAfterPaint(() => {
            onAnimationTick?.();
            onContentChange?.();
        });
    }, [onAnimationTick, onContentChange]);

    const notifyCompletion = useCallback(() => {
        if (completionNotifiedRef.current) {
            return;
        }
        completionNotifiedRef.current = true;
        scheduleAfterPaint(() => {
            onAnimationComplete?.();
            onContentChange?.();
        });
    }, [onAnimationComplete, onContentChange]);

    useEffect(() => {
        return () => {
            if (intervalRef.current !== null) {
                window.clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        };
    }, []);

    useEffect(() => {
        const signature = part?.id ? String(part.id) : `message-${messageId}`;
        const previousSignature = previousSignatureRef.current;
        const signatureChanged = previousSignature !== signature;

        const previousContent = signatureChanged ? '' : previousContentRef.current;

        if (!signatureChanged && previousContent === content) {
            return;
        }

        previousSignatureRef.current = signature;
        previousContentRef.current = content;

        if (intervalRef.current !== null) {
            window.clearInterval(intervalRef.current);
            intervalRef.current = null;
        }

        const targetLines = content.split('\n');
        const priorLines = previousContent.split('\n');

        let sharedLines = 0;
        const maxShared = Math.min(priorLines.length, targetLines.length);
        while (sharedLines < maxShared && priorLines[sharedLines] === targetLines[sharedLines]) {
            sharedLines += 1;
        }

        const initialContent = targetLines.slice(0, sharedLines).join('\n');
        completionNotifiedRef.current = sharedLines >= targetLines.length;

        if (!shouldAnimate) {
            setDisplayedContent(content);
            notifyTick();
            notifyCompletion();
            return;
        }

        setDisplayedContent(initialContent);
        if (sharedLines === 0) {
            notifyTick();
        }

        if (sharedLines >= targetLines.length) {
            notifyCompletion();
            return;
        }

        const runAnimation = () => {
            let nextIndex = sharedLines;

            const step = () => {
                if (nextIndex >= targetLines.length) {
                    notifyCompletion();
                    if (intervalRef.current !== null) {
                        clearInterval(intervalRef.current);
                        intervalRef.current = null;
                    }
                    return;
                }

                nextIndex += 1;
                const nextContent = targetLines.slice(0, nextIndex).join('\n');
                setDisplayedContent(nextContent);
                notifyTick();

                if (nextIndex >= targetLines.length) {
                    notifyCompletion();
                    if (intervalRef.current !== null) {
                        clearInterval(intervalRef.current);
                        intervalRef.current = null;
                    }
                }
            };

            step();
            intervalRef.current = setInterval(step, 60) as unknown as number;
        };

        if (typeof window === 'undefined') {
            runAnimation();
        } else if (typeof window.requestAnimationFrame === 'function') {
            window.requestAnimationFrame(() => {
                runAnimation();
            });
        } else {
            runAnimation();
        }

        return () => {
            if (intervalRef.current !== null) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        };
    }, [content, messageId, part?.id, notifyTick, notifyCompletion, shouldAnimate]);

    return (
        <div className="break-words flowtoken-animated">
            <AnimatedMarkdown
                key={componentKey}
                content={displayedContent}
                sep="diff"
                animation="fadeIn"
                animationDuration="0.10s"
                animationTimingFunction="ease-in-out"
                customComponents={markdownComponents}
            />
        </div>
    );
};
