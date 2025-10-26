import React, { useState, useEffect, useRef } from 'react';

interface WorkingPlaceholderProps {
    isWorking: boolean;
    persistenceMs?: number;
    hasWorkingContext: boolean;
    hasTextPart: boolean;
    onVisibilityChange?: (visible: boolean) => void;
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
 * Placeholder shown while tools/reasoning are running or shortly after they finish.
 * Bridges the gap between tool calls with configurable persistence window.
 */
export function WorkingPlaceholder({
    isWorking,
    persistenceMs = 2000,
    hasWorkingContext,
    hasTextPart,
    onVisibilityChange,
}: WorkingPlaceholderProps) {

    const [show, setShow] = useState(false);
    const [shouldDisplay, setShouldDisplay] = useState(false);
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastStopTimeRef = useRef<number | null>(null);
    const hasRecentWorkRef = useRef(false);
    const previousVisibilityRef = useRef<boolean>(false);

    // Delay initial appearance by 50ms to prevent flashing
    useEffect(() => {
        const timer = setTimeout(() => setShow(true), 50);
        return () => clearTimeout(timer);
    }, []);

    // Main display logic
    useEffect(() => {
        const now = Date.now();

        const clearTimer = () => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
                timeoutRef.current = null;
            }
        };

        if (hasTextPart) {
            clearTimer();
            hasRecentWorkRef.current = false;
            lastStopTimeRef.current = null;
            setShouldDisplay(false);
            return;
        }

        if (!hasWorkingContext) {
            clearTimer();
            hasRecentWorkRef.current = false;
            lastStopTimeRef.current = null;
            setShouldDisplay(false);
            return;
        }

        if (isWorking) {
            clearTimer();
            hasRecentWorkRef.current = true;
            lastStopTimeRef.current = null;
            setShouldDisplay(true);
            return;
        }

        if (!hasRecentWorkRef.current) {
            clearTimer();
            lastStopTimeRef.current = null;
            setShouldDisplay(false);
            return;
        }

        if (lastStopTimeRef.current === null) {
            lastStopTimeRef.current = now;
        }

        const elapsed = now - lastStopTimeRef.current;

        if (elapsed >= persistenceMs) {
            clearTimer();
            hasRecentWorkRef.current = false;
            lastStopTimeRef.current = null;
            setShouldDisplay(false);
            return;
        }

        setShouldDisplay(true);

        if (!timeoutRef.current) {
            const remaining = persistenceMs - elapsed;
            timeoutRef.current = setTimeout(() => {
                hasRecentWorkRef.current = false;
                setShouldDisplay(false);
                timeoutRef.current = null;
                lastStopTimeRef.current = null;
            }, remaining);
        }
    }, [isWorking, persistenceMs, hasWorkingContext, hasTextPart]);

    useEffect(() => {
        if (!onVisibilityChange) {
            return;
        }
        const currentVisibility = show && shouldDisplay;
        if (previousVisibilityRef.current !== currentVisibility) {
            previousVisibilityRef.current = currentVisibility;
            onVisibilityChange(currentVisibility);
        }
    }, [show, shouldDisplay, onVisibilityChange]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
            if (previousVisibilityRef.current && onVisibilityChange) {
                onVisibilityChange(false);
            }
        };
    }, [onVisibilityChange]);

    if (!show || !shouldDisplay) {
        return null;
    }

    return (
        <div className="flex items-center text-muted-foreground">
            <span className="typography-meta flex items-center">
                Working
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
