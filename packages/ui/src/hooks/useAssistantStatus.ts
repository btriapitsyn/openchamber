import React from 'react';
import type { AssistantMessage, Message, Part, ReasoningPart, StepFinishPart, TextPart, ToolPart } from '@opencode-ai/sdk';
import { useShallow } from 'zustand/react/shallow';

import type { MessageStreamPhase } from '@/stores/types/sessionTypes';
import { useSessionStore } from '@/stores/useSessionStore';
import { isFullySyntheticMessage } from '@/lib/messages/synthetic';

export type AssistantActivity = 'idle' | 'streaming' | 'tooling' | 'cooldown' | 'permission';

interface WorkingSummary {
    activity: AssistantActivity;
    hasWorkingContext: boolean;
    hasActiveTools: boolean;
    isWorking: boolean;
    isStreaming: boolean;
    isCooldown: boolean;
    lifecyclePhase: MessageStreamPhase | null;
    statusText: string | null;
    isWaitingForPermission: boolean;
    canAbort: boolean;
    compactionDeadline: number | null;
    activePartType?: 'text' | 'tool' | 'reasoning' | 'editing';
    activeToolName?: string;
    wasAborted: boolean;
    abortActive: boolean;
    lastCompletionId: string | null;
    isComplete: boolean;
}

interface FormingSummary {
    isActive: boolean;
    characterCount: number;
}

export interface AssistantStatusSnapshot {
    forming: FormingSummary;
    working: WorkingSummary;
}

type AssistantMessageWithState = AssistantMessage & {
    status?: string;
    streaming?: boolean;
    abortedAt?: number;
};

interface AssistantSessionMessageRecord {
    info: AssistantMessageWithState;
    parts: Part[];
}

const DEFAULT_WORKING: WorkingSummary = {
    activity: 'idle',
    hasWorkingContext: false,
    hasActiveTools: false,
    isWorking: false,
    isStreaming: false,
    isCooldown: false,
    lifecyclePhase: null,
    statusText: null,
    isWaitingForPermission: false,
    canAbort: false,
    compactionDeadline: null,
    activePartType: undefined,
    activeToolName: undefined,
    wasAborted: false,
    abortActive: false,
    lastCompletionId: null,
    isComplete: false,
};

const DEFAULT_FORMING: FormingSummary = {
    isActive: false,
    characterCount: 0,
};

// Gate for showing "Done" after reload/session switch: align with on-screen Done duration (1.5s) plus small buffer
const RECENT_COMPLETION_WINDOW_MS = 1700;

const isAssistantMessage = (message: Message): message is AssistantMessageWithState => message.role === 'assistant';

const isReasoningPart = (part: Part): part is ReasoningPart => part.type === 'reasoning';

const isStepFinishPart = (part: Part): part is StepFinishPart => part.type === 'step-finish';

const getStepFinishReason = (part: StepFinishPart): string | undefined => {
    const candidate = part as StepFinishPart & Partial<{ reason?: unknown }>;
    return typeof candidate.reason === 'string' ? candidate.reason : undefined;
};

const isAbortedStepFinish = (part: StepFinishPart): boolean => {
    const candidate = part as StepFinishPart & Partial<{ aborted?: unknown; reason?: unknown }>;
    if (candidate.aborted === true) {
        return true;
    }
    const reason = getStepFinishReason(part);
    return reason === 'aborted' || reason === 'abort' || reason === 'cancelled';
};

const isTextPart = (part: Part): part is TextPart => part.type === 'text';

const getLegacyTextContent = (part: Part): string | undefined => {
    if (isTextPart(part)) {
        return part.text;
    }
    const candidate = part as Partial<{ text?: unknown; content?: unknown; value?: unknown }>;
    if (typeof candidate.text === 'string') {
        return candidate.text;
    }
    if (typeof candidate.content === 'string') {
        return candidate.content;
    }
    if (typeof candidate.value === 'string') {
        return candidate.value;
    }
    return undefined;
};

const getPartTimeInfo = (part: Part): { end?: number } | undefined => {
    if (isTextPart(part) || isReasoningPart(part)) {
        return part.time;
    }
    const candidate = part as Partial<{ time?: { end?: number } }>;
    return candidate.time;
};

const getToolDisplayName = (part: ToolPart): string => {
    if (part.tool) {
        return part.tool;
    }
    const candidate = part as ToolPart & Partial<{ name?: unknown }>;
    return typeof candidate.name === 'string' ? candidate.name : 'tool';
};


