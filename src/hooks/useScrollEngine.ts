import React from 'react';

type ScrollEngineOptions = {
    containerRef: React.RefObject<HTMLDivElement | null>;
    isMobile: boolean;
};

type ScrollEngineResult = {
    handleScroll: () => void;
    flushToBottom: () => void;
    scrollToBottom: () => void;
    forceManualMode: () => void;
    showScrollButton: boolean;
    isPinned: boolean;
    isAtTop: boolean;
    isManualOverrideActive: () => boolean;
};

const PINNED_THRESHOLD_DESKTOP = 72;
const PINNED_THRESHOLD_MOBILE = 110;
const RELEASE_THRESHOLD_DESKTOP = 110;
const RELEASE_THRESHOLD_MOBILE = 150;

export const useScrollEngine = ({
    containerRef,
    isMobile,
}: ScrollEngineOptions): ScrollEngineResult => {
    const [showScrollButton, setShowScrollButton] = React.useState(false);
    const [isPinned, setIsPinned] = React.useState(true);
    const [isAtTop, setIsAtTop] = React.useState(true);

    const pinnedRef = React.useRef(true);
    const atTopRef = React.useRef(true);
    const lastScrollTopRef = React.useRef(0);
    const hasScrollBaselineRef = React.useRef(false);
    const manualOverrideRef = React.useRef(false);

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

    const markManualOverride = React.useCallback(() => {
        manualOverrideRef.current = true;
    }, []);

    const isManualOverrideActive = React.useCallback(() => {
        return manualOverrideRef.current;
    }, []);

    const flushToBottom = React.useCallback(() => {
        const container = containerRef.current;
        if (!container) return;

        hasScrollBaselineRef.current = false;
        container.scrollTop = container.scrollHeight - container.clientHeight;

        if (atTopRef.current) {
            atTopRef.current = false;
            setIsAtTop(false);
        }
    }, [containerRef]);

    const scrollToBottom = React.useCallback(() => {
        updatePinnedState(true);
        manualOverrideRef.current = false;
        flushToBottom();
    }, [flushToBottom, updatePinnedState]);

    const forceManualMode = React.useCallback(() => {
        updatePinnedState(false);
        setShowScrollButton(true);
    }, [updatePinnedState]);

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

            if (Math.abs(delta) > 0.5) {
                if (delta < -1 && pinnedRef.current) {
                    updatePinnedState(false);
                    setShowScrollButton(true);
                }
            }
        }

        // Clear manual override when near bottom
        if (distanceFromBottom <= 8) {
            manualOverrideRef.current = false;
        }

        if (distanceFromBottom <= pinnedThreshold) {
            updatePinnedState(true);
            return;
        }

        if (distanceFromBottom > releaseThreshold) {
            updatePinnedState(false);
            setShowScrollButton(true);
        }
    }, [
        containerRef,
        pinnedThreshold,
        releaseThreshold,
        updatePinnedState,
    ]);

    // Attach manual override listeners to container
    React.useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        container.addEventListener('wheel', markManualOverride, { passive: true });
        container.addEventListener('touchstart', markManualOverride, { passive: true });

        return () => {
            container.removeEventListener('wheel', markManualOverride);
            container.removeEventListener('touchstart', markManualOverride);
        };
    }, [containerRef, markManualOverride]);

    return React.useMemo(
        () => ({
            handleScroll,
            flushToBottom,
            scrollToBottom,
            forceManualMode,
            showScrollButton,
            isPinned,
            isAtTop,
            isManualOverrideActive,
        }),
        [
            handleScroll,
            flushToBottom,
            scrollToBottom,
            forceManualMode,
            showScrollButton,
            isPinned,
            isAtTop,
            isManualOverrideActive,
        ]
    );
};

export type { ScrollEngineResult, ScrollEngineOptions };
