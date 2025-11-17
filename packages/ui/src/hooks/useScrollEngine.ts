import React from 'react';

type ScrollEngineOptions = {
    containerRef: React.RefObject<HTMLDivElement | null>;
    isMobile: boolean;
};

type ScrollOptions = {
    instant?: boolean;
};

type ScrollEngineResult = {
    handleScroll: () => void;
    flushToBottom: (options?: ScrollOptions) => void;
    scrollToBottom: (options?: ScrollOptions) => void;
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
    const animationFrameRef = React.useRef<number | null>(null);
    const animationStartRef = React.useRef<number | null>(null);
    const animationFromRef = React.useRef(0);
    const animationTargetRef = React.useRef(0);

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
 
     const cancelAnimation = React.useCallback(() => {
         if (animationFrameRef.current !== null && typeof window !== 'undefined') {
             window.cancelAnimationFrame(animationFrameRef.current);
         }
 
         animationFrameRef.current = null;
         animationStartRef.current = null;
     }, []);
 
     const runAnimationFrame = React.useCallback(
         (timestamp: number) => {
             const container = containerRef.current;
             if (!container) {
                 cancelAnimation();
                 return;
             }
 
             if (animationStartRef.current === null) {
                 animationStartRef.current = timestamp;
             }
 
             const progress = Math.min(1, (timestamp - animationStartRef.current) / 160);
             const easedProgress = 1 - Math.pow(1 - progress, 3);
             const from = animationFromRef.current;
             const target = animationTargetRef.current;
             const nextTop = from + (target - from) * easedProgress;
 
             container.scrollTop = nextTop;
 
             if (progress < 1) {
                 animationFrameRef.current = window.requestAnimationFrame(runAnimationFrame);
                 return;
             }
 
             container.scrollTop = target;
             cancelAnimation();
 
             if (atTopRef.current) {
                 atTopRef.current = false;
                 setIsAtTop(false);
             }
         },
         [cancelAnimation, containerRef, setIsAtTop]
     );
 
    const flushToBottom = React.useCallback(
        (options?: ScrollOptions) => {
            const container = containerRef.current;
            if (!container) return;
 
            const target = Math.max(0, container.scrollHeight - container.clientHeight);
            const preferInstant = options?.instant ?? false;
            hasScrollBaselineRef.current = false;
 
            if (typeof window === 'undefined' || preferInstant) {
                cancelAnimation();
                container.scrollTop = target;
 
                if (atTopRef.current) {
                    atTopRef.current = false;
                    setIsAtTop(false);
                }
 
                return;
            }
 
            cancelAnimation();
 
            const distance = Math.abs(target - container.scrollTop);
            if (distance <= 0.5) {
                container.scrollTop = target;
 
                if (atTopRef.current) {
                    atTopRef.current = false;
                    setIsAtTop(false);
                }
 
                return;
            }
 
            animationFromRef.current = container.scrollTop;
            animationTargetRef.current = target;
            animationStartRef.current = null;
            animationFrameRef.current = window.requestAnimationFrame(runAnimationFrame);
        },
        [cancelAnimation, containerRef, runAnimationFrame, setIsAtTop]
    );



    const scrollToBottom = React.useCallback(
        (options?: ScrollOptions) => {
            updatePinnedState(true);
            manualOverrideRef.current = false;
            flushToBottom(options);
        },
        [flushToBottom, updatePinnedState]
    );

    const forceManualMode = React.useCallback(() => {
        updatePinnedState(false);
        setShowScrollButton(true);
    }, [updatePinnedState]);

    const handleScroll = React.useCallback(() => {
        const container = containerRef.current;
        if (!container) return;
 
        if (manualOverrideRef.current && animationFrameRef.current !== null) {
            cancelAnimation();
        }
 
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
        cancelAnimation,
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

    React.useEffect(() => {
        return () => {
            cancelAnimation();
        };
    }, [cancelAnimation]);

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

export type { ScrollEngineResult, ScrollEngineOptions, ScrollOptions };
