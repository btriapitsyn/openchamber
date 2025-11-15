import React, { useState, useEffect, useRef } from 'react';
import { RiCheckboxCircleLine, RiCloseCircleLine, RiLoader2Line, RiLoader3Line } from '@remixicon/react';
import { isDesktopRuntime, sendAssistantCompletionNotification } from '@/lib/desktop';

interface WorkingPlaceholderProps {
    statusText: string | null;
    isWaitingForPermission?: boolean;
    wasAborted?: boolean;
    notificationTitle?: string;
    notificationBody?: string;
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
    notificationTitle,
    notificationBody,
}: WorkingPlaceholderProps) {
    const [displayedStatus, setDisplayedStatus] = useState<string | null>(null);
    const [displayedPermission, setDisplayedPermission] = useState<boolean>(false);
    const [isVisible, setIsVisible] = useState<boolean>(false);
    const [isFadingOut, setIsFadingOut] = useState<boolean>(false);
    const [resultState, setResultState] = useState<ResultState>(null);
    const [isTransitioning, setIsTransitioning] = useState<boolean>(false);

    const displayStartTimeRef = useRef<number>(0);
    const statusQueueRef = useRef<Array<{ status: string; permission: boolean }>>([]);
    const removalPendingRef = useRef<boolean>(false);
    const fadeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const resultTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const transitionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastActiveStatusRef = useRef<string | null>(null);
    const hasShownActivityRef = useRef<boolean>(false);
    const wasAbortedRef = useRef<boolean>(false);
    const windowFocusRef = useRef<boolean>(true);
    const prevResultStateRef = useRef<ResultState>(null);
    const notificationSentRef = useRef<boolean>(false);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    const activateStatus = (status: string, permission: boolean) => {
        if (fadeTimeoutRef.current) {
            clearTimeout(fadeTimeoutRef.current);
            fadeTimeoutRef.current = null;
        }
        if (resultTimeoutRef.current) {
            clearTimeout(resultTimeoutRef.current);
            resultTimeoutRef.current = null;
        }
        if (transitionTimeoutRef.current) {
            clearTimeout(transitionTimeoutRef.current);
            transitionTimeoutRef.current = null;
        }

        if (status === 'aborted') {
            setDisplayedStatus(null);
            setDisplayedPermission(false);
            setIsFadingOut(false);
            setResultState('aborted');
            setIsTransitioning(false);
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
        setIsFadingOut(false);
        lastActiveStatusRef.current = status;
        hasShownActivityRef.current = true;

        const isStatusChanging = displayedStatus !== null && displayedStatus !== status;

        if (isStatusChanging) {
            // Trigger brief transition effect for smooth morph
            setIsTransitioning(true);
            transitionTimeoutRef.current = setTimeout(() => {
                setIsTransitioning(false);
                transitionTimeoutRef.current = null;
            }, 150);
        }

        setDisplayedStatus(status);
        setDisplayedPermission(permission);

        if (!isVisible) {
            // First time showing - fade in immediately
            if (typeof requestAnimationFrame === 'function') {
                requestAnimationFrame(() => {
                    setIsVisible(true);
                });
            } else {
                setIsVisible(true);
            }
        }
    };


    useEffect(() => {
        const now = Date.now();

        if (statusText) {
            notificationSentRef.current = false;
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
    }, [statusText, isWaitingForPermission, displayedStatus, displayedPermission, wasAborted, activateStatus]);

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

            const hadActiveStatus =
                lastActiveStatusRef.current !== null || hasShownActivityRef.current;

            if (result && hadActiveStatus) {
                // Seamless transition to result state - no fade, just like status changes
                setIsFadingOut(false);
                setIsVisible(true);
                
                // Update to result state immediately (seamless like status changes)
                setDisplayedStatus(null);
                setDisplayedPermission(false);
                setResultState(result);
                lastActiveStatusRef.current = null;
                
                // Don't trigger transition effect - just swap instantly
                setIsTransitioning(false);

                // Keep visible for result display duration
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
                // No active status to transition from - just hide
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
                    hasShownActivityRef.current = false;
                    lastActiveStatusRef.current = null;
                    fadeTimeoutRef.current = null;
                }, 180);
            }
            
            wasAbortedRef.current = false;
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
    }, [isFadingOut, activateStatus]);

    useEffect(() => {
        return () => {
            if (fadeTimeoutRef.current) {
                clearTimeout(fadeTimeoutRef.current);
            }
            if (resultTimeoutRef.current) {
                clearTimeout(resultTimeoutRef.current);
            }
            if (transitionTimeoutRef.current) {
                clearTimeout(transitionTimeoutRef.current);
            }
        };
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }

        windowFocusRef.current = typeof document !== 'undefined' && typeof document.hasFocus === 'function'
            ? document.hasFocus()
            : true;

        const handleFocus = () => {
            windowFocusRef.current = true;
        };

        const handleBlur = () => {
            windowFocusRef.current = false;
        };

        window.addEventListener('focus', handleFocus);
        window.addEventListener('blur', handleBlur);

        return () => {
            window.removeEventListener('focus', handleFocus);
            window.removeEventListener('blur', handleBlur);
        };
    }, []);

    useEffect(() => {
        if (!isDesktopRuntime()) {
            prevResultStateRef.current = resultState;
            return;
        }

        const previous = prevResultStateRef.current;
        if (resultState === 'success' && previous !== 'success' && !notificationSentRef.current) {
            const hasFocus = typeof document !== 'undefined' && typeof document.hasFocus === 'function'
                ? document.hasFocus()
                : windowFocusRef.current;
            const isHidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';

            if (!hasFocus || isHidden) {
                const resolvedTitle = typeof notificationTitle === 'string' && notificationTitle.trim().length > 0
                    ? notificationTitle.trim()
                    : 'Assistant Ready';
                const resolvedBody = typeof notificationBody === 'string' && notificationBody.trim().length > 0
                    ? notificationBody.trim()
                    : 'Assistant finished working.';

                void sendAssistantCompletionNotification({
                    title: resolvedTitle,
                    body: resolvedBody,
                });
                notificationSentRef.current = true;
            }
        }

        prevResultStateRef.current = resultState;
    }, [resultState, notificationTitle, notificationBody]);

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
        const iconStyle = { 
            opacity: isTransitioning ? 0.6 : 1,
            transition: 'opacity 150ms'
        };

        if (resultState === 'success') {
            return <RiCheckboxCircleLine size={18} aria-hidden="true" style={iconStyle} />;
        }

        if (resultState === 'aborted') {
            return (
                <RiCloseCircleLine
                    size={18}
                    aria-hidden="true"
                    style={{ color: 'var(--status-error)', ...iconStyle }}
                />
            );
        }

        if (displayedPermission) {
            return (
                <RiLoader2Line
                    size={16}
                    className="placeholder-blink"
                    aria-hidden="true"
                    style={iconStyle}
                />
            );
        }

        return (
            <RiLoader3Line
                size={16}
                className="animate-spin"
                aria-hidden="true"
                style={iconStyle}
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
                    <span 
                        className="typography-ui-header flex items-center gap-2 transition-opacity duration-150"
                        style={{ opacity: isTransitioning ? 0.6 : 1 }}
                    >
                        {label}
                        <span className="inline-flex items-center">
                            <span className="animate-dot-pulse" style={{ animationDelay: '0ms' }}>.</span>
                            <span className="animate-dot-pulse" style={{ animationDelay: '200ms' }}>.</span>
                            <span className="animate-dot-pulse" style={{ animationDelay: '400ms' }}>.</span>
                        </span>
                    </span>
                )}
                {resultState === 'success' && (
                    <span 
                        className="typography-ui-header transition-opacity duration-150"
                        style={{ opacity: isTransitioning ? 0.6 : 1 }}
                    >
                        Done
                    </span>
                )}
                {resultState === 'aborted' && (
                    <span 
                        className="typography-ui-header transition-opacity duration-150"
                        style={{ opacity: isTransitioning ? 0.6 : 1 }}
                    >
                        Aborted
                    </span>
                )}
            </span>
            <DotPulseStyles />
        </div>
    );
}
