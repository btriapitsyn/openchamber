import React from 'react';
import ReactMarkdown from 'react-markdown';

import { createUserMarkdown } from '../markdownPresets';
import type { Part } from '@opencode-ai/sdk';

type UserTextPartProps = {
    part: Part;
    messageId: string;
    isMobile: boolean;
};

const UserTextPart: React.FC<UserTextPartProps> = ({ part, messageId, isMobile }) => {
    const rawText = (part as any).text;
    const textContent = typeof rawText === 'string' ? rawText : (part as any).content || (part as any).value || '';

    if (!textContent || textContent.trim().length === 0) {
        return null;
    }

    const markdown = React.useMemo(() => createUserMarkdown({ isMobile }), [isMobile]);

    return (
        <div className="break-words" key={part.id || `${messageId}-user-text`}>
            <ReactMarkdown remarkPlugins={markdown.remarkPlugins} components={markdown.components}>
                {textContent}
            </ReactMarkdown>
        </div>
    );
};

export default React.memo(UserTextPart);
