import { strict as assert } from 'node:assert';
import test from 'node:test';
import type { Message, Part } from '@opencode-ai/sdk/v2';

import { projectTurnRecords } from './projectTurnRecords';
import type { ChatMessageEntry } from './types';

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

test('projectTurnRecords keeps retries and malformed-parent assistants in the same turn', () => {
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

    assert.equal(projection.turns.length, 2, 'two user anchors should produce two turns');

    const firstTurn = projection.turns[0];
    assert.equal(firstTurn.assistantMessageIds.length, 3, 'turn should include retry and malformed-parent fallback assistant');
    assert.equal(firstTurn.stream.isRetrying, true, 'multiple assistants in a turn should set retry stream state');
    assert.equal(firstTurn.summaryText, 'retry', 'summary should come from final assistant stop text');
    assert.equal(firstTurn.startedAt, 1, 'turn startedAt should use user created time');
    assert.equal(firstTurn.completedAt, 5, 'turn completedAt should track max assistant completed time');

    const secondTurn = projection.turns[1];
    assert.equal(secondTurn.assistantMessageIds.includes('a4'), true, 'task bridge assistant should remain in second turn');

    assert.equal(projection.indexes.messageToTurnId.get('a2'), 'u1', 'message-to-turn index should include retries');
    assert.equal(projection.lastTurnId, 'u2', 'last turn id should match latest user message');
    assert.equal(projection.ungroupedMessageIds.has('a1'), false, 'grouped assistant should not be marked ungrouped');
});
