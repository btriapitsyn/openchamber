import React, { useState, useEffect, useRef } from 'react';
import { SpinnerGap, Spinner, CheckCircle } from '@phosphor-icons/react';

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
        @keyframes placeholderBlink {
            0%, 100% { opacity: 0.45; }
            50% { opacity: 1; }
        }
        .placeholder-blink {
            animation: placeholderBlink 1.4s ease-in-out infinite;
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
    const [isVisible, setIsVisible] = useState<boolean>(false);
    const [isFadingOut, setIsFadingOut] = useState<boolean>(false);
    const [showSuccess, setShowSuccess] = useState<boolean>(false);
    const displayStartTimeRef = useRef<number>(0);
    const statusQueueRef = useRef<Array<{ status: string; permission: boolean }>>([]);
    const removalPendingRef = useRef<boolean>(false);
    const fadeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const successTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastActiveStatusRef = useRef<string | null>(null);
    const hasShownActivityRef = useRef<boolean>(false);

    const activateStatus = (status: string, permission: boolean) => {
        if (fadeTimeoutRef.current) {
            clearTimeout(fadeTimeoutRef.current);
            fadeTimeoutRef.current = null;
        }
        if (successTimeoutRef.current) {
            clearTimeout(successTimeoutRef.current);
            successTimeoutRef.current = null;
        }
        setShowSuccess(false);
        setDisplayedStatus(status);
        setDisplayedPermission(permission);
        setIsFadingOut(false);
        setIsVisible(false);
        lastActiveStatusRef.current = status;
        hasShownActivityRef.current = true;
        if (typeof requestAnimationFrame === 'function') {
            requestAnimationFrame(() => {
                setIsVisible(true);
            });
        } else {
            setIsVisible(true);
        }
    };

    const startFadeOut = (shouldShowSuccess: boolean) => {
        if (isFadingOut) {
            return;
        }
        setIsFadingOut(true);
        setIsVisible(false);
        if (fadeTimeoutRef.current) {
            clearTimeout(fadeTimeoutRef.current);
        }
        fadeTimeoutRef.current = setTimeout(() => {
            setDisplayedStatus(null);
            setDisplayedPermission(false);
            setIsFadingOut(false);
            fadeTimeoutRef.current = null;
            const hadActiveStatus =
                lastActiveStatusRef.current !== null || hasShownActivityRef.current;
            if (shouldShowSuccess && hadActiveStatus) {
                setShowSuccess(true);
                if (typeof requestAnimationFrame === 'function') {
                    requestAnimationFrame(() => {
                        setIsVisible(true);
                    });
                } else {
                    setIsVisible(true);
                }
                lastActiveStatusRef.current = null;
                if (successTimeoutRef.current) {
                    clearTimeout(successTimeoutRef.current);
                }
                successTimeoutRef.current = setTimeout(() => {
                    setIsVisible(false);
                    setShowSuccess(false);
                    hasShownActivityRef.current = false;
                    successTimeoutRef.current = null;
                }, 1500);
            } else {
                hasShownActivityRef.current = false;
                lastActiveStatusRef.current = null;
            }
        }, 180);
    };

    useEffect(() => {
        const now = Date.now();

        // Handle incoming status
        if (statusText) {
            removalPendingRef.current = false;

            if (!displayedStatus) {
                // Nothing displayed, show immediately
                activateStatus(statusText, !!isWaitingForPermission);
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
                    activateStatus(latest.status, latest.permission);
                    displayStartTimeRef.current = now;
                    statusQueueRef.current = [];
                } else if (removalPendingRef.current) {
                    // No queue and removal pending, hide now
                    removalPendingRef.current = false;
                    statusQueueRef.current = []; // Flush queue for next session
                    startFadeOut(true);
                }
            }
        }, 50); // Check every 50ms

        return () => clearInterval(checkInterval);
    }, []);

    useEffect(() => {
        return () => {
            if (fadeTimeoutRef.current) {
                clearTimeout(fadeTimeoutRef.current);
            }
            if (successTimeoutRef.current) {
                clearTimeout(successTimeoutRef.current);
            }
        };
    }, []);

    if (!displayedStatus && !showSuccess) {
        return null;
    }

    // Capitalize first letter
    const label = displayedStatus
        ? displayedStatus.charAt(0).toUpperCase() + displayedStatus.slice(1)
        : 'Completed';
    const ariaLive = displayedPermission ? 'assertive' : 'polite';

    const renderIcon = () => {
        if (showSuccess) {
            return (
                <CheckCircle
                    weight="duotone"
                    size={18}
                    aria-hidden="true"
                />
            );
        }

        if (displayedPermission) {
            return (
                <Spinner
                    weight="duotone"
                    size={16}
                    className="placeholder-blink"
                    aria-hidden="true"
                />
            );
        }

        return (
            <SpinnerGap
                weight="duotone"
                size={16}
                className="animate-spin"
                aria-hidden="true"
            />
        );
    };

    return (
        <div
            className={`flex h-full items-center text-muted-foreground pl-[2ch] transition-opacity duration-200 ${isVisible && !isFadingOut ? 'opacity-100' : 'opacity-0'}`}
            role="status"
            aria-live={ariaLive}
            aria-label={label}
            data-waiting={displayedPermission ? 'true' : undefined}
        >
            <span className="flex items-center gap-1.5 leading-tight">
                {renderIcon()}
                {!showSuccess && (
                    <span className="typography-ui-header flex items-center gap-2 leading-tight">
                        {label}
                        <span className="inline-flex">
                            <span className="animate-dot-pulse" style={{ animationDelay: '0ms' }}>.</span>
                            <span className="animate-dot-pulse" style={{ animationDelay: '200ms' }}>.</span>
                            <span className="animate-dot-pulse" style={{ animationDelay: '400ms' }}>.</span>
                        </span>
                    </span>
                )}
                {showSuccess && (
                    <span className="typography-ui-header leading-tight">Done</span>
                )}
            </span>
            <DotPulseStyles />
        </div>
    );
}
