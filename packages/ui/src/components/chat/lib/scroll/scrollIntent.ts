export const normalizeWheelDelta = (event: Pick<WheelEvent, 'deltaY' | 'deltaMode'>): number => {
    const lineMode = typeof WheelEvent !== 'undefined' ? WheelEvent.DOM_DELTA_LINE : 1;
    const pageMode = typeof WheelEvent !== 'undefined' ? WheelEvent.DOM_DELTA_PAGE : 2;

    if (event.deltaMode === lineMode) {
        return event.deltaY * 16;
    }
    if (event.deltaMode === pageMode) {
        return event.deltaY * 120;
    }
    return event.deltaY;
};

export const shouldMarkBoundaryGesture = (input: {
    delta: number;
    scrollTop: number;
    scrollHeight: number;
    clientHeight: number;
}): boolean => {
    if (input.delta < 0) {
        return input.scrollTop <= 0;
    }
    return input.scrollTop + input.clientHeight >= input.scrollHeight;
};

export const boundaryTarget = (root: HTMLElement, target: EventTarget | null): HTMLElement => {
    const current = target instanceof Element ? target : undefined;
    const nested = current?.closest('[data-scrollable]');
    if (!nested || nested === root) {
        return root;
    }
    if (!(nested instanceof HTMLElement)) {
        return root;
    }
    return nested;
};

export const shouldPauseAutoScrollOnWheel = (input: {
    root: HTMLElement;
    target: EventTarget | null;
    delta: number;
}): boolean => {
    if (input.delta >= 0) {
        return false;
    }

    const target = boundaryTarget(input.root, input.target);
    if (target === input.root) {
        return true;
    }

    return shouldMarkBoundaryGesture({
        delta: input.delta,
        scrollTop: target.scrollTop,
        scrollHeight: target.scrollHeight,
        clientHeight: target.clientHeight,
    });
};

export const isNearTop = (scrollTop: number, threshold: number): boolean => {
    return scrollTop <= threshold;
};

export const isNearBottom = (distanceFromBottom: number, threshold: number): boolean => {
    return distanceFromBottom <= threshold;
};
