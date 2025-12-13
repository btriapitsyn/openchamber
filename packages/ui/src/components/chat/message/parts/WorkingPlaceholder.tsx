import React, { useState, useEffect, useRef } from 'react';
import { Text } from '@/components/ui/text';

interface WorkingPlaceholderProps {
    statusText: string | null;
    isWaitingForPermission?: boolean;
    wasAborted?: boolean;
    completionId?: string | null;
    isComplete?: boolean;
}

const MIN_DISPLAY_TIME = 2000;
const DONE_DISPLAY_TIME = 1500;

type ResultState = 'success' | 'aborted' | null;

export function WorkingPlaceholder({
    statusText,
    isWaitingForPermission,
    wasAborted,
    completionId,
    isComplete,
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
    const rafIdRef = useRef<number | null>(null);
    const lastCheckTimeRef = useRef<number>(0);
    const lastActiveStatusRef = useRef<string | null>(null);
    const hasShownActivityRef = useRef<boolean>(false);
    const wasAbortedRef = useRef<boolean>(false);
    const isCompleteRef = useRef<boolean>(false);
    const windowFocusRef = useRef<boolean>(true);
    const lastCompletionShownRef = useRef<string | null>(null);
    const resultShownAtRef = useRef<number | null>(null);

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

            setIsTransitioning(true);
            transitionTimeoutRef.current = setTimeout(() => {
                setIsTransitioning(false);
                transitionTimeoutRef.current = null;
            }, 150);
        }

        setDisplayedStatus(status);
        setDisplayedPermission(permission);

        if (!isVisible) {

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
        isCompleteRef.current = !!isComplete;
    }, [isComplete]);

    useEffect(() => {
        if (isComplete) {
            removalPendingRef.current = true;
        }
    }, [isComplete]);

    useEffect(() => {
        const startFadeOut = (result: ResultState) => {
            if (isFadingOut) {
                return;
            }

            const hadActiveStatus =
                lastActiveStatusRef.current !== null || hasShownActivityRef.current;

            if (result && hadActiveStatus) {

                setIsFadingOut(false);
                setIsVisible(true);

                setDisplayedStatus(null);
                setDisplayedPermission(false);
                setResultState(result);
                lastActiveStatusRef.current = null;

                setIsTransitioning(false);

                if (result === 'success' && completionId) {
                    lastCompletionShownRef.current = completionId;
                }

                resultShownAtRef.current = Date.now();

                if (resultTimeoutRef.current) {
                    clearTimeout(resultTimeoutRef.current);
                }

                resultTimeoutRef.current = setTimeout(() => {
                    setIsVisible(false);
                    setResultState(null);
                    hasShownActivityRef.current = false;
                    resultTimeoutRef.current = null;
                }, DONE_DISPLAY_TIME);
            } else {

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

        const CHECK_THROTTLE_MS = 150; // Throttle checks to ~6-7 times per second

        const checkLoop = (timestamp: number) => {
            // Throttle: skip if less than CHECK_THROTTLE_MS since last check
            if (timestamp - lastCheckTimeRef.current < CHECK_THROTTLE_MS) {
                rafIdRef.current = requestAnimationFrame(checkLoop);
                return;
            }
            lastCheckTimeRef.current = timestamp;

            const now = Date.now();
            const elapsed = now - displayStartTimeRef.current;

            const isDone = removalPendingRef.current && isCompleteRef.current;

            const shouldWaitForMinTime = !isDone && statusQueueRef.current.length > 0;

            if (shouldWaitForMinTime && elapsed < MIN_DISPLAY_TIME) {
                rafIdRef.current = requestAnimationFrame(checkLoop);
                return;
            }

            if (removalPendingRef.current && wasAbortedRef.current) {
                removalPendingRef.current = false;
                statusQueueRef.current = [];
                startFadeOut('aborted');
            } else if (!isDone && statusQueueRef.current.length > 0) {
                const latest = statusQueueRef.current[statusQueueRef.current.length - 1];
                activateStatus(latest.status, latest.permission);
                displayStartTimeRef.current = now;
                statusQueueRef.current = [];
            } else if (removalPendingRef.current) {

                removalPendingRef.current = false;

                if (statusQueueRef.current.length > 0) {
                    hasShownActivityRef.current = true;
                }
                statusQueueRef.current = [];

                let result: ResultState = null;
                if (wasAbortedRef.current) {
                    result = 'aborted';
                } else if (isCompleteRef.current) {
                    result = 'success';

                    hasShownActivityRef.current = true;
                }

                if (result === 'success' && completionId && lastCompletionShownRef.current === completionId) {
                    setDisplayedStatus(null);
                    setDisplayedPermission(false);
                    setIsFadingOut(false);
                    setIsVisible(false);
                    setResultState(null);
                    statusQueueRef.current = [];
                    hasShownActivityRef.current = false;
                    lastActiveStatusRef.current = null;
                    removalPendingRef.current = false;
                    wasAbortedRef.current = false;
                    rafIdRef.current = requestAnimationFrame(checkLoop);
                    return;
                }

                startFadeOut(result);
            }

            rafIdRef.current = requestAnimationFrame(checkLoop);
        };

        rafIdRef.current = requestAnimationFrame(checkLoop);

        return () => {
            if (rafIdRef.current !== null) {
                cancelAnimationFrame(rafIdRef.current);
                rafIdRef.current = null;
            }
        };

    }, [isFadingOut]);

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
        const handleVisibilityRestore = () => {
            if (typeof document === 'undefined' || typeof Date === 'undefined') {
                return;
            }
            if (document.visibilityState !== 'visible') {
                return;
            }

            const shownAt = resultShownAtRef.current;
            const isCompletionVisible = resultState !== null || displayedStatus !== null;

            if (isCompletionVisible && shownAt && Date.now() - shownAt > 500) {
                setDisplayedStatus(null);
                setDisplayedPermission(false);
                setIsFadingOut(false);
                setIsVisible(false);
                setResultState(null);
                statusQueueRef.current = [];
                hasShownActivityRef.current = false;
                lastActiveStatusRef.current = null;
                removalPendingRef.current = false;
                wasAbortedRef.current = false;
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityRestore);
        window.addEventListener('focus', handleVisibilityRestore);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityRestore);
            window.removeEventListener('focus', handleVisibilityRestore);
        };
    }, [displayedStatus, resultState]);

    if (!displayedStatus && resultState === null) {
        return null;
    }

    let label: string;
    if (resultState === 'success') {
        label = 'Done';
    } else if (resultState === 'aborted') {
        label = 'Aborted';
    } else if (displayedStatus) {
        label = displayedStatus.charAt(0).toUpperCase() + displayedStatus.slice(1);
    } else {
        label = 'Working';
    }

    const ariaLive = displayedPermission ? 'assertive' : 'polite';

    const displayText = resultState === null ? `${label}...` : label;

    return (
        <div
            className={`flex h-full items-center text-muted-foreground pl-[2ch] transition-opacity duration-200 ${isVisible && !isFadingOut ? 'opacity-100' : 'opacity-0'}`}
            role="status"
            aria-live={ariaLive}
            aria-label={label}
            data-waiting={displayedPermission ? 'true' : undefined}
        >
            <span className="flex items-center gap-1.5">
                {resultState === null && (
                    <Text
                        variant="shine"
                        className="typography-ui-header transition-opacity duration-150"
                        style={{ opacity: isTransitioning ? 0.6 : 1 }}
                    >
                        {displayText}
                    </Text>
                )}
                {resultState === 'success' && (
                    <Text
                        variant="hover-enter"
                        className="typography-ui-header transition-opacity duration-150"
                        style={{ opacity: isTransitioning ? 0.6 : 1 }}
                    >
                        Done
                    </Text>
                )}
                {resultState === 'aborted' && (
                    <Text
                        variant="hover-enter"
                        className="typography-ui-header transition-opacity duration-150 text-status-error"
                        style={{ opacity: isTransitioning ? 0.6 : 1 }}
                    >
                        Aborted
                    </Text>
                )}
            </span>
        </div>
    );
}
