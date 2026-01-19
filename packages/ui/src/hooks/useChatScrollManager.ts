import React from 'react';
import { flushSync } from 'react-dom';
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
    scrollToBottom: (options?: { instant?: boolean; force?: boolean; clearAnchor?: boolean }) => void;
    spacerHeight: number;
    pendingAnchorId: string | null;
    hasActiveAnchor: boolean;
}

const ANCHOR_TARGET_OFFSET = 8;
const DEFAULT_SCROLL_BUTTON_THRESHOLD = 40;
const NEW_USER_ANCHOR_WINDOW_MS = 20_000;
const PROGRAMMATIC_SCROLL_SUPPRESS_MS = 200;

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

const getMessageCreatedAt = (message: ChatMessageRecord): number => {
    const info = message.info as { time?: { created?: unknown } };
    const created = info?.time?.created;
    return typeof created === 'number' ? created : 0;
};

export const useChatScrollManager = ({
    currentSessionId,
    sessionMessages,
    streamingMessageId,
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
    const suppressUserScrollUntilRef = React.useRef<number>(0);
    const previousMessageIdsRef = React.useRef<Set<string>>(new Set());
    const lastMessageCountRef = React.useRef<number>(sessionMessages.length);
    const spacerHeightRef = React.useRef(0);

    const anchorIdRef = React.useRef<string | null>(null);
    const pendingRestoreAnchorRef = React.useRef<{ sessionId: string; anchorId: string } | null>(null);

    const userScrollOverrideRef = React.useRef<boolean>(false);

    const currentPhase = currentSessionId
        ? sessionActivityPhase?.get(currentSessionId) ?? 'idle'
        : 'idle';
    const isActivePhase = currentPhase === 'busy' || currentPhase === 'cooldown';

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

    const isSpacerOutOfViewport = React.useCallback((): boolean => {
        const container = scrollRef.current;
        const currentSpacerHeight = spacerHeightRef.current;
        if (!container || currentSpacerHeight <= 0) return true;

        const spacerStartPosition = container.scrollHeight - currentSpacerHeight;
        const viewportBottom = container.scrollTop + container.clientHeight;

        return viewportBottom < spacerStartPosition;
    }, []);

    const clearActiveTurnAnchor = React.useCallback((sessionId: string) => {
        anchorIdRef.current = null;
        lastScrolledAnchorIdRef.current = null;
        pendingRestoreAnchorRef.current = null;
        setAnchorId(null);
        updateSpacerHeight(0);
        updateActiveTurnAnchor(sessionId, null, 0);
    }, [updateActiveTurnAnchor, updateSpacerHeight]);

    const markProgrammaticScroll = React.useCallback(() => {
        suppressUserScrollUntilRef.current = Date.now() + PROGRAMMATIC_SCROLL_SUPPRESS_MS;
    }, []);

    const calculateAnchorPosition = React.useCallback((anchorElement: HTMLElement): number => {
        const messageTop = anchorElement.offsetTop;
        return messageTop - ANCHOR_TARGET_OFFSET;
    }, []);

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

    const scrollToBottom = React.useCallback((options?: { instant?: boolean; force?: boolean; clearAnchor?: boolean }) => {
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
        }

        if (options?.clearAnchor && currentSessionId && anchorIdRef.current) {
            clearActiveTurnAnchor(currentSessionId);
        }

        const bottom = container.scrollHeight - container.clientHeight;
        markProgrammaticScroll();
        scrollEngine.scrollToPosition(Math.max(0, bottom), options);
    }, [clearActiveTurnAnchor, currentPhase, currentSessionId, isSyncing, markProgrammaticScroll, scrollEngine]);

    const scrollToNewAnchor = React.useCallback((messageId: string) => {
        if (lastScrolledAnchorIdRef.current === messageId) {
            return;
        }
        lastScrolledAnchorIdRef.current = messageId;

        setPendingAnchorId(messageId);
        const expectedSessionId = currentSessionIdRef.current;

        window.requestAnimationFrame(() => {
            if (expectedSessionId !== currentSessionIdRef.current) {
                return;
            }

            const container = scrollRef.current;
            if (!container) {
                setPendingAnchorId(null);
                return;
            }

            const anchorElement = container.querySelector(`[data-message-id="${messageId}"]`) as HTMLElement | null;
            if (!anchorElement) {
                setPendingAnchorId(null);
                return;
            }

            const containerHeight = container.clientHeight;
            const targetScrollTop = calculateAnchorPosition(anchorElement);

            const contentHeight = container.scrollHeight;
            const currentSpacer = spacerHeightRef.current;
            const contentWithoutSpacer = contentHeight - currentSpacer;
            const requiredHeight = targetScrollTop + containerHeight;

            let newSpacerHeight = 0;
            if (contentWithoutSpacer < requiredHeight) {
                newSpacerHeight = requiredHeight - contentWithoutSpacer;
            }

            if (newSpacerHeight !== currentSpacer) {
                updateSpacerHeight(newSpacerHeight);
            }

            if (currentSessionIdRef.current) {
                updateActiveTurnAnchor(currentSessionIdRef.current, messageId, newSpacerHeight);
            }

            window.requestAnimationFrame(() => {
                if (expectedSessionId !== currentSessionIdRef.current) {
                    return;
                }

                markProgrammaticScroll();
                scrollEngine.scrollToPosition(Math.max(0, targetScrollTop), { instant: true });

                window.requestAnimationFrame(() => {
                    if (expectedSessionId !== currentSessionIdRef.current) {
                        return;
                    }
                    setPendingAnchorId(null);
                });
            });
        });
    }, [calculateAnchorPosition, markProgrammaticScroll, scrollEngine, updateActiveTurnAnchor, updateSpacerHeight]);

    const handleScrollEvent = React.useCallback((event?: Event) => {
        const container = scrollRef.current;
        if (!container || !currentSessionId) {
            return;
        }

        const isProgrammatic = Date.now() < suppressUserScrollUntilRef.current || pendingAnchorId !== null;

        if (event?.isTrusted && !isProgrammatic) {
            userScrollOverrideRef.current = true;
        }

        scrollEngine.handleScroll();
        updateScrollButtonVisibility();

        if (
            event?.isTrusted &&
            !isProgrammatic &&
            currentPhase === 'idle' &&
            anchorIdRef.current !== null &&
            spacerHeightRef.current > 0 &&
            isSpacerOutOfViewport()
        ) {
            clearActiveTurnAnchor(currentSessionId);
        }

        const { scrollTop, scrollHeight, clientHeight } = container;
        const position = (scrollTop + clientHeight / 2) / Math.max(scrollHeight, 1);
        const estimatedIndex = Math.floor(position * sessionMessages.length);
        updateViewportAnchor(currentSessionId, estimatedIndex);
    }, [
        clearActiveTurnAnchor,
        currentPhase,
        currentSessionId,
        isSpacerOutOfViewport,
        pendingAnchorId,
        scrollEngine,
        sessionMessages.length,
        updateScrollButtonVisibility,
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
        if (!currentSessionId || currentSessionId === lastSessionIdRef.current) {
            return;
        }

        lastSessionIdRef.current = currentSessionId;
        MessageFreshnessDetector.getInstance().recordSessionStart(currentSessionId);

        previousMessageIdsRef.current = new Set(
            sessionMessages.map(getMessageId).filter((id): id is string => Boolean(id))
        );
        lastMessageCountRef.current = sessionMessages.length;

        if (isActivePhase) {
            const persistedAnchor = getActiveTurnAnchor(currentSessionId);
            if (persistedAnchor && persistedAnchor.anchorId) {
                anchorIdRef.current = persistedAnchor.anchorId;
                lastScrolledAnchorIdRef.current = persistedAnchor.anchorId;

                const container = scrollRef.current;
                const anchorElement = container
                    ? (container.querySelector(`[data-message-id="${persistedAnchor.anchorId}"]`) as HTMLElement | null)
                    : null;
                const messageHeight = anchorElement?.offsetHeight ?? 0;
                const restoredSpacerHeight = Math.max(0, persistedAnchor.spacerHeight - messageHeight);

                flushSync(() => {
                    setAnchorId(persistedAnchor.anchorId);
                    updateSpacerHeight(restoredSpacerHeight);
                });

                pendingRestoreAnchorRef.current = { sessionId: currentSessionId, anchorId: persistedAnchor.anchorId };
            } else {
                lastScrolledAnchorIdRef.current = null;
                anchorIdRef.current = null;
                setAnchorId(null);
                updateSpacerHeight(0);
                pendingRestoreAnchorRef.current = null;

                const container = scrollRef.current;
                if (container) {
                    const bottom = container.scrollHeight - container.clientHeight;
                    markProgrammaticScroll();
                    scrollEngine.scrollToPosition(Math.max(0, bottom), { instant: true });
                }
            }
        } else {
            lastScrolledAnchorIdRef.current = null;
            anchorIdRef.current = null;
            setAnchorId(null);
            updateSpacerHeight(0);
            pendingRestoreAnchorRef.current = null;
            updateActiveTurnAnchor(currentSessionId, null, 0);

            const container = scrollRef.current;
            if (container) {
                const bottom = container.scrollHeight - container.clientHeight;
                markProgrammaticScroll();
                scrollEngine.scrollToPosition(Math.max(0, bottom), { instant: true });
            }
        }

        setPendingAnchorId(null);
        setShowScrollButton(false);
        userScrollOverrideRef.current = false;
    }, [
        currentSessionId,
        getActiveTurnAnchor,
        isActivePhase,
        markProgrammaticScroll,
        scrollEngine,
        updateActiveTurnAnchor,
        updateSpacerHeight,
        sessionMessages,
    ]);

    useIsomorphicLayoutEffect(() => {
        if (typeof window === 'undefined') return;
        if (!currentSessionId) return;

        const pending = pendingRestoreAnchorRef.current;
        if (!pending || pending.sessionId !== currentSessionId) return;

        const container = scrollRef.current;
        if (!container) return;

        const anchorInList = sessionMessages.some((message) => getMessageId(message) === pending.anchorId);
        if (!anchorInList) {
            clearActiveTurnAnchor(currentSessionId);
            return;
        }

        const anchorElement = container.querySelector(`[data-message-id="${pending.anchorId}"]`) as HTMLElement | null;
        if (!anchorElement) return;

        const targetScrollTop = calculateAnchorPosition(anchorElement);
        markProgrammaticScroll();
        scrollEngine.scrollToPosition(targetScrollTop, { instant: true });
        pendingRestoreAnchorRef.current = null;
    }, [calculateAnchorPosition, clearActiveTurnAnchor, currentSessionId, markProgrammaticScroll, scrollEngine, sessionMessages]);

    useIsomorphicLayoutEffect(() => {
        if (isSyncing) {
            return;
        }

        if (lastSessionIdRef.current !== currentSessionId) {
            return;
        }

        const previousIds = previousMessageIdsRef.current;
        const nextIds = new Set(sessionMessages.map(getMessageId).filter((id): id is string => Boolean(id)));
        const nextCount = sessionMessages.length;

        if (nextCount > lastMessageCountRef.current) {
            const addedIds: string[] = [];
            nextIds.forEach((id) => {
                if (!previousIds.has(id)) {
                    addedIds.push(id);
                }
            });

            if (addedIds.length > 0) {
                const now = Date.now();
                let latestNewUserMessageId: string | null = null;
                let latestNewUserCreatedAt = 0;

                for (let i = 0; i < sessionMessages.length; i++) {
                    const message = sessionMessages[i];
                    const id = getMessageId(message);
                    if (!id || !addedIds.includes(id)) continue;
                    if (!isUserMessage(message)) continue;

                    let createdAt = getMessageCreatedAt(message);
                    if (createdAt <= 0 && (Boolean(streamingMessageId) || isActivePhase)) {
                        createdAt = now;
                    }
                    if (createdAt >= latestNewUserCreatedAt) {
                        latestNewUserCreatedAt = createdAt;
                        latestNewUserMessageId = id;
                    }
                }

                const shouldAnchorNewUser =
                    latestNewUserMessageId !== null &&
                    (Boolean(streamingMessageId) ||
                        isActivePhase ||
                        now - latestNewUserCreatedAt <= NEW_USER_ANCHOR_WINDOW_MS);

                if (shouldAnchorNewUser && latestNewUserMessageId) {
                    anchorIdRef.current = latestNewUserMessageId;
                    setAnchorId(latestNewUserMessageId);
                    scrollToNewAnchor(latestNewUserMessageId);
                }
            }
        }

        lastMessageCountRef.current = nextCount;
        previousMessageIdsRef.current = nextIds;
    }, [currentSessionId, isActivePhase, isSyncing, scrollToNewAnchor, sessionMessages, streamingMessageId]);

    React.useEffect(() => {
        const container = scrollRef.current;
        if (!container || typeof ResizeObserver === 'undefined') return;

        const observer = new ResizeObserver(() => {
            updateScrollButtonVisibility();
        });

        observer.observe(container);

        return () => {
            observer.disconnect();
        };
    }, [updateScrollButtonVisibility]);

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
            updateScrollButtonVisibility();
        }
    }, [anchorId, updateScrollButtonVisibility]);

    React.useEffect(() => {
        updateScrollButtonVisibility();
    }, [spacerHeight, updateScrollButtonVisibility]);

    const animationHandlersRef = React.useRef<Map<string, AnimationHandlers>>(new Map());

    const handleMessageContentChange = React.useCallback(() => {
        updateScrollButtonVisibility();
    }, [updateScrollButtonVisibility]);

    const getAnimationHandlers = React.useCallback((messageId: string): AnimationHandlers => {
        const existing = animationHandlersRef.current.get(messageId);
        if (existing) {
            return existing;
        }

        const handlers: AnimationHandlers = {
            onChunk: () => {
                updateScrollButtonVisibility();
            },
            onComplete: () => {
                updateScrollButtonVisibility();
            },
            onStreamingCandidate: () => {

            },
            onAnimationStart: () => {

            },
            onAnimatedHeightChange: () => {
                updateScrollButtonVisibility();
            },
            onReservationCancelled: () => {

            },
            onReasoningBlock: () => {

            },
        };

        animationHandlersRef.current.set(messageId, handlers);
        return handlers;
    }, [updateScrollButtonVisibility]);

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
