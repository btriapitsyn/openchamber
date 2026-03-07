import React from 'react';

import type { ChatMessageEntry } from '../lib/turns/types';
import type { MessageListHandle } from '../MessageList';
import { TURN_WINDOW_DEFAULTS } from '../lib/turns/constants';
import {
    buildTurnWindowModel,
    clampTurnStart,
    getInitialTurnStart,
    windowMessagesByTurn,
    type TurnWindowModel,
} from '../lib/turns/windowTurns';
import { deriveTurnHistorySignals, type TurnHistorySignals } from '../lib/turns/historySignals';
import { getMemoryLimits, type SessionMemoryState } from '@/stores/types/sessionTypes';
import { isNearTop } from '../lib/scroll/scrollIntent';

const HISTORY_REVEAL_SCROLL_THRESHOLD = 200;
const HISTORY_REVEAL_COOLDOWN_MS = 180;

const waitForFrames = async (count = 1): Promise<void> => {
    if (typeof window === 'undefined') {
        return;
    }
    for (let index = 0; index < count; index += 1) {
        await new Promise<void>((resolve) => {
            window.requestAnimationFrame(() => resolve());
        });
    }
};

type ViewportAnchor = { messageId: string; offsetTop: number };

interface UseChatTimelineControllerOptions {
    sessionId: string | null;
    messages: ChatMessageEntry[];
    memoryState: SessionMemoryState | null;
    scrollRef: React.RefObject<HTMLDivElement | null>;
    messageListRef: React.RefObject<MessageListHandle | null>;
    loadMoreMessages: (sessionId: string, direction: 'up' | 'down') => Promise<void>;
    scrollToBottom: (options?: { instant?: boolean; force?: boolean }) => void;
    isPinned: boolean;
    isOverflowing: boolean;
}

export interface UseChatTimelineControllerResult {
    turnIds: string[];
    turnStart: number;
    renderedMessages: ChatMessageEntry[];
    historySignals: TurnHistorySignals;
    isLoadingOlder: boolean;
    pendingRevealWork: boolean;
    activeTurnId: string | null;
    showScrollToBottom: boolean;
    turnWindowModel: TurnWindowModel;
    loadEarlier: () => Promise<void>;
    revealBufferedTurns: () => Promise<boolean>;
    resumeToBottom: () => void;
    scrollToTurn: (turnId: string, options?: { behavior?: ScrollBehavior }) => Promise<boolean>;
    scrollToMessage: (messageId: string, options?: { behavior?: ScrollBehavior }) => Promise<boolean>;
    captureViewportAnchor: () => ViewportAnchor | null;
    restoreViewportAnchor: (anchor: ViewportAnchor) => boolean;
    handleActiveTurnChange: (turnId: string | null) => void;
}

