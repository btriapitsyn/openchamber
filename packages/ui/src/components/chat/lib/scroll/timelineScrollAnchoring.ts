// Scroll geometry for the chat timeline.
//
// The timeline has two mutually exclusive scroll modes:
//
//   • `following-end`  — stay pinned to the live edge as content grows.
//   • `free-scrolling` — the user took over; nothing moves the scroll
//     position until they opt back in.
//
// This module is pure geometry: it reads measurements from the virtualized
// list and answers where the real content ends and whether the viewport is
// there. Keeping it free of DOM and React makes the rules testable without a
// renderer.

export type TimelineScrollMode = 'following-end' | 'free-scrolling';

export interface TimelineListMeasurementState {
    readonly data: readonly unknown[];
    readonly scroll: number;
    readonly scrollLength: number;
    readonly positionAtIndex: (index: number) => number | undefined;
    readonly sizeAtIndex: (index: number) => number | undefined;
}

export const getRowBottom = (
    state: TimelineListMeasurementState,
    index: number,
): number | null => {
    const top = state.positionAtIndex(index);
    const height = state.sizeAtIndex(index);
    if (
        typeof top !== 'number'
        || typeof height !== 'number'
        || !Number.isFinite(top)
        || !Number.isFinite(height)
    ) {
        return null;
    }
    // Rows measured at zero height would read as no content at all; treat
    // them as one pixel tall instead.
    return top + Math.max(1, height);
};

// The list footer (question and permission cards, error notices, the tail
// spacer) renders after the last row and is part of the real content; the
// list does not expose its size through getState, so the caller passes the
// last reported value.
export const resolveRealContentEndOffset = ({
    state,
    composerOverlayHeight,
    footerSize = 0,
}: {
    readonly state: TimelineListMeasurementState;
    readonly composerOverlayHeight: number;
    readonly footerSize?: number;
}): number | null => {
    const lastIndex = state.data.length - 1;
    if (lastIndex < 0) return null;
    const lastBottom = getRowBottom(state, lastIndex);
    if (lastBottom === null) return null;
    const visibleLength = Math.max(0, state.scrollLength - composerOverlayHeight);
    return Math.max(0, lastBottom + Math.max(0, footerSize) - visibleLength);
};

// "At the end" for follow purposes is half a viewport. Leaving the end is
// only ever decided by a real gesture, so this band never yanks a reader who
// is still on the end; what it decides is how close to the live edge a reader
// who scrolled away must come back before follow re-arms and the pill hides.
// Half a screen reads as "I am back at the bottom" without having to land on
// the last pixel, and stray row growth or late measurements cannot push a
// pinned reader out of it. Distance is measured against the full content
// length.
const FOLLOW_REARM_MIN_THRESHOLD_PX = 40;
export const resolveFollowRearmThresholdPx = (scrollLength: number): number =>
    Math.max(FOLLOW_REARM_MIN_THRESHOLD_PX, scrollLength / 2);

export const resolveTimelineIsAtEnd = (
    state: {
        readonly contentLength?: number;
        readonly scroll?: number;
        readonly scrollLength?: number;
        readonly isNearEnd?: boolean;
        readonly isAtEnd?: boolean;
    } | undefined,
): boolean | undefined => {
    if (!state) return undefined;
    const { contentLength, scroll, scrollLength } = state;
    if (
        typeof contentLength === 'number'
        && typeof scroll === 'number'
        && typeof scrollLength === 'number'
        && Number.isFinite(contentLength)
    ) {
        return contentLength - (scroll + scrollLength) <= resolveFollowRearmThresholdPx(scrollLength);
    }
    return state.isNearEnd ?? state.isAtEnd;
};
