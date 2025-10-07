import type { Part } from '@opencode-ai/sdk';

export type GroupStatus = 'working' | 'finished';

export type GroupablePart = Extract<Part, { type: 'tool' | 'reasoning' }>;

export interface ToolGroupDescriptor {
    id: string;
    parts: GroupablePart[];
    status: GroupStatus;
    external?: boolean;
    toolConnections?: Record<string, { hasPrev: boolean; hasNext: boolean }>;
}

export interface ExternalToolGroup {
    groupId: string;
    parts: GroupablePart[];
    status: GroupStatus;
    toolConnections?: Record<string, { hasPrev: boolean; hasNext: boolean }>;
}

export interface MessageGroupingContext {
    group?: ExternalToolGroup;
    hiddenPartIndices?: number[];
    suppressMessage?: boolean;
    toolConnections?: Record<string, { hasPrev: boolean; hasNext: boolean }>;
}
