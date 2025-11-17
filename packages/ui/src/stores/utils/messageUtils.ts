import type { Message, Part } from "@opencode-ai/sdk";

// Check if message is a tool/incomplete message that should not hide context display
export const isToolOrIncompleteMessage = (message: { info: Message; parts: Part[] }): boolean => {
    // Check if message has tool parts
    const hasToolParts = message.parts.some(part => (part as { type?: string }).type === 'tool');

    // Check if message has reasoning parts
    const hasReasoningParts = message.parts.some(part => (part as { type?: string }).type === 'reasoning');

    // Check if message has step-finish part (indicates completion)
    const hasStepFinish = message.parts.some(part => (part as { type?: string }).type === 'step-finish');

    // Tool, reasoning, or messages without step-finish should not hide display
    return hasToolParts || hasReasoningParts || !hasStepFinish;
};

export const extractTextFromDelta = (delta: unknown): string => {
    if (!delta) return '';
    if (typeof delta === 'string') return delta;
    if (Array.isArray(delta)) {
        return delta.map((item) => extractTextFromDelta(item)).join('');
    }
    if (typeof delta === 'object') {
        if (typeof (delta as { text?: unknown }).text === 'string') {
            return (delta as { text: string }).text;
        }
        if (Array.isArray((delta as { content?: unknown[] }).content)) {
            return (delta as { content: unknown[] }).content.map((item: unknown) => extractTextFromDelta(item)).join('');
        }
    }
    return '';
};

export const extractTextFromPart = (part: unknown): string => {
    if (!part) return '';
    const typedPart = part as { text?: string | unknown[]; delta?: unknown; content?: string | unknown[] };
    if (typeof typedPart.text === 'string') return typedPart.text;
    if (Array.isArray(typedPart.text)) {
        return typedPart.text.map((item: unknown) => (typeof item === 'string' ? item : extractTextFromPart(item))).join('');
    }
    const deltaText = extractTextFromDelta(typedPart.delta);
    if (deltaText) return deltaText;
    if (typeof typedPart.content === 'string') return typedPart.content;
    if (Array.isArray(typedPart.content)) {
        return typedPart.content
            .map((item: unknown) => {
                if (typeof item === 'string') return item;
                if (item && typeof item === 'object') {
                    const typedItem = item as { text?: string; delta?: unknown };
                    return typedItem.text || extractTextFromDelta(typedItem.delta) || '';
                }
                return '';
            })
            .join('');
    }
    return '';
};

export const normalizeStreamingPart = (incoming: Part, existing?: Part): Part => {
    const normalized: { type?: string; text?: string; delta?: unknown; [key: string]: unknown } = { ...incoming } as { type?: string; text?: string; delta?: unknown; [key: string]: unknown };
    normalized.type = normalized.type || 'text';

    if (normalized.type === 'text') {
        const existingText = existing && typeof (existing as { text?: string }).text === 'string' ? (existing as { text: string }).text : '';
        const directText = typeof normalized.text === 'string' ? normalized.text : '';
        const deltaText = extractTextFromDelta((incoming as { delta?: unknown }).delta);

        if (directText) {
            normalized.text = directText;
        } else if (deltaText) {
            normalized.text = existingText ? `${existingText}${deltaText}` : deltaText;
        } else if (existingText) {
            normalized.text = existingText;
        } else {
            normalized.text = '';
        }

        delete normalized.delta;
    }

    return normalized as Part;
};