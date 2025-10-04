import React from 'react';

const DEFAULT_TIMEOUT_MS = 20000;

interface MessagePart {
    type?: string;
    time?: { end?: number };
    state?: { status?: string };
    text?: string;
    content?: string;
}

interface ChatMessageRecord {
    info: {
        id: string;
        role: string;
        time: { created: number; completed?: number; updated?: number };
    };
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
}

interface UseAssistantTypingResult {
    isTyping: boolean;
}

export const useAssistantTyping = ({ messages, timeoutMs = DEFAULT_TIMEOUT_MS }: UseAssistantTypingOptions): UseAssistantTypingResult => {
    const assistantMessages = React.useMemo(() => getAssistantMessagesAfterLastUser(messages), [messages]);

    const hasAssistantActivity = assistantMessages.length > 0;
    const hasFinalAssistantText = assistantMessages.some((message) => hasFinalizedTextPart(message.parts));
    const shouldShowBasedOnContent = hasAssistantActivity && !hasFinalAssistantText;

    const signatureRef = React.useRef<string | null>(null);
    const [lastActivityAt, setLastActivityAt] = React.useState<number | null>(null);
    const [hasTimedOut, setHasTimedOut] = React.useState(false);

    React.useEffect(() => {
        if (!shouldShowBasedOnContent) {
            signatureRef.current = null;
            setLastActivityAt(null);
            setHasTimedOut(false);
            return;
        }

        const signature = buildAssistantActivitySignature(assistantMessages);

        if (signatureRef.current !== signature) {
            signatureRef.current = signature;
            setLastActivityAt(Date.now());
            setHasTimedOut(false);
        }
    }, [assistantMessages, shouldShowBasedOnContent]);

    React.useEffect(() => {
        if (!shouldShowBasedOnContent) {
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
    }, [shouldShowBasedOnContent, lastActivityAt, timeoutMs]);

    const isTyping = shouldShowBasedOnContent && !hasTimedOut;

    return React.useMemo(() => ({ isTyping }), [isTyping]);
};
