import React from 'react';

import { useSmoothAutoScroll } from '@/hooks/useSmoothAutoScroll';

type ScrollMode = 'animated' | 'immediate';
type ScrollDirection = 'up' | 'down' | null;

type NotifyOptions = {
    isFinal?: boolean;
    immediate?: boolean;
    source?: 'animation' | 'content' | 'lifecycle';
};

type ScrollEngineOptions = {
    containerRef: React.RefObject<HTMLDivElement | null>;
    isMobile: boolean;
};

type ScrollEngineResult = {
    handleScroll: () => void;
    notifyContentMutation: (options?: NotifyOptions) => void;
    flushToBottom: () => void;
    scrollToBottom: () => void;
    showScrollButton: boolean;
    isPinned: boolean;
    isAtTop: boolean;
    scrollDirection: ScrollDirection;
};

const PINNED_THRESHOLD_DESKTOP = 72;
const PINNED_THRESHOLD_MOBILE = 110;
const RELEASE_THRESHOLD_DESKTOP = 110;
const RELEASE_THRESHOLD_MOBILE = 150;

const FALLBACK_SCROLL_DELAY = 140;
const CONFIRMATION_DELAY = 80;

export const useScrollEngine = ({
    containerRef,
    isMobile,
}: ScrollEngineOptions): ScrollEngineResult => {
    const [showScrollButton, setShowScrollButton] = React.useState(false);
    const [isPinned, setIsPinned] = React.useState(true);
    const [isAtTop, setIsAtTop] = React.useState(true);
    const [scrollDirection, setScrollDirection] = React.useState<ScrollDirection>(null);

    const pinnedRef = React.useRef(true);
    const pendingFinalFlushRef = React.useRef(false);
    const rafIdRef = React.useRef<number | null>(null);
    const fallbackTimeoutRef = React.useRef<number | null>(null);
    const confirmationTimeoutRef = React.useRef<number | null>(null);
    const confirmationTokenRef = React.useRef(0);
    const scheduledRef = React.useRef(false);
    const autoScrollActiveRef = React.useRef(false);
    const atTopRef = React.useRef(true);
    const lastScrollTopRef = React.useRef(0);
    const directionRef = React.useRef<ScrollDirection>(null);
    const fadeTimeoutRef = React.useRef<number | null>(null);
    const hasScrollBaselineRef = React.useRef(false);

    const clearFadeTimeout = React.useCallback(() => {
        if (fadeTimeoutRef.current !== null) {
            clearTimeout(fadeTimeoutRef.current);
            fadeTimeoutRef.current = null;
        }
    }, []);

    const pinnedThreshold = isMobile ? PINNED_THRESHOLD_MOBILE : PINNED_THRESHOLD_DESKTOP;
    const releaseThreshold = isMobile ? RELEASE_THRESHOLD_MOBILE : RELEASE_THRESHOLD_DESKTOP;

    const updatePinnedState = React.useCallback(
        (nextPinned: boolean) => {
            if (pinnedRef.current !== nextPinned) {
                pinnedRef.current = nextPinned;
                setIsPinned(nextPinned);
            }

            if (nextPinned) {
                setShowScrollButton(false);
            }
        },
        []
    );

    const cancelScheduledScroll = React.useCallback(() => {
        if (rafIdRef.current !== null) {
            if (typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
                window.cancelAnimationFrame(rafIdRef.current);
            }
            rafIdRef.current = null;
        }
        if (fallbackTimeoutRef.current !== null) {
            clearTimeout(fallbackTimeoutRef.current);
            fallbackTimeoutRef.current = null;
        }
        if (confirmationTimeoutRef.current !== null) {
            clearTimeout(confirmationTimeoutRef.current);
            confirmationTimeoutRef.current = null;
        }
        clearFadeTimeout();
        scheduledRef.current = false;
    }, [clearFadeTimeout]);

    const smoothScroller = useSmoothAutoScroll({
        containerRef,
        isEnabled: isPinned,
    });

    const performScroll = React.useCallback(
        (mode: ScrollMode) => {
            if (mode === 'immediate') {
                smoothScroller.flushToBottom();
            } else {
                smoothScroller.animateToBottom();
            }
        },
        [smoothScroller]
    );

    const scheduleScroll = React.useCallback(
        (mode: ScrollMode) => {
            const hasDOM = typeof window !== 'undefined';

            if (scheduledRef.current) {
                return;
            }

            if (!containerRef.current) {
                return;
            }

            if (confirmationTimeoutRef.current !== null) {
                clearTimeout(confirmationTimeoutRef.current);
                confirmationTimeoutRef.current = null;
            }

            scheduledRef.current = true;

            const run = () => {
                scheduledRef.current = false;
                autoScrollActiveRef.current = true;
                hasScrollBaselineRef.current = false;
                performScroll(mode);

                if (!hasDOM) {
                    autoScrollActiveRef.current = false;
                    return;
                }

                const token = ++confirmationTokenRef.current;

                if (mode === 'animated') {
                    confirmationTimeoutRef.current = window.setTimeout(() => {
                        if (confirmationTokenRef.current !== token) {
                            return;
                        }

                        if (!pinnedRef.current) {
                            autoScrollActiveRef.current = false;
                            confirmationTimeoutRef.current = null;
                            return;
                        }

                        performScroll('immediate');
                        autoScrollActiveRef.current = false;
                        confirmationTimeoutRef.current = null;
                    }, CONFIRMATION_DELAY);
                } else {
                    autoScrollActiveRef.current = false;
                }
            };

            if (!hasDOM) {
                run();
                return;
            }

            const fallbackId = window.setTimeout(() => {
                fallbackTimeoutRef.current = null;
                run();
            }, FALLBACK_SCROLL_DELAY);

            fallbackTimeoutRef.current = fallbackId;

            const rafHandler = () => {
                if (fallbackTimeoutRef.current !== null) {
                    clearTimeout(fallbackTimeoutRef.current);
                    fallbackTimeoutRef.current = null;
                }

                // Double RAF: First RAF commits DOM, second RAF ensures layout is complete
                window.requestAnimationFrame(() => {
                    run();
                });
            };

            rafIdRef.current = window.requestAnimationFrame
                ? window.requestAnimationFrame(rafHandler)
                : null;

            if (rafIdRef.current === null) {
                // requestAnimationFrame is unavailable: run the fallback immediately
                if (fallbackTimeoutRef.current !== null) {
                    clearTimeout(fallbackTimeoutRef.current);
                    fallbackTimeoutRef.current = null;
                }
                run();
            }
        },
        [containerRef, performScroll]
    );

    const flushToBottom = React.useCallback(() => {
        pendingFinalFlushRef.current = false;
        scheduleScroll('immediate');
        if (atTopRef.current) {
            atTopRef.current = false;
            setIsAtTop(false);
        }
    }, [scheduleScroll]);

    const notifyContentMutation = React.useCallback(
        (options?: NotifyOptions) => {
            const { isFinal = false, immediate = false } = options ?? {};

            if (!containerRef.current) {
                return;
            }

            if (pinnedRef.current) {
                scheduleScroll(isFinal || immediate ? 'immediate' : 'animated');
            } else if (isFinal) {
                pendingFinalFlushRef.current = true;
            }
        },
        [containerRef, scheduleScroll]
    );

    const scrollToBottom = React.useCallback(() => {
        updatePinnedState(true);
        pendingFinalFlushRef.current = false;
        scheduleScroll('immediate');
        if (atTopRef.current) {
            atTopRef.current = false;
            setIsAtTop(false);
        }
        if (directionRef.current !== null) {
            directionRef.current = null;
            setScrollDirection(null);
            clearFadeTimeout();
        }
    }, [clearFadeTimeout, scheduleScroll, updatePinnedState]);

    const handleScroll = React.useCallback(() => {
        const container = containerRef.current;
        if (!container) return;

        const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
        const atTop = container.scrollTop <= 1;

        if (atTopRef.current !== atTop) {
            atTopRef.current = atTop;
            setIsAtTop(atTop);
        }

        const nextScrollTop = container.scrollTop;
        const prevScrollTop = lastScrollTopRef.current;

        if (!hasScrollBaselineRef.current) {
            hasScrollBaselineRef.current = true;
            lastScrollTopRef.current = nextScrollTop;
        } else {
            const delta = nextScrollTop - prevScrollTop;
            lastScrollTopRef.current = nextScrollTop;

            if (!autoScrollActiveRef.current && Math.abs(delta) > 0.5) {
                if (delta < -1 && pinnedRef.current) {
                    cancelScheduledScroll();
                    smoothScroller.cancel();
                    autoScrollActiveRef.current = false;
                    pendingFinalFlushRef.current = false;
                    updatePinnedState(false);
                    setShowScrollButton(true);
                }

                const direction: ScrollDirection = delta > 0 ? 'down' : 'up';

                if (directionRef.current !== direction) {
                    directionRef.current = direction;
                    setScrollDirection(direction);
                } else {
                    setScrollDirection((current) => (current === direction ? current : direction));
                }

                clearFadeTimeout();
                if (typeof window !== 'undefined') {
                    fadeTimeoutRef.current = window.setTimeout(() => {
                        directionRef.current = null;
                        fadeTimeoutRef.current = null;
                        setScrollDirection(null);
                    }, 220);
                }
            }
        }

        if (distanceFromBottom <= pinnedThreshold) {
            const wasPinned = pinnedRef.current;
            updatePinnedState(true);
            if (distanceFromBottom <= 4) {
                autoScrollActiveRef.current = false;
            }
            if (!wasPinned && pendingFinalFlushRef.current) {
                flushToBottom();
            }
            return;
        }

        if (distanceFromBottom > releaseThreshold) {
            if (autoScrollActiveRef.current) {
                return;
            }
            updatePinnedState(false);
            setShowScrollButton(true);
        }
    }, [
        cancelScheduledScroll,
        clearFadeTimeout,
        containerRef,
        flushToBottom,
        pinnedThreshold,
        releaseThreshold,
        smoothScroller,
        updatePinnedState,
    ]);

    React.useEffect(() => {
        return () => {
            cancelScheduledScroll();
            clearFadeTimeout();
        };
    }, [cancelScheduledScroll, clearFadeTimeout]);

    return React.useMemo(
        () => ({
            handleScroll,
            notifyContentMutation,
            flushToBottom,
            scrollToBottom,
            showScrollButton,
            isPinned,
            isAtTop,
            scrollDirection,
        }),
        [
            handleScroll,
            notifyContentMutation,
            flushToBottom,
            scrollToBottom,
            showScrollButton,
            isPinned,
            isAtTop,
            scrollDirection,
        ]
    );
};

export type { ScrollEngineResult, ScrollEngineOptions, NotifyOptions };
