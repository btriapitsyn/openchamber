import React from 'react';
import type { Part } from '@opencode-ai/sdk';

import { MessageFreshnessDetector } from '@/lib/messageFreshness';

import { useScrollEngine } from './useScrollEngine';

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
    scrollToBottom: (options?: { instant?: boolean }) => void;
    spacerHeight: number;
}

// Constants for anchor positioning
const ANCHOR_TARGET_OFFSET = 24; // px from top of viewport for short messages
const DEFAULT_SCROLL_BUTTON_THRESHOLD = 40; // px tolerance when no spacer
const LONG_MESSAGE_THRESHOLD = 0.20; // 20% of viewport = "long" message
const LONG_MESSAGE_VISIBLE_PORTION = 0.10; // Show bottom 10% of long messages

/**
 * Extract message ID from a message record
 */
const getMessageId = (message: ChatMessageRecord): string | null => {
    const info = message.info;
    if (typeof info?.id === 'string') {
        return info.id;
    }
    return null;
};

/**
 * Check if a message is from the user
 */
const isUserMessage = (message: ChatMessageRecord): boolean => {
    const info = message.info;
    if (info?.userMessageMarker === true) {
        return true;
    }
    const clientRole = info?.clientRole;
    const serverRole = info?.role;
    return clientRole === 'user' || serverRole === 'user';
};

/**
 * Find the last user message ID in the message list
 */
const findLastUserMessageId = (messages: ChatMessageRecord[]): string | null => {
    for (let i = messages.length - 1; i >= 0; i--) {
        const message = messages[i];
        if (isUserMessage(message)) {
            return getMessageId(message);
        }
    }
    return null;
};

