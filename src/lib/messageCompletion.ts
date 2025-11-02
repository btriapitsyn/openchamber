import type { Part } from "@opencode-ai/sdk";

export interface MessageInfo {
    id: string;
    role: string;
    time?: {
        created?: number;
        completed?: number;
    };
    status?: string;
    streaming?: boolean;
}

export interface MessageRecord {
    info: MessageInfo & Record<string, any>;
    parts: Part[];
}

/**
 * Matches TUI's IsBusy logic: 
 * Returns true if the message lacks time.completed or has pending/running tools
 */
export function isMessageComplete(messageInfo: MessageInfo, parts: Part[] = []): boolean {
    const timeInfo = messageInfo?.time ?? {};
    const completedAt = typeof timeInfo?.completed === 'number' ? timeInfo.completed : undefined;
    const messageStatus = messageInfo?.status;
    
    // Check for step-finish with reason "stop" - definitive completion signal
    const hasStopFinish = parts.some(part => 
        part.type === 'step-finish' && (part as any).reason === 'stop'
    );
    
    // Message is complete when both conditions met:
    // 1. SSE sent message.completed event (time.completed or status='completed')
    // 2. Has step-finish with reason "stop" (no more messages coming)
    const hasCompletedFlag = (typeof completedAt === 'number' && completedAt > 0) || messageStatus === 'completed';
    if (!hasCompletedFlag || !hasStopFinish) {
        return false;
    }
    
    // Check for active tools in this message
    const hasActiveTools = parts.some((part) => {
        switch (part.type) {
            case 'reasoning': {
                const time = (part as any)?.time;
                return !time || typeof time.end === 'undefined';
            }
            case 'tool': {
                const status = (part as any)?.state?.status;
                return status === 'running' || status === 'pending';
            }
            default:
                return false;
        }
    });
    
    // Message is incomplete if it has active tools
    return !hasActiveTools;
}

/**
 * Get the lexicographically latest assistant message ID from a list of messages
 * Matches TUI's message ordering logic
 */
export function getLatestAssistantMessageId(messages: MessageRecord[]): string | null {
    const assistantMessages = messages
        .filter(msg => msg.info.role === 'assistant')
        .sort((a, b) => (a.info.id || "").localeCompare(b.info.id || ""));
    
    return assistantMessages.length > 0 
        ? assistantMessages[assistantMessages.length - 1].info.id 
        : null;
}

/**
 * Matches TUI's HasAnimatingWork logic:
 * Returns true if any assistant message is incomplete or has pending/running tools
 */
export function hasAnimatingWork(messages: MessageRecord[]): boolean {
    if (messages.length === 0) {
        return false;
    }

    // Check all assistant messages for incomplete work
    for (const message of messages) {
        if (message.info.role !== 'assistant') {
            continue;
        }

        if (!isMessageComplete(message.info, message.parts)) {
            return true;
        }
    }

    return false;
}

/**
 * Check if streaming should continue based on TUI logic:
 * - Find lexicographically latest assistant message
 * - Check if it has time.completed and no active tools
 */
export function shouldContinueStreaming(
    messages: MessageRecord[], 
    currentStreamingId: string | null
): boolean {
    const latestId = getLatestAssistantMessageId(messages);
    if (!latestId) {
        return false;
    }
    
    // If we have a current streaming ID, check if it matches the latest
    if (currentStreamingId && currentStreamingId !== latestId) {
        return true; // Still streaming the current message
    }
    
    const latestMessage = messages.find(msg => msg.info.id === latestId);
    if (!latestMessage) {
        return false;
    }
    
    // Continue streaming if the latest message is not complete
    return !isMessageComplete(latestMessage.info, latestMessage.parts);
}