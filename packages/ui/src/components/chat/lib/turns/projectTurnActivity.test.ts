import { strict as assert } from 'node:assert';
import test from 'node:test';
import type { Message, Part } from '@opencode-ai/sdk/v2';

import { projectTurnActivity } from './projectTurnActivity';
import type { ChatMessageEntry } from './types';

const makeAssistant = (id: string, parts: Part[]): ChatMessageEntry => ({
    info: {
        id,
        sessionID: 's1',
        role: 'assistant',
        time: { created: 1 },
    } as Message,
    parts,
});

test('projectTurnActivity keeps segmented task + reasoning flow', () => {
    const firstAssistant = makeAssistant('a1', [
        { id: 'task', type: 'tool', tool: 'task', state: { status: 'completed' } } as unknown as Part,
        { id: 'r1', type: 'reasoning', text: 'thinking' } as unknown as Part,
    ]);
    const secondAssistant = makeAssistant('a2', [
        { id: 'tool-1', type: 'tool', tool: 'bash', state: { status: 'completed' } } as unknown as Part,
    ]);

    const result = projectTurnActivity({
        turnId: 'u1',
        assistantMessages: [firstAssistant, secondAssistant],
        showTextJustificationActivity: true,
        summarySourceMessageId: undefined,
    });

    assert.equal(result.hasTools, true, 'tool activity should be detected');
    assert.equal(result.hasReasoning, true, 'reasoning activity should be detected');
    assert.equal(result.activityParts.length, 3, 'all tool/reasoning parts should be captured');
    assert.equal(result.activitySegments.length >= 1, true, 'activity should be segmented');
    assert.equal(
        result.activitySegments.some((segment) => segment.afterToolPartId !== null),
        true,
        'task standalone tool should start a post-tool segment',
    );
});
