import { strict as assert } from 'node:assert';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Message, Part } from '@opencode-ai/sdk/v2';

import TurnItem from './TurnItem';
import type { ChatMessageEntry, TurnRecord } from '../lib/turns/types';

const makeMessage = (id: string, role: 'user' | 'assistant'): ChatMessageEntry => ({
    info: {
        id,
        role,
        sessionID: 's1',
        time: { created: 1 },
    } as Message,
    parts: [{ type: 'text', text: id } as unknown as Part],
});

test('TurnItem keeps turn anchor and assistant block order', () => {
    const user = makeMessage('u1', 'user');
    const assistant = makeMessage('a1', 'assistant');

    const turn: TurnRecord = {
        turnId: 'u1',
        userMessageId: 'u1',
        userMessage: user,
        headerMessageId: 'a1',
        messages: [],
        assistantMessageIds: ['a1'],
        assistantMessages: [assistant],
        summary: {},
        summaryText: undefined,
        hasTools: false,
        hasReasoning: false,
        diffStats: undefined,
        stream: { isStreaming: false, isRetrying: false },
    };

    const html = renderToStaticMarkup(
        <TurnItem
            turn={turn}
            stickyUserHeader={false}
            renderMessage={(message) => <div key={message.info.id} data-message-id={message.info.id}>{message.info.id}</div>}
        />,
    );

    assert.ok(html.includes('data-turn-id="u1"'), 'turn item should expose turn id anchor');
    assert.ok(html.includes('data-message-id="u1"'), 'turn item should render user anchor message');
    assert.ok(html.includes('data-message-id="a1"'), 'turn item should render assistant message block');
});
