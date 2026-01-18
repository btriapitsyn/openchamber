import React from 'react';
import type { Part } from '@opencode-ai/sdk/v2';

import { MessageFreshnessDetector } from '@/lib/messageFreshness';

import { useScrollEngine } from './useScrollEngine';

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? React.useLayoutEffect : React.useEffect;

export type ContentChangeReason = 'text' | 'structural' | 'permission';

interface ChatMessageRecord {
    info: Record<string, unknown>;
    parts: Part[];
}

interface SessionMemoryState {
    viewportAnchor: number;
    isStreaming: boolean;
    lastAccessedAt: number;
    backgroundMessageCount: number;
    totalAvailableMessages?: number;
    hasMoreAbove?: boolean;
    streamStartTime?: number;
    isZombie?: boolean;
}

type SessionActivityPhase = 'idle' | 'busy' | 'cooldown';

interface UseChatScrollManagerOptions {
    currentSessionId: string | null;
    sessionMessages: ChatMessageRecord[];
    sessionPermissions: unknown[];
    streamingMessageId: string | null;
    sessionMemoryState: Map<string, SessionMemoryState>;
    updateViewportAnchor: (sessionId: string, anchor: number) => void;
    updateActiveTurnAnchor: (sessionId: string, anchorId: string | null, spacerHeight: number) => void;
    getActiveTurnAnchor: (sessionId: string) => { anchorId: string | null; spacerHeight: number } | null;
    isSyncing: boolean;
    isMobile: boolean;
    messageStreamStates: Map<string, unknown>;
    trimToViewportWindow: (sessionId: string, targetSize?: number) => void;
    sessionActivityPhase?: Map<string, SessionActivityPhase>;
}

export interface AnimationHandlers {
    onChunk: () => void;
    onComplete: () => void;
    onStreamingCandidate?: () => void;
    onAnimationStart?: () => void;
    onReservationCancelled?: () => void;
    onReasoningBlock?: () => void;
    onAnimatedHeightChange?: (height: number) => void;
}

interface UseChatScrollManagerResult {
    scrollRef: React.RefObject<HTMLDivElement | null>;
    handleMessageContentChange: (reason?: ContentChangeReason) => void;
    getAnimationHandlers: (messageId: string) => AnimationHandlers;
    showScrollButton: boolean;
    scrollToBottom: (options?: { instant?: boolean; force?: boolean }) => void;
    spacerHeight: number;
    pendingAnchorId: string | null;
    hasActiveAnchor: boolean;
}

const ANCHOR_TARGET_OFFSET = 50;
const DEFAULT_SCROLL_BUTTON_THRESHOLD = 40;
const LONG_MESSAGE_THRESHOLD = 0.20;
const LONG_MESSAGE_VISIBLE_PORTION = 0.10;

const VIEWPORT_RESIZE_DEBOUNCE_MS = 150;
const BOTTOM_EPSILON_PX = 8;

const getMessageId = (message: ChatMessageRecord): string | null => {
    const info = message.info;
    if (typeof info?.id === 'string') {
        return info.id;
    }
    return null;
};

const isUserMessage = (message: ChatMessageRecord): boolean => {
    const info = message.info;
    if (info?.userMessageMarker === true) {
        return true;
    }
    const clientRole = info?.clientRole;
    const serverRole = info?.role;
    return clientRole === 'user' || serverRole === 'user';
};

