import React from 'react';
import type { Part } from '@opencode-ai/sdk';
import { useShallow } from 'zustand/react/shallow';

import type { MessageStreamPhase } from '@/stores/types/sessionTypes';
import { useSessionStore } from '@/stores/useSessionStore';
import { hasAnimatingWork } from '@/lib/messageCompletion';

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
};

const DEFAULT_FORMING: FormingSummary = {
    isActive: false,
    characterCount: 0,
};

const summarizeMessage = (
    messageInfo: Record<string, any> | undefined,
    parts: Part[],
    lifecyclePhase: MessageStreamPhase | null,
    isStreamingCandidate: boolean
): WorkingSummary => {
    const phase: MessageStreamPhase | null = lifecyclePhase === 'completed' ? null : lifecyclePhase;

    const timeInfo = (messageInfo as any)?.time ?? {};
    const completedAt = typeof timeInfo?.completed === 'number' ? timeInfo.completed : undefined;
    const messageStatus = (messageInfo as any)?.status;
    const messageStreamingFlag = (messageInfo as any)?.streaming;
    
    // Match TUI logic: message is complete only if time.completed is set
    const messageIsComplete = Boolean(
        (typeof completedAt === 'number' && completedAt > 0) ||
        messageStatus === 'completed'
    );

    let detectedActiveTools = false;
    let detectedStreamingText = false;
    let activePartType: 'text' | 'tool' | 'reasoning' | 'editing' | undefined = undefined;
    let activeToolName: string | undefined = undefined;

    // File editing tools that should show "Editing..." status
    const editingTools = new Set(['edit', 'write']);

    // Iterate in reverse to find the latest active part
    for (let i = parts.length - 1; i >= 0; i--) {
        const part = parts[i];
        
        switch (part.type) {
            case 'reasoning': {
                const time = (part as any)?.time;
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
                const status = (part as any)?.state?.status;
                if (status === 'running' || status === 'pending') {
                    detectedActiveTools = true;
                    if (!activePartType) {
                        const toolName = (part as any)?.tool || (part as any)?.name || 'tool';
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
                break;
            }
            case 'text': {
                const rawContent =
                    (part as any).text ||
                    (part as any).content ||
                    (part as any).value ||
                    '';

                if (typeof rawContent === 'string' && rawContent.trim().length > 0) {
                    const time = (part as any).time;
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

    const isStreamingPhase = phase === 'streaming';
    let hasActiveTools = detectedActiveTools;
    let hasStreamingText = detectedStreamingText;
    const streamingFlagActive = !messageIsComplete && messageStreamingFlag === true;

    if (messageIsComplete) {
        hasActiveTools = false;
        hasStreamingText = false;
    }

    const isStreaming = isStreamingPhase || streamingFlagActive || (isStreamingCandidate && !messageIsComplete && (hasStreamingText || hasActiveTools));
    const hasWorkingContext = !messageIsComplete || hasActiveTools || isStreaming;

    let activity: AssistantActivity = 'idle';
    if (isStreaming) {
        activity = 'streaming';
    } else if (hasActiveTools || !messageIsComplete) {
        activity = 'tooling';
    } else if (phase === 'cooldown') {
        activity = 'cooldown';
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
    };
};

export function useAssistantStatus(): AssistantStatusSnapshot {
    const { currentSessionId, messages, messageStreamStates, streamingMessageId, sessionCompactionUntil, permissions } = useSessionStore(
        useShallow((state) => ({
            currentSessionId: state.currentSessionId,
            messages: state.messages,
            messageStreamStates: state.messageStreamStates,
            streamingMessageId: state.streamingMessageId,
            sessionCompactionUntil: state.sessionCompactionUntil,
            permissions: state.permissions,
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

    const baseWorking = React.useMemo<WorkingSummary>(() => {
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
            // Get all assistant messages and sort by ID lexicographically (like TUI)
            const assistantMessages = sessionMessages
                .filter(msg => msg.info.role === 'assistant')
                .sort((a, b) => (a.info.id || "").localeCompare(b.info.id || ""));
            
            // Start from the lexicographically latest assistant message (end of array)
            for (let i = assistantMessages.length - 1; i >= 0; i -= 1) {
                const message = assistantMessages[i];
                if (!message) {
                    continue;
                }
                if (limitToActive && relevantIds.size > 0 && !relevantIds.has(message.info.id)) {
                    continue;
                }

                const lifecycle = messageStreamStates.get(message.info.id);
                const summary = summarizeMessage(
                    message.info as Record<string, any>,
                    message.parts ?? [],
                    lifecycle?.phase ?? null,
                    message.info.id === streamingMessageId
                );
                if (summary.hasWorkingContext) {
                    return summary;
                }
            }
            return DEFAULT_WORKING;
        };

        // First try to find an actively streaming message
        const activeSummary = findSummary(true);
        if (activeSummary !== DEFAULT_WORKING) {
            return activeSummary;
        }

        // If no active streaming found, check if any assistant message has animating work
        // This matches TUI's HasAnimatingWork logic
        const hasAnyAnimatingWork = hasAnimatingWork(sessionMessages);
        if (hasAnyAnimatingWork) {
            // Find the latest assistant message with work
            return findSummary(false);
        }

        return DEFAULT_WORKING;
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
                        (part as any).text ||
                        (part as any).content ||
                        (part as any).value ||
                        '';

                    if (typeof rawContent === 'string') {
                        const trimmedContent = rawContent.trim();
                        // Only count non-whitespace text
                        if (trimmedContent.length > 0) {
                            characterCount += rawContent.length;
                            hasAnyText = true;

                            // Only set hasStreamingText if content is meaningful (non-whitespace)
                            const time = (part as any).time;
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
    }, [messageStreamStates, sessionMessages, streamingMessageId]);

    const workingWithForming = React.useMemo<WorkingSummary>(() => {
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

        let activity = base.activity;
        let hasWorkingContext = base.hasWorkingContext;
        let isWorking = base.isWorking;
        let isStreaming = base.isStreaming;
        let isCooldown = base.isCooldown;
        let statusText = base.statusText;
        let canAbort = base.canAbort && !hasPendingPermission && !isCompacting;
        let isWaitingForPermission = false;

        if (hasPendingPermission) {
            activity = 'permission';
            hasWorkingContext = true;
            isWorking = true;
            isStreaming = false;
            isCooldown = false;
            statusText = 'waiting for permission';
            isWaitingForPermission = true;
            canAbort = false;
        } else if (isCompacting) {
            activity = 'cooldown';
            hasWorkingContext = true;
            isWorking = true;
            isStreaming = false;
            isCooldown = true;
            statusText = 'compacting';
            canAbort = false;
        } else if (isWorking) {
            // Generate dynamic status text based on active part
            if (base.activePartType === 'editing') {
                statusText = 'editing';
            } else if (base.activePartType === 'tool' && base.activeToolName) {
                statusText = `using ${base.activeToolName}`;
            } else if (base.activePartType === 'reasoning') {
                statusText = 'thinking';
            } else if (base.activePartType === 'text') {
                statusText = 'writing';
            } else {
                statusText = statusText ?? 'working';
            }
            canAbort = activity === 'streaming' || activity === 'tooling';
        } else {
            statusText = null;
            canAbort = false;
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
        };
    }, [currentSessionId, permissions, sessionCompactionUntil, workingWithForming]);

    return {
        forming,
        working,
    };
}