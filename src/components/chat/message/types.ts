export type StreamPhase = 'streaming' | 'cooldown' | 'completed';

export interface ToolPopupContent {
    open: boolean;
    title: string;
    content: string;
    language?: string;
    isDiff?: boolean;
    diffHunks?: any[];
    metadata?: any;
}
