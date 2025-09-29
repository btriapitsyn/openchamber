import React from 'react';
import ReactMarkdown from 'react-markdown';

import { createUserMarkdown } from '../markdownPresets';
import type { Part } from '@opencode-ai/sdk';

type UserTextPartProps = {
    part: Part;
    messageId: string;
};

const UserTextPart: React.FC<UserTextPartProps> = ({ part, messageId }) => {
    const rawText = (part as any).text;
    const textContent = typeof rawText === 'string' ? rawText : (part as any).content || (part as any).value || '';

    if (!textContent || textContent.trim().length === 0) {
        return null;
    }

    const markdown = createUserMarkdown();

    return (
        <div className="break-words" key={part.id || `${messageId}-user-text`}>
            <ReactMarkdown remarkPlugins={markdown.remarkPlugins} components={markdown.components}>
                {textContent}
            </ReactMarkdown>
        </div>
    );
};

export default React.memo(UserTextPart);
