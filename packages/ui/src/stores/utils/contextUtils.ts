import { extractTokensFromMessage } from "./tokenUtils";
import type { Message, Part } from "@opencode-ai/sdk";
import type { SessionStore } from "../types/sessionTypes";

// Smart context usage update function - only polls when tokens are missing
type SessionMessage = { info: Message; parts: Part[] };

export const calculateContextUsage = (
    totalTokens: number,
    contextLimit: number,
    outputLimit: number
) => {
    const safeContext = Number.isFinite(contextLimit) ? Math.max(contextLimit, 0) : 0;
    const hasOutputLimit = Number.isFinite(outputLimit) && outputLimit > 0;
    const safeOutput = hasOutputLimit ? Math.max(outputLimit, 0) : 0;
    // Server logic: usable = context - min(output, 32000); use 32k floor when output is missing/unbounded
    const effectiveOutputReservation = Math.min(hasOutputLimit ? safeOutput : 32000, 32000);
    const normalizedOutput = Math.min(effectiveOutputReservation, safeContext);
    const thresholdLimit = safeContext > 0 ? Math.max(safeContext - normalizedOutput, 1) : 0;
    const percentage = thresholdLimit > 0 ? (totalTokens / thresholdLimit) * 100 : 0;

    return {
        percentage: Math.min(percentage, 100),
        contextLimit: safeContext,
        outputLimit: safeOutput, // Display the model's declared output limit (not the 32k cap)
        thresholdLimit: thresholdLimit || 1,
        normalizedOutput // Return the capped reservation if needed internally
    };
};

export const smartUpdateContextUsage = (
    get: () => SessionStore,
    set: (updater: (state: SessionStore) => Partial<SessionStore>) => void,
    sessionId: string,
    contextLimit: number,
    outputLimit: number
) => {

    const sessionMessages = (get().messages.get(sessionId) || []) as SessionMessage[];
    const assistantMessages = sessionMessages.filter((message) => message.info.role === 'assistant');

    if (assistantMessages.length === 0) return;

    const lastAssistantMessage = assistantMessages[assistantMessages.length - 1];
    const totalTokens = extractTokensFromMessage(lastAssistantMessage);

    // Update cache immediately
    const usage = calculateContextUsage(totalTokens, contextLimit, outputLimit);

    set((state) => {
        const newContextUsage = new Map(state.sessionContextUsage);
        newContextUsage.set(sessionId, {
            totalTokens,
            percentage: usage.percentage,
            contextLimit: usage.contextLimit,
            outputLimit: usage.outputLimit,
            normalizedOutput: usage.normalizedOutput,
            thresholdLimit: usage.thresholdLimit,
        });
        return { sessionContextUsage: newContextUsage };
    });

    // ONLY start polling if tokens are zero (async population expected)
    if (totalTokens === 0) {
        get().pollForTokenUpdates(sessionId, lastAssistantMessage.info.id);
    }
};
