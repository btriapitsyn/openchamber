import { strict as assert } from 'node:assert';
import test from 'node:test';
import { pickOffsetTurnId, pickVisibleTurnId } from './scrollSpy';

test('scrollSpy picks best visible/offset turn ids', () => {
    const visible = pickVisibleTurnId([
        { id: 't1', ratio: 0.4, top: 300 },
        { id: 't2', ratio: 0.75, top: 420 },
        { id: 't3', ratio: 0.75, top: 360 },
    ], 350);
    assert.equal(visible, 't3', 'visible picker should prefer highest ratio then nearest line');

    const offset = pickOffsetTurnId([
        { id: 't1', top: 0 },
        { id: 't2', top: 160 },
        { id: 't3', top: 320 },
    ], 200);
    assert.equal(offset, 't2', 'offset picker should return nearest item above cutoff');
});
