import { strict as assert } from 'node:assert';
import test from 'node:test';

import {
    resolveAssistantDisplayText,
    shouldRenderAssistantText,
} from './assistantTextVisibility';

test('resolveAssistantDisplayText keeps streaming text visible immediately', () => {
    const display = resolveAssistantDisplayText({
        textContent: 'full text',
        throttledTextContent: 'stream chunk',
        isStreaming: true,
    });

    assert.equal(display, 'stream chunk', 'streaming phase should use throttled live text');
});

test('shouldRenderAssistantText does not hide non-finalized streaming content', () => {
    assert.equal(
        shouldRenderAssistantText({ displayTextContent: 'partial answer', isFinalized: false }),
        true,
        'non-finalized assistant text should render while streaming',
    );

    assert.equal(
        shouldRenderAssistantText({ displayTextContent: '', isFinalized: false }),
        false,
        'non-finalized assistant text should stay hidden only when empty',
    );
});
