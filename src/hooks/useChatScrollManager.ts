import React from 'react';
import type { Part } from '@opencode-ai/sdk';
import type { Permission } from '@/types/permission';

import { MessageFreshnessDetector } from '@/lib/messageFreshness';
import { ACTIVE_SESSION_WINDOW } from '@/stores/types/sessionTypes';

import { useScrollEngine } from './useScrollEngine';

type MessageStreamLifecycle = {
    phase: 'streaming' | 'cooldown' | 'completed';
    startedAt: number;
    lastUpdateAt: number;
    completedAt?: number;
};

export type ContentChangeReason = 'text' | 'structural' | 'permission';

interface AnimationHoldState {
    messageId: string;
    targetHeight: number;
    isHolding: boolean;
}

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

interface UseChatScrollManagerOptions {
    currentSessionId: string | null;
    sessionMessages: ChatMessageRecord[];
    sessionPermissions: Permission[];
    streamingMessageId: string | null;
    sessionMemoryState: Map<string, SessionMemoryState>;
    updateViewportAnchor: (sessionId: string, anchor: number) => void;
    isSyncing: boolean;
    isMobile: boolean;
    messageStreamStates: Map<string, MessageStreamLifecycle>;
    trimToViewportWindow: (sessionId: string, targetSize?: number) => void;
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
    scrollToBottom: () => void;
}

const VIEWPORT_UPDATE_DELAY = 250;
const ANIMATION_VIEWPORT_RATIO = 0.4;

