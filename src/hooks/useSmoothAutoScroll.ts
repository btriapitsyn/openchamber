import React from 'react';

const DEFAULT_DURATION = 60;
const DEFAULT_CLASS_NAME = 'has-streaming-scroll';
const linearEasing = (t: number) => t;

interface UseSmoothAutoScrollOptions {
    containerRef: React.RefObject<HTMLElement | null>;
    isEnabled: boolean;
    shouldObserve?: boolean;
    durationMs?: number;
    easing?: (t: number) => number;
    activeClassName?: string;
}

interface SmoothAutoScrollApi {
    notifyContentDelta: (delta: number) => void;
    cancel: () => void;
    flushToBottom: () => void;
    animateToBottom: () => void;
}

interface AnimationState {
    delta: number;
    applied: number;
    startTime: number | null;
    duration: number;
}

const EPSILON = 0.1;

export const useSmoothAutoScroll = ({
    containerRef,
    isEnabled,
    shouldObserve,
    durationMs = DEFAULT_DURATION,
    easing = linearEasing,
    activeClassName = DEFAULT_CLASS_NAME,
}: UseSmoothAutoScrollOptions): SmoothAutoScrollApi => {
    const queueRef = React.useRef<number[]>([]);
    const animationRef = React.useRef<AnimationState | null>(null);
    const rafIdRef = React.useRef<number | null>(null);
    const lastObservedHeightRef = React.useRef<number>(0);
    const previousContainerRef = React.useRef<HTMLElement | null>(null);

    const resolvedShouldObserve = shouldObserve ?? isEnabled;

    const ensureClass = React.useCallback(
        (active: boolean) => {
            const container = containerRef.current;
            if (!container) return;

            if (active) {
                container.classList.add(activeClassName);
            } else {
                container.classList.remove(activeClassName);
            }
        },
        [activeClassName, containerRef]
    );

    const stopAnimation = React.useCallback(() => {
        if (rafIdRef.current !== null) {
            cancelAnimationFrame(rafIdRef.current);
            rafIdRef.current = null;
        }
        animationRef.current = null;
        queueRef.current.length = 0;
        ensureClass(false);
    }, [ensureClass]);

    const step = React.useCallback(
        (timestamp: number) => {
            const container = containerRef.current;
            if (!container) {
                stopAnimation();
                return;
            }

            if (!isEnabled) {
                stopAnimation();
                return;
            }

            let state = animationRef.current;

            if (!state) {
                const nextDelta = queueRef.current.shift();

                if (!nextDelta) {
                    stopAnimation();
                    return;
                }

                state = {
                    delta: nextDelta,
                    applied: 0,
                    startTime: timestamp,
                    duration: durationMs,
                };

                animationRef.current = state;
                ensureClass(true);
            } else if (state.startTime === null) {
                state.startTime = timestamp;
            }

            const elapsed = state.startTime ? timestamp - state.startTime : 0;
            const progress = state.duration <= 0 ? 1 : Math.min(1, elapsed / state.duration);
            const easedProgress = easing(progress);
            const target = state.delta * easedProgress;
            const increment = target - state.applied;

            if (Math.abs(increment) > EPSILON) {
                container.scrollTop += increment;
                state.applied = target;
            }

            if (progress >= 1 - EPSILON) {
                animationRef.current = null;

                if (queueRef.current.length === 0) {
                    stopAnimation();
                    return;
                }
            }

            rafIdRef.current = requestAnimationFrame(step);
        },
        [containerRef, durationMs, easing, ensureClass, isEnabled, stopAnimation]
    );

    const ensureAnimation = React.useCallback(() => {
        if (rafIdRef.current === null) {
            rafIdRef.current = requestAnimationFrame(step);
        }
    }, [step]);

    const enqueueDelta = React.useCallback(
        (delta: number) => {
            if (!isEnabled || delta <= 0) {
                return;
            }

            queueRef.current.push(delta);
            ensureClass(true);
            ensureAnimation();
        },
        [ensureAnimation, ensureClass, isEnabled]
    );

    const notifyContentDelta = enqueueDelta;

    const cancel = React.useCallback(() => {
        stopAnimation();
    }, [stopAnimation]);

    const flushToBottom = React.useCallback(() => {
        const container = containerRef.current;
        if (!container) return;

        stopAnimation();
        container.scrollTop = container.scrollHeight - container.clientHeight;
    }, [containerRef, stopAnimation]);

    const animateToBottom = React.useCallback(() => {
        const container = containerRef.current;
        if (!container) return;

        const target = container.scrollHeight - container.clientHeight;
        const delta = target - container.scrollTop;

        enqueueDelta(delta);
    }, [containerRef, enqueueDelta]);

    React.useEffect(() => {
        if (!isEnabled) {
            stopAnimation();
        }
    }, [isEnabled, stopAnimation]);

    React.useEffect(() => {
        const container = containerRef.current;

        if (!container) return;

        if (previousContainerRef.current && previousContainerRef.current !== container) {
            previousContainerRef.current.classList.remove(activeClassName);
        }

        previousContainerRef.current = container;
    }, [activeClassName, containerRef]);

    React.useEffect(() => {
        const container = containerRef.current;
        if (!container || !resolvedShouldObserve) {
            return;
        }

        lastObservedHeightRef.current = container.scrollHeight;

        const observer = new ResizeObserver(() => {
            if (!isEnabled) {
                lastObservedHeightRef.current = container.scrollHeight;
                return;
            }

            const nextHeight = container.scrollHeight;
            const delta = nextHeight - lastObservedHeightRef.current;

            if (delta > 0) {
                notifyContentDelta(delta);
            }

            lastObservedHeightRef.current = nextHeight;
        });

        observer.observe(container);

        return () => {
            observer.disconnect();
        };
    }, [containerRef, isEnabled, notifyContentDelta, resolvedShouldObserve]);

    React.useEffect(() => {
        return () => {
            stopAnimation();
        };
    }, [stopAnimation]);

    return React.useMemo(
        () => ({
            notifyContentDelta,
            cancel,
            flushToBottom,
            animateToBottom,
        }),
        [animateToBottom, cancel, flushToBottom, notifyContentDelta]
    );
};
