import React from 'react';
import { useCurrentSessionActivity } from '@/hooks/useSessionActivity';
import { useUIStore } from '@/stores/useUIStore';
import { projectTurnRecords } from '../lib/turns/projectTurnRecords';
import type {
    ChatMessageEntry,
    Turn,
    TurnActivityGroup,
    TurnActivityRecord as TurnActivityPart,
    TurnGroupingContext,
    TurnRecord,
} from '../lib/turns/types';

export type {
    ChatMessageEntry,
    Turn,
    TurnActivityPart,
    TurnActivityGroup,
    TurnGroupingContext,
};

export const detectTurns = (messages: ChatMessageEntry[]): Turn[] => {
    return projectTurnRecords(messages, { showTextJustificationActivity: false }).turns.map((turn) => ({
        turnId: turn.turnId,
        userMessage: turn.userMessage,
        assistantMessages: turn.assistantMessages,
    }));
};

interface UseTurnGroupingResult {
    turns: Turn[];
    getTurnForMessage: (messageId: string) => Turn | undefined;
    getContextForMessage: (messageId: string) => TurnGroupingContext | undefined;
}

export const useTurnGrouping = (messages: ChatMessageEntry[]): UseTurnGroupingResult => {
    const { isWorking: sessionIsWorking } = useCurrentSessionActivity();
    const showTextJustificationActivity = useUIStore((state) => state.showTextJustificationActivity);

    const projection = React.useMemo(() => {
        return projectTurnRecords(messages, {
            showTextJustificationActivity,
        });
    }, [messages, showTextJustificationActivity]);

    const turns = React.useMemo<Turn[]>(() => {
        return projection.turns.map((turn) => ({
            turnId: turn.turnId,
            userMessage: turn.userMessage,
            assistantMessages: turn.assistantMessages,
        }));
    }, [projection.turns]);

    const [turnUiStates, setTurnUiStates] = React.useState<Map<string, { isExpanded: boolean }>>(() => new Map());
    const toolCallExpansion = useUIStore((state) => state.toolCallExpansion);
    const defaultActivityExpanded =
        toolCallExpansion === 'activity' || toolCallExpansion === 'detailed' || toolCallExpansion === 'changes';

    React.useEffect(() => {
        setTurnUiStates(new Map());
    }, [toolCallExpansion]);

    const toggleGroup = React.useCallback((turnId: string) => {
        setTurnUiStates((prev) => {
            const next = new Map(prev);
            const current = next.get(turnId) ?? { isExpanded: defaultActivityExpanded };
            next.set(turnId, { isExpanded: !current.isExpanded });
            return next;
        });
    }, [defaultActivityExpanded]);

    const getTurnForMessage = React.useCallback((messageId: string): Turn | undefined => {
        const turnId = projection.indexes.messageToTurnId.get(messageId);
        if (!turnId) {
            return undefined;
        }
        const record = projection.indexes.turnById.get(turnId);
        if (!record) {
            return undefined;
        }
        return {
            turnId: record.turnId,
            userMessage: record.userMessage,
            assistantMessages: record.assistantMessages,
        };
    }, [projection.indexes.messageToTurnId, projection.indexes.turnById]);

    const getContextForMessage = React.useCallback((messageId: string): TurnGroupingContext | undefined => {
        const meta = projection.indexes.messageMetaById.get(messageId);
        if (!meta || !meta.isAssistantMessage) {
            return undefined;
        }
        const turn = projection.indexes.turnById.get(meta.turnId);
        if (!turn) {
            return undefined;
        }

        const uiState = turnUiStates.get(turn.turnId) ?? { isExpanded: defaultActivityExpanded };
        const userCreatedAt = (turn.userMessage.info.time as { created?: number } | undefined)?.created;

        return {
            turnId: turn.turnId,
            isFirstAssistantInTurn: meta.isFirstAssistantInTurn,
            isLastAssistantInTurn: meta.isLastAssistantInTurn,
            summaryBody: turn.summaryText,
            activityParts: turn.activityParts,
            activityGroupSegments: turn.activitySegments,
            headerMessageId: turn.headerMessageId,
            hasTools: turn.hasTools,
            hasReasoning: turn.hasReasoning,
            diffStats: turn.diffStats,
            userMessageCreatedAt: typeof userCreatedAt === 'number' ? userCreatedAt : undefined,
            isWorking: sessionIsWorking && projection.lastTurnId === turn.turnId,
            isGroupExpanded: uiState.isExpanded,
            toggleGroup: () => toggleGroup(turn.turnId),
        };
    }, [defaultActivityExpanded, projection.indexes.messageMetaById, projection.indexes.turnById, projection.lastTurnId, sessionIsWorking, toggleGroup, turnUiStates]);

    return {
        turns,
        getTurnForMessage,
        getContextForMessage,
    };
};

export type TurnRecordType = TurnRecord;
