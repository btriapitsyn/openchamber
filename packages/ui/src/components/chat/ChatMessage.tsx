import React from 'react';
import type { Message, Part } from '@opencode-ai/sdk';
import { useShallow } from 'zustand/react/shallow';

import { defaultCodeDark, defaultCodeLight } from '@/lib/codeTheme';
import { MessageFreshnessDetector } from '@/lib/messageFreshness';
import { useSessionStore } from '@/stores/useSessionStore';
import { useMessageStore } from '@/stores/messageStore';
import { useConfigStore } from '@/stores/useConfigStore';
import { useUIStore } from '@/stores/useUIStore';
import { useDeviceInfo } from '@/lib/device';
import { useThemeSystem } from '@/contexts/useThemeSystem';
import { generateSyntaxTheme } from '@/lib/theme/syntaxThemeGenerator';
import { cn } from '@/lib/utils';

import type { AnimationHandlers, ContentChangeReason } from '@/hooks/useChatScrollManager';
import MessageHeader from './message/MessageHeader';
import MessageBody from './message/MessageBody';
import type { AgentMentionInfo } from './message/types';
import type { StreamPhase, ToolPopupContent } from './message/types';
import { deriveMessageRole } from './message/messageRole';
import { filterVisibleParts } from './message/partUtils';
import { flattenAssistantTextParts } from '@/lib/messages/messageText';
import { FadeInOnReveal } from './message/FadeInOnReveal';
import type { TurnGroupingContext } from './hooks/useTurnGrouping';

const ToolOutputDialog = React.lazy(() => import('./message/ToolOutputDialog'));

function useStickyDisplayValue<T>(value: T | null | undefined): T | null | undefined {
    const ref = React.useRef<{ hasValue: boolean; value: T | null | undefined }>({ hasValue: false, value: undefined as T | null | undefined });

    if (!ref.current.hasValue && value !== undefined && value !== null) {
        ref.current = { hasValue: true, value };
    }

    return ref.current.hasValue ? ref.current.value : value;
}

const getMessageInfoProp = (info: unknown, key: string): unknown => {
    if (typeof info === 'object' && info !== null) {
        return (info as Record<string, unknown>)[key];
    }
    return undefined;
};

interface ChatMessageProps {
    message: {
        info: Message;
        parts: Part[];
    };
    previousMessage?: {
        info: Message;
        parts: Part[];
    };
    nextMessage?: {
        info: Message;
        parts: Part[];
    };
    onContentChange?: (reason?: ContentChangeReason) => void;
    animationHandlers?: AnimationHandlers;
    scrollToBottom?: (options?: { instant?: boolean; force?: boolean }) => void;
    isPendingAnchor?: boolean;
    turnGroupingContext?: TurnGroupingContext;
}

