import type { Message, Part } from '@opencode-ai/sdk/v2';
import { projectTurnDiffStats, projectTurnSummary } from './projectTurnSummary';
import type { ChatMessageEntry } from './types';

const assert = (condition: unknown, message: string): void => {
    if (!condition) {
        throw new Error(message);
    }
};

const makeMessage = (overrides: Partial<Message>, parts: Part[]): ChatMessageEntry => ({
    info: {
        id: overrides.id ?? 'msg',
        sessionID: overrides.sessionID ?? 's1',
        role: overrides.role ?? 'assistant',
        time: overrides.time ?? { created: 1 },
        ...overrides,
    } as Message,
    parts,
});

export const runProjectTurnSummaryTests = (): void => {
    const summary = projectTurnSummary([
        makeMessage({ id: 'a1', finish: 'stop' } as Partial<Message>, [
            { id: 'p1', type: 'text', text: 'final answer' } as unknown as Part,
        ]),
    ]);
    assert(summary.text === 'final answer', 'summary text should be extracted from last stop text part');
    assert(summary.sourceMessageId === 'a1', 'summary source message should be tracked');

    const fallbackSummary = projectTurnSummary([
        makeMessage({ id: 'a2', finish: 'length' } as Partial<Message>, [
            { id: 'p2', type: 'text', text: 'partial text' } as unknown as Part,
        ]),
    ]);
    assert(fallbackSummary.text === 'partial text', 'summary should fallback to last text when finish=stop missing');

    const diffStats = projectTurnDiffStats(makeMessage({
        role: 'user',
        summary: {
            diffs: [
                { additions: 5, deletions: 2 },
                { additions: 0, deletions: 0 },
            ],
        },
    } as Partial<Message>, []));
    assert(Boolean(diffStats), 'diff stats should exist for non-empty diffs');
    assert(diffStats?.additions === 5, 'diff additions should aggregate');
    assert(diffStats?.deletions === 2, 'diff deletions should aggregate');
    assert(diffStats?.files === 1, 'diff files should count non-zero diff entries');
};
