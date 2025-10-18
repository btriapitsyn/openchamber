import React, { useState, useEffect, useRef } from 'react';
import { CircleNotch } from '@phosphor-icons/react';

interface WorkingPlaceholderProps {
    hasRunningTools: boolean;
    lastToolFinishTime: number | null;
    persistenceMs?: number;
    hasWorkingParts: boolean;
    hasTextPart: boolean;
}

/**
 * Placeholder shown while tools/reasoning are running or shortly after they finish.
 * Bridges the gap between tool calls with configurable persistence window.
 */
export function WorkingPlaceholder({
    hasRunningTools,
    lastToolFinishTime,
    persistenceMs = 2000,
    hasWorkingParts,
    hasTextPart,
}: WorkingPlaceholderProps) {
    const [show, setShow] = useState(false);
    const [shouldDisplay, setShouldDisplay] = useState(false);
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastProcessedFinishTime = useRef<number | null>(null);

    // Delay initial appearance by 50ms to prevent flashing
    useEffect(() => {
        const timer = setTimeout(() => setShow(true), 50);
        return () => clearTimeout(timer);
    }, []);

    // Main display logic
    useEffect(() => {
        // Hide if text part exists
        if (hasTextPart) {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
                timeoutRef.current = null;
            }
            lastProcessedFinishTime.current = null;
            setShouldDisplay(false);
            return;
        }

        // Hide if no working parts at all
        if (!hasWorkingParts) {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
                timeoutRef.current = null;
            }
            lastProcessedFinishTime.current = null;
            setShouldDisplay(false);
            return;
        }

        // Tools are running - show unconditionally, cancel any pending timeout
        if (hasRunningTools) {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
                timeoutRef.current = null;
            }
            lastProcessedFinishTime.current = null;
            setShouldDisplay(true);
            return;
        }

        // Tools finished - handle persistence window
        if (lastToolFinishTime !== null) {
            // Check if this is a NEW finish time we haven't processed yet
            const isNewFinishTime = lastToolFinishTime !== lastProcessedFinishTime.current;

            if (isNewFinishTime) {
                // Clear any existing timeout from previous tool
                if (timeoutRef.current) {
                    clearTimeout(timeoutRef.current);
                    timeoutRef.current = null;
                }

                // Calculate elapsed time
                const elapsed = Date.now() - lastToolFinishTime;

                if (elapsed < persistenceMs) {
                    // Within window - show and set timeout
                    setShouldDisplay(true);
                    const remaining = persistenceMs - elapsed;

                    timeoutRef.current = setTimeout(() => {
                        setShouldDisplay(false);
                        timeoutRef.current = null;
                        lastProcessedFinishTime.current = null;
                    }, remaining);

                    // Mark this finish time as processed
                    lastProcessedFinishTime.current = lastToolFinishTime;
                } else {
                    // Already expired - hide
                    setShouldDisplay(false);
                    lastProcessedFinishTime.current = null;
                }
            }
            // If not a new finish time, timeout is already running - do nothing
        } else {
            // No finish time - hide
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
                timeoutRef.current = null;
            }
            lastProcessedFinishTime.current = null;
            setShouldDisplay(false);
        }
    }, [hasRunningTools, lastToolFinishTime, persistenceMs, hasWorkingParts, hasTextPart]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
        };
    }, []);

    if (!show || !shouldDisplay) {
        return null;
    }

    return (
        <div className="flex items-center gap-2 px-3 py-1 text-muted-foreground">
            <CircleNotch className="w-4 h-4 animate-spin" weight="bold" />
            <span className="typography-meta">Working…</span>
        </div>
    );
}
