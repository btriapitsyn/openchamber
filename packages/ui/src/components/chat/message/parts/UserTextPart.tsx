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
    }, [isExpanded]);

    const handleClick = React.useCallback(() => {
        if (isTruncated || isExpanded) {
            setIsExpanded((prev) => !prev);
        }
    }, [isTruncated, isExpanded]);

    const handleKeyDown = React.useCallback((e: React.KeyboardEvent) => {
        if ((e.key === 'Enter' || e.key === ' ') && (isTruncated || isExpanded)) {
            e.preventDefault();
            setIsExpanded((prev) => !prev);
        }
    }, [isTruncated, isExpanded]);

    if (!textContent || textContent.trim().length === 0) {
        return null;
    }

    const parseInlineCode = (text: string): React.ReactNode[] => {
        const segments: React.ReactNode[] = [];
        const regex = /`([^`]+)`|((?:^|\s)(\/[a-zA-Z][\w-]*))/g;
        let lastIndex = 0;

        for (const match of text.matchAll(regex)) {
            if (match.index !== undefined && match.index > lastIndex) {
                segments.push(text.slice(lastIndex, match.index));
            }
            
            if (match[1] !== undefined) {
                segments.push(
                    <code
                        key={`code-${match.index}`}
                        className="font-mono bg-muted/30 dark:bg-muted/20 px-1.5 py-0.5 rounded border border-border/20 text-[0.9em]"
                    >
                        {match[1]}
                    </code>
                );
            } else if (match[2] !== undefined) {
                const leadingSpace = match[2].slice(0, match[2].indexOf('/'));
                const command = match[2].slice(match[2].indexOf('/'));
                segments.push(
                    <React.Fragment key={`cmd-${match.index}`}>
                        {leadingSpace}
                        <span className="font-mono text-[var(--status-warning)] bg-[rgb(from_var(--status-warning)_r_g_b_/_0.1)] border border-[rgb(from_var(--status-warning)_r_g_b_/_0.2)] px-1.5 py-0.5 rounded">
                            {command}
                        </span>
                    </React.Fragment>
                );
            }
            
            if (match.index !== undefined) {
                lastIndex = match.index + match[0].length;
            }
        }

        if (lastIndex < text.length) {
            segments.push(text.slice(lastIndex));
        }

        return segments.length > 0 ? segments : [text];
    };

    const parseFilePaths = (node: React.ReactNode): React.ReactNode => {
        if (typeof node !== 'string') {
            return node;
        }

        const filePathRegex = /((?:\.{1,2}\/|~\/|\/|[A-Za-z]:[/\\])[\w\-/\\.]+\.\w+)/g;
        const segments: React.ReactNode[] = [];
        let lastIndex = 0;
        let segmentKey = 0;

        for (const match of node.matchAll(filePathRegex)) {
            const path = match[1];
            
            if (path.includes('://') || path.includes('@')) {
                continue;
            }

            if (match.index !== undefined && match.index > lastIndex) {
                segments.push(node.slice(lastIndex, match.index));
            }
            
            segments.push(
                <code
                    key={`filepath-${segmentKey++}`}
                    className="font-mono text-[var(--agent-color)] bg-[rgb(from_var(--agent-color-bg)_r_g_b_/_0.1)] border border-[rgb(from_var(--agent-color)_r_g_b_/_0.2)] px-1.5 py-0.5 rounded text-[0.9em]"
                >
                    {path}
                </code>
            );
            
            if (match.index !== undefined) {
                lastIndex = match.index + match[0].length;
            }
        }

        if (lastIndex < node.length) {
            segments.push(node.slice(lastIndex));
        }

        return segments.length > 0 ? segments : node;
    };

    const renderContent = () => {
        if (!agentMention?.token || !textContent.includes(agentMention.token)) {
            const codeSegments = parseInlineCode(textContent);
            return codeSegments.map((segment, idx) => {
                const key = typeof segment === 'string' 
                    ? `seg-${idx}-${segment.slice(0, 20)}` 
                    : `seg-${idx}`;
                return (
                    <React.Fragment key={key}>
                        {parseFilePaths(segment)}
                    </React.Fragment>
                );
            });
        }
        const idx = textContent.indexOf(agentMention.token);
        const before = textContent.slice(0, idx);
        const after = textContent.slice(idx + agentMention.token.length);
        
        const beforeSegments = parseInlineCode(before);
        const afterSegments = parseInlineCode(after);
        
        return (
            <>
                {beforeSegments.map((segment, idx) => {
                    const key = typeof segment === 'string'
                        ? `before-${idx}-${segment.slice(0, 20)}`
                        : `before-${idx}`;
                    return (
                        <React.Fragment key={key}>
                            {parseFilePaths(segment)}
                        </React.Fragment>
                    );
                })}
                <a
                    href={buildMentionUrl(agentMention.name)}
                    className="text-[var(--vscode-textLink-foreground,hsl(var(--primary)))] hover:underline"
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                >
                    {agentMention.token}
                </a>
                {afterSegments.map((segment, idx) => {
                    const key = typeof segment === 'string'
                        ? `after-${idx}-${segment.slice(0, 20)}`
                        : `after-${idx}`;
                    return (
                        <React.Fragment key={key}>
                            {parseFilePaths(segment)}
                        </React.Fragment>
                    );
                })}
            </>
        );
    };

    const isInteractive = isTruncated || isExpanded;

    return (
        <div
            className={cn(
                "break-words whitespace-pre-wrap font-sans typography-markdown",
                !isExpanded && "line-clamp-3",
                isInteractive && "cursor-pointer"
            )}
            ref={textRef}
            {...(isInteractive && {
                onClick: handleClick,
                onKeyDown: handleKeyDown,
                role: "button",
                tabIndex: 0,
                "aria-label": isExpanded ? "Collapse text" : "Expand text"
            })}
            key={part.id || `${messageId}-user-text`}
        >
            {renderContent()}
        </div>
    );
};

export default React.memo(UserTextPart);
