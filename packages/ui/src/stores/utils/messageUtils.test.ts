import { strict as assert } from 'node:assert';
import test from 'node:test';
import type { Part } from '@opencode-ai/sdk/v2';

import { normalizeStreamingPart } from './messageUtils';

test('normalizeStreamingPart preserves tool timing across partial updates', () => {
    const existing = {
        type: 'tool',
        id: 'tool-1',
        tool: 'bash',
        state: {
            status: 'running',
            time: { start: 100 },
            input: { command: 'pwd' },
        },
    } as unknown as Part;

    const incoming = {
        type: 'tool',
        id: 'tool-1',
        tool: 'bash',
        state: {
            status: 'completed',
            time: { end: 250 },
        },
    } as unknown as Part;

    const merged = normalizeStreamingPart(incoming, existing) as Part & {
        state?: { status?: string; time?: { start?: number; end?: number }; input?: { command?: string } };
    };

    assert.equal(merged.state?.status, 'completed');
    assert.deepEqual(merged.state?.time, { start: 100, end: 250 });
    assert.equal(merged.state?.input?.command, 'pwd');
});

test('normalizeStreamingPart keeps earliest start and latest end for tool timing', () => {
    const existing = {
        type: 'tool',
        id: 'tool-2',
        tool: 'bash',
        state: {
            time: { start: 120, end: 220 },
        },
    } as unknown as Part;

    const incoming = {
        type: 'tool',
        id: 'tool-2',
        tool: 'bash',
        state: {
            time: { start: 150, end: 200 },
        },
    } as unknown as Part;

    const merged = normalizeStreamingPart(incoming, existing) as Part & {
        state?: { time?: { start?: number; end?: number } };
    };

    assert.deepEqual(merged.state?.time, { start: 120, end: 220 });
});

test('normalizeStreamingPart preserves part-level time bounds across updates', () => {
    const existing = {
        type: 'reasoning',
        id: 'reasoning-1',
        text: 'thinking',
        time: { start: 50 },
    } as unknown as Part;

    const incoming = {
        type: 'reasoning',
        id: 'reasoning-1',
        text: 'thinking more',
        time: { end: 90 },
    } as unknown as Part;

    const merged = normalizeStreamingPart(incoming, existing) as Part & {
        text?: string;
        time?: { start?: number; end?: number };
    };

    assert.equal(merged.text, 'thinking more');
    assert.deepEqual(merged.time, { start: 50, end: 90 });
});
