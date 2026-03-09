import { strict as assert } from 'node:assert';
import test from 'node:test';
import type { Message, Part } from '@opencode-ai/sdk/v2';

import { projectTurnRecords } from './projectTurnRecords';
import { stabilizeTurnProjection } from './stabilizeTurnProjection';
import type { ChatMessageEntry } from './types';

const makeMessage = (
    id: string,
    role: 'user' | 'assistant',
    text: string,
    overrides?: Partial<Message>,
): ChatMessageEntry => ({
    info: {
        id,
        sessionID: 's1',
        role,
        time: { created: 1 },
        ...overrides,
    } as Message,
    parts: [{ type: 'text', text } as unknown as Part],
});

test('stabilizeTurnProjection keeps historical turns referentially stable', () => {
    const previousProjection = projectTurnRecords([
        makeMessage('u1', 'user', 'Q1', { time: { created: 1 } }),
        makeMessage('a1', 'assistant', 'A1', { parentID: 'u1', finish: 'stop', time: { created: 2, completed: 3 } }),
        makeMessage('u2', 'user', 'Q2', { time: { created: 4 } }),
        makeMessage('a2', 'assistant', 'stream part 1', { parentID: 'u2', time: { created: 5 } }),
    ]);

    const nextProjection = projectTurnRecords([
        makeMessage('u1', 'user', 'Q1', { time: { created: 1 } }),
        makeMessage('a1', 'assistant', 'A1', { parentID: 'u1', finish: 'stop', time: { created: 2, completed: 3 } }),
        makeMessage('u2', 'user', 'Q2', { time: { created: 4 } }),
        makeMessage('a2', 'assistant', 'stream part 1 + part 2', { parentID: 'u2', time: { created: 5 } }),
    ]);

    const stabilized = stabilizeTurnProjection(nextProjection, previousProjection);

    assert.equal(
        stabilized.turns[0],
        previousProjection.turns[0],
        'first historical turn should be reused by reference',
    );
    assert.notEqual(
        stabilized.turns[1],
        previousProjection.turns[1],
        'active streaming turn should keep new reference',
    );
});
