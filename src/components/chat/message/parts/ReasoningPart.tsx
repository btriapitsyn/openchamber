import React from 'react';
import type { Part } from '@opencode-ai/sdk';
import { Brain, ChevronDown, ChevronRight, Maximize2, CheckCircle, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ToolPopupContent } from '../types';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { createAssistantMarkdownComponents } from '../markdownPresets';

type ReasoningPartProps = {
    part: Part;
    onContentChange?: () => void;
    isMobile?: boolean;
    onShowPopup?: (content: ToolPopupContent) => void;
    syntaxTheme?: any;
    copiedCode?: string | null;
    onCopyCode?: (code: string) => void;
};

const getReasoningStateIcon = (isFinalized: boolean) => {
    if (!isFinalized) {
        return <div className="animate-spin h-3 w-3 border-2 border-t-transparent rounded-full" style={{ borderColor: 'var(--status-info)' }} />;
    }
    return <CheckCircle className="h-3 w-3" style={{ color: 'var(--status-success)' }} />;
};

const formatDuration = (start: number, end?: number) => {
    const duration = end ? end - start : Date.now() - start;
    if (duration < 1000) return `${duration}ms`;
    return `${(duration / 1000).toFixed(1)}s`;
};

const ReasoningPart: React.FC<ReasoningPartProps> = ({ part, onContentChange, isMobile = false, onShowPopup, syntaxTheme, copiedCode, onCopyCode }) => {
    const [isExpanded, setIsExpanded] = React.useState(false);

    // Check if part is finalized
    const time = (part as any).time;
    const isFinalized = time && typeof time.end !== 'undefined';

    // Call onContentChange on mount (when reasoning card appears)
    React.useEffect(() => {
        onContentChange?.();
    }, []);

    // Call onContentChange when expanded state changes
    React.useEffect(() => {
        if (isExpanded !== undefined) {
            onContentChange?.();
        }
    }, [isExpanded, onContentChange]);

    const rawText = (part as any).text || (part as any).content || '';

    // Clean text by removing blockquote markers (> at start of lines)
    const text = React.useMemo(() => {
        return rawText.split('\n').map((line: string) => line.replace(/^>\s?/, '')).join('\n');
    }, [rawText]);

    // Generate preview for header (first 50-80 chars)
    const preview = text.length > 0 ? text.substring(0, 80) + (text.length > 80 ? '...' : '') : 'Thinking...';

    const handlePopup = React.useCallback(() => {
        if (onShowPopup && text) {
            onShowPopup({
                open: true,
                title: 'Reasoning',
                content: text,
                metadata: { tool: 'reasoning' },
            });
        }
    }, [onShowPopup, text]);

    return (
        <div className="my-1.5 border border-border/30 rounded-md bg-muted/20">
            <div
                className="flex items-center gap-2 px-2 py-1 cursor-pointer hover:bg-muted/30 transition-colors"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="flex items-center gap-2 flex-shrink-0">
                    <Brain className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                    <span className="typography-meta font-bold text-foreground">Reasoning</span>
                </div>
                {!isMobile && text && (
                    <span className="typography-meta text-muted-foreground/60 truncate font-normal flex-1 min-w-0">
                        {preview}
                    </span>
                )}
                <div className="flex items-center gap-2 flex-shrink-0 ml-auto">
                    {getReasoningStateIcon(isFinalized)}
                    {!isMobile && time && isFinalized && (
                        <span className="typography-meta text-muted-foreground">
                            {formatDuration(time.start, time.end)}
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                    {isFinalized && (
                        <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0"
                            onClick={(e) => {
                                e.stopPropagation();
                                handlePopup();
                            }}
                        >
                            <Maximize2 className="h-3 w-3" />
                        </Button>
                    )}
                    <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0"
                        onClick={(e) => {
                            e.stopPropagation();
                            setIsExpanded(!isExpanded);
                        }}
                    >
                        {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    </Button>
                </div>
            </div>

            {isExpanded && text && (
                <div className="px-2 pb-1.5 pt-1 border-t border-border/20">
                    <div
                        className="typography-meta text-muted-foreground/70 leading-relaxed"
                        style={{ fontSize: 'var(--text-meta)' }}
                    >
                        <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={createAssistantMarkdownComponents({
                                syntaxTheme: syntaxTheme || {},
                                isMobile: isMobile || false,
                                copiedCode: copiedCode || null,
                                onCopyCode: onCopyCode || (() => {}),
                                onShowPopup: onShowPopup || (() => {}),
                                allowAnimation: false,
                            })}
                        >
                            {text}
                        </ReactMarkdown>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ReasoningPart;
