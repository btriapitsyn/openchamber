import React from 'react';
import ReactMarkdown from 'react-markdown';

import { createUserMarkdown } from '../markdownPresets';
import type { Part } from '@opencode-ai/sdk';
import type { AgentMentionInfo } from '../types';

type PartWithText = Part & { text?: string; content?: string; value?: string };

type UserTextPartProps = {
    part: Part;
    messageId: string;
    isMobile: boolean;
    agentMention?: AgentMentionInfo;
};

const buildMentionLink = (token: string, name: string): string => {
    const encoded = encodeURIComponent(name);
    return `[${token}](https://opencode.ai/docs/agents/#${encoded})`;
};

const UserTextPart: React.FC<UserTextPartProps> = ({ part, messageId, isMobile, agentMention }) => {
    const partWithText = part as PartWithText;
    const rawText = partWithText.text;
    const textContent = typeof rawText === 'string' ? rawText : partWithText.content || partWithText.value || '';

    // useMemo must be called unconditionally before early return
    const markdown = React.useMemo(() => createUserMarkdown({ isMobile }), [isMobile]);

    const processedText = React.useMemo(() => {
        if (!agentMention) {
            return textContent;
        }
        const token = agentMention.token;
        if (!token || token.length === 0) {
            return textContent;
        }
        if (!textContent.includes(token)) {
            return textContent;
        }
        const link = buildMentionLink(token, agentMention.name);
        return textContent.replace(token, link);
    }, [agentMention, textContent]);

    if (!processedText || processedText.trim().length === 0) {
        return null;
    }

    return (
        <div className="break-words" key={part.id || `${messageId}-user-text`}>
            <ReactMarkdown remarkPlugins={markdown.remarkPlugins} components={markdown.components}>
                {processedText}
            </ReactMarkdown>
        </div>
    );
};

export default React.memo(UserTextPart);
