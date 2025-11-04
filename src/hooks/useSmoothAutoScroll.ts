import React from 'react';

const DEFAULT_DURATION = 60;
const DEFAULT_CLASS_NAME = 'has-streaming-scroll';
const MAX_SEGMENT_DELTA = 160;
const DURATION_SCALE_MS_PER_PX = 0.5;
const MAX_SEGMENT_DURATION = 280;
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

interface QueuedDelta {
    delta: number;
    duration: number;
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
    const queueRef = React.useRef<QueuedDelta[]>([]);
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
                const next = queueRef.current.shift();

                if (!next) {
                    stopAnimation();
                    return;
                }

                state = {
                    delta: next.delta,
                    applied: 0,
                    startTime: timestamp,
                    duration: next.duration,
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
        [containerRef, easing, ensureClass, isEnabled, stopAnimation]
    );

    const ensureAnimation = React.useCallback(() => {
        if (rafIdRef.current === null) {
            rafIdRef.current = requestAnimationFrame(step);
        }
    }, [step]);

    const computeDuration = React.useCallback(
        (delta: number) => {
            const scaled = delta * DURATION_SCALE_MS_PER_PX;
            return Math.min(MAX_SEGMENT_DURATION, Math.max(durationMs, scaled));
        },
        [durationMs]
    );

    const segmentDelta = React.useCallback(
        (delta: number): QueuedDelta[] => {
            if (delta <= 0) {
                return [];
            }

            const segments: QueuedDelta[] = [];
            let remaining = delta;

            while (remaining > 0) {
                const nextDelta = Math.min(remaining, MAX_SEGMENT_DELTA);
                segments.push({
                    delta: nextDelta,
                    duration: computeDuration(nextDelta),
                });
                remaining -= nextDelta;
            }

            return segments;
        },
        [computeDuration]
    );

    const scrollEngine = React.useCallback(
        (delta: number) => {
            if (!isEnabled || delta <= 0) {
                return;
            }

            const segments = segmentDelta(delta);

            if (!segments.length) {
                return;
            }

            queueRef.current.push(...segments);
            ensureClass(true);
            ensureAnimation();
        },
        [ensureAnimation, ensureClass, isEnabled, segmentDelta]
    );

    const enqueueDelta = scrollEngine;

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
