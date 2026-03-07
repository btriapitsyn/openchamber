import { strict as assert } from 'node:assert';
import test from 'node:test';

import { computeStreamingThrottleDelay } from './useStreamingTextThrottle';

test('computeStreamingThrottleDelay starts with full throttle interval', () => {
    assert.equal(
        computeStreamingThrottleDelay(0, 0, 100),
        100,
        'throttle delay should start at full interval',
    );
});

test('computeStreamingThrottleDelay shrinks as elapsed time grows', () => {
    assert.equal(
        computeStreamingThrottleDelay(100, 160, 100),
        40,
        'throttle delay should shrink as elapsed time grows',
    );
});

test('computeStreamingThrottleDelay flushes after interval', () => {
    assert.equal(
        computeStreamingThrottleDelay(100, 260, 100),
        0,
        'throttle delay should flush immediately after interval',
    );
});
