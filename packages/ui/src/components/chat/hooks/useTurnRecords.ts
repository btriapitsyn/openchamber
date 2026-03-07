import React from 'react';
import { projectTurnRecords } from '../lib/turns/projectTurnRecords';
import type { ChatMessageEntry, TurnProjectionResult } from '../lib/turns/types';

interface UseTurnRecordsOptions {
    showTextJustificationActivity: boolean;
}

export interface TurnRecordsResult {
    projection: TurnProjectionResult;
    staticTurns: TurnProjectionResult['turns'];
    streamingTurn: TurnProjectionResult['turns'][number] | undefined;
}

export const useTurnRecords = (
    messages: ChatMessageEntry[],
    options: UseTurnRecordsOptions,
): TurnRecordsResult => {
    const projection = React.useMemo(() => {
        return projectTurnRecords(messages, {
            showTextJustificationActivity: options.showTextJustificationActivity,
        });
    }, [messages, options.showTextJustificationActivity]);

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
