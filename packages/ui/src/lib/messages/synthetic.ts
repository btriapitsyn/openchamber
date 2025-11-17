import type { Part } from "@opencode-ai/sdk";

const isSyntheticPart = (part: Part | undefined): boolean => {
    if (!part || typeof part !== "object") {
        return false;
    }
    return Boolean((part as { synthetic?: boolean }).synthetic);
};

export const isFullySyntheticMessage = (parts: Part[] | undefined): boolean => {
    if (!Array.isArray(parts) || parts.length === 0) {
        return false;
    }

    return parts.every((part) => isSyntheticPart(part));
};
