import React from 'react';

import { useSmoothAutoScroll } from '@/hooks/useSmoothAutoScroll';

type ScrollMode = 'animated' | 'immediate';

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

    const pinnedRef = React.useRef(true);
    const pendingFinalFlushRef = React.useRef(false);
    const rafIdRef = React.useRef<number | null>(null);
    const fallbackTimeoutRef = React.useRef<number | null>(null);
    const confirmationTimeoutRef = React.useRef<number | null>(null);
    const scheduledRef = React.useRef(false);
    const autoScrollActiveRef = React.useRef(false);

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
        scheduledRef.current = false;
    }, []);

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

            scheduledRef.current = true;

            const run = () => {
                scheduledRef.current = false;
                autoScrollActiveRef.current = true;
                performScroll(mode);
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
                run();

                confirmationTimeoutRef.current = window.setTimeout(() => {
                    performScroll('immediate');
                    autoScrollActiveRef.current = false;
                }, CONFIRMATION_DELAY);
            };

            rafIdRef.current = window.requestAnimationFrame
                ? window.requestAnimationFrame(rafHandler)
                : null;

            if (rafIdRef.current === null) {
                // requestAnimationFrame не доступний: відразу виконуємо fallback
                if (fallbackTimeoutRef.current !== null) {
                    clearTimeout(fallbackTimeoutRef.current);
                    fallbackTimeoutRef.current = null;
                }
                run();
                confirmationTimeoutRef.current = window.setTimeout(() => {
                    performScroll('immediate');
                    autoScrollActiveRef.current = false;
                }, CONFIRMATION_DELAY);
            }
        },
        [containerRef, performScroll]
    );

    const flushToBottom = React.useCallback(() => {
        pendingFinalFlushRef.current = false;
        scheduleScroll('immediate');
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
    }, [scheduleScroll, updatePinnedState]);

    const handleScroll = React.useCallback(() => {
        const container = containerRef.current;
        if (!container) return;

        const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;

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
    }, [containerRef, flushToBottom, pinnedThreshold, releaseThreshold, updatePinnedState]);

    React.useEffect(() => {
        return () => {
            cancelScheduledScroll();
        };
    }, [cancelScheduledScroll]);

    return React.useMemo(
        () => ({
            handleScroll,
            notifyContentMutation,
            flushToBottom,
            scrollToBottom,
            showScrollButton,
            isPinned,
        }),
        [
            handleScroll,
            notifyContentMutation,
            flushToBottom,
            scrollToBottom,
            showScrollButton,
            isPinned,
        ]
    );
};

export type { ScrollEngineResult, ScrollEngineOptions, NotifyOptions };