export const useChatTimelineController = ({
    sessionId,
    messages,
    memoryState,
    scrollRef,
    messageListRef,
    loadMoreMessages,
    scrollToBottom,
    isPinned,
    isOverflowing,
}: UseChatTimelineControllerOptions): UseChatTimelineControllerResult => {
    const turnWindowModel = React.useMemo(() => buildTurnWindowModel(messages), [messages]);

    const [turnStart, setTurnStart] = React.useState(() => getInitialTurnStart(turnWindowModel.turnCount));
    const [isLoadingOlder, setIsLoadingOlder] = React.useState(false);
    const [pendingRevealWork, setPendingRevealWork] = React.useState(false);
    const [activeTurnId, setActiveTurnId] = React.useState<string | null>(null);

    const turnModelRef = React.useRef(turnWindowModel);
    const turnStartRef = React.useRef(turnStart);
    const isPinnedRef = React.useRef(isPinned);
    const isLoadingOlderRef = React.useRef(isLoadingOlder);
    const pendingRevealWorkRef = React.useRef(pendingRevealWork);
    const sessionIdRef = React.useRef<string | null>(sessionId);
    const previousTurnCountRef = React.useRef(turnWindowModel.turnCount);
    const initializedSessionRef = React.useRef<string | null>(null);

    const historySignals = React.useMemo(() => {
        return deriveTurnHistorySignals({
            memoryState,
            loadedMessageCount: messages.length,
            loadedTurnCount: turnWindowModel.turnCount,
            turnStart,
            defaultHistoryLimit: getMemoryLimits().HISTORICAL_MESSAGES,
        });
    }, [memoryState, messages.length, turnStart, turnWindowModel.turnCount]);

    const historySignalsRef = React.useRef(historySignals);

    React.useEffect(() => {
        turnModelRef.current = turnWindowModel;
    }, [turnWindowModel]);

    React.useEffect(() => {
        turnStartRef.current = turnStart;
    }, [turnStart]);

    React.useEffect(() => {
        isPinnedRef.current = isPinned;
    }, [isPinned]);

    React.useEffect(() => {
        isLoadingOlderRef.current = isLoadingOlder;
    }, [isLoadingOlder]);

    React.useEffect(() => {
        pendingRevealWorkRef.current = pendingRevealWork;
    }, [pendingRevealWork]);

    React.useEffect(() => {
        historySignalsRef.current = historySignals;
    }, [historySignals]);

    React.useEffect(() => {
        sessionIdRef.current = sessionId;
    }, [sessionId]);

    React.useEffect(() => {
        if (initializedSessionRef.current === sessionId) {
            return;
        }
        initializedSessionRef.current = sessionId;
        setTurnStart(getInitialTurnStart(turnWindowModel.turnCount));
        setIsLoadingOlder(false);
        setPendingRevealWork(false);
        setActiveTurnId(null);
        previousTurnCountRef.current = turnWindowModel.turnCount;
    }, [sessionId, turnWindowModel.turnCount]);

    React.useEffect(() => {
        setTurnStart((current) => clampTurnStart(current, turnWindowModel.turnCount));
    }, [turnWindowModel.turnCount]);

    React.useEffect(() => {
        const previousTurnCount = previousTurnCountRef.current;
        const nextTurnCount = turnWindowModel.turnCount;
        if (previousTurnCount === nextTurnCount) {
            return;
        }

        setTurnStart((current) => {
            const previousInitial = getInitialTurnStart(previousTurnCount);
            const nextInitial = getInitialTurnStart(nextTurnCount);
            if (isPinnedRef.current && current === previousInitial) {
                return nextInitial;
            }
            return clampTurnStart(current, nextTurnCount);
        });

        previousTurnCountRef.current = nextTurnCount;
    }, [turnWindowModel.turnCount]);

    const renderedMessages = React.useMemo(() => {
        return windowMessagesByTurn(messages, turnWindowModel, turnStart);
    }, [messages, turnStart, turnWindowModel]);

    const captureViewportAnchor = React.useCallback((): ViewportAnchor | null => {
        return messageListRef.current?.captureViewportAnchor() ?? null;
    }, [messageListRef]);

    const restoreViewportAnchor = React.useCallback((anchor: ViewportAnchor): boolean => {
        return messageListRef.current?.restoreViewportAnchor(anchor) ?? false;
    }, [messageListRef]);

    const restoreViewportWithFallback = React.useCallback((input: {
        anchor: ViewportAnchor | null;
        previousHeight: number | null;
        previousTop: number | null;
    }) => {
        const container = scrollRef.current;
        if (input.anchor && restoreViewportAnchor(input.anchor)) {
            return;
        }

        if (!container || input.previousHeight === null || input.previousTop === null) {
            return;
        }

        const heightDelta = container.scrollHeight - input.previousHeight;
        if (heightDelta !== 0) {
            container.scrollTop = input.previousTop + heightDelta;
        }
    }, [restoreViewportAnchor, scrollRef]);

    const revealBufferedTurns = React.useCallback(async (): Promise<boolean> => {
        if (turnStartRef.current <= 0 || pendingRevealWorkRef.current) {
            return false;
        }

        const anchor = captureViewportAnchor();
        const container = scrollRef.current;
        const previousHeight = container?.scrollHeight ?? null;
        const previousTop = container?.scrollTop ?? null;

        setPendingRevealWork(true);
        setTurnStart((current) => {
            const next = current - TURN_WINDOW_DEFAULTS.batchTurns;
            return next > 0 ? next : 0;
        });

        await waitForFrames(2);
        restoreViewportWithFallback({
            anchor,
            previousHeight,
            previousTop,
        });
        setPendingRevealWork(false);
        return true;
    }, [captureViewportAnchor, restoreViewportWithFallback, scrollRef]);

    const fetchOlderHistory = React.useCallback(async (input: {
        preserveViewport: boolean;
    }): Promise<boolean> => {
        if (!sessionIdRef.current || isLoadingOlderRef.current) {
            return false;
        }
        if (!historySignalsRef.current.hasMoreAboveTurns) {
            return false;
        }

        const anchor = input.preserveViewport ? captureViewportAnchor() : null;
        const container = scrollRef.current;
        const previousHeight = input.preserveViewport ? (container?.scrollHeight ?? null) : null;
        const previousTop = input.preserveViewport ? (container?.scrollTop ?? null) : null;

        setPendingRevealWork(true);
        setIsLoadingOlder(true);

        try {
            const targetSessionId = sessionIdRef.current;
            if (!targetSessionId) {
                return false;
            }

            await loadMoreMessages(targetSessionId, 'up');
            await waitForFrames(2);

            if (input.preserveViewport) {
                restoreViewportWithFallback({
                    anchor,
                    previousHeight,
                    previousTop,
                });
            }

            return true;
        } finally {
            setIsLoadingOlder(false);
            setPendingRevealWork(false);
        }
    }, [captureViewportAnchor, loadMoreMessages, restoreViewportWithFallback, scrollRef]);

    const loadEarlier = React.useCallback(async () => {
        if (await revealBufferedTurns()) {
            return;
        }

        void (await fetchOlderHistory({ preserveViewport: true }));
    }, [fetchOlderHistory, revealBufferedTurns]);

    const scrollToTurn = React.useCallback(async (
        turnId: string,
        options?: { behavior?: ScrollBehavior },
    ): Promise<boolean> => {
        if (!turnId || !sessionIdRef.current) {
            return false;
        }

        setPendingRevealWork(true);

        try {
            for (let attempt = 0; attempt < 10; attempt += 1) {
                if (sessionIdRef.current !== sessionId) {
                    return false;
                }

                const turnIndex = turnModelRef.current.turnIndexById.get(turnId);
                if (typeof turnIndex === 'number') {
                    if (turnIndex < turnStartRef.current) {
                        setTurnStart(turnIndex);
                        await waitForFrames(2);
                    }

                    const didScroll = messageListRef.current?.scrollToTurnId(turnId, {
                        behavior: options?.behavior,
                    }) ?? false;

                    if (didScroll) {
                        setActiveTurnId(turnId);
                        return true;
                    }

                    await waitForFrames(2);
                    continue;
                }

                const fetched = await fetchOlderHistory({ preserveViewport: false });
                if (!fetched) {
                    return false;
                }
            }

            return false;
        } finally {
            setPendingRevealWork(false);
        }
    }, [fetchOlderHistory, messageListRef, sessionId]);

    const scrollToMessage = React.useCallback(async (
        messageId: string,
        options?: { behavior?: ScrollBehavior },
    ): Promise<boolean> => {
        if (!messageId || !sessionIdRef.current) {
            return false;
        }

        setPendingRevealWork(true);

        try {
            for (let attempt = 0; attempt < 10; attempt += 1) {
                if (sessionIdRef.current !== sessionId) {
                    return false;
                }

                const turnId = turnModelRef.current.messageToTurnId.get(messageId);
                const turnIndex = turnModelRef.current.messageToTurnIndex.get(messageId);

                if (typeof turnIndex === 'number') {
                    if (turnIndex < turnStartRef.current) {
                        setTurnStart(turnIndex);
                        await waitForFrames(2);
                    }

                    const didScroll = messageListRef.current?.scrollToMessageId(messageId, {
                        behavior: options?.behavior,
                    }) ?? false;
                    if (didScroll) {
                        if (turnId) {
                            setActiveTurnId(turnId);
                        }
                        return true;
                    }

                    await waitForFrames(2);
                    continue;
                }

                const fetched = await fetchOlderHistory({ preserveViewport: false });
                if (!fetched) {
                    return false;
                }
            }

            return false;
        } finally {
            setPendingRevealWork(false);
        }
    }, [fetchOlderHistory, messageListRef, sessionId]);

    const resumeToBottom = React.useCallback(() => {
        const nextStart = getInitialTurnStart(turnModelRef.current.turnCount);
        setTurnStart(nextStart);
        setPendingRevealWork(false);
        setIsLoadingOlder(false);
        scrollToBottom({ force: true });
    }, [scrollToBottom]);

    React.useEffect(() => {
        const container = scrollRef.current;
        if (!container) {
            return;
        }

        let cooldownUntil = 0;
        const onScroll = () => {
            if (isPinnedRef.current) {
                return;
            }

            if (!isNearTop(container.scrollTop, HISTORY_REVEAL_SCROLL_THRESHOLD)) {
                return;
            }

            const now = Date.now();
            if (now < cooldownUntil) {
                return;
            }
            cooldownUntil = now + HISTORY_REVEAL_COOLDOWN_MS;

            if (turnStartRef.current > 0) {
                void revealBufferedTurns();
                return;
            }

            if (historySignalsRef.current.hasMoreAboveTurns && !isLoadingOlderRef.current) {
                void fetchOlderHistory({ preserveViewport: true });
            }
        };

        container.addEventListener('scroll', onScroll, { passive: true });
        return () => {
            container.removeEventListener('scroll', onScroll);
        };
    }, [fetchOlderHistory, revealBufferedTurns, scrollRef]);

    const handleActiveTurnChange = React.useCallback((turnId: string | null) => {
        setActiveTurnId(turnId);
    }, []);

    return {
        turnIds: turnWindowModel.turnIds,
        turnStart,
        renderedMessages,
        historySignals,
        isLoadingOlder,
        pendingRevealWork,
        activeTurnId,
        showScrollToBottom: isOverflowing && !isPinned && !pendingRevealWork,
        turnWindowModel,
        loadEarlier,
        revealBufferedTurns,
        resumeToBottom,
        scrollToTurn,
        scrollToMessage,
        captureViewportAnchor,
        restoreViewportAnchor,
        handleActiveTurnChange,
    };
};
