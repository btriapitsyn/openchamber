import type { Message, Part } from '@opencode-ai/sdk/v2';
import { projectTurnRecords } from './projectTurnRecords';
import type { ChatMessageEntry } from './types';

const assert = (condition: unknown, message: string): void => {
    if (!condition) {
        throw new Error(message);
    }
};

const makeMessage = (
    id: string,
    role: 'user' | 'assistant',
    parts: Part[],
    overrides?: Partial<Message>,
): ChatMessageEntry => {
    return {
        info: {
            id,
            sessionID: 's1',
            role,
            time: { created: 1 },
            ...overrides,
        } as Message,
        parts,
    };
};

export const runProjectTurnRecordsTests = (): void => {
    const user1 = makeMessage('u1', 'user', [{ type: 'text', text: 'hi' } as unknown as Part]);
    const assistant1 = makeMessage(
        'a1',
        'assistant',
        [{ type: 'text', text: 'hello' } as unknown as Part],
        { parentID: 'u1', finish: 'stop', time: { created: 2, completed: 3 } },
    );
    const retryAssistant = makeMessage(
        'a2',
        'assistant',
        [{ type: 'text', text: 'retry' } as unknown as Part],
        { parentID: 'u1', finish: 'stop', time: { created: 4, completed: 5 } },
    );
    const malformedAssistant = makeMessage(
        'a3',
        'assistant',
        [{ type: 'reasoning', text: 'fallback parent' } as unknown as Part],
        { parentID: 'missing-parent', time: { created: 6 } },
    );
    const userSubtask = makeMessage('u2', 'user', [{ type: 'subtask', text: 'do task' } as unknown as Part]);
    const syntheticTaskBridge = makeMessage(
        'a4',
        'assistant',
        [{ type: 'tool', tool: 'task', state: { status: 'completed' } } as unknown as Part],
        { parentID: 'u2', time: { created: 8, completed: 9 } },
    );

    const projection = projectTurnRecords(
        [user1, assistant1, retryAssistant, malformedAssistant, userSubtask, syntheticTaskBridge],
        { showTextJustificationActivity: true },
    );

    assert(projection.turns.length === 2, 'two user anchors should produce two turns');

    const firstTurn = projection.turns[0];
    assert(firstTurn.assistantMessageIds.length === 3, 'turn should include retry and malformed-parent fallback assistant');
    assert(firstTurn.stream.isRetrying, 'multiple assistants in a turn should set retry stream state');
    assert(firstTurn.summaryText === 'retry', 'summary should come from final assistant stop text');
    assert(firstTurn.startedAt === 1, 'turn startedAt should use user created time');
    assert(firstTurn.completedAt === 5, 'turn completedAt should track max assistant completed time');

    const secondTurn = projection.turns[1];
    assert(secondTurn.assistantMessageIds.includes('a4'), 'task bridge assistant should remain in second turn');

    assert(projection.indexes.messageToTurnId.get('a2') === 'u1', 'message-to-turn index should include retries');
    assert(projection.lastTurnId === 'u2', 'last turn id should match latest user message');
    assert(!projection.ungroupedMessageIds.has('a1'), 'grouped assistant should not be marked ungrouped');
};
