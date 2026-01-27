import React from 'react';

import { cn } from '@/lib/utils';
import type { Part } from '@opencode-ai/sdk/v2';
import type { AgentMentionInfo } from '../types';

type PartWithText = Part & { text?: string; content?: string; value?: string };

type UserTextPartProps = {
    part: Part;
    messageId: string;
    isMobile: boolean;
    agentMention?: AgentMentionInfo;
};

const buildMentionUrl = (name: string): string => {
    const encoded = encodeURIComponent(name);
    return `https://opencode.ai/docs/agents/#${encoded}`;
};

const UserTextPart: React.FC<UserTextPartProps> = ({ part, messageId, agentMention }) => {
    const partWithText = part as PartWithText;
    const rawText = partWithText.text;
    const textContent = typeof rawText === 'string' ? rawText : partWithText.content || partWithText.value || '';

    const [isExpanded, setIsExpanded] = React.useState(false);
    const [isTruncated, setIsTruncated] = React.useState(false);
    const textRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        const el = textRef.current;
        if (!el || isExpanded) return;

        const checkTruncation = () => {
            setIsTruncated(el.scrollHeight > el.clientHeight);
        };

        checkTruncation();

        const resizeObserver = new ResizeObserver(checkTruncation);
        resizeObserver.observe(el);

        return () => resizeObserver.disconnect();
    }, [textContent, isExpanded]);

    const handleClick = React.useCallback(() => {
        if (isTruncated || isExpanded) {
            setIsExpanded((prev) => !prev);
        }
    }, [isTruncated, isExpanded]);

    if (!textContent || textContent.trim().length === 0) {
        return null;
    }

    // Render content with optional agent mention link
    const renderContent = () => {
        if (!agentMention?.token || !textContent.includes(agentMention.token)) {
            return textContent;
        }
        const idx = textContent.indexOf(agentMention.token);
        const before = textContent.slice(0, idx);
        const after = textContent.slice(idx + agentMention.token.length);
        return (
            <>
                {before}
                <a
                    href={buildMentionUrl(agentMention.name)}
                    className="text-primary hover:underline"
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                >
                    {agentMention.token}
                </a>
                {after}
            </>
        );
    };

    return (
        <div
            className={cn(
                "break-words whitespace-pre-wrap font-sans typography-markdown",
                !isExpanded && "line-clamp-3",
                (isTruncated || isExpanded) && "cursor-pointer"
            )}
            ref={textRef}
            onClick={handleClick}
            key={part.id || `${messageId}-user-text`}
        >
            {renderContent()}
        </div>
    );
};

export default React.memo(UserTextPart);
