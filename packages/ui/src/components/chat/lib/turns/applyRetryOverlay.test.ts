import { strict as assert } from 'node:assert';
import test from 'node:test';
import type { Message, Part } from '@opencode-ai/sdk/v2';

import { applyRetryOverlay } from './applyRetryOverlay';
import type { ChatMessageEntry } from './types';

const makeMessage = (
    id: string,
    role: 'user' | 'assistant',
    overrides?: Partial<Message>,
): ChatMessageEntry => ({
    info: {
        id,
        sessionID: 's1',
        role,
        time: { created: 1 },
        ...overrides,
    } as Message,
    parts: [{ type: 'text', text: id } as unknown as Part],
});

test('applyRetryOverlay attaches retry error to latest assistant in active turn', () => {
    const messages = [
        makeMessage('u1', 'user'),
        makeMessage('a1', 'assistant', { parentID: 'u1' }),
    ];

    const result = applyRetryOverlay(messages, {
        sessionId: 's1',
        message: 'retrying',
        confirmedAt: 100,
        fallbackTimestamp: 50,
    });

    assert.equal(result.length, 2, 'should not insert synthetic row when assistant exists');
    const assistantError = (result[1]?.info as { error?: { name?: string; message?: string } }).error;
    assert.equal(assistantError?.name, 'SessionRetry', 'assistant should receive SessionRetry error marker');
    assert.equal(assistantError?.message, 'retrying', 'assistant should receive retry message');
});

test('applyRetryOverlay injects synthetic assistant when no assistant exists yet', () => {
    const messages = [
        makeMessage('u1', 'user'),
    ];

    const result = applyRetryOverlay(messages, {
        sessionId: 's1',
        message: 'retrying',
        confirmedAt: 100,
        fallbackTimestamp: 50,
    });

    assert.equal(result.length, 2, 'should insert retry synthetic assistant row');
    assert.equal(result[1]?.info.id, 'synthetic_retry_notice_s1', 'synthetic id should be stable by session id');
    assert.equal(result[1]?.info.role, 'assistant', 'synthetic row should be assistant role');
});
