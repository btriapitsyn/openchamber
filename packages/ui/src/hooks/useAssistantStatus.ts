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
};

const DEFAULT_FORMING: FormingSummary = {
    isActive: false,
    characterCount: 0,
};

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

const summarizeMessage = (
    messageInfo: AssistantMessageWithState,
    parts: Part[],
    lifecyclePhase: MessageStreamPhase | null,
    isStreamingCandidate: boolean
): WorkingSummary => {
    const phase: MessageStreamPhase | null = lifecyclePhase === 'completed' ? null : lifecyclePhase;

    const messageStreamingFlag = messageInfo.streaming === true;
    const abortedAt = typeof messageInfo.abortedAt === 'number' ? messageInfo.abortedAt : undefined;
    const status = typeof messageInfo.status === 'string' ? messageInfo.status.toLowerCase() : undefined;
    const abortedStepFinish = parts.some((part) => part.type === 'step-finish' && isAbortedStepFinish(part as StepFinishPart));
    const wasAborted =
        (typeof abortedAt === 'number' && abortedAt > 0) ||
        status === 'aborted' ||
        status === 'abort' ||
        abortedStepFinish;

    // Message is complete when BOTH conditions are met:
    // 1. time.completed is set (SSE confirmed all parts are ready)
    // 2. Has step-finish with reason "stop" (no more parts coming)
    const timeInfo = messageInfo.time ?? {};
    const hasCompletedTime = typeof timeInfo.completed === 'number' && timeInfo.completed > 0;
    const hasStopFinish = parts.some((part) => isStepFinishPart(part) && getStepFinishReason(part) === 'stop');
    const messageIsComplete = hasCompletedTime && hasStopFinish;

    let detectedActiveTools = false;
    let detectedStreamingText = false;
    let activePartType: 'text' | 'tool' | 'reasoning' | 'editing' | undefined = undefined;
    let activeToolName: string | undefined = undefined;

     // File editing tools that should show "Editing..." status
     const editingTools = new Set(['edit', 'write']);

    // Iterate in reverse to find the latest active part
    // Skip step-start markers and find actual work parts
    for (let i = parts.length - 1; i >= 0; i--) {
        const part = parts[i];
        
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
                const status = part.state?.status;
                if (status === 'running' || status === 'pending') {
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
            case 'step-start': {
                detectedActiveTools = true;
                // Skip - this is just a marker, not actual work
                break;
            }
            case 'text': {
                const rawContent =
                    getLegacyTextContent(part) ??
                    '';

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

    // If message is complete (has step-finish with reason='stop'), it's done - no activity
    if (messageIsComplete) {
        return {
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
        };
    }

    const isStreamingPhase = phase === 'streaming';
    const hasActiveTools = detectedActiveTools;
    const hasStreamingText = detectedStreamingText;
    const streamingFlagActive = messageStreamingFlag === true;

    const isStreaming = isStreamingPhase || streamingFlagActive || (isStreamingCandidate && (hasStreamingText || hasActiveTools));
    const hasWorkingContext = hasActiveTools || isStreaming;

    let activity: AssistantActivity = 'idle';
    if (isStreaming) {
        activity = 'streaming';
    } else if (hasActiveTools) {
        activity = 'tooling';
    } else if (phase === 'cooldown') {
        activity = 'cooldown';
    }

    if (wasAborted) {
        return {
            activity: 'cooldown',
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
            activePartType,
            activeToolName,
            wasAborted: true,
            abortActive: true,
            lastCompletionId: null,
        };
    }

    return {
        activity,
        hasWorkingContext,
        hasActiveTools,
        isWorking: activity === 'streaming' || activity === 'tooling',
        isStreaming,
        isCooldown: activity === 'cooldown',
        lifecyclePhase: phase,
        statusText: null,
        isWaitingForPermission: false,
        canAbort: activity === 'streaming' || activity === 'tooling',
        compactionDeadline: null,
        activePartType,
        activeToolName,
        wasAborted,
        abortActive: false,
        lastCompletionId: null,
    };
};

export function useAssistantStatus(): AssistantStatusSnapshot {
    const { currentSessionId, messages, messageStreamStates, streamingMessageId, sessionCompactionUntil, permissions, sessionAbortFlags } = useSessionStore(
        useShallow((state) => ({
            currentSessionId: state.currentSessionId,
            messages: state.messages,
            messageStreamStates: state.messageStreamStates,
            streamingMessageId: state.streamingMessageId,
            sessionCompactionUntil: state.sessionCompactionUntil,
            permissions: state.permissions,
            sessionAbortFlags: state.sessionAbortFlags,
        }))
    );

    const lastCompletionIdPerSessionRef = React.useRef<Map<string, string>>(new Map());
    const lastStatusPerSessionRef = React.useRef<Map<string, string>>(new Map());

    const sessionMessages = React.useMemo<Array<{ info: Message; parts: Part[] }>>(() => {
        if (!currentSessionId) {
            return [];
        }
        const records = messages.get(currentSessionId) ?? [];
        return records as Array<{ info: Message; parts: Part[] }>;
    }, [currentSessionId, messages]);

    const baseWorking = React.useMemo<WorkingSummary>(() => {
        if (sessionMessages.length === 0) {
            return DEFAULT_WORKING;
        }

        // Get last assistant message
        const assistantMessages = sessionMessages
            .filter(
                (msg): msg is AssistantSessionMessageRecord =>
                    isAssistantMessage(msg.info) && !isFullySyntheticMessage(msg.parts)
            );

        if (assistantMessages.length === 0) {
            return DEFAULT_WORKING;
        }

        const sortedAssistantMessages = [...assistantMessages].sort((a, b) => a.info.id.localeCompare(b.info.id));

        const lastAssistant = sortedAssistantMessages[sortedAssistantMessages.length - 1];

        // Message is complete when BOTH conditions are met:
        // 1. time.completed is set (SSE confirmed all parts are ready)
        // 2. Has step-finish with reason "stop" (no more parts coming)
        const timeInfo = lastAssistant.info.time ?? {};
        const hasCompletedTime = typeof timeInfo.completed === 'number' && timeInfo.completed > 0;
        const hasStopFinish = (lastAssistant.parts ?? []).some(
            (part) => isStepFinishPart(part) && getStepFinishReason(part) === 'stop'
        );
        const isComplete = hasCompletedTime && hasStopFinish;

        // If complete, no status indicator
        if (isComplete) {
            if (currentSessionId) {
                lastCompletionIdPerSessionRef.current.set(currentSessionId, lastAssistant.info.id);
            }
            const lastCompletionId = currentSessionId ? lastCompletionIdPerSessionRef.current.get(currentSessionId) ?? null : null;
            return {
                ...DEFAULT_WORKING,
                lastCompletionId,
            };
        }

        // Otherwise, analyze the last message to show status
        const lifecycle = messageStreamStates.get(lastAssistant.info.id);
        const summary = summarizeMessage(
            lastAssistant.info,
            lastAssistant.parts ?? [],
            lifecycle?.phase ?? null,
            lastAssistant.info.id === streamingMessageId
        );

        const lastCompletionId = currentSessionId ? lastCompletionIdPerSessionRef.current.get(currentSessionId) ?? null : null;
        return {
            ...summary,
            lastCompletionId,
        };
    }, [currentSessionId, messageStreamStates, sessionMessages, streamingMessageId]);

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

                const lifecycle = messageStreamStates.get(message.info.id);
                const phase = lifecycle?.phase;
                const isStreamingPhase = phase === 'streaming';
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
    }, [messageStreamStates, sessionMessages]);

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
        const compactionDeadline = sessionId ? sessionCompactionUntil?.get(sessionId) ?? null : null;
        const now = Date.now();
        const isCompacting = Boolean(compactionDeadline && compactionDeadline > now);

        const permissionList = sessionId ? permissions?.get(sessionId) ?? [] : [];
        const hasPendingPermission = permissionList.length > 0;

        const base = {
            ...workingWithForming,
            compactionDeadline,
        };

        const abortRecord = sessionId ? sessionAbortFlags?.get(sessionId) ?? null : null;
        const abortTimestamp = abortRecord?.timestamp ?? null;
        const abortAcknowledged = abortRecord?.acknowledged ?? false;

        // Only show abort if no new activity has started and last message isn't complete
        const hasNewActivity = base.isWorking || base.isStreaming || base.hasActiveTools;
        const lastMessageComplete = base.lastCompletionId !== null;
        const shouldShowAbort = abortTimestamp && !hasNewActivity && !lastMessageComplete;

        if (shouldShowAbort) {
            return {
                ...base,
                activity: 'cooldown',
                hasWorkingContext: false,
                hasActiveTools: false,
                isWorking: false,
                isStreaming: false,
                isCooldown: false,
                statusText: null,
                isWaitingForPermission: false,
                canAbort: false,
                wasAborted: !abortAcknowledged,
                abortActive: true,
            };
        }

        let activity = base.activity;
        let hasWorkingContext = base.hasWorkingContext;
        let isWorking = base.isWorking;
        let isStreaming = base.isStreaming;
        let isCooldown = base.isCooldown;
        let statusText = base.statusText;
        let canAbort = base.canAbort && !hasPendingPermission && !isCompacting;
        let isWaitingForPermission = false;
        let wasAborted = base.wasAborted;
        let abortActive = base.abortActive;

        const lastStatus = sessionId ? lastStatusPerSessionRef.current.get(sessionId) ?? 'working' : 'working';

        if (hasPendingPermission) {
            activity = 'permission';
            hasWorkingContext = true;
            isWorking = true;
            isStreaming = false;
            isCooldown = false;
            statusText = 'waiting for permission';
            isWaitingForPermission = true;
            canAbort = false;
            if (sessionId) lastStatusPerSessionRef.current.set(sessionId, statusText);
            wasAborted = false;
        } else if (isCompacting) {
            activity = 'cooldown';
            hasWorkingContext = true;
            isWorking = true;
            isStreaming = false;
            isCooldown = true;
            statusText = 'compacting';
            canAbort = false;
            if (sessionId) lastStatusPerSessionRef.current.set(sessionId, statusText);
            wasAborted = false;
        } else if (isWorking) {
            // Generate dynamic status text based on active part
            if (base.activePartType === 'editing') {
                statusText = 'editing';
                if (sessionId) lastStatusPerSessionRef.current.set(sessionId, statusText);
            } else if (base.activePartType === 'tool' && base.activeToolName) {
                statusText = `using ${base.activeToolName}`;
                if (sessionId) lastStatusPerSessionRef.current.set(sessionId, statusText);
            } else if (base.activePartType === 'reasoning') {
                statusText = 'thinking';
                if (sessionId) lastStatusPerSessionRef.current.set(sessionId, statusText);
            } else if (base.activePartType === 'text') {
                statusText = 'writing';
                if (sessionId) lastStatusPerSessionRef.current.set(sessionId, statusText);
            } else {
                // No active part detected, keep showing last known status for this session
                statusText = lastStatus;
            }
            canAbort = activity === 'streaming' || activity === 'tooling';
            wasAborted = false;
        } else {
            statusText = null;
            canAbort = false;
            if (sessionId) lastStatusPerSessionRef.current.set(sessionId, 'working');
            abortActive = false;
        }

        return {
            ...base,
            activity,
            hasWorkingContext,
            isWorking,
            isStreaming,
            isCooldown,
            statusText,
            isWaitingForPermission,
            canAbort,
            compactionDeadline,
            wasAborted,
            abortActive,
            lastCompletionId: base.lastCompletionId,
        };
    }, [currentSessionId, permissions, sessionCompactionUntil, sessionAbortFlags, workingWithForming]);

    return {
        forming,
        working,
    };
}
