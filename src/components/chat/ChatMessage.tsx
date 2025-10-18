import React from 'react';
import type { Message, Part } from '@opencode-ai/sdk';
import { useShallow } from 'zustand/react/shallow';

import { defaultCodeDark, defaultCodeLight } from '@/lib/codeTheme';
import { MessageFreshnessDetector } from '@/lib/messageFreshness';
import { useSessionStore } from '@/stores/useSessionStore';
import { useConfigStore } from '@/stores/useConfigStore';
import { useDeviceInfo } from '@/lib/device';
import { useThemeSystem } from '@/contexts/ThemeSystemContext';
import { generateSyntaxTheme } from '@/lib/theme/syntaxThemeGenerator';
import { cn } from '@/lib/utils';

import MessageHeader from './message/MessageHeader';
import MessageBody from './message/MessageBody';
import type { StreamPhase, ToolPopupContent } from './message/types';
import { deriveMessageRole } from './message/messageRole';
import { filterVisibleParts } from './message/partUtils';

const ToolOutputDialog = React.lazy(() => import('./message/ToolOutputDialog'));

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
    onContentChange?: () => void;
    animationHandlers?: {
        onChunk: () => void;
        onComplete: () => void;
    };
}

const ChatMessage: React.FC<ChatMessageProps> = ({
    message,
    previousMessage,
    nextMessage,
    onContentChange,
    animationHandlers,
}) => {
    const { isMobile } = useDeviceInfo();
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

    // For agent name: use mode from message if available (completed messages),
    // otherwise fallback to active selections for streaming state
    const agentName = React.useMemo(() => {
        if (isUser) return undefined;

        // Try to get mode from message (for completed messages)
        const messageMode = 'mode' in message.info ? (message.info as any).mode : undefined;
        if (messageMode) return messageMode;

        const sessionId = message.info.sessionID;
        if (!sessionId) {
            return undefined;
        }

        // Prefer current streaming context (updated by event stream)
        const currentContextAgent = getCurrentAgent(sessionId);
        if (currentContextAgent) {
            return currentContextAgent;
        }

        // Fallback to the persisted selection for this session
        const savedSelection = getSessionAgentSelection(sessionId);
        return savedSelection ?? undefined;
    }, [isUser, message.info, getCurrentAgent, getSessionAgentSelection]);

    const sessionId = message.info.sessionID;
    const messageProviderID = !isUser && 'providerID' in message.info ? (message.info as any).providerID : null;
    const messageModelID = !isUser && 'modelID' in message.info ? (message.info as any).modelID : null;

    const contextModelSelection = React.useMemo(() => {
        if (isUser || !sessionId) return null;

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
    }, [isUser, sessionId, agentName, getAgentModelForSession, getSessionModelSelection]);

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

        // Find the provider and model using providerID and modelID
        if (providerID && modelID && providers.length > 0) {
            const provider = providers.find((p) => p.id === providerID);
            if (provider?.models && Array.isArray(provider.models)) {
                const model = provider.models.find((m: any) => m.id === modelID);
                return model?.name;
            }
        }

        return undefined;
    }, [isUser, providerID, modelID, providers]);

    const visibleParts = React.useMemo(() => filterVisibleParts(message.parts), [message.parts]);

    // No grouping - use all visible parts directly
    const displayParts = visibleParts;

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
            .filter((part: any) => part.type === 'text')
            .map((part: any) => {
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

    React.useEffect(() => {
        animationCompletedRef.current = false;
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
        setPopupContent(content);
    }, []);

    const handlePopupChange = React.useCallback((open: boolean) => {
        setPopupContent((prev) => ({ ...prev, open }));
    }, []);

    const isAnimationSettled = Boolean((message.info as any)?.animationSettled);
    const isStreamingPhase = streamPhase === 'streaming';
    const allowAnimation = shouldAnimateMessage && !isAnimationSettled && !isStreamingPhase;

    React.useEffect(() => {
        if (!allowAnimation && lifecyclePhase && lifecyclePhase !== 'streaming') {
            handleAnimationComplete();
        }
    }, [allowAnimation, lifecyclePhase, handleAnimationComplete]);

    return (
        <>
            <div
                className={cn(
                    'group px-4',
                    shouldShowHeader ? 'pt-2' : 'pt-0',
                    isUser ? 'pb-2' : isFollowedByAssistant ? 'pb-0' : 'pb-2'
                )}
            >
                <div className="max-w-3xl mx-auto">
                    {shouldShowHeader && (
                        <MessageHeader
                            isUser={isUser}
                            providerID={providerID}
                            agentName={agentName}
                            modelName={modelName}
                            isDarkTheme={isDarkTheme}
                            hasTextContent={hasTextContent}
                            onCopyMessage={handleCopyMessage}
                            isCopied={copiedMessage}
                            compactSpacing={isFollowedByAssistant}
                        />
                    )}
                    <MessageBody
                        messageId={message.info.id}
                        parts={visibleParts}
                        isUser={isUser}
                        syntaxTheme={syntaxTheme}
                        isMobile={isMobile}
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
