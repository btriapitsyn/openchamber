import { strict as assert } from 'node:assert';
import test from 'node:test';
import type { Part } from '@opencode-ai/sdk/v2';

import { normalizeUserDisplayParts } from './normalizeUserDisplayParts';

test('normalizeUserDisplayParts converts compaction marker to /compact command text', () => {
    const normalized = normalizeUserDisplayParts([
        { type: 'compaction' } as unknown as Part,
    ]);

    assert.equal(normalized.length, 1, 'compaction marker should remain represented in user bubble');
    assert.equal((normalized[0] as { type: string }).type, 'text', 'compaction marker should normalize into text part');
    assert.equal((normalized[0] as { text?: string }).text, '/compact', 'compaction marker should map to /compact text');
});

test('normalizeUserDisplayParts keeps only supported synthetic user text markers', () => {
    const normalized = normalizeUserDisplayParts([
        { type: 'text', text: 'The following tool was executed by the user: bash', synthetic: true } as unknown as Part,
        { type: 'text', text: 'hidden synthetic', synthetic: true } as unknown as Part,
        { type: 'text', text: 'regular user text' } as unknown as Part,
    ]);

    assert.equal(normalized.length, 2, 'unsupported synthetic text should be removed');
    assert.equal((normalized[0] as { text?: string }).text, '/shell', 'shell synthetic text should normalize to /shell');
    assert.equal((normalized[1] as { text?: string }).text, 'regular user text', 'normal user text should remain intact');
});
