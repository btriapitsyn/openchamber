import React from 'react';
import type { Message, Part } from '@opencode-ai/sdk';
import { useShallow } from 'zustand/react/shallow';

import { defaultCodeDark, defaultCodeLight } from '@/lib/codeTheme';
import { MessageFreshnessDetector } from '@/lib/messageFreshness';
import { useSessionStore } from '@/stores/useSessionStore';
import { useConfigStore } from '@/stores/useConfigStore';
import { useDeviceInfo } from '@/lib/device';
import { useThemeSystem } from '@/contexts/useThemeSystem';
import { generateSyntaxTheme } from '@/lib/theme/syntaxThemeGenerator';
import { cn } from '@/lib/utils';

import type { AnimationHandlers, ContentChangeReason } from '@/hooks/useChatScrollManager';
import MessageHeader from './message/MessageHeader';
import MessageBody from './message/MessageBody';
import type { StreamPhase, ToolPopupContent } from './message/types';
import { deriveMessageRole } from './message/messageRole';
import { filterVisibleParts } from './message/partUtils';
import { FadeInOnReveal } from './message/FadeInOnReveal';

const ToolOutputDialog = React.lazy(() => import('./message/ToolOutputDialog'));

function useStickyDisplayValue<T>(value: T | null | undefined): T | null | undefined {
    const ref = React.useRef<{ hasValue: boolean; value: T | null | undefined }>({ hasValue: false, value: undefined as T | null | undefined });

    if (!ref.current.hasValue && value !== undefined && value !== null) {
        ref.current = { hasValue: true, value };
    }

    return ref.current.hasValue ? ref.current.value : value;
}

// Helper to safely access message.info properties
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
}

