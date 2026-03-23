import type { Part } from '@opencode-ai/sdk/v2';

type TextLikePart = Part & { text?: string; content?: string };

export const flattenAssistantTextParts = (parts: Part[]): string => {
    const textParts = parts
        .filter((part): part is TextLikePart => part?.type === 'text')
        .map((part) => (part.text || part.content || '').trim())
        .filter((text) => text.length > 0);

    const combined = textParts.join('\n');
    return combined.replace(/\n\s*\n+/g, '\n');
};
