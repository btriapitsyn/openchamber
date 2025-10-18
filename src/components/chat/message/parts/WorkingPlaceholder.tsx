import React, { useState, useEffect, useRef } from 'react';
import { CircleNotch } from '@phosphor-icons/react';

interface WorkingPlaceholderProps {
    hasRunningTools: boolean;
    lastToolFinishTime: number | null;
    persistenceMs?: number;
}

/**
 * Placeholder shown while tools are running or shortly after they finish.
 * Bridges the gap between tool calls with configurable persistence window.
 *
 * Logic:
 * - While any tool is running: show unconditionally
 * - After last tool finishes: persist for {persistenceMs} (default 2000ms)
 * - Hidden when: text part arrives or persistence window expires
 */
export function WorkingPlaceholder({
    hasRunningTools,
    lastToolFinishTime,
    persistenceMs = 2000
}: WorkingPlaceholderProps) {
    const [show, setShow] = useState(false);
    const [shouldDisplay, setShouldDisplay] = useState(false);
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Delay initial appearance by 50ms to prevent flashing
    useEffect(() => {
        const timer = setTimeout(() => setShow(true), 50);
        return () => clearTimeout(timer);
    }, []);

    // Determine if we should display based on tool state and timeout
    useEffect(() => {
        // Clear any existing timeout
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }

        if (hasRunningTools) {
            // Tools are running - show unconditionally
            setShouldDisplay(true);
        } else if (lastToolFinishTime !== null) {
            // All tools finished - check if within persistence window
            const elapsed = Date.now() - lastToolFinishTime;

            if (elapsed < persistenceMs) {
                // Within window - show and schedule hide
                setShouldDisplay(true);
                const remaining = persistenceMs - elapsed;
                timeoutRef.current = setTimeout(() => {
                    setShouldDisplay(false);
                }, remaining);
            } else {
                // Window expired - hide
                setShouldDisplay(false);
            }
        } else {
            // No tools at all - hide
            setShouldDisplay(false);
        }

        return () => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
                timeoutRef.current = null;
            }
        };
    }, [hasRunningTools, lastToolFinishTime, persistenceMs]);

    // Don't render until initial delay passes
    if (!show) {
        return null;
    }

    // Don't render if we shouldn't display
    if (!shouldDisplay) {
        return null;
    }

    return (
        <div className="flex items-center gap-2 px-3 py-1 text-muted-foreground">
            <CircleNotch className="w-4 h-4 animate-spin" weight="bold" />
            <span className="typography-meta">Working…</span>
        </div>
    );
}
