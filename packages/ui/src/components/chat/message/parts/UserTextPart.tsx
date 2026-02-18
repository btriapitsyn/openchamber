import React from 'react';

import { cn } from '@/lib/utils';
import { typography } from '@/lib/typography';
import { parseInlineCode } from '@/lib/parseInlineCode';
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
    const CLAMP_LINES = 2;
    const partWithText = part as PartWithText;
    const rawText = partWithText.text;
    const textContent = typeof rawText === 'string' ? rawText : partWithText.content || partWithText.value || '';

    const [isExpanded, setIsExpanded] = React.useState(true);
    const [isTruncated, setIsTruncated] = React.useState(false);
    const [collapseZoneHeight, setCollapseZoneHeight] = React.useState<number>(0);
    const textRef = React.useRef<HTMLDivElement>(null);

    const hasActiveSelectionInElement = React.useCallback((element: HTMLElement): boolean => {
        if (typeof window === 'undefined') {
            return false;
        }

        const selection = window.getSelection();
        if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
            return false;
        }

        const range = selection.getRangeAt(0);
        return element.contains(range.startContainer) || element.contains(range.endContainer);
    }, []);

    React.useEffect(() => {
        const el = textRef.current;
        if (!el) return;

        const checkTruncation = () => {
            if (!isExpanded) {
                setIsTruncated(el.scrollHeight > el.clientHeight);
            }

            const styles = window.getComputedStyle(el);
            const lineHeight = Number.parseFloat(styles.lineHeight);
            const fontSize = Number.parseFloat(styles.fontSize);
            const fallbackLineHeight = Number.isFinite(fontSize) ? fontSize * 1.4 : 20;
            const resolvedLineHeight = Number.isFinite(lineHeight) ? lineHeight : fallbackLineHeight;
            setCollapseZoneHeight(Math.max(1, Math.round(resolvedLineHeight * CLAMP_LINES)));
        };

        checkTruncation();

        const resizeObserver = new ResizeObserver(checkTruncation);
        resizeObserver.observe(el);

        return () => resizeObserver.disconnect();
    }, [textContent, isExpanded]);

    const handleClick = React.useCallback((event: React.MouseEvent<HTMLDivElement>) => {
        const element = textRef.current;
        if (!element) {
            return;
        }

        if (hasActiveSelectionInElement(element)) {
            return;
        }

        if (!isExpanded) {
            if (isTruncated) {
                setIsExpanded(true);
            }
            return;
        }

        const clickY = event.clientY - element.getBoundingClientRect().top;
        if (clickY <= collapseZoneHeight) {
            setIsExpanded(false);
        }
    }, [collapseZoneHeight, hasActiveSelectionInElement, isExpanded, isTruncated]);

    if (!textContent || textContent.trim().length === 0) {
        return null;
    }

    // Inline code styling to match assistant messages
    const inlineCodeStyle: React.CSSProperties = {
        ...typography.code.inline,
        fontFamily: 'var(--font-mono)',
        backgroundColor: 'var(--markdown-inline-code-bg, var(--surface-muted))',
        color: 'var(--markdown-inline-code, var(--foreground))',
        padding: '0.125rem 0.25rem',
        borderRadius: '0.25rem',
    };

    // Render a text string, handling all agent mentions if present
    const renderTextWithMention = (text: string, key: string): React.ReactNode => {
        if (!agentMention?.token || !text.includes(agentMention.token)) {
            return text;
        }

        // Split by the mention token to handle all occurrences
        const parts = text.split(agentMention.token);
        const result: React.ReactNode[] = [];

        parts.forEach((part, index) => {
            if (index > 0) {
                // Add the mention link before this part (except for the first part)
                result.push(
                    <a
                        key={`${key}-mention-${index}`}
                        href={buildMentionUrl(agentMention.name)}
                        className="text-primary hover:underline"
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {agentMention.token}
                    </a>
                );
            }
            if (part) {
                result.push(part);
            }
        });

        return <React.Fragment key={key}>{result}</React.Fragment>;
    };

    // Render content with inline code parsing and optional agent mention link
    const renderContent = () => {
        const segments = parseInlineCode(textContent);

        return segments.map((segment, index) => {
            const key = `segment-${index}`;
            if (segment.type === 'code') {
                return (
                    <code key={key} style={inlineCodeStyle}>
                        {segment.content}
                    </code>
                );
            }
            // For text segments, check for agent mention
            return renderTextWithMention(segment.content, key);
        });
    };

    return (
        <div className="relative" key={part.id || `${messageId}-user-text`}>
            <div
                className={cn(
                    "break-words whitespace-pre-wrap font-sans typography-markdown",
                    !isExpanded && "line-clamp-2",
                    isTruncated && !isExpanded && "cursor-pointer"
                )}
                ref={textRef}
                onClick={handleClick}
            >
                {renderContent()}
            </div>
        </div>
    );
};

export default React.memo(UserTextPart);
