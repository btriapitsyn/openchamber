import React from 'react';

const DEFAULT_TIMEOUT_MS = 20000;
const LIFECYCLE_GRACE_MS = 8000;

type MessageStreamPhase = 'streaming' | 'cooldown' | 'completed';

interface MessageStreamLifecycle {
    phase: MessageStreamPhase;
    startedAt: number;
    lastUpdateAt: number;
    completedAt?: number;
}

interface MessagePart {
    type?: string;
    time?: { end?: number };
    state?: { status?: string };
    text?: string;
    content?: string;
}

interface ChatMessageInfo {
    id: string;
    role: string;
    time: { created: number; completed?: number; updated?: number };
    animationSettled?: boolean;
}

interface ChatMessageRecord {
    info: ChatMessageInfo;
    parts: MessagePart[];
}

const hasFinalizedTextPart = (parts: MessagePart[]): boolean => {
    return parts.some((part) => {
        if (part?.type !== 'text') {
            return false;
        }
        if (!part?.time || typeof part.time.end === 'undefined') {
            return false;
        }
        const content = typeof part.text === 'string' ? part.text : part.content;
        return Boolean(content && content.trim().length > 0);
    });
};

const getAssistantMessagesAfterLastUser = (messages: ChatMessageRecord[]): ChatMessageRecord[] => {
    let lastUserIndex = -1;

    for (let i = messages.length - 1; i >= 0; i -= 1) {
        if (messages[i]?.info?.role === 'user') {
            lastUserIndex = i;
            break;
        }
    }

    return messages.filter((message, index) => index > lastUserIndex && message?.info?.role === 'assistant');
};

const buildAssistantActivitySignature = (messages: ChatMessageRecord[]): string => {
    return messages
        .map((message) => {
            const partSignature = (message.parts || [])
                .map((part) => {
                    const type = part?.type || 'unknown';
                    const finalized = part?.time && typeof part.time.end !== 'undefined' ? '1' : '0';
                    const status = part?.state?.status || '';
                    const textLength = typeof part?.text === 'string' ? part.text.length : 0;
                    const contentLength = typeof part?.content === 'string' ? part.content.length : 0;
                    return `${type}:${finalized}:${status}:${textLength}:${contentLength}`;
                })
                .join('|');

            const completed = message.info?.time?.completed || '';
            const updated = message.info?.time?.updated || '';

            return `${message.info?.id || 'unknown'}:${message.parts?.length || 0}:${completed}:${updated}:${partSignature}`;
        })
        .join('||');
};

interface UseAssistantTypingOptions {
    messages: ChatMessageRecord[];
    timeoutMs?: number;
    messageStreamStates?: Map<string, MessageStreamLifecycle>;
}

interface UseAssistantTypingResult {
    isTyping: boolean;
}

export const useAssistantTyping = ({
    messages,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    messageStreamStates,
}: UseAssistantTypingOptions): UseAssistantTypingResult => {
    const assistantMessages = React.useMemo(() => getAssistantMessagesAfterLastUser(messages), [messages]);

    const hasAssistantActivity = assistantMessages.length > 0;
    const hasFinalAssistantText = assistantMessages.some((message) => hasFinalizedTextPart(message.parts));
    const assistantHasUnsettledAnimation = assistantMessages.some((message) => {
        return message.info.animationSettled !== true;
    });
    const hasActiveLifecycle = React.useMemo(() => {
        if (!messageStreamStates || messageStreamStates.size === 0) {
            return false;
        }

        return assistantMessages.some((message) => {
            const lifecycle = messageStreamStates.get(message.info.id);
            if (!lifecycle) {
                return false;
            }
            return lifecycle.phase === 'streaming' || lifecycle.phase === 'cooldown';
        });
    }, [assistantMessages, messageStreamStates]);

    const hasRunningTool = React.useMemo(() => {
        return assistantMessages.some((message) =>
            (message.parts || []).some(
                (part) => part?.type === 'tool' && part?.state?.status === 'running'
            )
        );
    }, [assistantMessages]);

    const shouldShowBecauseOfLifecycle = hasAssistantActivity && (hasActiveLifecycle || hasRunningTool);
    const shouldShowBasedOnContent = assistantHasUnsettledAnimation && hasAssistantActivity && !hasFinalAssistantText;
    const [graceUntil, setGraceUntil] = React.useState<number | null>(null);
    const previousLifecycleRef = React.useRef<boolean>(false);

    React.useEffect(() => {
        if (shouldShowBecauseOfLifecycle) {
            setGraceUntil(null);
        } else if (previousLifecycleRef.current) {
            setGraceUntil(Date.now() + LIFECYCLE_GRACE_MS);
        }

        previousLifecycleRef.current = shouldShowBecauseOfLifecycle;
    }, [shouldShowBecauseOfLifecycle]);

    React.useEffect(() => {
        if (graceUntil === null) {
            return undefined;
        }

        const remaining = graceUntil - Date.now();
        if (remaining <= 0) {
            setGraceUntil(null);
            return undefined;
        }

        const timer = window.setTimeout(() => {
            setGraceUntil(null);
        }, remaining);

        return () => window.clearTimeout(timer);
    }, [graceUntil]);

    const withinLifecycleGrace = graceUntil !== null;

    const shouldShowIndicator = shouldShowBasedOnContent || shouldShowBecauseOfLifecycle || withinLifecycleGrace;

    const signatureRef = React.useRef<string | null>(null);
    const [lastActivityAt, setLastActivityAt] = React.useState<number | null>(null);
    const [hasTimedOut, setHasTimedOut] = React.useState(false);

    React.useEffect(() => {
        if (!shouldShowIndicator) {
            signatureRef.current = null;
            setLastActivityAt(null);
            setHasTimedOut(false);
            return;
        }

        const contentSignature = buildAssistantActivitySignature(assistantMessages);
        const lifecycleSignature = messageStreamStates
            ? assistantMessages
                  .map((message) => {
                      const lifecycle = messageStreamStates.get(message.info.id);
                      if (!lifecycle) {
                          return `${message.info.id}:none`;
                      }
                      return `${message.info.id}:${lifecycle.phase}:${lifecycle.lastUpdateAt}:${
                          lifecycle.completedAt || ''
                      }`;
                  })
                  .join('||')
            : '';
        const signature = `${contentSignature}::${lifecycleSignature}::${hasRunningTool ? 'tool-running' : ''}::${
            graceUntil ?? 'no-grace'
        }`;

        if (signatureRef.current !== signature) {
            signatureRef.current = signature;
            setLastActivityAt(Date.now());
            setHasTimedOut(false);
        }
    }, [assistantMessages, shouldShowIndicator, messageStreamStates, hasRunningTool, graceUntil]);

    React.useEffect(() => {
        if (!shouldShowIndicator) {
            return undefined;
        }

        if (lastActivityAt === null) {
            return undefined;
        }

        const now = Date.now();
        const elapsed = now - lastActivityAt;

        if (elapsed >= timeoutMs) {
            setHasTimedOut(true);
            return undefined;
        }

        const remaining = timeoutMs - elapsed;
        const timer = window.setTimeout(() => {
            setHasTimedOut(true);
        }, remaining);

        return () => window.clearTimeout(timer);
    }, [shouldShowIndicator, lastActivityAt, timeoutMs]);

    const isTyping = shouldShowIndicator && !hasTimedOut;

    return React.useMemo(() => ({ isTyping }), [isTyping]);
};
