import React from 'react';
import type { Part } from '@opencode-ai/sdk';
import { Brain, CaretDown as ChevronDown, CaretRight as ChevronRight, ArrowsOutSimple as Maximize2 } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
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
    const isRunning = !isFinalized;

    // Call onContentChange on mount and when expanded state changes
    React.useEffect(() => {
        onContentChange?.();
    }, []);

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

    // Generate preview for collapsed view
    const preview = text.length > 0 ? text.substring(0, 100) + (text.length > 100 ? '...' : '') : '';

    const handlePopup = React.useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
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
        <div className="my-1">
            {/* Single-line collapsed view */}
            <div
                className={cn(
                    'flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors',
                    isExpanded && 'bg-muted/20'
                )}
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="flex items-center gap-2 flex-shrink-0">
                    <div className={cn(isRunning && 'animate-pulse')}>
                        <Brain className="h-3.5 w-3.5 flex-shrink-0" />
                    </div>
                    <span className={cn(
                        'typography-meta font-medium',
                        isRunning && 'animate-pulse'
                    )}>
                        Reasoning
                    </span>
                </div>

                {preview && (
                    <span className="typography-micro text-muted-foreground/70 truncate flex-1 min-w-0">
                        {preview}
                    </span>
                )}

                <div className="flex items-center gap-1.5 flex-shrink-0 ml-auto">
                    {isFinalized && time && (
                        <span className="typography-meta text-muted-foreground/60">
                            {formatDuration(time.start, time.end)}
                        </span>
                    )}

                    {isFinalized && text && (
                        <Button
                            size="sm"
                            variant="ghost"
                            className="h-5 w-5 p-0 opacity-60 hover:opacity-100"
                            onClick={handlePopup}
                        >
                            <Maximize2 weight="regular" className="h-3 w-3" />
                        </Button>
                    )}

                    <Button
                        size="sm"
                        variant="ghost"
                        className="h-5 w-5 p-0 opacity-60 hover:opacity-100"
                        onClick={(e) => {
                            e.stopPropagation();
                            setIsExpanded(!isExpanded);
                        }}
                    >
                        {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    </Button>
                </div>
            </div>

            {/* Expanded content */}
            {isExpanded && text && (
                <div className="relative pr-2 pb-2 pt-2 pl-[1.875rem] before:absolute before:left-[0.9375rem] before:top-0 before:bottom-0 before:w-px before:bg-border/30">
                    <div className="bg-muted/30 border border-border/20 rounded-md max-h-60 overflow-auto">
                        <div
                            className="typography-micro text-muted-foreground/70 leading-relaxed p-2"
                            style={{ '--text-markdown': 'var(--text-micro)' } as React.CSSProperties}
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
                </div>
            )}
        </div>
    );
};

export default ReasoningPart;
