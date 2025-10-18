import React, { useState, useEffect } from 'react';
import { ArrowsClockwise as Loader2 } from '@phosphor-icons/react';

interface StreamingPlaceholderProps {
    partType: 'text' | 'tool';
    toolName?: string;
    characterCount?: number;
}

/**
 * Placeholder component shown while parts are streaming (before finalization).
 * Provides visual feedback about what the assistant is doing.
 */
export function StreamingPlaceholder({ partType, toolName, characterCount }: StreamingPlaceholderProps) {
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

    // Text streaming placeholder with optional character count
    return (
        <div className="px-3 py-1 text-muted-foreground">
            <span className="typography-meta">
                Forming the response
                {characterCount !== undefined && characterCount > 0 && (
                    <> {characterCount.toLocaleString()}</>
                )}
                <span className="inline-flex ml-0.5">
                    <span className="animate-dot-pulse" style={{ animationDelay: '0ms' }}>.</span>
                    <span className="animate-dot-pulse" style={{ animationDelay: '200ms' }}>.</span>
                    <span className="animate-dot-pulse" style={{ animationDelay: '400ms' }}>.</span>
                </span>
            </span>
            <style>{`
                @keyframes dotPulse {
                    0%, 20% {
                        opacity: 0;
                    }
                    50% {
                        opacity: 1;
                    }
                    100% {
                        opacity: 0;
                    }
                }
                .animate-dot-pulse {
                    animation: dotPulse 1.4s infinite;
                }
            `}</style>
        </div>
    );
}
