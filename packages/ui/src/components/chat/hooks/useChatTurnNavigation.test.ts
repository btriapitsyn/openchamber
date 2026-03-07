import { strict as assert } from 'node:assert';
import test from 'node:test';

import { parseChatHashTarget, resolveTurnOffsetTarget } from './useChatTurnNavigation';

test('parseChatHashTarget parses turn hash', () => {
    assert.deepEqual(parseChatHashTarget('#turn-turn-123'), {
        kind: 'turn',
        id: 'turn-123',
    });
});

test('parseChatHashTarget parses message hash without leading #', () => {
    assert.deepEqual(parseChatHashTarget('message-msg-9'), {
        kind: 'message',
        id: 'msg-9',
    });
});

test('parseChatHashTarget returns null for invalid hash', () => {
    assert.equal(parseChatHashTarget('#not-supported'), null);
});

test('resolveTurnOffsetTarget returns noop for zero offset', () => {
    assert.deepEqual(resolveTurnOffsetTarget(['turn-a'], 'turn-a', 0), { kind: 'noop' });
});

test('resolveTurnOffsetTarget returns noop when no turns exist', () => {
    assert.deepEqual(resolveTurnOffsetTarget([], null, -1), { kind: 'noop' });
});

test('resolveTurnOffsetTarget navigates relative to active turn', () => {
    assert.deepEqual(
        resolveTurnOffsetTarget(['turn-a', 'turn-b', 'turn-c'], 'turn-b', -1),
        { kind: 'turn', turnId: 'turn-a' },
    );
});

test('resolveTurnOffsetTarget falls back to latest turn for unknown active turn', () => {
    assert.deepEqual(
        resolveTurnOffsetTarget(['turn-a', 'turn-b', 'turn-c'], 'turn-x', -1),
        { kind: 'turn', turnId: 'turn-b' },
    );
});

test('resolveTurnOffsetTarget clamps offsets above oldest turn', () => {
    assert.deepEqual(
        resolveTurnOffsetTarget(['turn-a', 'turn-b', 'turn-c'], 'turn-b', -99),
        { kind: 'turn', turnId: 'turn-a' },
    );
});

test('resolveTurnOffsetTarget resumes when navigating beyond newest turn', () => {
    assert.deepEqual(
        resolveTurnOffsetTarget(['turn-a', 'turn-b', 'turn-c'], 'turn-c', 1),
        { kind: 'resume' },
    );
});
