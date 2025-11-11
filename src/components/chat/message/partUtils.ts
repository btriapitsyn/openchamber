import type { Part } from '@opencode-ai/sdk';

type PartWithText = Part & { text?: string; content?: string; value?: string };

export const extractTextContent = (part: Part): string => {
    const partWithText = part as PartWithText;
    const rawText = partWithText.text;
    if (typeof rawText === 'string') {
        return rawText;
    }
    return partWithText.content || partWithText.value || '';
};

export const isEmptyTextPart = (part: Part): boolean => {
    if (part.type !== 'text') {
        return false;
    }
    const text = extractTextContent(part);
    return !text || text.trim().length === 0;
};

type PartWithSynthetic = Part & { synthetic?: boolean };

export const filterVisibleParts = (parts: Part[]): Part[] => {
    return parts.filter((part) => {
        const partWithSynthetic = part as PartWithSynthetic;
        const isSynthetic = 'synthetic' in partWithSynthetic && partWithSynthetic.synthetic;
        const isPatchPart = part.type === 'patch';
        const isStepStart = part.type === 'step-start';
        const isStepFinish = part.type === 'step-finish';
        return !isSynthetic && !isPatchPart && !isStepStart && !isStepFinish;
    });
};

type PartWithTime = Part & { time?: { start?: number; end?: number } };

export const isFinalizedTextPart = (part: Part): boolean => {
    if (part.type !== 'text') {
        return false;
    }
    const time = (part as PartWithTime).time;
    return Boolean(time && typeof time.end !== 'undefined');
};
