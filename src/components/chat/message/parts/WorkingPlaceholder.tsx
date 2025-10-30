import React, { useState, useEffect, useRef } from 'react';

interface WorkingPlaceholderProps {
    statusText: string | null;
    isWaitingForPermission?: boolean;
}

const MIN_DISPLAY_TIME = 2000; // 2 seconds minimum display time

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
 * Implements minimum display time of 1000ms to prevent flickering.
 */
export function WorkingPlaceholder({
    statusText,
    isWaitingForPermission,
}: WorkingPlaceholderProps) {
    const [displayedStatus, setDisplayedStatus] = useState<string | null>(null);
    const [displayedPermission, setDisplayedPermission] = useState<boolean>(false);
    const displayStartTimeRef = useRef<number>(0);
    const statusQueueRef = useRef<Array<{ status: string; permission: boolean }>>([]);
    const removalPendingRef = useRef<boolean>(false);

    useEffect(() => {
        const now = Date.now();

        // Handle incoming status
        if (statusText) {
            removalPendingRef.current = false;

            if (!displayedStatus) {
                // Nothing displayed, show immediately
                setDisplayedStatus(statusText);
                setDisplayedPermission(!!isWaitingForPermission);
                displayStartTimeRef.current = now;
                statusQueueRef.current = [];
            } else {
                // Something already displayed, add to queue if different
                if (statusText !== displayedStatus || !!isWaitingForPermission !== displayedPermission) {
                    statusQueueRef.current.push({
                        status: statusText,
                        permission: !!isWaitingForPermission
                    });
                }
            }
        } else {
            // Removal signal received
            removalPendingRef.current = true;
        }
    }, [statusText, isWaitingForPermission, displayedStatus, displayedPermission]);

    useEffect(() => {
        const checkInterval = setInterval(() => {
            const now = Date.now();
            const elapsed = now - displayStartTimeRef.current;

            if (elapsed >= MIN_DISPLAY_TIME) {
                // Minimum display time reached
                if (statusQueueRef.current.length > 0) {
                    // Get latest status from queue
                    const latest = statusQueueRef.current[statusQueueRef.current.length - 1];
                    setDisplayedStatus(latest.status);
                    setDisplayedPermission(latest.permission);
                    displayStartTimeRef.current = now;
                    statusQueueRef.current = [];
                } else if (removalPendingRef.current) {
                    // No queue and removal pending, hide now
                    setDisplayedStatus(null);
                    setDisplayedPermission(false);
                    removalPendingRef.current = false;
                }
            }
        }, 50); // Check every 50ms

        return () => clearInterval(checkInterval);
    }, []);

    if (!displayedStatus) {
        return null;
    }

    // Capitalize first letter
    const label = displayedStatus.charAt(0).toUpperCase() + displayedStatus.slice(1);
    const ariaLive = displayedPermission ? 'assertive' : 'polite';

    return (
        <div
            className="flex items-center text-muted-foreground"
            role="status"
            aria-live={ariaLive}
            aria-label={label}
            data-waiting={displayedPermission ? 'true' : undefined}
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
