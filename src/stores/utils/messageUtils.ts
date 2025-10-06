import type { Message, Part } from "@opencode-ai/sdk";

// Check if message is a tool/incomplete message that should not hide context display
export const isToolOrIncompleteMessage = (message: { info: Message; parts: Part[] }): boolean => {
    // Check if message has tool parts
    const hasToolParts = message.parts.some(part => (part as any).type === 'tool');

    // Check if message has reasoning parts
    const hasReasoningParts = message.parts.some(part => (part as any).type === 'reasoning');

    // Check if message has step-finish part (indicates completion)
    const hasStepFinish = message.parts.some(part => (part as any).type === 'step-finish');

    // Tool, reasoning, or messages without step-finish should not hide display
    return hasToolParts || hasReasoningParts || !hasStepFinish;
};

export const extractTextFromDelta = (delta: any): string => {
    if (!delta) return '';
    if (typeof delta === 'string') return delta;
    if (Array.isArray(delta)) {
        return delta.map((item) => extractTextFromDelta(item)).join('');
    }
    if (typeof delta === 'object') {
        if (typeof delta.text === 'string') {
            return delta.text;
        }
        if (Array.isArray(delta.content)) {
            return delta.content.map((item: any) => extractTextFromDelta(item)).join('');
        }
    }
    return '';
};

export const extractTextFromPart = (part: any): string => {
    if (!part) return '';
    if (typeof part.text === 'string') return part.text;
    if (Array.isArray(part.text)) {
        return part.text.map((item: any) => (typeof item === 'string' ? item : extractTextFromPart(item))).join('');
    }
    const deltaText = extractTextFromDelta(part.delta);
    if (deltaText) return deltaText;
    if (typeof part.content === 'string') return part.content;
    if (Array.isArray(part.content)) {
        return part.content
            .map((item: any) => {
                if (typeof item === 'string') return item;
                if (item && typeof item === 'object') {
                    return item.text || extractTextFromDelta(item.delta) || '';
                }
                return '';
            })
            .join('');
    }
    return '';
};

export const normalizeStreamingPart = (incoming: Part, existing?: Part): Part => {
    const normalized: any = { ...incoming };
    normalized.type = normalized.type || 'text';

    if (normalized.type === 'text') {
        const existingText = existing && typeof (existing as any).text === 'string' ? (existing as any).text : '';
        const directText = typeof normalized.text === 'string' ? normalized.text : '';
        const deltaText = extractTextFromDelta((incoming as any).delta);

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