import type { Message, Part } from '@opencode-ai/sdk/v2';
import { projectTurnActivity } from './projectTurnActivity';
import type { ChatMessageEntry } from './types';

const assert = (condition: unknown, message: string): void => {
    if (!condition) {
        throw new Error(message);
    }
};

const makeAssistant = (id: string, parts: Part[]): ChatMessageEntry => ({
    info: {
        id,
        sessionID: 's1',
        role: 'assistant',
        time: { created: 1 },
    } as Message,
    parts,
});

export const runProjectTurnActivityTests = (): void => {
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

    assert(result.hasTools, 'tool activity should be detected');
    assert(result.hasReasoning, 'reasoning activity should be detected');
    assert(result.activityParts.length === 3, 'all tool/reasoning parts should be captured');
    assert(result.activitySegments.length >= 1, 'activity should be segmented');
    assert(
        result.activitySegments.some((segment) => segment.afterToolPartId !== null),
        'task standalone tool should start a post-tool segment',
    );
};
