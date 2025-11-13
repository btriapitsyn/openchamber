import { extractTokensFromMessage } from "./tokenUtils";
import type { Message, Part } from "@opencode-ai/sdk";
import type { SessionStore } from "../types/sessionTypes";

// Smart context usage update function - only polls when tokens are missing
type SessionMessage = { info: Message; parts: Part[] };

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
    const safeContext = Number.isFinite(contextLimit) ? Math.max(contextLimit, 0) : 0;
    const safeOutput = Number.isFinite(outputLimit) ? Math.max(outputLimit, 0) : 0;
    const normalizedOutput = Math.min(safeOutput, safeContext);
    const thresholdLimit = safeContext > 0 ? Math.max(safeContext - normalizedOutput, 1) : 0;
    const percentage = thresholdLimit > 0 ? (totalTokens / thresholdLimit) * 100 : 0;
    set((state) => {
        const newContextUsage = new Map(state.sessionContextUsage);
        newContextUsage.set(sessionId, {
            totalTokens,
            percentage: Math.min(percentage, 100),
            contextLimit: safeContext,
            outputLimit: normalizedOutput,
            thresholdLimit: thresholdLimit || 1,
        });
        return { sessionContextUsage: newContextUsage };
    });

    // ONLY start polling if tokens are zero (async population expected)
    if (totalTokens === 0) {
        get().pollForTokenUpdates(sessionId, lastAssistantMessage.info.id);
    }
};
