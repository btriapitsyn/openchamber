import React from 'react';
import type { Part } from '@opencode-ai/sdk';
import { useShallow } from 'zustand/react/shallow';

import { useSessionStore } from '@/stores/useSessionStore';

interface WorkingSummary {
    hasWorkingContext: boolean;
    isWorking: boolean;
    hasTextPart: boolean;
}

interface FormingSummary {
    isActive: boolean;
    characterCount: number;
}

export interface AssistantStatusSnapshot {
    forming: FormingSummary;
    working: WorkingSummary;
}

const DEFAULT_WORKING: WorkingSummary = {
    hasWorkingContext: false,
    isWorking: false,
    hasTextPart: false,
};

const DEFAULT_FORMING: FormingSummary = {
    isActive: false,
    characterCount: 0,
};

const summarizeParts = (parts: Part[]): WorkingSummary => {
    let hasWorkingContext = false;
    let isWorking = false;
    let hasTextPart = false;

    parts.forEach((part) => {
        switch (part.type) {
            case 'reasoning': {
                hasWorkingContext = true;
                const time = (part as any).time;
                if (!time || typeof time.end === 'undefined') {
                    isWorking = true;
                }
                break;
            }
            case 'tool': {
                hasWorkingContext = true;
                const status = (part as any)?.state?.status;
                if (status === 'running' || status === 'pending') {
                    isWorking = true;
                }
                break;
            }
            case 'step-start': {
                hasWorkingContext = true;
                isWorking = true;
                break;
            }
            case 'step-finish': {
                hasWorkingContext = true;
                break;
            }
            case 'text': {
                const content =
                    (part as any).text ||
                    (part as any).content ||
                    (part as any).value ||
                    '';
                if (typeof content === 'string' && content.trim().length > 0) {
                    hasTextPart = true;
                }
                break;
            }
            default:
                break;
        }
    });

    return {
        hasWorkingContext,
        isWorking,
        hasTextPart,
    };
};

export function useAssistantStatus(): AssistantStatusSnapshot {
    const { currentSessionId, messages, messageStreamStates, streamingMessageId } = useSessionStore(
        useShallow((state) => ({
            currentSessionId: state.currentSessionId,
            messages: state.messages,
            messageStreamStates: state.messageStreamStates,
            streamingMessageId: state.streamingMessageId,
        }))
    );

    type SessionMessageRecord = { info: { id: string; role: string } & Record<string, any>; parts: Part[] };

    const sessionMessages = React.useMemo<SessionMessageRecord[]>(() => {
        if (!currentSessionId) {
            return [];
        }
        const records = messages.get(currentSessionId) ?? [];
        return records as SessionMessageRecord[];
    }, [currentSessionId, messages]);

    const working = React.useMemo<WorkingSummary>(() => {
        if (sessionMessages.length === 0) {
            return DEFAULT_WORKING;
        }

        const relevantIds = new Set<string>();
        messageStreamStates.forEach((lifecycle, id) => {
            if (lifecycle.phase === 'streaming' || lifecycle.phase === 'cooldown') {
                relevantIds.add(id);
            }
        });
        if (streamingMessageId) {
            relevantIds.add(streamingMessageId);
        }

        const findSummary = (limitToActive: boolean): WorkingSummary => {
            for (let i = sessionMessages.length - 1; i >= 0; i -= 1) {
                const message = sessionMessages[i];
                if (!message || message.info.role !== 'assistant') {
                    continue;
                }
                if (limitToActive && relevantIds.size > 0 && !relevantIds.has(message.info.id)) {
                    continue;
                }

                const summary = summarizeParts(message.parts ?? []);
                if (summary.hasWorkingContext) {
                    return summary;
                }
            }
            return DEFAULT_WORKING;
        };

        const activeSummary = findSummary(true);
        if (activeSummary !== DEFAULT_WORKING) {
            return activeSummary;
        }

        return findSummary(false);
    }, [messageStreamStates, sessionMessages, streamingMessageId]);

    const forming = React.useMemo<FormingSummary>(() => {
        if (sessionMessages.length === 0) {
            return DEFAULT_FORMING;
        }

        const findSummary = (requireStreaming: boolean): FormingSummary | null => {
            for (let i = sessionMessages.length - 1; i >= 0; i -= 1) {
                const message = sessionMessages[i];
                if (!message || message.info.role !== 'assistant') {
                    continue;
                }

                const lifecycle = messageStreamStates.get(message.info.id);
                const phase = lifecycle?.phase;
                const isStreamingPhase = phase === 'streaming';
                if (requireStreaming && !isStreamingPhase) {
                    continue;
                }

                let characterCount = 0;
                let hasStreamingText = false;
                let hasAnyText = false;

                (message.parts ?? []).forEach((part) => {
                    if (part.type !== 'text') {
                        return;
                    }

                    const rawContent =
                        (part as any).text ||
                        (part as any).content ||
                        (part as any).value ||
                        '';

                    if (typeof rawContent === 'string') {
                        characterCount += rawContent.length;
                        if (rawContent.length > 0) {
                            hasAnyText = true;
                        }
                    }

                    const time = (part as any).time;
                    if (!time || typeof time.end === 'undefined') {
                        hasStreamingText = true;
                    }
                });

                if (!hasAnyText && !hasStreamingText && characterCount === 0) {
                    continue;
                }

                return {
                    isActive: Boolean(isStreamingPhase && (hasStreamingText || characterCount > 0)),
                    characterCount,
                };
            }

            return null;
        };

        return findSummary(true) ?? DEFAULT_FORMING;
    }, [messageStreamStates, sessionMessages, streamingMessageId]);

    return {
        forming,
        working,
    };
}
