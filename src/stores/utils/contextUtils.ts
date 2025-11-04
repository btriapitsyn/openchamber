import { extractTokensFromMessage } from "./tokenUtils";

// Smart context usage update function - only polls when tokens are missing
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const smartUpdateContextUsage = (get: () => any, set: (updater: (state: any) => any) => void, sessionId: string, contextLimit: number) => {

    const sessionMessages = get().messages.get(sessionId) || [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const assistantMessages = sessionMessages.filter((m: any) => m.info.role === 'assistant');

    if (assistantMessages.length === 0) return;

    const lastAssistantMessage = assistantMessages[assistantMessages.length - 1];
    const totalTokens = extractTokensFromMessage(lastAssistantMessage);

    // Update cache immediately
    const percentage = contextLimit > 0 ? (totalTokens / contextLimit) * 100 : 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    set((state: any) => {
        const newContextUsage = new Map(state.sessionContextUsage);
        newContextUsage.set(sessionId, {
            totalTokens,
            percentage: Math.min(percentage, 100),
            contextLimit,
        });
        return { sessionContextUsage: newContextUsage };
    });

    // ONLY start polling if tokens are zero (async population expected)
    if (totalTokens === 0) {
        get().pollForTokenUpdates(sessionId, lastAssistantMessage.info.id);
    }
};