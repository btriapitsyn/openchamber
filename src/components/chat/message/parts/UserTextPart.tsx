import React from 'react';
import ReactMarkdown from 'react-markdown';

import { createUserMarkdown } from '../markdownPresets';
import type { Part } from '@opencode-ai/sdk';

type PartWithText = Part & { text?: string; content?: string; value?: string };

type UserTextPartProps = {
    part: Part;
    messageId: string;
    isMobile: boolean;
};

const UserTextPart: React.FC<UserTextPartProps> = ({ part, messageId, isMobile }) => {
    const partWithText = part as PartWithText;
    const rawText = partWithText.text;
    const textContent = typeof rawText === 'string' ? rawText : partWithText.content || partWithText.value || '';

    // useMemo must be called unconditionally before early return
    const markdown = React.useMemo(() => createUserMarkdown({ isMobile }), [isMobile]);

    if (!textContent || textContent.trim().length === 0) {
        return null;
    }

    return (
        <div className="break-words" key={part.id || `${messageId}-user-text`}>
            <ReactMarkdown remarkPlugins={markdown.remarkPlugins} components={markdown.components}>
                {textContent}
            </ReactMarkdown>
        </div>
    );
};

export default React.memo(UserTextPart);
