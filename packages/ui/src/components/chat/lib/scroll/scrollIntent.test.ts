import { strict as assert } from 'node:assert';
import test from 'node:test';
import {
    isNearBottom,
    isNearTop,
    shouldMarkBoundaryGesture,
} from './scrollIntent';

test('scrollIntent helpers detect boundaries', () => {
    assert.ok(
        shouldMarkBoundaryGesture({
            delta: -40,
            scrollTop: 0,
            scrollHeight: 800,
            clientHeight: 400,
        }),
        'upward gesture at top should mark boundary intent',
    );

    assert.ok(
        !shouldMarkBoundaryGesture({
            delta: -40,
            scrollTop: 20,
            scrollHeight: 800,
            clientHeight: 400,
        }),
        'upward gesture away from top should not mark boundary intent',
    );

    assert.ok(
        isNearTop(120, 200),
        'near-top helper should return true inside threshold',
    );

    assert.ok(
        isNearBottom(32, 40),
        'near-bottom helper should return true inside threshold',
    );
});
