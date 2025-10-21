import React from 'react';
import type { Part } from '@opencode-ai/sdk';
import { cn } from '@/lib/utils';

type ReasoningPartProps = {
    part: Part;
    onContentChange?: () => void;
    messageId: string;
};

const ReasoningPart: React.FC<ReasoningPartProps> = ({
    part,
    onContentChange,
    messageId,
}) => {
    const [isExpanded, setIsExpanded] = React.useState(false);
    const [isClamped, setIsClamped] = React.useState(false);
    const blockquoteRef = React.useRef<HTMLQuoteElement>(null);
    const rawText = (part as any).text || (part as any).content || '';

    // Clean text by removing blockquote markers and all empty lines
    const textContent = React.useMemo(() => {
        if (typeof rawText !== 'string' || !rawText) {
            return '';
        }
        // Remove blockquote markers and filter out all empty lines
        return rawText
            .split('\n')
            .map((line: string) => line.replace(/^>\s?/, ''))
            .filter((line: string) => line.trim().length > 0)
            .join('\n');
    }, [rawText]);

    // Check if text is actually clamped
    React.useEffect(() => {
        if (!blockquoteRef.current || isExpanded) {
            setIsClamped(false);
            return;
        }

        const element = blockquoteRef.current;
        // Check if content is being clamped
        const isTextClamped = element.scrollHeight > element.clientHeight;
        setIsClamped(isTextClamped);
    }, [textContent, isExpanded]);

    // Call onContentChange on mount and when expanded changes
    React.useEffect(() => {
        onContentChange?.();
    }, [onContentChange, isExpanded]);

    // Skip rendering when no text
    if (!textContent || textContent.trim().length === 0) {
        return null;
    }

    // Show as clickable if text is clamped OR already expanded
    const isClickable = isClamped || isExpanded;

    return (
        <div className="my-1 pl-1">
            <div
                className={cn(
                    "relative pl-[1.875rem] pr-3 py-1.5",
                    'before:absolute before:left-[0.875rem] before:top-[-0.25rem] before:bottom-[-0.25rem] before:w-px before:bg-border/80 before:content-[\"\"]'
                )}
            >
                <blockquote
                    ref={blockquoteRef}
                    key={part.id || `${messageId}-reasoning`}
                    onClick={() => isClickable && setIsExpanded(!isExpanded)}
                    className={cn(
                        "whitespace-pre-wrap break-words typography-micro italic text-muted-foreground/70 transition-all duration-200",
                        isClickable && "cursor-pointer hover:text-muted-foreground",
                        !isExpanded && "line-clamp-2"
                    )}
                >
                    {textContent}
                </blockquote>
            </div>
        </div>
    );
};

export default ReasoningPart;
