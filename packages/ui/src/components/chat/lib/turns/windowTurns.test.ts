import { strict as assert } from 'node:assert';
import test from 'node:test';
import type { Message, Part } from '@opencode-ai/sdk/v2';

import {
    buildTurnWindowModel,
    getInitialTurnStart,
    windowMessagesByTurn,
} from './windowTurns';
import type { ChatMessageEntry } from './types';

const makeMessage = (
    id: string,
    role: 'user' | 'assistant',
    parentID?: string,
): ChatMessageEntry => {
    return {
        info: {
            id,
            role,
            parentID,
            sessionID: 's1',
            time: { created: 1, completed: role === 'assistant' ? 2 : undefined },
        } as Message,
        parts: [{ type: 'text', text: id } as unknown as Part],
    };
};

test('windowTurns builds turn model and windows entries', () => {
    const messages: ChatMessageEntry[] = [
        makeMessage('u1', 'user'),
        makeMessage('a1', 'assistant', 'u1'),
        makeMessage('u2', 'user'),
        makeMessage('a2', 'assistant', 'u2'),
        makeMessage('u3', 'user'),
        makeMessage('a3', 'assistant', 'u3'),
    ];

    const model = buildTurnWindowModel(messages);
    assert.equal(model.turnCount, 3, 'turn model should count user anchors');
    assert.equal(model.turnIndexById.get('u2'), 1, 'turn index map should include middle turn');
    assert.equal(model.messageToTurnId.get('a3'), 'u3', 'assistant message should map to parent turn id');

    const initialStart = getInitialTurnStart(25, 10);
    assert.equal(initialStart, 15, 'initial turn start should keep only recent turns');

    const windowed = windowMessagesByTurn(messages, model, 1);
    assert.equal(windowed[0]?.info.id, 'u2', 'window slicing should start from selected turn');
    assert.equal(windowed.length, 4, 'window slicing should keep selected turn and newer messages');
});