const ChatMessage: React.FC<ChatMessageProps> = ({
    message,
    previousMessage,
    nextMessage,
    onContentChange,
    animationHandlers,
}) => {
    const { isMobile, hasTouchInput } = useDeviceInfo();
    const { currentTheme } = useThemeSystem();

    // PERFORMANCE: Combined selector with shallow equality to reduce subscription overhead
    // Previously: 9 separate selectors = 9 subscription checks per message per update
    // Now: 1 combined selector with shallow comparison
    const sessionState = useSessionStore(
        useShallow((state) => ({
            pendingUserMessageIds: state.pendingUserMessageIds,
            lifecyclePhase: state.messageStreamStates.get(message.info.id)?.phase ?? null,
            isStreamingMessage: state.streamingMessageId === message.info.id,
            currentSessionId: state.currentSessionId,
            markMessageStreamSettled: state.markMessageStreamSettled,
            getCurrentAgent: state.getCurrentAgent,
            getSessionAgentSelection: state.getSessionAgentSelection,
            getAgentModelForSession: state.getAgentModelForSession,
            getSessionModelSelection: state.getSessionModelSelection,
        }))
    );

    const {
        pendingUserMessageIds,
        lifecyclePhase,
        isStreamingMessage,
        currentSessionId,
        markMessageStreamSettled,
        getCurrentAgent,
        getSessionAgentSelection,
        getAgentModelForSession,
        getSessionModelSelection,
    } = sessionState;

    const providers = useConfigStore((state) => state.providers);

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

    const messageRole = React.useMemo(() => deriveMessageRole(message.info, pendingUserMessageIds), [message.info, pendingUserMessageIds]);
    const isUser = messageRole.isUser;

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

    // For agent name: use mode from message if available (completed messages),
    // otherwise fallback to metadata captured on the preceding user message,
    // then finally the active selections for streaming state
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

    // Extract model name from message
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

    const visibleParts = React.useMemo(() => filterVisibleParts(message.parts), [message.parts]);

    // No grouping - use all visible parts directly
    const displayParts = visibleParts;

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
        return deriveMessageRole(previousMessage.info, pendingUserMessageIds);
    }, [previousMessage, pendingUserMessageIds]);

    const nextRole = React.useMemo(() => {
        if (!nextMessage) return null;
        return deriveMessageRole(nextMessage.info, pendingUserMessageIds);
    }, [nextMessage, pendingUserMessageIds]);

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

    const streamPhase: StreamPhase = lifecyclePhase
        ? lifecyclePhase
        : isStreamingMessage
            ? 'streaming'
            : 'completed';

    const handleCopyCode = React.useCallback((code: string) => {
        navigator.clipboard.writeText(code);
        setCopiedCode(code);
        setTimeout(() => setCopiedCode(null), 2000);
    }, []);

    // Extract only text parts from message
    const messageTextContent = React.useMemo(() => {
        // For both user and assistant: collect only text parts from parts array
        const textParts = displayParts
            .filter((part): part is Part & { type: 'text'; text?: string; content?: string } => part.type === 'text')
            .map((part) => {
                const text = part.text || part.content || '';
                return text.trim();
            })
            .filter(text => text.length > 0);

        const combined = textParts.join('\n');

        // Remove multiple consecutive empty lines (replace 2+ newlines with single newline)
        return combined.replace(/\n\s*\n+/g, '\n');
    }, [displayParts]);

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

    const animationCompletedRef = React.useRef(false);
    const hasRequestedReservationRef = React.useRef(false);
    const animationStartNotifiedRef = React.useRef(false);
    const hasTriggeredReservationOnceRef = React.useRef(false);

    React.useEffect(() => {
        animationCompletedRef.current = false;
        hasRequestedReservationRef.current = false;
        animationStartNotifiedRef.current = false;
        hasTriggeredReservationOnceRef.current = false;
    }, [message.info.id]);

    const handleAnimationChunk = React.useCallback(() => {
        // Invoke callbacks only when they actually exist
        resolvedAnimationHandlers?.onChunk?.();
    }, [resolvedAnimationHandlers]);

    const handleAnimationComplete = React.useCallback(() => {
        if (animationCompletedRef.current) {
            return;
        }

        animationCompletedRef.current = true;
        resolvedAnimationHandlers?.onComplete?.();
        markMessageStreamSettled(message.info.id);
    }, [markMessageStreamSettled, message.info.id, resolvedAnimationHandlers]);

    const handleShowPopup = React.useCallback((content: ToolPopupContent) => {
        // Only show popup for images
        if (content.image) {
            setPopupContent(content);
        }
    }, []);

    const handlePopupChange = React.useCallback((open: boolean) => {
        setPopupContent((prev) => ({ ...prev, open }));
    }, []);



    const isAnimationSettled = Boolean(getMessageInfoProp(message.info, 'animationSettled'));
    const isStreamingPhase = streamPhase === 'streaming';
    const allowAnimation = shouldAnimateMessage && !isAnimationSettled && !isStreamingPhase;
    const shouldReserveAnimationSpace = !isUser && shouldAnimateMessage && assistantTextParts.length > 0 && !shouldCoordinateRendering;
    const hasReasoningParts = React.useMemo(() => {
        if (isUser) {
            return false;
        }
        return visibleParts.some((part) => part.type === 'reasoning');
    }, [isUser, visibleParts]);

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
        if (!allowAnimation && lifecyclePhase && lifecyclePhase !== 'streaming') {
            handleAnimationComplete();
        }
    }, [allowAnimation, lifecyclePhase, handleAnimationComplete]);

    return (
        <>
            <div className={cn(
                'group w-full',
                shouldShowHeader ? 'pt-2' : 'pt-0',
                isUser ? 'pb-2' : isFollowedByAssistant ? 'pb-0' : 'pb-2'
            )}>
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
                                    onAssistantAnimationChunk={handleAnimationChunk}
                                    onAssistantAnimationComplete={handleAnimationComplete}
                                    onContentChange={onContentChange}
                                    compactTopSpacing={true}
                                    shouldShowHeader={false}
                                    hasTextContent={hasTextContent}
                                    onCopyMessage={handleCopyMessage}
                                    copiedMessage={copiedMessage}
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
                                    compactSpacing={isFollowedByAssistant}
                                />
                            )}

                            <MessageBody
                                messageId={message.info.id}
                                parts={visibleParts}
                                isUser={isUser}
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
                                onAssistantAnimationChunk={handleAnimationChunk}
                                onAssistantAnimationComplete={handleAnimationComplete}
                                onContentChange={onContentChange}
                                compactTopSpacing={!shouldShowHeader}
                                shouldShowHeader={shouldShowHeader}
                                hasTextContent={hasTextContent}
                                onCopyMessage={handleCopyMessage}
                                copiedMessage={copiedMessage}
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
