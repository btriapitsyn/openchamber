import { strict as assert } from 'node:assert';
import test from 'node:test';

import {
    collectVisibleSessionIdsForBlockingRequests,
    flattenBlockingRequests,
} from './lib/blockingRequests';

test('collectVisibleSessionIdsForBlockingRequests scopes parent/child sessions', () => {
    const sessions = [
        { id: 'root' },
        { id: 'child-1', parentID: 'root' },
        { id: 'child-2', parentID: 'root' },
        { id: 'other' },
    ];

    const rootScope = collectVisibleSessionIdsForBlockingRequests(sessions, 'root');
    assert.deepEqual(
        rootScope,
        ['root', 'child-1', 'child-2'],
        'root session should include direct children for blocking cards',
    );

    const childScope = collectVisibleSessionIdsForBlockingRequests(sessions, 'child-1');
    assert.deepEqual(
        childScope,
        [],
        'child sessions should not render parent-handled blocking cards',
    );
});

test('flattenBlockingRequests deduplicates by request id', () => {
    const source = new Map<string, Array<{ id: string; label: string }>>([
        ['root', [{ id: 'p1', label: 'A' }, { id: 'p2', label: 'B' }]],
        ['child-1', [{ id: 'p2', label: 'B duplicate' }, { id: 'p3', label: 'C' }]],
    ]);

    const flattened = flattenBlockingRequests(source, ['root', 'child-1']);
    assert.deepEqual(
        flattened.map((entry) => entry.id),
        ['p1', 'p2', 'p3'],
        'flattening should preserve first seen order and remove duplicates',
    );
});
