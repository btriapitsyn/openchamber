import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatedMarkdown } from 'flowtoken';
import 'flowtoken/dist/styles.css';
import type { Part } from '@opencode-ai/sdk';

import type { StreamPhase } from './message/types';

interface StreamingAnimatedTextProps {
    content: string;
    phase: StreamPhase;
    markdownComponents: any;
    part?: Part;
    onPhaseSettled?: () => void;
}

const COOLDOWN_DURATION_MS = 1200;

export const StreamingAnimatedText: React.FC<StreamingAnimatedTextProps> = ({
    content,
    phase,
    markdownComponents,
    part,
    onPhaseSettled,
}) => {
    const prevContentRef = useRef(content);
    const cooldownTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const hasSettledRef = useRef(false);
    const [hasPendingAnimation, setHasPendingAnimation] = useState(() => phase === 'streaming' && content.length > 0);

    // Track content growth to trigger animation for new tokens
    useEffect(() => {
        const previous = prevContentRef.current;
        if (content !== previous) {
            if (content.length > previous.length) {
                setHasPendingAnimation(true);
                hasSettledRef.current = false;
            }
            prevContentRef.current = content;
        }
    }, [content]);

    // Handle lifecycle transitions between streaming, cooldown, and completion
    useEffect(() => {
        if (phase === 'streaming') {
            if (cooldownTimeoutRef.current) {
                clearTimeout(cooldownTimeoutRef.current);
                cooldownTimeoutRef.current = null;
            }
            hasSettledRef.current = false;
            if (content.length > 0) {
                setHasPendingAnimation(true);
            }
            return;
        }

        if (phase === 'cooldown' && hasPendingAnimation) {
            if (cooldownTimeoutRef.current) {
                clearTimeout(cooldownTimeoutRef.current);
            }
            cooldownTimeoutRef.current = setTimeout(() => {
                cooldownTimeoutRef.current = null;
                setHasPendingAnimation(false);
            }, COOLDOWN_DURATION_MS);
            return () => {
                if (cooldownTimeoutRef.current) {
                    clearTimeout(cooldownTimeoutRef.current);
                    cooldownTimeoutRef.current = null;
                }
            };
        }

        if (phase === 'completed' && hasPendingAnimation) {
            if (cooldownTimeoutRef.current) {
                clearTimeout(cooldownTimeoutRef.current);
                cooldownTimeoutRef.current = null;
            }
            setHasPendingAnimation(false);
        }

        return () => {
            if (cooldownTimeoutRef.current) {
                clearTimeout(cooldownTimeoutRef.current);
                cooldownTimeoutRef.current = null;
            }
        };
    }, [phase, hasPendingAnimation, content.length]);

    // Cleanup on unmount
    useEffect(() => () => {
        if (cooldownTimeoutRef.current) {
            clearTimeout(cooldownTimeoutRef.current);
        }
    }, []);

    useEffect(() => {
        if (hasPendingAnimation) {
            hasSettledRef.current = false;
        }
    }, [hasPendingAnimation]);

    useEffect(() => {
        if (hasPendingAnimation) {
            return;
        }
        if (phase !== 'streaming' && !hasSettledRef.current) {
            hasSettledRef.current = true;
            onPhaseSettled?.();
        }
    }, [phase, hasPendingAnimation, onPhaseSettled]);

    const shouldAnimate = phase === 'streaming' || hasPendingAnimation;

    const cleanedContent = useMemo(() => content.replace(/<[^>]*$/g, ''), [content]);

    const componentKey = useMemo(() => {
        if (part?.id) {
            return `flow-${part.id}`;
        }
        return 'flow-default';
    }, [part?.id]);

    return (
        <div className="break-words flowtoken-animated">
            <AnimatedMarkdown
                key={componentKey}
                content={cleanedContent}
                sep="diff"
                animation={shouldAnimate ? 'fadeIn' : null}
                animationDuration="0.5s"
                animationTimingFunction="ease-out"
                customComponents={markdownComponents}
            />
        </div>
    );
};
