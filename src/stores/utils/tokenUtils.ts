import type { Message, Part } from "@opencode-ai/sdk";

// Token extraction utilities for session store
export const extractTokensFromMessage = (message: { info: Message; parts: Part[] }): number => {
    const tokens = (message.info as { tokens?: number | { input?: number; output?: number; reasoning?: number; cache?: { read?: number; write?: number } } }).tokens;

    if (tokens) {
        if (typeof tokens === 'number') {
            return tokens;
        } else if (typeof tokens === 'object' && tokens !== null) {
            // Calculate base tokens
            const baseTokens = (tokens.input || 0) + (tokens.output || 0) + (tokens.reasoning || 0);

            // Handle cache tokens intelligently
            if (tokens.cache && typeof tokens.cache === 'object') {
                const cacheRead = tokens.cache.read || 0;
                const cacheWrite = tokens.cache.write || 0;
                const totalCache = cacheRead + cacheWrite;

                // If cache is larger than base tokens, add cache (separate counting)
                // If cache is smaller/equal, it's already included in input/output
                if (totalCache > baseTokens) {
                    return baseTokens + totalCache;
                }
            }

            return baseTokens;
        }
    }

    // Fallback: check parts for tokens
    const tokenParts = message.parts.filter(p => (p as { tokens?: number | { input?: number; output?: number; reasoning?: number; cache?: { read?: number; write?: number } } }).tokens);
    if (tokenParts.length > 0) {
        const partTokens = (tokenParts[0] as { tokens: number | { input?: number; output?: number; reasoning?: number; cache?: { read?: number; write?: number } } }).tokens;
        if (typeof partTokens === 'number') {
            return partTokens;
        } else if (typeof partTokens === 'object' && partTokens !== null) {
            const baseTokens = (partTokens.input || 0) + (partTokens.output || 0) + (partTokens.reasoning || 0);

            if (partTokens.cache && typeof partTokens.cache === 'object') {
                const cacheRead = partTokens.cache.read || 0;
                const cacheWrite = partTokens.cache.write || 0;
                const totalCache = cacheRead + cacheWrite;

                if (totalCache > baseTokens) {
                    return baseTokens + totalCache;
                }
            }

            return baseTokens;
        }
    }

    return 0;
};