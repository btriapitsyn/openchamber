import React from 'react';
import type { Message, Part } from '@opencode-ai/sdk';

import { defaultCodeDark, defaultCodeLight } from '@/lib/codeTheme';
import { MessageFreshnessDetector } from '@/lib/messageFreshness';
import { useSessionStore } from '@/stores/useSessionStore';
import { useDeviceInfo } from '@/lib/device';
import { useThemeSystem } from '@/contexts/ThemeSystemContext';
import { generateSyntaxTheme } from '@/lib/theme/syntaxThemeGenerator';

import MessageHeader from './message/MessageHeader';
import MessageBody from './message/MessageBody';
import ToolOutputDialog from './message/ToolOutputDialog';
import type { StreamPhase, ToolPopupContent } from './message/types';
import { deriveMessageRole } from './message/messageRole';

interface ChatMessageProps {
    message: {
        info: Message;
        parts: Part[];
    };
    onContentChange?: () => void;
}

const filterVisibleParts = (parts: Part[]) => {
    const filtered = parts.filter((part: any) => !('synthetic' in part && part.synthetic));
    return [
        ...filtered.filter((part) => part.type === 'reasoning'),
        ...filtered.filter((part) => part.type !== 'reasoning'),
    ];
};

const ChatMessage: React.FC<ChatMessageProps> = ({
    message,
    onContentChange,
}) => {
    const { isMobile } = useDeviceInfo();
    const { currentTheme } = useThemeSystem();

    const pendingUserMessageIds = useSessionStore((state) => state.pendingUserMessageIds);
    const streamingMessageId = useSessionStore((state) => state.streamingMessageId);
    const messageStreamStates = useSessionStore((state) => state.messageStreamStates);
    const currentSessionId = useSessionStore((state) => state.currentSessionId);
    const markMessageStreamSettled = useSessionStore((state) => state.markMessageStreamSettled);

    React.useEffect(() => {
        if (currentSessionId) {
            MessageFreshnessDetector.getInstance().recordSessionStart(currentSessionId);
        }
    }, [currentSessionId]);

    React.useEffect(() => {
        onContentChange?.();
    }, [message.parts.length, onContentChange]);

    const [copiedCode, setCopiedCode] = React.useState<string | null>(null);
    const [expandedTools, setExpandedTools] = React.useState<Set<string>>(new Set());
    const [popupContent, setPopupContent] = React.useState<ToolPopupContent>({
        open: false,
        title: '',
        content: '',
    });

    const messageRole = React.useMemo(() => deriveMessageRole(message.info, pendingUserMessageIds), [message.info, pendingUserMessageIds]);
    const isUser = messageRole.isUser;

    const providerID = !isUser && 'providerID' in message.info ? (message.info as any).providerID : null;
    const agentName = !isUser && 'agent' in message.info ? (message.info as any).agent : null;

    const visibleParts = React.useMemo(() => filterVisibleParts(message.parts), [message.parts]);

    const isDarkTheme = React.useMemo(() => {
        if (typeof document !== 'undefined') {
            return document.documentElement.classList.contains('dark');
        }
        return false;
    }, [currentTheme]);

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

    const lifecycle = messageStreamStates.get(message.info.id);
    const lifecyclePhase = lifecycle?.phase;
    const streamPhase: StreamPhase = lifecyclePhase
        ? lifecyclePhase
        : streamingMessageId === message.info.id
            ? 'streaming'
            : 'completed';

    const handleCopyCode = React.useCallback((code: string) => {
        setCopiedCode(code);
        setTimeout(() => setCopiedCode(null), 2000);
    }, []);

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

    const handlePhaseSettled = React.useCallback(() => {
        markMessageStreamSettled(message.info.id);
    }, [markMessageStreamSettled, message.info.id]);

    const handleShowPopup = React.useCallback((content: ToolPopupContent) => {
        setPopupContent(content);
    }, []);

    const handlePopupChange = React.useCallback((open: boolean) => {
        setPopupContent((prev) => ({ ...prev, open }));
    }, []);

    const allowAnimation = shouldAnimateMessage;

    React.useEffect(() => {
        if (!allowAnimation && lifecyclePhase && lifecyclePhase !== 'streaming') {
            markMessageStreamSettled(message.info.id);
        }
    }, [allowAnimation, lifecyclePhase, markMessageStreamSettled, message.info.id]);

    return (
        <>
            <div className="group px-4 py-2">
                <div className="max-w-3xl mx-auto">
                    <MessageHeader
                        isUser={isUser}
                        providerID={providerID}
                        agentName={agentName}
                        isDarkTheme={isDarkTheme}
                    />
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
                        onAssistantPhaseSettled={handlePhaseSettled}
                    />
                </div>
            </div>
            <ToolOutputDialog
                popup={popupContent}
                onOpenChange={handlePopupChange}
                syntaxTheme={syntaxTheme}
                isMobile={isMobile}
            />
        </>
    );
};

export default React.memo(ChatMessage);