const ChatMessage: React.FC<ChatMessageProps> = ({
    message,
    previousMessage,
    nextMessage,
    onContentChange,
    animationHandlers,
    isPendingAnchor = false,
    turnGroupingContext,
}) => {
    const { isMobile, hasTouchInput } = useDeviceInfo();
    const { currentTheme } = useThemeSystem();
    const messageContainerRef = React.useRef<HTMLDivElement | null>(null);

    const sessionState = useSessionStore(
        useShallow((state) => ({
            lifecyclePhase: state.messageStreamStates.get(message.info.id)?.phase ?? null,
            isStreamingMessage: (() => {
                const sessionId =
                    (message.info as { sessionID?: string }).sessionID ??
                    state.currentSessionId ??
                    null;
                if (!sessionId) return false;
                return (state.streamingMessageIds.get(sessionId) ?? null) === message.info.id;
            })(),
            currentSessionId: state.currentSessionId,
            getCurrentAgent: state.getCurrentAgent,
            getSessionAgentSelection: state.getSessionAgentSelection,
            getAgentModelForSession: state.getAgentModelForSession,
            getSessionModelSelection: state.getSessionModelSelection,
        }))
    );

    const {
        lifecyclePhase,
        isStreamingMessage,
        currentSessionId,
        getCurrentAgent,
        getSessionAgentSelection,
        getAgentModelForSession,
        getSessionModelSelection,
    } = sessionState;

    const providers = useConfigStore((state) => state.providers);
    const showReasoningTraces = useUIStore((state) => state.showReasoningTraces);

    React.useEffect(() => {
        if (currentSessionId) {
            MessageFreshnessDetector.getInstance().recordSessionStart(currentSessionId);
        }
    }, [currentSessionId]);

    const [copiedCode, setCopiedCode] = React.useState<string | null>(null);
    const [copiedMessage, setCopiedMessage] = React.useState(false);
    const [expandedTools, setExpandedTools] = React.useState<Set<string>>(new Set());
    const [popupContent, setPopupContent] = React.useState<ToolPopupContent>({
        open: false,
        title: '',
        content: '',
    });

    const messageRole = React.useMemo(() => deriveMessageRole(message.info), [message.info]);
    const isUser = messageRole.isUser;

    const normalizedParts = React.useMemo(() => {
        if (!isUser) {
            return message.parts;
        }

        return message.parts.map((part) => {
            const rawPart = part as Record<string, unknown>;
            if (rawPart.type === 'compaction') {
                return { type: 'text', text: '/summarize' } as Part;
            }
            return part;
        });
    }, [isUser, message.parts]);

    const previousUserMetadata = React.useMemo(() => {
        if (isUser || !previousMessage) {
            return null;
        }

        const clientRole = getMessageInfoProp(previousMessage.info, 'clientRole');
        const role = getMessageInfoProp(previousMessage.info, 'role');
        const previousRole = typeof clientRole === 'string' ? clientRole : (typeof role === 'string' ? role : undefined);
        if (previousRole !== 'user') {
            return null;
        }

        const mode = getMessageInfoProp(previousMessage.info, 'mode');
        const providerID = getMessageInfoProp(previousMessage.info, 'providerID');
        const modelID = getMessageInfoProp(previousMessage.info, 'modelID');
        const resolvedAgent = typeof mode === 'string' && mode.trim().length > 0 ? mode : undefined;
        const resolvedProvider = typeof providerID === 'string' && providerID.trim().length > 0 ? providerID : undefined;
        const resolvedModel = typeof modelID === 'string' && modelID.trim().length > 0 ? modelID : undefined;

        if (!resolvedAgent && !resolvedProvider && !resolvedModel) {
            return null;
        }

        return {
            agentName: resolvedAgent,
            providerId: resolvedProvider,
            modelId: resolvedModel,
        };
    }, [isUser, previousMessage]);

    const agentName = React.useMemo(() => {
        if (isUser) return undefined;

        const messageMode = getMessageInfoProp(message.info, 'mode');
        if (typeof messageMode === 'string' && messageMode.trim().length > 0) {
            return messageMode;
        }

        if (previousUserMetadata?.agentName) {
            return previousUserMetadata.agentName;
        }

        const sessionId = message.info.sessionID;
        if (!sessionId) {
            return undefined;
        }

        const currentContextAgent = getCurrentAgent(sessionId);
        if (currentContextAgent) {
            return currentContextAgent;
        }

        const savedSelection = getSessionAgentSelection(sessionId);
        return savedSelection ?? undefined;
    }, [isUser, message.info, previousUserMetadata, getCurrentAgent, getSessionAgentSelection]);

    const sessionId = message.info.sessionID;
    const messageProviderID = !isUser ? getMessageInfoProp(message.info, 'providerID') : null;
    const messageModelID = !isUser ? getMessageInfoProp(message.info, 'modelID') : null;

    const contextModelSelection = React.useMemo(() => {
        if (isUser || !sessionId) return null;

        if (previousUserMetadata?.providerId && previousUserMetadata?.modelId) {
            return {
                providerId: previousUserMetadata.providerId,
                modelId: previousUserMetadata.modelId,
            };
        }

        if (agentName) {
            const agentSelection = getAgentModelForSession(sessionId, agentName);
            if (agentSelection?.providerId && agentSelection?.modelId) {
                return agentSelection;
            }
        }

        const sessionSelection = getSessionModelSelection(sessionId);
        if (sessionSelection?.providerId && sessionSelection?.modelId) {
            return sessionSelection;
        }

        return null;
    }, [isUser, sessionId, agentName, previousUserMetadata, getAgentModelForSession, getSessionModelSelection]);

    const providerID = React.useMemo(() => {
        if (isUser) return null;
        if (typeof messageProviderID === 'string' && messageProviderID.trim().length > 0) {
            return messageProviderID;
        }
        return contextModelSelection?.providerId ?? null;
    }, [isUser, messageProviderID, contextModelSelection]);

    const modelID = React.useMemo(() => {
        if (isUser) return null;
        if (typeof messageModelID === 'string' && messageModelID.trim().length > 0) {
            return messageModelID;
        }
        return contextModelSelection?.modelId ?? null;
    }, [isUser, messageModelID, contextModelSelection]);

    const modelName = React.useMemo(() => {
        if (isUser) return undefined;

        if (providerID && modelID && providers.length > 0) {
            const provider = providers.find((p) => p.id === providerID);
            if (provider?.models && Array.isArray(provider.models)) {
                const model = provider.models.find((m: Record<string, unknown>) => (m as Record<string, unknown>).id === modelID);
                const modelObj = model as Record<string, unknown> | undefined;
                const name = modelObj?.name;
                return typeof name === 'string' ? name : undefined;
            }
        }

        return undefined;
    }, [isUser, providerID, modelID, providers]);

    const displayAgentName = useStickyDisplayValue<string>(agentName);
    const displayProviderIDValue = useStickyDisplayValue<string>(providerID ?? undefined);
    const displayModelName = useStickyDisplayValue<string>(modelName);

    const headerAgentName = displayAgentName ?? undefined;
    const headerProviderID = displayProviderIDValue ?? null;
    const headerModelName = displayModelName ?? undefined;

    const messageCompletedAt = React.useMemo(() => {
        const timeInfo = message.info.time as { completed?: number } | undefined;
        return typeof timeInfo?.completed === 'number' ? timeInfo.completed : null;
    }, [message.info.time]);

    const isMessageCompleted = React.useMemo(() => {
        if (isUser) return true;
        return Boolean(messageCompletedAt && messageCompletedAt > 0);
    }, [isUser, messageCompletedAt]);

    const visibleParts = React.useMemo(
        () =>
            filterVisibleParts(normalizedParts, {
                includeReasoning: showReasoningTraces,
            }),
        [normalizedParts, showReasoningTraces]
    );

    const displayParts = React.useMemo(() => {
        if (isUser) {
            return visibleParts;
        }

        return isMessageCompleted ? visibleParts : [];
    }, [isUser, isMessageCompleted, visibleParts]);

    const assistantTextParts = React.useMemo(() => {
        if (isUser) {
            return [];
        }
        return visibleParts.filter((part) => part.type === 'text');
    }, [isUser, visibleParts]);

    const toolParts = React.useMemo(() => {
        if (isUser) {
            return [];
        }
        return visibleParts.filter((part) => part.type === 'tool');
    }, [isUser, visibleParts]);

    const agentMention = React.useMemo(() => {
        if (!isUser) {
            return undefined;
        }
        const mentionPart = message.parts.find((part) => part.type === 'agent');
        if (!mentionPart) {
            return undefined;
        }
        const partWithName = mentionPart as { name?: string; source?: { value?: string } };
        const name = typeof partWithName.name === 'string' ? partWithName.name : undefined;
        if (!name) {
            return undefined;
        }
        const rawValue = partWithName.source && typeof partWithName.source.value === 'string' && partWithName.source.value.trim().length > 0
            ? partWithName.source.value
            : `#${name}`;
        return { name, token: rawValue } satisfies AgentMentionInfo;
    }, [isUser, message.parts]);

    const stepState = React.useMemo(() => {

        let stepStarts = 0;
        let stepFinishes = 0;
        visibleParts.forEach((part) => {
            if (part.type === 'step-start') {
                stepStarts += 1;
            } else if (part.type === 'step-finish') {
                stepFinishes += 1;
            }
        });
        return {
            hasOpenStep: stepStarts > stepFinishes,
        };
    }, [visibleParts]);

    const hasOpenStep = stepState.hasOpenStep;

    const shouldCoordinateRendering = React.useMemo(() => {
        if (isUser) {
            return false;
        }
        if (assistantTextParts.length === 0 || toolParts.length === 0) {
            return hasOpenStep;
        }
        return true;
    }, [assistantTextParts.length, toolParts.length, hasOpenStep, isUser]);

    const themeVariant = currentTheme?.metadata.variant;
    const isDarkTheme = React.useMemo(() => {
        if (themeVariant) {
            return themeVariant === 'dark';
        }
        if (typeof document !== 'undefined') {
            return document.documentElement.classList.contains('dark');
        }
        return false;
    }, [themeVariant]);

    const syntaxTheme = React.useMemo(() => {
        if (currentTheme) {
            return generateSyntaxTheme(currentTheme);
        }
        return isDarkTheme ? defaultCodeDark : defaultCodeLight;
    }, [currentTheme, isDarkTheme]);

    const shouldAnimateMessage = React.useMemo(() => {
        if (isUser) return false;
        const freshnessDetector = MessageFreshnessDetector.getInstance();
        return freshnessDetector.shouldAnimateMessage(message.info, currentSessionId || message.info.sessionID);
    }, [message.info, currentSessionId, isUser]);

    const previousRole = React.useMemo(() => {
        if (!previousMessage) return null;
        return deriveMessageRole(previousMessage.info);
    }, [previousMessage]);

    const nextRole = React.useMemo(() => {
        if (!nextMessage) return null;
        return deriveMessageRole(nextMessage.info);
    }, [nextMessage]);

    const shouldShowHeader = React.useMemo(() => {
        if (isUser) return true;
        if (!previousRole) return true;
        return previousRole.isUser;
    }, [isUser, previousRole]);

    const isFollowedByAssistant = React.useMemo(() => {
        if (isUser) return false;
        if (!nextRole) return false;
        return !nextRole.isUser && nextRole.role === 'assistant';
    }, [isUser, nextRole]);

    const streamPhase: StreamPhase = React.useMemo(() => {
        if (isMessageCompleted) {
            return 'completed';
        }
        if (lifecyclePhase) {
            return lifecyclePhase;
        }
        return isStreamingMessage ? 'streaming' : 'completed';
    }, [isMessageCompleted, lifecyclePhase, isStreamingMessage]);

    const handleCopyCode = React.useCallback((code: string) => {
        navigator.clipboard.writeText(code);
        setCopiedCode(code);
        setTimeout(() => setCopiedCode(null), 2000);
    }, []);

    const userMessageIdForTurn = turnGroupingContext?.turnId;
    const assistantSummaryFromStore = useMessageStore((state) => {
        if (!userMessageIdForTurn) return undefined;
        const sessionId = message.info.sessionID;
        if (!sessionId) return undefined;
        const sessionMessages = state.messages.get(sessionId);
        if (!sessionMessages) return undefined;
        const userMsg = sessionMessages.find((entry) => entry.info?.id === userMessageIdForTurn);
        if (!userMsg) return undefined;
        const summary = (userMsg.info as { summary?: { body?: string | null | undefined } | null | undefined }).summary;
        const body = summary?.body;
        return typeof body === 'string' && body.trim().length > 0 ? body : undefined;
    });

    const assistantSummaryCandidate =
        typeof turnGroupingContext?.summaryBody === 'string' && turnGroupingContext.summaryBody.trim().length > 0
            ? turnGroupingContext.summaryBody
            : assistantSummaryFromStore;

    const assistantSummaryRef = React.useRef<string | undefined>(undefined);
    if (assistantSummaryCandidate && assistantSummaryCandidate.trim().length > 0) {
        assistantSummaryRef.current = assistantSummaryCandidate;
    }
    const prevUserMessageIdForCopy = React.useRef(userMessageIdForTurn);
    if (prevUserMessageIdForCopy.current !== userMessageIdForTurn) {
        prevUserMessageIdForCopy.current = userMessageIdForTurn;
        assistantSummaryRef.current = undefined;
    }
    const assistantSummaryForCopy = assistantSummaryRef.current;

    const messageTextContent = React.useMemo(() => {
        if (isUser) {
            const textParts = displayParts
                .filter((part): part is Part & { type: 'text'; text?: string; content?: string } => part.type === 'text')
                .map((part) => {
                    const text = part.text || part.content || '';
                    return text.trim();
                })
                .filter((text) => text.length > 0);

            const combined = textParts.join('\n');
            return combined.replace(/\n\s*\n+/g, '\n');
        }

        if (assistantSummaryForCopy && assistantSummaryForCopy.trim().length > 0) {
            return assistantSummaryForCopy;
        }

        return flattenAssistantTextParts(displayParts);
    }, [assistantSummaryForCopy, displayParts, isUser]);

    const hasTextContent = messageTextContent.length > 0;

    const handleCopyMessage = React.useCallback(() => {
        navigator.clipboard.writeText(messageTextContent);
        setCopiedMessage(true);
        setTimeout(() => setCopiedMessage(false), 2000);
    }, [messageTextContent]);

    const handleToggleTool = React.useCallback((toolId: string) => {
        setExpandedTools((prev) => {
            const next = new Set(prev);
            if (next.has(toolId)) {
                next.delete(toolId);
            } else {
                next.add(toolId);
            }
            return next;
        });
    }, []);

    const resolvedAnimationHandlers = animationHandlers ?? null;
    const hasAnnouncedAuxiliaryScrollRef = React.useRef(false);

    const animationCompletedRef = React.useRef(false);
    const hasRequestedReservationRef = React.useRef(false);
    const animationStartNotifiedRef = React.useRef(false);
    const hasTriggeredReservationOnceRef = React.useRef(false);

    React.useEffect(() => {
        animationCompletedRef.current = false;
        hasRequestedReservationRef.current = false;
        animationStartNotifiedRef.current = false;
        hasTriggeredReservationOnceRef.current = false;
        hasAnnouncedAuxiliaryScrollRef.current = false;
    }, [message.info.id]);

    const handleAuxiliaryContentComplete = React.useCallback(() => {
        if (isUser) {
            return;
        }
        if (hasAnnouncedAuxiliaryScrollRef.current) {
            return;
        }
        hasAnnouncedAuxiliaryScrollRef.current = true;
        onContentChange?.('structural');
    }, [isUser, onContentChange]);

    const handleShowPopup = React.useCallback((content: ToolPopupContent) => {

        if (content.image) {
            setPopupContent(content);
        }
    }, []);

    const handlePopupChange = React.useCallback((open: boolean) => {
        setPopupContent((prev) => ({ ...prev, open }));
    }, []);

    const isAnimationSettled = Boolean(getMessageInfoProp(message.info, 'animationSettled'));
    const isStreamingPhase = streamPhase === 'streaming';

    const hasReasoningParts = React.useMemo(() => {
        if (isUser) {
            return false;
        }
        return visibleParts.some((part) => part.type === 'reasoning');
    }, [isUser, visibleParts]);

    const allowAnimation = shouldAnimateMessage && !isAnimationSettled && !isStreamingPhase;
    const shouldReserveAnimationSpace = !isUser && shouldAnimateMessage && assistantTextParts.length > 0 && !shouldCoordinateRendering;

    React.useEffect(() => {
        if (!resolvedAnimationHandlers?.onStreamingCandidate) {
            return;
        }

        if (!shouldReserveAnimationSpace) {
            if (hasRequestedReservationRef.current) {
                if (hasReasoningParts && resolvedAnimationHandlers?.onReasoningBlock) {
                    resolvedAnimationHandlers.onReasoningBlock();
                } else if (resolvedAnimationHandlers?.onReservationCancelled) {
                    resolvedAnimationHandlers.onReservationCancelled();
                }
                hasRequestedReservationRef.current = false;
            }
            return;
        }

        if (hasTriggeredReservationOnceRef.current) {
            return;
        }

        hasTriggeredReservationOnceRef.current = true;
        resolvedAnimationHandlers.onStreamingCandidate();
        hasRequestedReservationRef.current = true;
    }, [resolvedAnimationHandlers, shouldReserveAnimationSpace, hasReasoningParts]);

    React.useEffect(() => {
        if (!resolvedAnimationHandlers?.onAnimationStart) {
            return;
        }
        if (!allowAnimation) {
            return;
        }
        if (animationStartNotifiedRef.current) {
            return;
        }
        resolvedAnimationHandlers.onAnimationStart();
        animationStartNotifiedRef.current = true;
    }, [resolvedAnimationHandlers, allowAnimation]);

    React.useEffect(() => {
        if (isUser) {
            return;
        }

        const handler = resolvedAnimationHandlers?.onAnimatedHeightChange;
        if (!handler) {
            return;
        }

        const shouldTrackHeight = allowAnimation || shouldReserveAnimationSpace;
        if (!shouldTrackHeight) {
            return;
        }

        const element = messageContainerRef.current;
        if (!element) {
            return;
        }

        if (typeof window === 'undefined' || typeof ResizeObserver === 'undefined') {
            handler(element.getBoundingClientRect().height);
            return;
        }

        let rafId: number | null = null;
        const notifyHeight = (height: number) => {
            if (typeof window === 'undefined') {
                handler(height);
                return;
            }
            if (rafId !== null) {
                window.cancelAnimationFrame(rafId);
            }
            rafId = window.requestAnimationFrame(() => {
                handler(height);
            });
        };

        const observer = new ResizeObserver((entries) => {
            const entry = entries[0];
            if (!entry) {
                return;
            }
            notifyHeight(entry.contentRect.height);
        });

        observer.observe(element);
        notifyHeight(element.getBoundingClientRect().height);

        return () => {
            if (rafId !== null) {
                window.cancelAnimationFrame(rafId);
                rafId = null;
            }
            observer.disconnect();
        };
    }, [allowAnimation, isUser, resolvedAnimationHandlers, shouldReserveAnimationSpace]);

    return (
        <>
            <div
                className={cn(
                    'group w-full',
                    shouldShowHeader ? 'pt-2' : 'pt-0',
                    isUser ? 'pb-2' : isFollowedByAssistant ? 'pb-0' : 'pb-2'
                )}
                data-message-id={message.info.id}
                ref={messageContainerRef}
                style={isPendingAnchor ? { visibility: 'hidden' } : undefined}
            >
                <div className="chat-column">
                    {isUser ? (
                        <FadeInOnReveal>
                            <div
                                className={cn(
                                    'rounded-xl border bg-input/10 dark:bg-input/30 pt-[0.7rem] pb-[0.45rem] relative'
                                )}
                                style={{
                                    borderColor: 'color-mix(in srgb, var(--primary-muted, var(--primary)) 40%, var(--interactive-border, transparent))'
                                }}
                            >
                                <MessageBody
                                    messageId={message.info.id}
                                    parts={visibleParts}
                                    isUser={isUser}
                                    isMessageCompleted={isMessageCompleted}
                                    syntaxTheme={syntaxTheme}
                                    isMobile={isMobile}
                                    hasTouchInput={hasTouchInput}
                                    copiedCode={copiedCode}
                                    onCopyCode={handleCopyCode}
                                    expandedTools={expandedTools}
                                    onToggleTool={handleToggleTool}
                                    onShowPopup={handleShowPopup}
                                    streamPhase={streamPhase}
                                    allowAnimation={allowAnimation}
                                    onContentChange={onContentChange}
                                    shouldShowHeader={false}
                                    hasTextContent={hasTextContent}
                                    onCopyMessage={handleCopyMessage}
                                    copiedMessage={copiedMessage}
                                    showReasoningTraces={showReasoningTraces}
                                    onAuxiliaryContentComplete={handleAuxiliaryContentComplete}
                                    agentMention={agentMention}
                                />

                            </div>
                        </FadeInOnReveal>
                    ) : (
                        <div>
                            {shouldShowHeader && (
                                <MessageHeader
                                    isUser={isUser}
                                    providerID={headerProviderID}
                                    agentName={headerAgentName}
                                    modelName={headerModelName}
                                    isDarkTheme={isDarkTheme}
                                />
                            )}

                            <MessageBody
                                messageId={message.info.id}
                                parts={visibleParts}
                                isUser={isUser}
                                isMessageCompleted={isMessageCompleted}
                                syntaxTheme={syntaxTheme}
                                isMobile={isMobile}
                                hasTouchInput={hasTouchInput}
                                copiedCode={copiedCode}
                                onCopyCode={handleCopyCode}
                                expandedTools={expandedTools}
                                onToggleTool={handleToggleTool}
                                onShowPopup={handleShowPopup}
                                streamPhase={streamPhase}
                                allowAnimation={allowAnimation}
                                onContentChange={onContentChange}
                                shouldShowHeader={shouldShowHeader}
                                hasTextContent={hasTextContent}
                                onCopyMessage={handleCopyMessage}
                                copiedMessage={copiedMessage}
                                onAuxiliaryContentComplete={handleAuxiliaryContentComplete}
                                showReasoningTraces={showReasoningTraces}
                                agentMention={agentMention}
                                turnGroupingContext={turnGroupingContext}
                            />

                        </div>
                    )}
                </div>
            </div>
            <React.Suspense fallback={null}>
                <ToolOutputDialog
                    popup={popupContent}
                    onOpenChange={handlePopupChange}
                    syntaxTheme={syntaxTheme}
                    isMobile={isMobile}
                />
            </React.Suspense>
        </>
    );
};

export default React.memo(ChatMessage);