export const useChatScrollManager = ({
    currentSessionId,
    sessionMessages,
    updateViewportAnchor,
    isSyncing,
    isMobile,
    sessionActivityPhase,
}: UseChatScrollManagerOptions): UseChatScrollManagerResult => {
    const scrollRef = React.useRef<HTMLDivElement | null>(null);
    const scrollEngine = useScrollEngine({ containerRef: scrollRef, isMobile });

    // Active anchor state
    const [anchorId, setAnchorId] = React.useState<string | null>(null);
    const [spacerHeight, setSpacerHeight] = React.useState(0);
    const [showScrollButton, setShowScrollButton] = React.useState(false);

    // Refs for debouncing and tracking
    const lastScrolledAnchorIdRef = React.useRef<string | null>(null);
    const lastSessionIdRef = React.useRef<string | null>(null);
    const lastMessageCountRef = React.useRef<number>(sessionMessages.length);
    const anchorElementRef = React.useRef<HTMLElement | null>(null);
    const spacerHeightRef = React.useRef(0);

    // Get current session's activity phase
    const currentPhase = currentSessionId
        ? sessionActivityPhase?.get(currentSessionId) ?? 'idle'
        : 'idle';

    // Helper to update spacer height (both state and ref)
    const updateSpacerHeight = React.useCallback((height: number) => {
        const newHeight = Math.max(0, height);
        if (spacerHeightRef.current !== newHeight) {
            spacerHeightRef.current = newHeight;
            setSpacerHeight(newHeight);
        }
    }, []);

    /**
     * Get the DOM element for the anchor message
     */
    const getAnchorElement = React.useCallback((): HTMLElement | null => {
        if (!anchorId) return null;
        const container = scrollRef.current;
        if (!container) return null;
        return container.querySelector(`[data-message-id="${anchorId}"]`) as HTMLElement | null;
    }, [anchorId]);

    /**
     * Check if the spacer is fully out of viewport (scrolled past it)
     */
    const isSpacerOutOfViewport = React.useCallback((): boolean => {
        const container = scrollRef.current;
        const currentSpacerHeight = spacerHeightRef.current;
        if (!container || currentSpacerHeight <= 0) return true;

        // Spacer is at the bottom of content
        // Spacer start position = scrollHeight - spacerHeight
        const spacerStartPosition = container.scrollHeight - currentSpacerHeight;
        const viewportBottom = container.scrollTop + container.clientHeight;

        // Spacer is out of viewport when the viewport bottom is above the spacer start
        return viewportBottom < spacerStartPosition;
    }, []);

    /**
     * Calculate scroll position for anchoring a user message.
     * - Short messages (<20% viewport): show full message at top with small offset
     * - Long messages (>20% viewport): show only bottom 10% at top
     */
    const calculateAnchorPosition = React.useCallback((
        anchorElement: HTMLElement,
        containerHeight: number
    ): number => {
        const messageHeight = anchorElement.offsetHeight;
        const messageTop = anchorElement.offsetTop;
        const isLongMessage = messageHeight > containerHeight * LONG_MESSAGE_THRESHOLD;

        if (isLongMessage) {
            // Long message: position so bottom 10% of message is at top of viewport
            // Message bottom = messageTop + messageHeight
            // We want: scrollTop + visiblePortion = messageBottom
            // So: scrollTop = messageBottom - visiblePortion
            const visiblePortion = containerHeight * LONG_MESSAGE_VISIBLE_PORTION;
            const messageBottom = messageTop + messageHeight;
            return messageBottom - visiblePortion;
        } else {
            // Short message: show full message at top with small offset
            return messageTop - ANCHOR_TARGET_OFFSET;
        }
    }, []);

    /**
     * Calculate and update spacer height to ensure anchor position is reachable
     * This updates spacer silently without affecting scrollTop
     */
    const refreshSpacer = React.useCallback(() => {
        const container = scrollRef.current;
        if (!container || !anchorId) {
            updateSpacerHeight(0);
            return;
        }

        const anchorElement = getAnchorElement();
        if (!anchorElement) {
            updateSpacerHeight(0);
            return;
        }

        const containerHeight = container.clientHeight;
        const contentHeight = container.scrollHeight;

        // Use same anchor position calculation as scrollToNewAnchor
        const targetScrollTop = calculateAnchorPosition(anchorElement, containerHeight);
        const requiredHeight = targetScrollTop + containerHeight;

        // If content is shorter than required, add spacer
        // But also shrink spacer as content grows
        const currentSpacerHeight = spacerHeightRef.current;
        const contentWithoutSpacer = contentHeight - currentSpacerHeight;

        if (contentWithoutSpacer >= requiredHeight) {
            // Real content is tall enough, no spacer needed
            updateSpacerHeight(0);
        } else {
            // Need spacer to make anchor position reachable
            const needed = requiredHeight - contentWithoutSpacer;
            updateSpacerHeight(needed);
        }
    }, [anchorId, calculateAnchorPosition, getAnchorElement, updateSpacerHeight]);

    /**
     * Update scroll button visibility based on spacer presence
     * - If spacer exists: show button when scrolled past spacer (into real content)
     * - If no spacer: show button when not at bottom
     */
    const updateScrollButtonVisibility = React.useCallback(() => {
        const container = scrollRef.current;
        if (!container) {
            setShowScrollButton(false);
            return;
        }

        const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
        const currentSpacerHeight = spacerHeightRef.current;

        if (currentSpacerHeight > 0) {
            // Spacer exists: show button when user has scrolled past the spacer
            // (i.e., when they're viewing actual content, not empty space)
            const spacerStartPosition = container.scrollHeight - currentSpacerHeight;
            const viewportBottom = container.scrollTop + container.clientHeight;

            // Show button when viewport bottom is above spacer start
            // (user is viewing content, not spacer)
            setShowScrollButton(viewportBottom < spacerStartPosition);
        } else {
            // No spacer: show button when not at bottom
            setShowScrollButton(distanceFromBottom > DEFAULT_SCROLL_BUTTON_THRESHOLD);
        }
    }, []);

    /**
     * Scroll to actual bottom (used by "scroll to bottom" button)
     */
    const scrollToBottom = React.useCallback((options?: { instant?: boolean }) => {
        const container = scrollRef.current;
        if (!container) return;

        // Always scroll to actual bottom
        const bottom = container.scrollHeight - container.clientHeight;
        scrollEngine.scrollToPosition(Math.max(0, bottom), options);
    }, [scrollEngine]);

    /**
     * Perform the ONE scroll to anchor a new user message
     * Uses ResizeObserver to wait for message to be fully rendered
     */
    const scrollToNewAnchor = React.useCallback((messageId: string) => {
        // Debounce: don't scroll if we already scrolled to this anchor
        if (lastScrolledAnchorIdRef.current === messageId) {
            return;
        }
        lastScrolledAnchorIdRef.current = messageId;

        const container = scrollRef.current;
        if (!container) return;

        // Wait for element to appear in DOM
        const waitForElement = () => {
            const anchorElement = container.querySelector(`[data-message-id="${messageId}"]`) as HTMLElement | null;
            if (!anchorElement) {
                // Element not yet in DOM, retry
                window.requestAnimationFrame(waitForElement);
                return;
            }

            anchorElementRef.current = anchorElement;

            // Use ResizeObserver to wait for stable size
            let lastHeight = 0;
            let stableCount = 0;
            let hasScrolled = false;

            const doScroll = () => {
                if (hasScrolled) return;
                hasScrolled = true;

                const containerHeight = container.clientHeight;
                const contentHeight = container.scrollHeight;

                // Calculate target scroll position based on message height
                const targetScrollTop = calculateAnchorPosition(anchorElement, containerHeight);

                // Calculate required spacer to make this position reachable
                const requiredHeight = targetScrollTop + containerHeight;
                const currentSpacer = spacerHeightRef.current;
                const contentWithoutSpacer = contentHeight - currentSpacer;

                let newSpacerHeight = 0;
                if (contentWithoutSpacer < requiredHeight) {
                    newSpacerHeight = requiredHeight - contentWithoutSpacer;
                }

                // Update spacer first
                if (newSpacerHeight !== currentSpacer) {
                    updateSpacerHeight(newSpacerHeight);
                }

                // Then scroll (instant for user messages)
                scrollEngine.scrollToPosition(targetScrollTop, { instant: true });
            };

            // If ResizeObserver not available, fall back to RAF
            if (typeof ResizeObserver === 'undefined') {
                window.requestAnimationFrame(() => {
                    window.requestAnimationFrame(doScroll);
                });
                return;
            }

            const observer = new ResizeObserver((entries) => {
                const entry = entries[0];
                if (!entry) return;

                const currentHeight = entry.contentRect.height;

                // Check if height has stabilized
                if (currentHeight > 0 && Math.abs(currentHeight - lastHeight) < 1) {
                    stableCount++;
                    // Wait for 2 stable readings before scrolling
                    if (stableCount >= 2) {
                        observer.disconnect();
                        doScroll();
                    }
                } else {
                    stableCount = 0;
                    lastHeight = currentHeight;
                }
            });

            observer.observe(anchorElement);

            // Safety timeout - scroll anyway after 500ms
            setTimeout(() => {
                observer.disconnect();
                doScroll();
            }, 500);
        };

        if (typeof window !== 'undefined') {
            window.requestAnimationFrame(waitForElement);
        }
    }, [calculateAnchorPosition, scrollEngine, updateSpacerHeight]);

    // Handle scroll events
    const handleScrollEvent = React.useCallback(() => {
        const container = scrollRef.current;
        if (!container || !currentSessionId) {
            return;
        }

        scrollEngine.handleScroll();
        updateScrollButtonVisibility();

        // Remove spacer when scrolled past it and turn is idle
        if (currentPhase === 'idle' && spacerHeightRef.current > 0 && isSpacerOutOfViewport()) {
            updateSpacerHeight(0);
        }

        // Update viewport anchor for session memory
        const { scrollTop, scrollHeight, clientHeight } = container;
        const position = (scrollTop + clientHeight / 2) / Math.max(scrollHeight, 1);
        const estimatedIndex = Math.floor(position * sessionMessages.length);
        updateViewportAnchor(currentSessionId, estimatedIndex);
    }, [
        currentSessionId,
        currentPhase,
        isSpacerOutOfViewport,
        scrollEngine,
        sessionMessages.length,
        updateScrollButtonVisibility,
        updateSpacerHeight,
        updateViewportAnchor,
    ]);

    // Attach scroll listener
    React.useEffect(() => {
        const container = scrollRef.current;
        if (!container) return;

        container.addEventListener('scroll', handleScrollEvent, { passive: true });

        return () => {
            container.removeEventListener('scroll', handleScrollEvent);
        };
    }, [handleScrollEvent]);

    // Handle session change - reset state, NO anchor, NO spacer
    React.useEffect(() => {
        if (currentSessionId && currentSessionId !== lastSessionIdRef.current) {
            lastSessionIdRef.current = currentSessionId;
            MessageFreshnessDetector.getInstance().recordSessionStart(currentSessionId);
            lastMessageCountRef.current = sessionMessages.length;
            lastScrolledAnchorIdRef.current = null;

            // Reset state - no anchor/spacer for existing sessions
            // Anchor is only set when NEW user message is sent
            setAnchorId(null);
            updateSpacerHeight(0);
        }
    }, [currentSessionId, sessionMessages.length, updateSpacerHeight]);

    // Handle new messages - THE KEY LOGIC
    // Only runs for ACTUAL new messages, not session switches
    React.useEffect(() => {
        // Skip if syncing
        if (isSyncing) {
            lastMessageCountRef.current = sessionMessages.length;
            return;
        }

        // Skip if this is a session switch (ref tracks different session)
        if (lastSessionIdRef.current !== currentSessionId) {
            return;
        }

        const previousCount = lastMessageCountRef.current;
        const nextCount = sessionMessages.length;

        // Detect actual message additions (not session switch)
        if (nextCount > previousCount && previousCount > 0) {
            // Check if messages were appended (not prepended/history load)
            const previousLastId = getMessageId(sessionMessages[previousCount - 1]);

            // If the message at previousCount-1 is still there, messages were appended
            const wasAppended = previousLastId !== null &&
                 getMessageId(sessionMessages[Math.min(previousCount - 1, nextCount - 1)]) === previousLastId;

            if (wasAppended) {
                // Check for new user message in appended messages
                const appendedMessages = sessionMessages.slice(previousCount, nextCount);
                const newUserMessage = appendedMessages.find(isUserMessage);

                if (newUserMessage) {
                    const newAnchorId = getMessageId(newUserMessage);
                    if (newAnchorId) {
                        setAnchorId(newAnchorId);
                        scrollToNewAnchor(newAnchorId);
                    }
                } else {
                    // Assistant messages added - just refresh spacer, NO scroll
                    refreshSpacer();
                }
            } else {
                // History was prepended - NO scroll, just refresh spacer
                refreshSpacer();
            }
        }

        lastMessageCountRef.current = nextCount;
    }, [currentSessionId, isSyncing, refreshSpacer, scrollToNewAnchor, sessionMessages]);

    // Handle container resize - refresh spacer without scrolling
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

    // Refresh spacer when anchor changes
    React.useEffect(() => {
        if (anchorId) {
            refreshSpacer();
            updateScrollButtonVisibility();
        }
    }, [anchorId, refreshSpacer, updateScrollButtonVisibility]);

    // Remove spacer when assistant turn is over AND spacer is out of viewport
    React.useEffect(() => {
        // Only remove spacer when:
        // 1. Phase is 'idle' (turn is over)
        // 2. Spacer exists
        // 3. Spacer is fully out of viewport
        if (currentPhase === 'idle' && spacerHeightRef.current > 0 && isSpacerOutOfViewport()) {
            updateSpacerHeight(0);
        }
    }, [currentPhase, isSpacerOutOfViewport, updateSpacerHeight]);

    // Update scroll button visibility when spacer height changes
    React.useEffect(() => {
        updateScrollButtonVisibility();
    }, [spacerHeight, updateScrollButtonVisibility]);

    // Legacy animation handlers (no longer used for scroll behavior)
    const animationHandlersRef = React.useRef<Map<string, AnimationHandlers>>(new Map());

    const handleMessageContentChange = React.useCallback(() => {
        // Content changed - refresh spacer silently, NO auto-scroll
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
                // Legacy handler - no longer used for autoscroll
                refreshSpacer();
            },
            onComplete: () => {
                // Legacy handler - no longer used for autoscroll
                refreshSpacer();
            },
            onStreamingCandidate: () => {
                // Legacy handler - no longer used for autoscroll
            },
            onAnimationStart: () => {
                // Legacy handler - no longer used for autoscroll
            },
            onAnimatedHeightChange: () => {
                // Legacy handler - spacer refresh
                refreshSpacer();
            },
            onReservationCancelled: () => {
                // Legacy handler - no longer used for autoscroll
            },
            onReasoningBlock: () => {
                // Legacy handler - no longer used for autoscroll
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
    };
};
