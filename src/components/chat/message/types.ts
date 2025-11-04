export type StreamPhase = 'streaming' | 'cooldown' | 'completed';

export type DiffViewMode = 'side-by-side' | 'unified';

export interface ToolPopupContent {
    open: boolean;
    title: string;
    content: string;
    language?: string;
    isDiff?: boolean;
    diffHunks?: Array<Record<string, unknown>>;
    metadata?: Record<string, unknown>;
    image?: {
        url: string;
        mimeType?: string;
        filename?: string;
        size?: number;
    };
}
