import type { Part } from '@opencode-ai/sdk';

export const extractTextContent = (part: Part): string => {
    const rawText = (part as any).text;
    if (typeof rawText === 'string') {
        return rawText;
    }
    return (part as any).content || (part as any).value || '';
};

export const isEmptyTextPart = (part: Part): boolean => {
    if (part.type !== 'text') {
        return false;
    }
    const text = extractTextContent(part);
    return !text || text.trim().length === 0;
};

export const filterVisibleParts = (parts: Part[]): Part[] => {
    return parts.filter((part: any) => !('synthetic' in part && part.synthetic));
};
