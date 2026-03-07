import { strict as assert } from 'node:assert';
import test from 'node:test';
import type { Message, Part } from '@opencode-ai/sdk/v2';

import {
    filterMessagesByRevertPoint,
    normalizeMessageInfoForProjection,
} from './messageProjectors';

test('normalizeMessageInfoForProjection keeps client role markers for turn projection', () => {
    const info = normalizeMessageInfoForProjection({
        id: 'u1',
        role: 'user',
        sessionID: 's1',
        time: { created: 1 },
    } as Message);

    assert.equal((info as { clientRole?: string }).clientRole, 'user', 'normalized info should carry clientRole');
    assert.equal((info as { userMessageMarker?: boolean }).userMessageMarker, true, 'user marker should be attached');
});

test('filterMessagesByRevertPoint trims reverted tail only', () => {
    const messages = [
        { info: { id: 'm1' } as Message, parts: [] as Part[] },
        { info: { id: 'm2' } as Message, parts: [] as Part[] },
        { info: { id: 'm3' } as Message, parts: [] as Part[] },
    ];

    const filtered = filterMessagesByRevertPoint(messages, 'm3');
    assert.deepEqual(
        filtered.map((message) => message.info.id),
        ['m1', 'm2'],
        'revert point should keep messages before the target id',
    );

    const untouched = filterMessagesByRevertPoint(messages, 'missing');
    assert.equal(untouched, messages, 'missing revert id should keep original array reference');
});
