import { strict as assert } from 'node:assert';
import test from 'node:test';

import { getToolLifecycleState, normalizeToolStatus } from './toolStatus';

test('normalizeToolStatus handles spacing and casing variants', () => {
    assert.equal(normalizeToolStatus(' In_Progress '), 'inprogress');
    assert.equal(normalizeToolStatus('DONE'), 'done');
    assert.equal(normalizeToolStatus('   '), undefined);
});

test('getToolLifecycleState keeps unknown tool states in flight until finalized', () => {
    const lifecycle = getToolLifecycleState({
        status: 'waiting-on-server',
        time: { start: 10 },
    });

    assert.equal(lifecycle.isInFlight, true);
    assert.equal(lifecycle.isFinalized, false);
    assert.equal(lifecycle.hasStarted, true);
    assert.equal(lifecycle.hasEnded, false);
});

test('getToolLifecycleState treats normalized active and final states consistently', () => {
    const active = getToolLifecycleState({
        status: 'In_Progress',
        time: { start: 10 },
    });
    const finalized = getToolLifecycleState({
        status: 'Failed',
        time: { start: 10 },
    });

    assert.equal(active.isInFlight, true);
    assert.equal(active.isFinalized, false);
    assert.equal(finalized.isInFlight, false);
    assert.equal(finalized.isFinalized, true);
});

test('getToolLifecycleState trusts valid end timestamps even without final status', () => {
    const lifecycle = getToolLifecycleState({
        status: 'running',
        time: { start: 10, end: 25 },
    });

    assert.equal(lifecycle.isInFlight, false);
    assert.equal(lifecycle.isFinalized, true);
    assert.equal(lifecycle.hasEnded, true);
    assert.equal(lifecycle.end, 25);
});