export function useAssistantStatus(): AssistantStatusSnapshot {
    const { currentSessionId, messages, permissions, sessionAbortFlags } = useSessionStore(
        useShallow((state) => ({
            currentSessionId: state.currentSessionId,
            messages: state.messages,
            permissions: state.permissions,
            sessionAbortFlags: state.sessionAbortFlags,
        }))
    );

    const lastCompletionIdPerSessionRef = React.useRef<Map<string, string>>(new Map());

    const sessionMessages = React.useMemo<Array<{ info: Message; parts: Part[] }>>(() => {
        if (!currentSessionId) {
            return [];
        }
        const records = messages.get(currentSessionId) ?? [];
        return records as Array<{ info: Message; parts: Part[] }>;
    }, [currentSessionId, messages]);

    const baseWorking = React.useMemo<WorkingSummary>(() => {
        const sessionId = currentSessionId;
        const abortRecord = sessionId ? sessionAbortFlags?.get(sessionId) ?? null : null;
        const hasActiveAbort = Boolean(abortRecord && !abortRecord.acknowledged);

        if (sessionMessages.length === 0) {
            if (hasActiveAbort) {
                return {
                    ...DEFAULT_WORKING,
                    wasAborted: true,
                    abortActive: true,
                };
            }
            return DEFAULT_WORKING;
        }

        // Get last assistant message
        const assistantMessages = sessionMessages
            .filter(
                (msg): msg is AssistantSessionMessageRecord =>
                    isAssistantMessage(msg.info) && !isFullySyntheticMessage(msg.parts)
            );

        if (assistantMessages.length === 0) {
            if (hasActiveAbort) {
                return {
                    ...DEFAULT_WORKING,
                    wasAborted: true,
                    abortActive: true,
                };
            }
            return DEFAULT_WORKING;
        }

        const sortedAssistantMessages = [...assistantMessages].sort((a, b) => {
            const aCreated = typeof a.info.time?.created === 'number' ? a.info.time.created : null;
            const bCreated = typeof b.info.time?.created === 'number' ? b.info.time.created : null;

            if (aCreated !== null && bCreated !== null && aCreated !== bCreated) {
                return aCreated - bCreated;
            }

            return a.info.id.localeCompare(b.info.id);
        });

        const lastAssistant = sortedAssistantMessages[sortedAssistantMessages.length - 1];

        const hasStopFinish = (lastAssistant.parts ?? []).some(
            (part) => isStepFinishPart(part) && getStepFinishReason(part) === 'stop'
        );
        const abortedStepFinish = (lastAssistant.parts ?? []).some(
            (part) => part.type === 'step-finish' && isAbortedStepFinish(part as StepFinishPart)
        );
        const status = typeof lastAssistant.info.status === 'string' ? lastAssistant.info.status.toLowerCase() : undefined;
        const wasAborted =
            abortedStepFinish ||
            status === 'aborted' ||
            status === 'abort' ||
            status === 'cancelled' ||
            hasActiveAbort;

        if (hasStopFinish) {
            const completedAt = typeof lastAssistant.info.time?.completed === 'number' ? lastAssistant.info.time.completed : null;
            const isRecent = completedAt !== null ? Date.now() - completedAt <= RECENT_COMPLETION_WINDOW_MS : true;

            if (!isRecent) {
                // Completed long ago - no placeholder or Done flash
                return DEFAULT_WORKING;
            }

            if (currentSessionId) {
                lastCompletionIdPerSessionRef.current.set(currentSessionId, lastAssistant.info.id);
            }
            const lastCompletionId = currentSessionId ? lastCompletionIdPerSessionRef.current.get(currentSessionId) ?? null : null;
            return {
                ...DEFAULT_WORKING,
                lastCompletionId,
                isComplete: true,
            };
        }

        if (wasAborted) {
            return {
                ...DEFAULT_WORKING,
                wasAborted: true,
                abortActive: true,
            };
        }

        let detectedActiveTools = false;
        let detectedStreamingText = false;
        let activePartType: 'text' | 'tool' | 'reasoning' | 'editing' | undefined = undefined;
        let activeToolName: string | undefined = undefined;

        const editingTools = new Set(['edit', 'write']);

        for (let i = (lastAssistant.parts ?? []).length - 1; i >= 0; i -= 1) {
            const part = lastAssistant.parts?.[i];
            if (!part) continue;

            switch (part.type) {
                case 'reasoning': {
                    const time = part.time ?? getPartTimeInfo(part);
                    const stillRunning = !time || typeof time.end === 'undefined';
                    if (stillRunning) {
                        detectedActiveTools = true;
                        if (!activePartType) {
                            activePartType = 'reasoning';
                        }
                    }
                    break;
                }
                case 'tool': {
                    const toolStatus = part.state?.status;
                    if (toolStatus === 'running' || toolStatus === 'pending') {
                        detectedActiveTools = true;
                        if (!activePartType) {
                            const toolName = getToolDisplayName(part);
                            if (editingTools.has(toolName)) {
                                activePartType = 'editing';
                            } else {
                                activePartType = 'tool';
                                activeToolName = toolName;
                            }
                        }
                    }
                    break;
                }
                case 'text': {
                    const rawContent =
                        getLegacyTextContent(part) ?? '';

                    if (typeof rawContent === 'string' && rawContent.trim().length > 0) {
                        const time = getPartTimeInfo(part);
                        const streamingPart = !time || typeof time.end === 'undefined';
                        if (streamingPart) {
                            detectedStreamingText = true;
                            if (!activePartType) {
                                activePartType = 'text';
                            }
                        }
                    }
                    break;
                }
                default:
                    break;
            }
        }

        const hasWorkingContext = detectedActiveTools || detectedStreamingText;
        const hasActiveTools = detectedActiveTools;
        const statusText = (() => {
            if (activePartType === 'editing') return 'editing';
            if (activePartType === 'tool' && activeToolName) return `using ${activeToolName}`;
            if (activePartType === 'reasoning') return 'thinking';
            if (activePartType === 'text') return 'writing';
            return 'working';
        })();

        return {
            activity: hasWorkingContext ? 'streaming' : 'idle',
            hasWorkingContext,
            hasActiveTools,
            isWorking: hasWorkingContext,
            isStreaming: hasWorkingContext,
            isCooldown: false,
            lifecyclePhase: null,
            statusText,
            isWaitingForPermission: false,
            canAbort: true,
            compactionDeadline: null,
            activePartType,
            activeToolName,
            wasAborted: false,
            abortActive: false,
            lastCompletionId: null,
            isComplete: false,
        };
    }, [currentSessionId, sessionAbortFlags, sessionMessages]);

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

                if (isFullySyntheticMessage(message.parts)) {
                    continue;
                }

                const hasStopFinish = (message.parts ?? []).some(
                    (part) => isStepFinishPart(part) && getStepFinishReason(part) === 'stop'
                );
                const isStreamingPhase = !hasStopFinish;
                if (requireStreaming && !isStreamingPhase) {
                    continue;
                }

                 // Check if message has any tool parts - if so, don't show forming indicator
                 const hasAnyToolPart = (message.parts ?? []).some((part) => part.type === 'tool');
                if (hasAnyToolPart) {
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
                        getLegacyTextContent(part) ?? '';

                    if (typeof rawContent === 'string') {
                        const trimmedContent = rawContent.trim();
                        // Only count non-whitespace text
                        if (trimmedContent.length > 0) {
                            characterCount += rawContent.length;
                            hasAnyText = true;

                            // Only set hasStreamingText if content is meaningful (non-whitespace)
                            const time = getPartTimeInfo(part);
                            if (!time || typeof time.end === 'undefined') {
                                hasStreamingText = true;
                            }
                        }
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
    }, [sessionMessages]);

    const workingWithForming = React.useMemo<WorkingSummary>(() => {
        if (baseWorking.wasAborted) {
            return baseWorking;
        }

        if (!forming.isActive) {
            return baseWorking;
        }

        if (baseWorking.activity === 'streaming') {
            return {
                ...baseWorking,
                hasWorkingContext: true,
                isWorking: true,
                isStreaming: true,
                isCooldown: false,
                canAbort: true,
                statusText: baseWorking.statusText,
            };
        }

        return {
            ...baseWorking,
            activity: 'streaming',
            hasWorkingContext: true,
            isWorking: true,
            isStreaming: true,
            isCooldown: false,
            lifecyclePhase: baseWorking.lifecyclePhase ?? 'streaming',
            canAbort: true,
        };
    }, [baseWorking, forming.isActive]);

    const working = React.useMemo<WorkingSummary>(() => {
        const sessionId = currentSessionId;
        const permissionList = sessionId ? permissions?.get(sessionId) ?? [] : [];
        const hasPendingPermission = permissionList.length > 0;

        const base = workingWithForming;

        if (base.wasAborted || base.abortActive) {
            return base;
        }

        let statusText = base.statusText;
        let isWaitingForPermission = false;
        let canAbort = base.canAbort;

        if (hasPendingPermission) {
            statusText = 'waiting for permission';
            isWaitingForPermission = true;
            canAbort = false;
        }

        return {
            ...base,
            statusText,
            isWaitingForPermission,
            canAbort,
        };
    }, [currentSessionId, permissions, workingWithForming]);

    return {
        forming,
        working,
    };
}
