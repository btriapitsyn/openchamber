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
    scrollToPosition: (position: number, options?: ScrollOptions) => void;
    forceManualMode: () => void;
    isAtTop: boolean;
    isManualOverrideActive: () => boolean;
    getScrollTop: () => number;
    getScrollHeight: () => number;
    getClientHeight: () => number;
};

const ANIMATION_DURATION_MS = 160;

export const useScrollEngine = ({
    containerRef,
}: ScrollEngineOptions): ScrollEngineResult => {
    const [isAtTop, setIsAtTop] = React.useState(true);

    const atTopRef = React.useRef(true);
    const manualOverrideRef = React.useRef(false);
    const animationFrameRef = React.useRef<number | null>(null);
    const animationStartRef = React.useRef<number | null>(null);
    const animationFromRef = React.useRef(0);
    const animationTargetRef = React.useRef(0);

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

            const progress = Math.min(1, (timestamp - animationStartRef.current) / ANIMATION_DURATION_MS);
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

    const scrollToPosition = React.useCallback(
        (position: number, options?: ScrollOptions) => {
            const container = containerRef.current;
            if (!container) return;

            const target = Math.max(0, position);
            const preferInstant = options?.instant ?? false;

            // Clear manual override when programmatically scrolling
            manualOverrideRef.current = false;

            if (typeof window === 'undefined' || preferInstant) {
                cancelAnimation();
                container.scrollTop = target;

                const atTop = target <= 1;
                if (atTopRef.current !== atTop) {
                    atTopRef.current = atTop;
                    setIsAtTop(atTop);
                }

                return;
            }

            cancelAnimation();

            const distance = Math.abs(target - container.scrollTop);
            if (distance <= 0.5) {
                container.scrollTop = target;

                const atTop = target <= 1;
                if (atTopRef.current !== atTop) {
                    atTopRef.current = atTop;
                    setIsAtTop(atTop);
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

    const forceManualMode = React.useCallback(() => {
        manualOverrideRef.current = true;
    }, []);

    const markManualOverride = React.useCallback(() => {
        manualOverrideRef.current = true;
    }, []);

    const isManualOverrideActive = React.useCallback(() => {
        return manualOverrideRef.current;
    }, []);

    const getScrollTop = React.useCallback(() => {
        return containerRef.current?.scrollTop ?? 0;
    }, [containerRef]);

    const getScrollHeight = React.useCallback(() => {
        return containerRef.current?.scrollHeight ?? 0;
    }, [containerRef]);

    const getClientHeight = React.useCallback(() => {
        return containerRef.current?.clientHeight ?? 0;
    }, [containerRef]);

    const handleScroll = React.useCallback(() => {
        const container = containerRef.current;
        if (!container) return;

        // Cancel animation if user is manually scrolling
        if (manualOverrideRef.current && animationFrameRef.current !== null) {
            cancelAnimation();
        }

        const atTop = container.scrollTop <= 1;

        if (atTopRef.current !== atTop) {
            atTopRef.current = atTop;
            setIsAtTop(atTop);
        }
    }, [cancelAnimation, containerRef]);

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
            scrollToPosition,
            forceManualMode,
            isAtTop,
            isManualOverrideActive,
            getScrollTop,
            getScrollHeight,
            getClientHeight,
        }),
        [
            handleScroll,
            scrollToPosition,
            forceManualMode,
            isAtTop,
            isManualOverrideActive,
            getScrollTop,
            getScrollHeight,
            getClientHeight,
        ]
    );
};

export type { ScrollEngineResult, ScrollEngineOptions, ScrollOptions };