export const useChatScrollManager = ({
    currentSessionId,
    sessionMessages,
    updateViewportAnchor,
    updateActiveTurnAnchor,
    getActiveTurnAnchor,
    isSyncing,
    isMobile,
    sessionActivityPhase,
}: UseChatScrollManagerOptions): UseChatScrollManagerResult => {
    const scrollRef = React.useRef<HTMLDivElement | null>(null);
    const scrollEngine = useScrollEngine({ containerRef: scrollRef, isMobile });

    const [anchorId, setAnchorId] = React.useState<string | null>(null);
    const [spacerHeight, setSpacerHeight] = React.useState(0);
    const [showScrollButton, setShowScrollButton] = React.useState(false);
    const [pendingAnchorId, setPendingAnchorId] = React.useState<string | null>(null);

    const lastScrolledAnchorIdRef = React.useRef<string | null>(null);
    const lastSessionIdRef = React.useRef<string | null>(null);
    const currentSessionIdRef = React.useRef<string | null>(currentSessionId ?? null);
    const lastMessageCountRef = React.useRef<number>(sessionMessages.length);
    const lastFirstMessageIdRef = React.useRef<string | null>(sessionMessages.length > 0 ? getMessageId(sessionMessages[0]) : null);
    const lastLastMessageIdRef = React.useRef<string | null>(sessionMessages.length > 0 ? getMessageId(sessionMessages[sessionMessages.length - 1]) : null);
    const spacerHeightRef = React.useRef(0);

    const viewportHeightRef = React.useRef<number>(0);
    const resizeTimeoutRef = React.useRef<number | undefined>(undefined);

    const anchorIdRef = React.useRef<string | null>(null);
    const pendingRestoreAnchorRef = React.useRef<{ sessionId: string; anchorId: string } | null>(null);

    const hasAnchoredOnceRef = React.useRef<boolean>(false);
    const userScrollOverrideRef = React.useRef<boolean>(false);
    const previousPhaseRef = React.useRef<SessionActivityPhase | null>(null);

    const currentPhase = currentSessionId
        ? sessionActivityPhase?.get(currentSessionId) ?? 'idle'
        : 'idle';

    React.useEffect(() => {
        currentSessionIdRef.current = currentSessionId ?? null;
    }, [currentSessionId]);

    const updateSpacerHeight = React.useCallback((height: number) => {
        const newHeight = Math.max(0, height);
        if (spacerHeightRef.current !== newHeight) {
            spacerHeightRef.current = newHeight;
            setSpacerHeight(newHeight);
        }
    }, []);

    const updateViewportCache = React.useCallback(() => {
        const container = scrollRef.current;
        if (container) {
            viewportHeightRef.current = container.clientHeight;
        }
    }, []);

    const getAnchorElement = React.useCallback((): HTMLElement | null => {
        if (!anchorId) return null;
        const container = scrollRef.current;
        if (!container) return null;
        return container.querySelector(`[data-message-id="${anchorId}"]`) as HTMLElement | null;
    }, [anchorId]);

    const isSpacerOutOfViewport = React.useCallback((): boolean => {
        const container = scrollRef.current;
        const currentSpacerHeight = spacerHeightRef.current;
        if (!container || currentSpacerHeight <= 0) return true;

        const spacerStartPosition = container.scrollHeight - currentSpacerHeight;
        const viewportBottom = container.scrollTop + container.clientHeight;

        return viewportBottom < spacerStartPosition;
    }, []);

    const isAtBottom = React.useCallback((): boolean => {
        const container = scrollRef.current;
        if (!container) return true;
        const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
        return distanceFromBottom <= BOTTOM_EPSILON_PX;
    }, []);

    const calculateAnchorPosition = React.useCallback((
        anchorElement: HTMLElement,
        containerHeight: number
    ): number => {
        const messageHeight = anchorElement.offsetHeight;
        const messageTop = anchorElement.offsetTop;
        const isLongMessage = messageHeight > containerHeight * LONG_MESSAGE_THRESHOLD;

        if (isLongMessage) {

            const visiblePortion = containerHeight * LONG_MESSAGE_VISIBLE_PORTION;
            const messageBottom = messageTop + messageHeight;
            return messageBottom - visiblePortion;
        } else {

            return messageTop - ANCHOR_TARGET_OFFSET;
        }
    }, []);

    const refreshSpacer = React.useCallback(() => {
        const container = scrollRef.current;

        if (!container || !anchorIdRef.current) {
            return;
        }

        const anchorElement = getAnchorElement();
        if (!anchorElement) {
            return;
        }

        const containerHeight = container.clientHeight;
        const contentHeight = container.scrollHeight;

        const targetScrollTop = calculateAnchorPosition(anchorElement, containerHeight);
        const requiredHeight = targetScrollTop + containerHeight;

        const currentSpacerHeight = spacerHeightRef.current;
        const contentWithoutSpacer = contentHeight - currentSpacerHeight;

        if (!hasAnchoredOnceRef.current && contentWithoutSpacer < requiredHeight) {

            const needed = requiredHeight - contentWithoutSpacer;

            if (needed > currentSpacerHeight) {
                updateSpacerHeight(needed);
                // Persist updated spacer height to store
                if (currentSessionId && anchorIdRef.current) {
                    updateActiveTurnAnchor(currentSessionId, anchorIdRef.current, needed);
                }
            }
        }

    }, [calculateAnchorPosition, currentSessionId, getAnchorElement, updateActiveTurnAnchor, updateSpacerHeight]);

    const updateScrollButtonVisibility = React.useCallback(() => {
        const container = scrollRef.current;
        if (!container) {
            setShowScrollButton(false);
            return;
        }

        if (pendingAnchorId) {
            setShowScrollButton(false);
            return;
        }

        const hasScrollableContent = container.scrollHeight > container.clientHeight;
        if (!hasScrollableContent) {
            setShowScrollButton(false);
            return;
        }

        const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
        const currentSpacerHeight = spacerHeightRef.current;

        if (currentSpacerHeight > 0) {

            const spacerStartPosition = container.scrollHeight - currentSpacerHeight;
            const viewportBottom = container.scrollTop + container.clientHeight;

            setShowScrollButton(viewportBottom < spacerStartPosition);
        } else {

            setShowScrollButton(distanceFromBottom > DEFAULT_SCROLL_BUTTON_THRESHOLD);
        }
    }, [pendingAnchorId]);

    const scrollToBottom = React.useCallback((options?: { instant?: boolean; force?: boolean }) => {
        const container = scrollRef.current;
        if (!container) return;

        const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;

        const shouldRespectUserScroll =
            userScrollOverrideRef.current &&
            currentPhase === 'idle' &&
            !isSyncing &&
            !options?.force &&
            distanceFromBottom > DEFAULT_SCROLL_BUTTON_THRESHOLD;

        if (shouldRespectUserScroll) {
            return;
        }

        if (options?.force) {
            userScrollOverrideRef.current = false;
            if (currentSessionId && anchorIdRef.current) {
                anchorIdRef.current = null;
                hasAnchoredOnceRef.current = false;
                lastScrolledAnchorIdRef.current = null;
                setAnchorId(null);
                pendingRestoreAnchorRef.current = null;
                updateSpacerHeight(0);
                updateActiveTurnAnchor(currentSessionId, null, 0);
            }
        }

        const bottom = container.scrollHeight - container.clientHeight;
        scrollEngine.scrollToPosition(Math.max(0, bottom), options);
    }, [currentPhase, currentSessionId, isSyncing, scrollEngine, updateActiveTurnAnchor, updateSpacerHeight]);

    const scrollToNewAnchor = React.useCallback((messageId: string) => {
        if (lastScrolledAnchorIdRef.current === messageId) {
            return;
        }
        lastScrolledAnchorIdRef.current = messageId;

        setPendingAnchorId(messageId);
        const expectedSessionId = currentSessionIdRef.current;

        const container = scrollRef.current;
        if (!container) {
            setPendingAnchorId(null);
            return;
        }

        const contentHeight = container.scrollHeight;
        const currentSpacer = spacerHeightRef.current;
        const contentWithoutSpacer = contentHeight - currentSpacer;

        const containerHeight = viewportHeightRef.current > 0
            ? viewportHeightRef.current
            : container.clientHeight;

        const estimatedMessageTop = contentWithoutSpacer;

        const targetScrollTop = estimatedMessageTop - ANCHOR_TARGET_OFFSET;

        const requiredHeight = targetScrollTop + containerHeight;
        let newSpacerHeight = 0;
        if (contentWithoutSpacer < requiredHeight) {
            newSpacerHeight = requiredHeight - contentWithoutSpacer;
        }

        if (newSpacerHeight !== currentSpacer) {
            updateSpacerHeight(newSpacerHeight);
        }

        // Persist anchor state to store
        if (currentSessionId) {
            updateActiveTurnAnchor(currentSessionId, messageId, newSpacerHeight);
        }

        hasAnchoredOnceRef.current = true;

        window.requestAnimationFrame(() => {
            if (expectedSessionId !== currentSessionIdRef.current) {
                return;
            }

            scrollEngine.scrollToPosition(targetScrollTop, { instant: true });

            window.requestAnimationFrame(() => {
                if (expectedSessionId !== currentSessionIdRef.current) {
                    return;
                }
                setPendingAnchorId(null);
            });
        });
    }, [currentSessionId, scrollEngine, updateActiveTurnAnchor, updateSpacerHeight]);

    const handleScrollEvent = React.useCallback((event?: Event) => {
        const container = scrollRef.current;
        if (!container || !currentSessionId) {
            return;
        }

        if (event?.isTrusted) {
            userScrollOverrideRef.current = true;
        }

        scrollEngine.handleScroll();
        updateScrollButtonVisibility();

        if (
            event?.isTrusted &&
            anchorIdRef.current !== null &&
            (spacerHeightRef.current > 0 ? !isSpacerOutOfViewport() : isAtBottom())
        ) {
            updateSpacerHeight(0);
            anchorIdRef.current = null;
            hasAnchoredOnceRef.current = false;
            lastScrolledAnchorIdRef.current = null;
            setAnchorId(null);
            pendingRestoreAnchorRef.current = null;
            updateActiveTurnAnchor(currentSessionId, null, 0);
        }

        const { scrollTop, scrollHeight, clientHeight } = container;
        const position = (scrollTop + clientHeight / 2) / Math.max(scrollHeight, 1);
        const estimatedIndex = Math.floor(position * sessionMessages.length);
        updateViewportAnchor(currentSessionId, estimatedIndex);
    }, [
        currentSessionId,
        isAtBottom,
        isSpacerOutOfViewport,
        scrollEngine,
        sessionMessages.length,
        updateActiveTurnAnchor,
        updateScrollButtonVisibility,
        updateSpacerHeight,
        updateViewportAnchor,
    ]);

    React.useEffect(() => {
        const container = scrollRef.current;
        if (!container) return;

        container.addEventListener('scroll', handleScrollEvent as EventListener, { passive: true });

        return () => {
            container.removeEventListener('scroll', handleScrollEvent as EventListener);
        };
    }, [handleScrollEvent]);

    useIsomorphicLayoutEffect(() => {
        if (typeof window === 'undefined') return;

        updateViewportCache();

        const handleResize = () => {

            if (resizeTimeoutRef.current !== undefined) {
                window.clearTimeout(resizeTimeoutRef.current);
            }

            resizeTimeoutRef.current = window.setTimeout(() => {
                updateViewportCache();
            }, VIEWPORT_RESIZE_DEBOUNCE_MS);
        };

        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
            if (resizeTimeoutRef.current !== undefined) {
                window.clearTimeout(resizeTimeoutRef.current);
            }
        };
    }, [updateViewportCache]);

    React.useEffect(() => {
        if (currentSessionId && currentSessionId !== lastSessionIdRef.current) {
            lastSessionIdRef.current = currentSessionId;
            MessageFreshnessDetector.getInstance().recordSessionStart(currentSessionId);
            lastMessageCountRef.current = sessionMessages.length;
            lastFirstMessageIdRef.current = sessionMessages.length > 0 ? getMessageId(sessionMessages[0]) : null;
            lastLastMessageIdRef.current = sessionMessages.length > 0 ? getMessageId(sessionMessages[sessionMessages.length - 1]) : null;

            // Restore persisted anchor state from store
            const persistedAnchor = getActiveTurnAnchor(currentSessionId);
            if (persistedAnchor && persistedAnchor.anchorId) {
                anchorIdRef.current = persistedAnchor.anchorId;
                lastScrolledAnchorIdRef.current = persistedAnchor.anchorId;
                hasAnchoredOnceRef.current = true;
                setAnchorId(persistedAnchor.anchorId);
                updateSpacerHeight(persistedAnchor.spacerHeight);
                pendingRestoreAnchorRef.current = { sessionId: currentSessionId, anchorId: persistedAnchor.anchorId };

                userScrollOverrideRef.current = false;
            } else {
                lastScrolledAnchorIdRef.current = null;
                anchorIdRef.current = null;
                hasAnchoredOnceRef.current = false;
                setAnchorId(null);
                updateSpacerHeight(0);
                pendingRestoreAnchorRef.current = null;

                // Ensure idle/non-anchored sessions snap to bottom on switch
                window.requestAnimationFrame(() => {
                    scrollToBottom({ instant: true, force: true });
                });
            }

            setPendingAnchorId(null);
            setShowScrollButton(false);

            userScrollOverrideRef.current = false;
            // Reset phase tracking to prevent false "transition to idle" detection
            previousPhaseRef.current = null;
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only run on session change, not message changes
    }, [currentPhase, currentSessionId, scrollToBottom, sessionMessages.length, getActiveTurnAnchor]);

    useIsomorphicLayoutEffect(() => {
        if (typeof window === 'undefined') return;
        if (!currentSessionId) return;

        const pending = pendingRestoreAnchorRef.current;
        if (!pending || pending.sessionId !== currentSessionId) return;

        const container = scrollRef.current;
        if (!container) return;

        const anchorInList = sessionMessages.some((message) => getMessageId(message) === pending.anchorId);
        if (!anchorInList) {
            pendingRestoreAnchorRef.current = null;
            anchorIdRef.current = null;
            hasAnchoredOnceRef.current = false;
            lastScrolledAnchorIdRef.current = null;
            setAnchorId(null);
            updateSpacerHeight(0);
            updateActiveTurnAnchor(currentSessionId, null, 0);
            return;
        }

        const anchorElement = container.querySelector(`[data-message-id="${pending.anchorId}"]`) as HTMLElement | null;
        if (!anchorElement) return;

        const containerHeight = container.clientHeight;
        const targetScrollTop = calculateAnchorPosition(anchorElement, containerHeight);
        scrollEngine.scrollToPosition(targetScrollTop, { instant: true });
        pendingRestoreAnchorRef.current = null;
    }, [calculateAnchorPosition, currentSessionId, scrollEngine, sessionMessages, updateActiveTurnAnchor, updateSpacerHeight]);

    useIsomorphicLayoutEffect(() => {

        if (isSyncing) {
            lastMessageCountRef.current = sessionMessages.length;
            lastFirstMessageIdRef.current = sessionMessages.length > 0 ? getMessageId(sessionMessages[0]) : null;
            lastLastMessageIdRef.current = sessionMessages.length > 0 ? getMessageId(sessionMessages[sessionMessages.length - 1]) : null;
            return;
        }

        if (lastSessionIdRef.current !== currentSessionId) {
            return;
        }

        const previousCount = lastMessageCountRef.current;
        const nextCount = sessionMessages.length;

        if (nextCount > previousCount && previousCount > 0) {
            const previousFirstId = lastFirstMessageIdRef.current;
            const newFirstId = getMessageId(sessionMessages[0]);
            const newLastId = getMessageId(sessionMessages[nextCount - 1]);
            const previousLastId = lastLastMessageIdRef.current;

            const firstIdChanged = previousFirstId !== null && newFirstId !== previousFirstId;
            const lastIdChanged = previousLastId !== null && newLastId !== previousLastId;

            const wasPrepended = firstIdChanged && !lastIdChanged;
            const wasAppended = lastIdChanged && !firstIdChanged;

            if (wasPrepended) {
                anchorIdRef.current = null;
                hasAnchoredOnceRef.current = false;
                setAnchorId(null);
                updateSpacerHeight(0);
                lastMessageCountRef.current = nextCount;
                lastFirstMessageIdRef.current = newFirstId;
                lastLastMessageIdRef.current = newLastId;
                return;
            }

            if (wasAppended) {
                const appendedMessages = sessionMessages.slice(previousCount, nextCount);
                const newUserMessage = appendedMessages.find(isUserMessage);

                if (newUserMessage) {
                    const newAnchorId = getMessageId(newUserMessage);
                    if (newAnchorId) {
                        anchorIdRef.current = newAnchorId;
                        setAnchorId(newAnchorId);
                        scrollToNewAnchor(newAnchorId);
                    }
                } else {
                    refreshSpacer();
                }
            }
        }

        lastMessageCountRef.current = nextCount;
        lastFirstMessageIdRef.current = sessionMessages.length > 0 ? getMessageId(sessionMessages[0]) : null;
        lastLastMessageIdRef.current = sessionMessages.length > 0 ? getMessageId(sessionMessages[sessionMessages.length - 1]) : null;
    }, [currentSessionId, isSyncing, refreshSpacer, scrollToNewAnchor, sessionMessages]);

    React.useEffect(() => {
        const container = scrollRef.current;
        if (!container || typeof ResizeObserver === 'undefined') return;

        const observer = new ResizeObserver(() => {
            refreshSpacer();
            updateScrollButtonVisibility();
        });

        observer.observe(container);

        return () => {
            observer.disconnect();
        };
    }, [refreshSpacer, updateScrollButtonVisibility]);

    React.useEffect(() => {
        if (typeof window === 'undefined') {
            updateScrollButtonVisibility();
            return;
        }

        const rafId = window.requestAnimationFrame(() => {
            updateScrollButtonVisibility();
        });

        return () => {
            window.cancelAnimationFrame(rafId);
        };
    }, [currentSessionId, sessionMessages.length, updateScrollButtonVisibility]);

    React.useEffect(() => {
        if (anchorId) {
            refreshSpacer();
            updateScrollButtonVisibility();
        }
    }, [anchorId, refreshSpacer, updateScrollButtonVisibility]);

    React.useEffect(() => {
        const prevPhase = previousPhaseRef.current;
        previousPhaseRef.current = currentPhase;

        // Only clear anchor when session TRANSITIONS to idle (from busy/cooldown)
        // Not when we switch to an already-idle session
        const transitionedToIdle = prevPhase !== null && prevPhase !== 'idle' && currentPhase === 'idle';

        if (
            transitionedToIdle &&
            (spacerHeightRef.current > 0 ? !isSpacerOutOfViewport() : isAtBottom()) &&
            anchorIdRef.current !== null
        ) {
            updateSpacerHeight(0);
            anchorIdRef.current = null;
            hasAnchoredOnceRef.current = false;
            setAnchorId(null);
            // Clear in store as well
            if (currentSessionId) {
                updateActiveTurnAnchor(currentSessionId, null, 0);
            }
        }
    }, [currentPhase, currentSessionId, isAtBottom, isSpacerOutOfViewport, updateActiveTurnAnchor, updateSpacerHeight]);

    React.useEffect(() => {
        updateScrollButtonVisibility();
    }, [spacerHeight, updateScrollButtonVisibility]);

    const animationHandlersRef = React.useRef<Map<string, AnimationHandlers>>(new Map());

    const handleMessageContentChange = React.useCallback(() => {

        refreshSpacer();
        updateScrollButtonVisibility();
    }, [refreshSpacer, updateScrollButtonVisibility]);

    const getAnimationHandlers = React.useCallback((messageId: string): AnimationHandlers => {
        const existing = animationHandlersRef.current.get(messageId);
        if (existing) {
            return existing;
        }

        const handlers: AnimationHandlers = {
            onChunk: () => {

                refreshSpacer();
            },
            onComplete: () => {

                refreshSpacer();
            },
            onStreamingCandidate: () => {

            },
            onAnimationStart: () => {

            },
            onAnimatedHeightChange: () => {

                refreshSpacer();
            },
            onReservationCancelled: () => {

            },
            onReasoningBlock: () => {

            },
        };

        animationHandlersRef.current.set(messageId, handlers);
        return handlers;
    }, [refreshSpacer]);

    return {
        scrollRef,
        handleMessageContentChange,
        getAnimationHandlers,
        showScrollButton,
        scrollToBottom,
        spacerHeight,
        pendingAnchorId,
        hasActiveAnchor: anchorId !== null,
    };
};