export const useChatScrollManager = ({
    currentSessionId,
    sessionMessages,
    sessionPermissions,
    streamingMessageId,
    sessionMemoryState,
    updateViewportAnchor,
    isSyncing,
    isMobile,
    messageStreamStates,
    trimToViewportWindow,
}: UseChatScrollManagerOptions): UseChatScrollManagerResult => {
    const scrollRef = React.useRef<HTMLDivElement | null>(null);
    const scrollEngine = useScrollEngine({ containerRef: scrollRef, isMobile });
    const isPinned = scrollEngine.isPinned;

    const viewportAnchorTimeoutRef = React.useRef<number | null>(null);
    const lastSessionIdRef = React.useRef<string | null>(null);
    const lastMessageCountRef = React.useRef<number>(sessionMessages.length);
    const previousLifecycleStatesRef = React.useRef<Map<string, MessageStreamLifecycle>>(new Map());
    const pendingInitialAutoScrollRef = React.useRef(false);
    const [animationHold, setAnimationHold] = React.useState<AnimationHoldState | null>(null);
    const [autoScrollLocked, setAutoScrollLocked] = React.useState(false);
    const autoScrollLockedRef = React.useRef(false);

    const setAutoScrollLockedState = React.useCallback((locked: boolean) => {
        autoScrollLockedRef.current = locked;
        setAutoScrollLocked(locked);
    }, []);

    const flushIfPinned = React.useCallback(() => {
        if (autoScrollLockedRef.current) {
            return;
        }
        if (scrollEngine.isManualOverrideActive()) {
            return;
        }
        if (!scrollEngine.isPinned) {
            return;
        }
        scrollEngine.flushToBottom();
    }, [scrollEngine]);

    const cleanViewportAnchorTimeout = React.useCallback(() => {
        if (viewportAnchorTimeoutRef.current !== null && typeof window !== 'undefined') {
            window.clearTimeout(viewportAnchorTimeoutRef.current);
            viewportAnchorTimeoutRef.current = null;
        }
    }, []);

    const handleViewportAnchorUpdate = React.useCallback(
        (container: HTMLDivElement) => {
            if (!currentSessionId) return;

            const { scrollTop, scrollHeight, clientHeight } = container;
            const position = (scrollTop + clientHeight / 2) / Math.max(scrollHeight, 1);
            const estimatedIndex = Math.floor(position * sessionMessages.length);

            cleanViewportAnchorTimeout();
            if (typeof window === 'undefined') {
                updateViewportAnchor(currentSessionId, estimatedIndex);
                return;
            }

            viewportAnchorTimeoutRef.current = window.setTimeout(() => {
                updateViewportAnchor(currentSessionId, estimatedIndex);
                viewportAnchorTimeoutRef.current = null;
            }, VIEWPORT_UPDATE_DELAY);
        },
        [cleanViewportAnchorTimeout, currentSessionId, sessionMessages.length, updateViewportAnchor]
    );

    const beginAnimationHoldTracking = React.useCallback((messageId: string) => {
        if (!scrollEngine.isPinned) {
            return;
        }

        const container = scrollRef.current;
        if (!container) {
            return;
        }

        const viewportHeight = container.clientHeight;
        if (viewportHeight <= 0) {
            return;
        }

        const targetHeight = Math.max(0, Math.round(viewportHeight * ANIMATION_VIEWPORT_RATIO));
        flushIfPinned();

        setAnimationHold((prev) => {
            if (prev && prev.messageId !== messageId) {
                return prev;
            }

            return {
                messageId,
                targetHeight,
                isHolding: false,
            };
        });
    }, [scrollEngine.isPinned, flushIfPinned]);

    const holdManualReturnRef = React.useRef(false);

    const releaseAnimationHold = React.useCallback((messageId?: string) => {
        let shouldUnlock = false;
        setAnimationHold((prev) => {
            if (!prev) {
                return prev;
            }
            if (messageId && prev.messageId !== messageId) {
                return prev;
            }

            shouldUnlock = prev.isHolding;
            return null;
        });

        if (shouldUnlock) {
            setAutoScrollLockedState(false);
            holdManualReturnRef.current = false;
        }
    }, [setAutoScrollLockedState]);

    const handleAnimatedHeightChange = React.useCallback((messageId: string, renderedHeight: number) => {
        setAnimationHold((prev) => {
            if (!prev || prev.messageId !== messageId) {
                return prev;
            }

            if (prev.isHolding) {
                return prev;
            }

            if (renderedHeight >= prev.targetHeight) {
                setAutoScrollLockedState(true);
                holdManualReturnRef.current = false;
                return { ...prev, isHolding: true };
            }

            flushIfPinned();
            return prev;
        });
    }, [flushIfPinned, setAutoScrollLockedState, scrollEngine]);

    const handleScrollEvent = React.useCallback(() => {
        const container = scrollRef.current;
        if (!container || !currentSessionId) {
            return;
        }

        scrollEngine.handleScroll();
        if (animationHold?.isHolding && !scrollEngine.isPinned) {
            holdManualReturnRef.current = true;
        }

        handleViewportAnchorUpdate(container);
    }, [
        currentSessionId,
        handleViewportAnchorUpdate,
        scrollEngine,
        animationHold,
    ]);

    React.useEffect(() => {
        const container = scrollRef.current;
        if (!container) return;

        const onScroll = () => handleScrollEvent();

        container.addEventListener('scroll', onScroll, { passive: true });

        return () => {
            container.removeEventListener('scroll', onScroll);
            cleanViewportAnchorTimeout();
        };
    }, [cleanViewportAnchorTimeout, handleScrollEvent]);

    React.useEffect(() => {
        if (currentSessionId && currentSessionId !== lastSessionIdRef.current) {
            lastSessionIdRef.current = currentSessionId;
            MessageFreshnessDetector.getInstance().recordSessionStart(currentSessionId);
            pendingInitialAutoScrollRef.current = true;
            lastMessageCountRef.current = 0;

            scrollEngine.scrollToBottom();
        }
    }, [currentSessionId, scrollEngine]);

    React.useEffect(() => {
        if (!currentSessionId) {
            return;
        }

        if (!pendingInitialAutoScrollRef.current) {
            return;
        }

        if (sessionMessages.length === 0) {
            return;
        }

        pendingInitialAutoScrollRef.current = false;

        const performScroll = () => {
            scrollEngine.flushToBottom();
            const anchorIndex = Math.max(0, sessionMessages.length - 1);
            updateViewportAnchor(currentSessionId, anchorIndex);
        };

        if (typeof window === 'undefined') {
            performScroll();
        } else {
            window.requestAnimationFrame(() => {
                window.requestAnimationFrame(performScroll);
            });
        }
    }, [currentSessionId, scrollEngine, sessionMessages.length, updateViewportAnchor]);

    React.useEffect(() => {
        if (isSyncing) {
            lastMessageCountRef.current = sessionMessages.length;
            return;
        }

        const previousCount = lastMessageCountRef.current;
        const nextCount = sessionMessages.length;

        if (nextCount > previousCount) {
            if (pendingInitialAutoScrollRef.current) {
                pendingInitialAutoScrollRef.current = false;

                if (currentSessionId) {
                    const anchorIndex = Math.max(0, nextCount - 1);
                    updateViewportAnchor(currentSessionId, anchorIndex);
                }

                const runFlush = () => {
                    scrollEngine.flushToBottom();
                };

                if (typeof window === 'undefined') {
                    runFlush();
                } else {
                    window.requestAnimationFrame(runFlush);
                }
            } else {
                const newMessage = sessionMessages[nextCount - 1];

                if (newMessage?.info?.role === 'user') {
                    releaseAnimationHold();
                    scrollEngine.scrollToBottom();
                } else {
                    if (scrollEngine.isPinned) {
                        scrollEngine.flushToBottom();
                    } else {
                        flushIfPinned();
                    }
                }
            }
        }

        lastMessageCountRef.current = nextCount;
    }, [currentSessionId, flushIfPinned, isPinned, isSyncing, releaseAnimationHold, scrollEngine, sessionMessages, updateViewportAnchor]);

    React.useEffect(() => {
        if (!streamingMessageId) {
            return;
        }

        flushIfPinned();
    }, [flushIfPinned, streamingMessageId]);

    React.useEffect(() => {
        const previousStates = previousLifecycleStatesRef.current;
        const nextStates = messageStreamStates;

        previousStates.forEach((previousLifecycle, messageId) => {
            if (previousLifecycle.phase !== 'completed' && !nextStates.has(messageId)) {
                flushIfPinned();
            }
        });

        previousLifecycleStatesRef.current = new Map(nextStates);
    }, [flushIfPinned, messageStreamStates]);

    React.useEffect(() => {
        if (!animationHold) {
            if (autoScrollLocked) {
                setAutoScrollLockedState(false);
            }
            return;
        }

        if (!animationHold.isHolding) {
            return;
        }

        if (holdManualReturnRef.current && scrollEngine.isPinned) {
            releaseAnimationHold(animationHold.messageId);
        }
    }, [animationHold, releaseAnimationHold, scrollEngine.isPinned, autoScrollLocked, setAutoScrollLockedState]);

    React.useEffect(() => {
        releaseAnimationHold();
    }, [currentSessionId, releaseAnimationHold]);

    const handleMessageContentChange = React.useCallback((reason: ContentChangeReason = 'text') => {
        if (reason === 'text') {
            return;
        }
        flushIfPinned();
    }, [flushIfPinned]);

    const animationHandlersRef = React.useRef<Map<string, AnimationHandlers>>(new Map());
    const previousPermissionIdsRef = React.useRef<string[]>(sessionPermissions.map((permission) => permission.id));

    React.useEffect(() => {
        const previousIds = previousPermissionIdsRef.current;
        const nextIds = sessionPermissions.map((permission) => permission.id);

        const hasNewPermission = nextIds.some((id) => !previousIds.includes(id));
        previousPermissionIdsRef.current = nextIds;

        if (!hasNewPermission) {
            return;
        }

        flushIfPinned();
    }, [flushIfPinned, sessionPermissions]);

    React.useEffect(() => {
        // Auto-trim when near the bottom to prevent unbounded lists during long sessions
        if (!currentSessionId) {
            return;
        }

        const limit = ACTIVE_SESSION_WINDOW;
        const messageCount = sessionMessages.length;

        if (messageCount <= limit) {
            return;
        }

        const memoryState = sessionMemoryState.get(currentSessionId);
        if (!memoryState || memoryState.isStreaming) {
            return;
        }

        const anchor = typeof memoryState.viewportAnchor === 'number' ? memoryState.viewportAnchor : messageCount - 1;
        const bottomThreshold = Math.max(0, messageCount - Math.ceil(limit / 3));

        if (anchor < bottomThreshold) {
            return;
        }

        trimToViewportWindow(currentSessionId, limit);
    }, [
        currentSessionId,
        sessionMessages.length,
        sessionMemoryState,
        trimToViewportWindow,
    ]);

    const getAnimationHandlers = React.useCallback((messageId: string): AnimationHandlers => {
        const existing = animationHandlersRef.current.get(messageId);
        if (existing) {
            return existing;
        }

        const handlers: AnimationHandlers = {
            onChunk: () => handleMessageContentChange('text'),
            onComplete: () => {
                // keep hold active until the user scrolls back to bottom
            },
            onStreamingCandidate: () => beginAnimationHoldTracking(messageId),
            onAnimationStart: () => {
                // noop placeholder to preserve API compatibility
            },
            onAnimatedHeightChange: (height: number) => {
                handleAnimatedHeightChange(messageId, height);
            },
            onReservationCancelled: () => {
                releaseAnimationHold(messageId);
            },
            onReasoningBlock: () => {
                releaseAnimationHold(messageId);
            },
        };

        animationHandlersRef.current.set(messageId, handlers);
        return handlers;
    }, [
        handleMessageContentChange,
        beginAnimationHoldTracking,
        handleAnimatedHeightChange,
        releaseAnimationHold,
    ]);

    return {
        scrollRef,
        handleMessageContentChange,
        getAnimationHandlers,
        showScrollButton: scrollEngine.showScrollButton,
        scrollToBottom: scrollEngine.scrollToBottom,
    };
};
