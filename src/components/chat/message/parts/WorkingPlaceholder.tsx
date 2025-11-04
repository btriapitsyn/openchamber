import React, { useState, useEffect, useRef } from 'react';
import { SpinnerGap, Spinner, CheckCircle, XCircle } from '@phosphor-icons/react';

interface WorkingPlaceholderProps {
    statusText: string | null;
    isWaitingForPermission?: boolean;
    wasAborted?: boolean;
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

type ResultState = 'success' | 'aborted' | null;

export function WorkingPlaceholder({
    statusText,
    isWaitingForPermission,
    wasAborted,
}: WorkingPlaceholderProps) {
    const [displayedStatus, setDisplayedStatus] = useState<string | null>(null);
    const [displayedPermission, setDisplayedPermission] = useState<boolean>(false);
    const [isVisible, setIsVisible] = useState<boolean>(false);
    const [isFadingOut, setIsFadingOut] = useState<boolean>(false);
    const [resultState, setResultState] = useState<ResultState>(null);

    const displayStartTimeRef = useRef<number>(0);
    const statusQueueRef = useRef<Array<{ status: string; permission: boolean }>>([]);
    const removalPendingRef = useRef<boolean>(false);
    const fadeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const resultTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastActiveStatusRef = useRef<string | null>(null);
    const hasShownActivityRef = useRef<boolean>(false);
    const wasAbortedRef = useRef<boolean>(false);

    const activateStatus = (status: string, permission: boolean) => {
        if (fadeTimeoutRef.current) {
            clearTimeout(fadeTimeoutRef.current);
            fadeTimeoutRef.current = null;
        }
        if (resultTimeoutRef.current) {
            clearTimeout(resultTimeoutRef.current);
            resultTimeoutRef.current = null;
        }

        if (status === 'aborted') {
            setDisplayedStatus(null);
            setDisplayedPermission(false);
            setIsFadingOut(false);
            setResultState('aborted');
            lastActiveStatusRef.current = 'aborted';
            hasShownActivityRef.current = true;
            wasAbortedRef.current = true;

            if (typeof requestAnimationFrame === 'function') {
                requestAnimationFrame(() => setIsVisible(true));
            } else {
                setIsVisible(true);
            }

            return;
        }

        setResultState(null);
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


    useEffect(() => {
        const now = Date.now();

        if (statusText) {
            removalPendingRef.current = false;

            if (!displayedStatus) {
                activateStatus(statusText, !!isWaitingForPermission);
                displayStartTimeRef.current = now;
                statusQueueRef.current = [];
            } else if (
                statusText !== displayedStatus ||
                !!isWaitingForPermission !== displayedPermission
            ) {
                statusQueueRef.current.push({
                    status: statusText,
                    permission: !!isWaitingForPermission,
                });
            }
        } else {
            removalPendingRef.current = true;
        }
    }, [statusText, isWaitingForPermission, displayedStatus, displayedPermission, wasAborted]);

    useEffect(() => {
        if (wasAborted) {
            wasAbortedRef.current = true;
        }
    }, [wasAborted]);

    useEffect(() => {
        const startFadeOut = (result: ResultState) => {
            if (isFadingOut) {
                return;
            }

            setIsFadingOut(true);
            setIsVisible(false);
            setResultState(null);

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

                if (result && hadActiveStatus) {
                    setResultState(result);

                    if (typeof requestAnimationFrame === 'function') {
                        requestAnimationFrame(() => setIsVisible(true));
                    } else {
                        setIsVisible(true);
                    }

                    lastActiveStatusRef.current = null;

                    if (resultTimeoutRef.current) {
                        clearTimeout(resultTimeoutRef.current);
                    }

                    resultTimeoutRef.current = setTimeout(() => {
                        setIsVisible(false);
                        setResultState(null);
                        hasShownActivityRef.current = false;
                        resultTimeoutRef.current = null;
                    }, 1500);
                } else {
                    hasShownActivityRef.current = false;
                    lastActiveStatusRef.current = null;
                }
                wasAbortedRef.current = false;
            }, 180);
        };

        const checkInterval = setInterval(() => {
            const now = Date.now();
            const elapsed = now - displayStartTimeRef.current;

            // For status changes, wait MIN_DISPLAY_TIME to prevent flashing
            const shouldWaitForMinTime = statusQueueRef.current.length > 0;

            if (shouldWaitForMinTime && elapsed < MIN_DISPLAY_TIME) {
                return;
            }

            if (removalPendingRef.current && wasAbortedRef.current) {
                removalPendingRef.current = false;
                statusQueueRef.current = [];
                startFadeOut('aborted');
            } else if (statusQueueRef.current.length > 0) {
                const latest = statusQueueRef.current[statusQueueRef.current.length - 1];
                activateStatus(latest.status, latest.permission);
                displayStartTimeRef.current = now;
                statusQueueRef.current = [];
            } else if (removalPendingRef.current) {
                // Transition to Done immediately when work completes
                removalPendingRef.current = false;
                statusQueueRef.current = [];
                const result = wasAbortedRef.current ? 'aborted' : 'success';
                startFadeOut(result);
            }
        }, 50);

        return () => clearInterval(checkInterval);
    }, [isFadingOut]);

    useEffect(() => {
        return () => {
            if (fadeTimeoutRef.current) {
                clearTimeout(fadeTimeoutRef.current);
            }
            if (resultTimeoutRef.current) {
                clearTimeout(resultTimeoutRef.current);
            }
        };
    }, []);

    if (!displayedStatus && resultState === null) {
        return null;
    }

    let label: string;
    if (resultState === 'success') {
        label = 'Completed';
    } else if (resultState === 'aborted') {
        label = 'Aborted';
    } else if (displayedStatus) {
        label = displayedStatus.charAt(0).toUpperCase() + displayedStatus.slice(1);
    } else {
        label = 'Working';
    }

    const ariaLive = displayedPermission ? 'assertive' : 'polite';

    const renderIcon = () => {
        if (resultState === 'success') {
            return <CheckCircle weight="duotone" size={18} aria-hidden="true" />;
        }

        if (resultState === 'aborted') {
            return (
                <XCircle
                    weight="duotone"
                    size={18}
                    aria-hidden="true"
                    style={{ color: 'var(--status-error)' }}
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
            <span className="flex items-center gap-1.5">
                {renderIcon()}
                {resultState === null && (
                    <span className="typography-ui-header flex items-center gap-2">
                        {label}
                        <span className="inline-flex items-center">
                            <span className="animate-dot-pulse" style={{ animationDelay: '0ms' }}>.</span>
                            <span className="animate-dot-pulse" style={{ animationDelay: '200ms' }}>.</span>
                            <span className="animate-dot-pulse" style={{ animationDelay: '400ms' }}>.</span>
                        </span>
                    </span>
                )}
                {resultState === 'success' && (
                    <span className="typography-ui-header">Done</span>
                )}
                {resultState === 'aborted' && (
                    <span className="typography-ui-header">Aborted</span>
                )}
            </span>
            <DotPulseStyles />
        </div>
    );
}
