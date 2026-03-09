import { strict as assert } from 'node:assert';
import test from 'node:test';
import type { Part } from '@opencode-ai/sdk/v2';

import { hasAnimatingWork, isMessageComplete, type MessageInfo, type MessageRecord } from './messageCompletion';

test('isMessageComplete treats non-terminal tool statuses as active work', () => {
    const info: MessageInfo = {
        id: 'm1',
        role: 'assistant',
        finish: 'stop',
        status: 'completed',
        time: { completed: 50 },
    };

    const parts = [{
        type: 'tool',
        tool: 'task',
        state: {
            status: 'in_progress',
            time: { start: 10 },
        },
    }] as unknown as Part[];

    assert.equal(isMessageComplete(info, parts), false);
});

test('hasAnimatingWork keeps task sessions alive until child tools are terminal', () => {
    const messages = [{
        info: {
            id: 'm1',
            role: 'assistant',
            finish: 'stop',
            status: 'completed',
            time: { completed: 50 },
        },
        parts: [{
            type: 'tool',
            tool: 'bash',
            state: {
                status: 'started',
                time: { start: 10 },
            },
        }] as unknown as Part[],
    }] satisfies MessageRecord[];

    assert.equal(hasAnimatingWork(messages), true);
});
