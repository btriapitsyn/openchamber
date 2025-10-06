import React, { useState, useEffect, useMemo } from 'react';
import { RefreshDouble as Loader2 } from 'iconoir-react';

interface StreamingPlaceholderProps {
    partType: 'text' | 'tool';
    toolName?: string;
}

// Typing animation presets
const TYPING_ANIMATIONS = [
    {
        name: 'star',
        frames: ['✶', '✸', '✹', '✺', '✹', '✷'],
        interval: 70,
    },
    {
        name: 'pulse',
        frames: ['○', '◉', '●', '◉'],
        interval: 120,
    },
    {
        name: 'circle',
        frames: ['◡', '⊙', '◠'],
        interval: 150,
    },
    {
        name: 'arc',
        frames: ['◜', '◠', '◝', '◞', '◡', '◟'],
        interval: 100,
    },
] as const;

/**
 * Character-based typing indicator with cycling frames
 */
export const TypingIndicator: React.FC = () => {
    // Randomly select animation on mount
    const animation = useMemo(() => {
        const randomIndex = Math.floor(Math.random() * TYPING_ANIMATIONS.length);
        return TYPING_ANIMATIONS[randomIndex];
    }, []);

    const [frameIndex, setFrameIndex] = useState(0);

    useEffect(() => {
        const interval = setInterval(() => {
            setFrameIndex((prev) => (prev + 1) % animation.frames.length);
        }, animation.interval);

        return () => clearInterval(interval);
    }, [animation]);

    // Add rotation for star animation
    const shouldRotate = animation.name === 'star';

    return (
        <div
            className="flex items-center justify-center"
            style={{
                width: '16px',
                height: '16px',
                fontSize: '14px',
                animation: shouldRotate ? 'starRotate 2.5s linear infinite' : undefined,
            }}
        >
            {animation.frames[frameIndex]}
            {shouldRotate && (
                <style>{`
                    @keyframes starRotate {
                        from { transform: rotate(0deg); }
                        to { transform: rotate(360deg); }
                    }
                `}</style>
            )}
        </div>
    );
};

/**
 * Placeholder component shown while parts are streaming (before finalization).
 * Provides visual feedback about what the assistant is doing.
 */
export function StreamingPlaceholder({ partType, toolName }: StreamingPlaceholderProps) {
    const [show, setShow] = useState(false);

    // Delay showing placeholder by 50ms to avoid flashing
    useEffect(() => {
        const timer = setTimeout(() => setShow(true), 50);
        return () => clearTimeout(timer);
    }, []);

    if (!show) {
        return null;
    }

    if (partType === 'tool') {
        return (
            <div className="flex items-center gap-2 px-3 py-1 text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">{toolName || 'Tool'} running...</span>
            </div>
        );
    }

    // Defer to the global typing indicator for text streaming states
    return null;
}
