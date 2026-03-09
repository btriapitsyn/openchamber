import React from 'react';
import { projectTurnRecords } from '../lib/turns/projectTurnRecords';
import { stabilizeTurnProjection } from '../lib/turns/stabilizeTurnProjection';
import type { ChatMessageEntry, TurnProjectionResult } from '../lib/turns/types';

export interface TurnRecordsResult {
    projection: TurnProjectionResult;
    staticTurns: TurnProjectionResult['turns'];
    streamingTurn: TurnProjectionResult['turns'][number] | undefined;
}

export const useTurnRecords = (
    messages: ChatMessageEntry[],
): TurnRecordsResult => {
    const previousProjectionRef = React.useRef<TurnProjectionResult | null>(null);

    const projection = React.useMemo(() => {
        const rawProjection = projectTurnRecords(messages, {
            previousProjection: previousProjectionRef.current,
        });
        const stabilizedProjection = stabilizeTurnProjection(rawProjection, previousProjectionRef.current);
        previousProjectionRef.current = stabilizedProjection;
        return stabilizedProjection;
    }, [messages]);

    const staticTurns = React.useMemo(() => {
        if (projection.turns.length <= 1) {
            return [];
        }
        return projection.turns.slice(0, -1);
    }, [projection.turns]);

    const streamingTurn = React.useMemo(() => {
        if (projection.turns.length === 0) {
            return undefined;
        }
        return projection.turns[projection.turns.length - 1];
    }, [projection.turns]);

    return {
        projection,
        staticTurns,
        streamingTurn,
    };
};
