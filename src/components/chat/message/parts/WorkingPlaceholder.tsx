import React, { useState, useEffect } from 'react';

interface WorkingPlaceholderProps {
    statusText: string | null;
    isWaitingForPermission?: boolean;
}


export const DotPulseStyles: React.FC = () => (
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
);

/**
 * Placeholder shown while the assistant is actively working.
 * Mirrors the TUI behaviour: render only while work is ongoing.
 */
export function WorkingPlaceholder({
    statusText,
    isWaitingForPermission,
}: WorkingPlaceholderProps) {
    const [ready, setReady] = useState(false);

    // Small delay to avoid flashing on very transient states
    useEffect(() => {
        const timer = setTimeout(() => setReady(true), 50);
        return () => clearTimeout(timer);
    }, []);

    if (!statusText || !ready) {
        return null;
    }

    // Capitalize first letter
    const label = statusText.charAt(0).toUpperCase() + statusText.slice(1);
    const ariaLive = isWaitingForPermission ? 'assertive' : 'polite';

    return (
        <div
            className="flex items-center text-muted-foreground"
            role="status"
            aria-live={ariaLive}
            aria-label={label}
            data-waiting={isWaitingForPermission ? 'true' : undefined}
        >
            <span className="typography-meta flex items-center">
                {label}
                <span className="inline-flex ml-0.5">
                    <span className="animate-dot-pulse" style={{ animationDelay: '0ms' }}>.</span>
                    <span className="animate-dot-pulse" style={{ animationDelay: '200ms' }}>.</span>
                    <span className="animate-dot-pulse" style={{ animationDelay: '400ms' }}>.</span>
                </span>
            </span>
            <DotPulseStyles />
        </div>
    );
}
