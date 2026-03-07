import { projectTurnIndexes } from './projectTurnIndexes';
import type { TurnProjectionResult, TurnRecord } from './types';

const buildTurnSignature = (turn: TurnRecord): string => {
    const assistantIds = turn.assistantMessageIds.join(',');
    const activityIds = turn.activityParts.map((part) => part.id).join(',');
    const segmentIds = turn.activitySegments.map((segment) => `${segment.id}:${segment.parts.length}`).join(',');
    return [
        turn.turnId,
        turn.headerMessageId ?? '',
        assistantIds,
        activityIds,
        segmentIds,
        turn.summaryText ?? '',
        turn.stream.isStreaming ? '1' : '0',
        turn.stream.isRetrying ? '1' : '0',
        turn.completedAt ?? '',
    ].join('|');
};

export const stabilizeTurnProjection = (
    nextProjection: TurnProjectionResult,
    previousProjection: TurnProjectionResult | null,
): TurnProjectionResult => {
    if (!previousProjection || previousProjection.turns.length === 0 || nextProjection.turns.length === 0) {
        return nextProjection;
    }

    const previousById = new Map(previousProjection.turns.map((turn) => [turn.turnId, turn]));
    let reused = false;

    const stabilizedTurns = nextProjection.turns.map((turn, index) => {
        const isLastTurn = index === nextProjection.turns.length - 1;
        if (isLastTurn) {
            return turn;
        }

        const previousTurn = previousById.get(turn.turnId);
        if (!previousTurn) {
            return turn;
        }

        if (buildTurnSignature(previousTurn) !== buildTurnSignature(turn)) {
            return turn;
        }

        reused = true;
        return previousTurn;
    });

    if (!reused) {
        return nextProjection;
    }

    const projection = projectTurnIndexes(stabilizedTurns);
    return {
        ...projection,
        ungroupedMessageIds: nextProjection.ungroupedMessageIds,
    };
};
