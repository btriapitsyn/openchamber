import React from 'react';
import { Clock, CheckCircle, XCircle, ChevronDown, ChevronRight, AlertTriangle, Wrench, Terminal, FileEdit, FileText, FileCode, FolderOpen, Globe, Search, GitBranch, Maximize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getToolMetadata, getLanguageFromExtension } from '@/lib/toolHelpers';
import type { ToolPart as ToolPartType, ToolStateUnion } from '@/types/tool';
import { toolDisplayStyles } from '@/lib/typography';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { createAssistantMarkdownComponents } from '../markdownPresets';

import {
    renderListOutput,
    renderGrepOutput,
    renderGlobOutput,
    renderTodoOutput,
    renderWebSearchOutput,
    parseDiffToLines,
    formatEditOutput,
    detectLanguageFromOutput,
    formatInputForDisplay,
    hasLspDiagnostics,
} from '../toolRenderers';
import type { ToolPopupContent } from '../types';
import { StreamingPlaceholder } from '../StreamingPlaceholder';

interface ToolPartProps {
    part: ToolPartType;
    isExpanded: boolean;
    onToggle: (toolId: string) => void;
    syntaxTheme: any;
    isMobile: boolean;
    onShowPopup: (content: ToolPopupContent) => void;
    onContentChange?: () => void;
}

const getToolIcon = (toolName: string, size: 'small' | 'default' = 'small') => {
    const iconClass = size === 'small'
        ? 'h-3 w-3 text-muted-foreground flex-shrink-0'
        : 'h-3.5 w-3.5 text-muted-foreground flex-shrink-0';
    const tool = toolName.toLowerCase();

    if (tool === 'edit' || tool === 'multiedit' || tool === 'str_replace' || tool === 'str_replace_based_edit_tool') {
        return <FileEdit className={iconClass} />;
    }
    if (tool === 'write' || tool === 'create' || tool === 'file_write') {
        return <FileText className={iconClass} />;
    }
    if (tool === 'read' || tool === 'view' || tool === 'file_read' || tool === 'cat') {
        return <FileCode className={iconClass} />;
    }
    if (tool === 'bash' || tool === 'shell' || tool === 'cmd' || tool === 'terminal') {
        return <Terminal className={iconClass} />;
    }
    if (tool === 'list' || tool === 'ls' || tool === 'dir' || tool === 'list_files') {
        return <FolderOpen className={iconClass} />;
    }
    if (tool === 'search' || tool === 'grep' || tool === 'find' || tool === 'ripgrep') {
        return <Search className={iconClass} />;
    }
    if (tool === 'fetch' || tool === 'curl' || tool === 'wget' || tool === 'webfetch') {
        return <Globe className={iconClass} />;
    }
    if (tool === 'web-search' || tool === 'websearch' || tool === 'search_web' || tool === 'google' || tool === 'bing' || tool === 'duckduckgo') {
        return <Search className={iconClass} />;
    }
    if (tool.startsWith('git')) {
        return <GitBranch className={iconClass} />;
    }
    return <Wrench className={iconClass} />;
};

const getToolStateIcon = (status: ToolStateUnion['status']) => {
    switch (status) {
        case 'pending':
            return <Clock className="h-3 w-3 text-muted-foreground" />;
        case 'running':
            return <div className="animate-spin h-3 w-3 border-2 border-t-transparent rounded-full" style={{ borderColor: 'var(--status-info)' }} />;
        case 'completed':
            return <CheckCircle className="h-3 w-3" style={{ color: 'var(--status-success)' }} />;
        case 'error':
            return <XCircle className="h-3 w-3" style={{ color: 'var(--status-error)' }} />;
        default:
            return <Wrench className="h-3 w-3 text-muted-foreground" />;
    }
};

const formatDuration = (start: number, end?: number) => {
    const duration = end ? end - start : Date.now() - start;
    if (duration < 1000) return `${duration}ms`;
    return `${(duration / 1000).toFixed(1)}s`;
};

const ToolPart: React.FC<ToolPartProps> = ({ part, isExpanded, onToggle, syntaxTheme, isMobile, onShowPopup, onContentChange }) => {
    const state = part.state;

    // Check if tool is finalized
    const isFinalized = state.status === 'completed' || state.status === 'error';

    // Call onContentChange on mount (when tool card appears)
    React.useEffect(() => {
        onContentChange?.();
    }, []);

    // Call onContentChange when expanded state changes
    React.useEffect(() => {
        if (isExpanded !== undefined) {
            onContentChange?.();
        }
    }, [isExpanded, onContentChange]);

    const metadata = 'metadata' in state ? (state as any).metadata : undefined;
    const input = 'input' in state ? (state as any).input : undefined;
    const rawOutput = 'output' in state ? (state as any).output : undefined;
    const hasStringOutput = typeof rawOutput === 'string' && rawOutput.length > 0;
    const outputString = typeof rawOutput === 'string' ? rawOutput : '';

    const metadataHasDiagnostics = React.useMemo(() => {
        if (!metadata || !metadata.lspDiagnostics) {
            return false;
        }
        const diagnostics = metadata.lspDiagnostics;
        if (Array.isArray(diagnostics)) {
            return diagnostics.length > 0;
        }
        if (typeof diagnostics === 'object') {
            return Object.keys(diagnostics).length > 0;
        }
        return Boolean(diagnostics);
    }, [metadata]);

    const showLspWarning = state.status === 'completed' && (
        (typeof rawOutput === 'string' && hasLspDiagnostics(rawOutput)) || metadataHasDiagnostics
    );

    const handlePopup = React.useCallback(
        (content: Omit<ToolPopupContent, 'open'>) => {
            onShowPopup({
                open: true,
                ...content,
            });
        },
        [onShowPopup]
    );

    return (
        <div className="my-1.5 border border-border/30 rounded-md bg-muted/20">
            <div className="flex items-center gap-2 px-2 py-1 cursor-pointer hover:bg-muted/30 transition-colors" onClick={() => onToggle(part.id)}>
                <div className="flex items-center gap-2 flex-shrink-0">
                    {getToolIcon(part.tool)}
                    <span className="typography-meta font-bold text-foreground">{getToolMetadata(part.tool).displayName}</span>
                </div>
                {!isMobile && (
                    <span className="typography-meta text-muted-foreground/60 truncate font-normal flex-1 min-w-0">
                        {input?.description
                            ? input.description
                            : metadata?.description
                                ? metadata.description
                                : ('title' in state && state.title)
                                    ? state.title
                                    : input?.command
                                        ? input.command.split('\n')[0].substring(0, 100) + (input.command.length > 100 ? '...' : '')
                                        : ''}
                    </span>
                )}
                <div className="flex items-center gap-2 flex-shrink-0 ml-auto">
                    {showLspWarning && (
                        <div className="flex items-center gap-1" title="LSP detected diagnostics for this run">
                            <AlertTriangle className="h-3 w-3" style={{ color: 'var(--status-warning)' }} />
                        </div>
                    )}
                    {getToolStateIcon(state.status)}
                    {!isMobile && 'time' in state && isFinalized && (
                        <span className="typography-meta text-muted-foreground">
                            {formatDuration(state.time.start, 'end' in state.time ? state.time.end : undefined)}
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                    {isFinalized && state.status === 'completed' && (
                        <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0"
                            onClick={(e) => {
                                e.stopPropagation();
                                const isDiff = (part.tool === 'edit' || part.tool === 'multiedit') && Boolean(metadata?.diff);
                                const content = isDiff && metadata?.diff
                                    ? metadata.diff
                                    : typeof rawOutput === 'string'
                                        ? formatEditOutput(rawOutput, part.tool, metadata)
                                        : '';

                                const detectedLanguage = detectLanguageFromOutput(content, part.tool, input);
                                const displayName = getToolMetadata(part.tool).displayName;
                                const fileDescriptor = input?.filePath || input?.file_path || input?.path || metadata?.filePath || metadata?.file_path || metadata?.path;
                                const popupTitle = !isMobile && fileDescriptor
                                    ? `${displayName} - ${fileDescriptor}`
                                    : displayName;

                                handlePopup({
                                    title: popupTitle,
                                    content,
                                    language: detectedLanguage,
                                    isDiff,
                                    diffHunks: isDiff && metadata?.diff ? parseDiffToLines(metadata.diff) : undefined,
                                    metadata: { input, tool: part.tool },
                                });
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
                            onToggle(part.id);
                        }}
                    >
                        {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    </Button>
                </div>
            </div>

            {isExpanded && (
                <div className="px-2 pb-1.5 pt-6 space-y-1.5 border-t border-border/20">
                    {(part.tool === 'todowrite' || part.tool === 'todoread') ? (
                        state.status === 'completed' && hasStringOutput ? (
                            renderTodoOutput(outputString) || (
                                <div className="typography-meta bg-muted/30 p-2 rounded border border-border/20 text-muted-foreground">
                                    Unable to parse todo list
                                </div>
                            )
                        ) : state.status === 'error' && 'error' in state ? (
                            <div>
                                <div className="typography-meta font-medium text-muted-foreground mb-1">Error:</div>
                                <div className="typography-meta p-2 rounded border" style={{
                                    backgroundColor: 'var(--status-error-background)',
                                    color: 'var(--status-error)',
                                    borderColor: 'var(--status-error-border)',
                                }}>
                                    {state.error}
                                </div>
                            </div>
                        ) : (
                            <div className="typography-meta text-muted-foreground">Processing todo list...</div>
                        )
                    ) : (
                        <>
                            {input && Object.keys(input).length > 0 && (
                                <div>
                                    <div className={cn('font-medium text-muted-foreground mb-1', isMobile ? 'typography-micro' : 'typography-meta')}>
                                        {input.command ? 'Command:' : 'Input:'}
                                    </div>
                                    {input.command && part.tool === 'bash' ? (
                                        <div className="typography-meta bg-muted/30 rounded border border-border/20 overflow-hidden">
                                            <SyntaxHighlighter
                                                style={syntaxTheme}
                                                language="bash"
                                                PreTag="div"
                                                customStyle={{
                                                    ...toolDisplayStyles.getCollapsedStyles(),
                                                    fontSize: 'inherit',
                                                }}
                                                wrapLongLines
                                            >
                                                {formatInputForDisplay(input, part.tool)}
                                            </SyntaxHighlighter>
                                        </div>
                                    ) : part.tool === 'write' && input.content ? (
                                        <div className="typography-meta bg-muted/30 rounded border border-border/20 overflow-hidden">
                                            <SyntaxHighlighter
                                                style={syntaxTheme}
                                                language={getLanguageFromExtension(input.filePath || input.file_path || '') || 'text'}
                                                PreTag="div"
                                                customStyle={{
                                                    ...toolDisplayStyles.getCollapsedStyles(),
                                                    fontSize: 'inherit',
                                                }}
                                                wrapLongLines
                                            >
                                                {input.content}
                                            </SyntaxHighlighter>
                                        </div>
                                    ) : (
                                        <pre className="typography-meta bg-muted/50 px-2 py-1 rounded font-mono whitespace-pre-wrap break-words text-foreground/90">
                                            {formatInputForDisplay(input, part.tool)}
                                        </pre>
                                    )}
                                </div>
                            )}

                            {state.status === 'completed' && 'output' in state && (
                                <div>
                                    <div className={cn('font-medium text-muted-foreground mb-1', isMobile ? 'typography-micro' : 'typography-meta')}>
                                        Output:
                                    </div>
                                    {(part.tool === 'todowrite' || part.tool === 'todoread') && hasStringOutput ? (
                                        renderTodoOutput(outputString) || (
                                            <div className="typography-meta bg-muted/30 p-2 rounded border border-border/20 max-h-40 overflow-auto">
                                                <SyntaxHighlighter
                                                    style={syntaxTheme}
                                                    language="json"
                                                    PreTag="div"
                                                    customStyle={{
                                                        ...toolDisplayStyles.getCollapsedStyles(),
                                                        padding: 0,
                                                        overflowX: 'visible',
                                                    }}
                                                    codeTagProps={{
                                                        style: {
                                                            background: 'transparent !important',
                                                        },
                                                    }}
                                                    wrapLongLines
                                                >
                                                    {formatEditOutput(outputString, part.tool, metadata)}
                                                </SyntaxHighlighter>
                                            </div>
                                        )
                                    ) : part.tool === 'list' && hasStringOutput ? (
                                        renderListOutput(outputString) || (
                                            <pre className="typography-meta bg-muted/30 p-2 rounded border border-border/20 font-mono whitespace-pre-wrap">
                                                {outputString}
                                            </pre>
                                        )
                                    ) : part.tool === 'grep' && hasStringOutput ? (
                                        renderGrepOutput(outputString, isMobile) || (
                                            <pre className="typography-meta bg-muted/30 p-2 rounded border border-border/20 font-mono whitespace-pre-wrap">
                                                {outputString}
                                            </pre>
                                        )
                                    ) : part.tool === 'glob' && hasStringOutput ? (
                                        renderGlobOutput(outputString, isMobile) || (
                                            <pre className="typography-meta bg-muted/30 p-2 rounded border border-border/20 font-mono whitespace-pre-wrap">
                                                {outputString}
                                            </pre>
                                        )
                                    ) : part.tool === 'task' && hasStringOutput ? (
                                        <div
                                            className="p-3 bg-muted/20 rounded border border-border/20"
                                            style={{ fontSize: 'var(--text-code)' }}
                                        >
                                            <ReactMarkdown
                                                remarkPlugins={[remarkGfm]}
                                                components={createAssistantMarkdownComponents({
                                                    syntaxTheme,
                                                    isMobile,
                                                    copiedCode: null,
                                                    onCopyCode: () => {},
                                                    onShowPopup: () => {},
                                                    allowAnimation: false,
                                                })}
                                            >
                                                {outputString}
                                            </ReactMarkdown>
                                        </div>
                                    ) : (part.tool === 'web-search' || part.tool === 'websearch' || part.tool === 'search_web') && hasStringOutput ? (
                                        renderWebSearchOutput(outputString, syntaxTheme) || (
                                            <pre className="typography-meta bg-muted/30 p-2 rounded border border-border/20 font-mono whitespace-pre-wrap">
                                                {outputString}
                                            </pre>
                                        )
                                    ) : (part.tool === 'edit' || part.tool === 'multiedit') && ((!hasStringOutput && metadata?.diff) || (outputString.trim().length === 0 || hasLspDiagnostics(outputString))) && metadata?.diff ? (
                                        <div className="typography-meta bg-muted/30 rounded border border-border/20 max-h-60 overflow-y-auto">
                                            {parseDiffToLines(metadata!.diff).map((hunk, hunkIdx) => (
                                                <div key={hunkIdx} className="border-b border-border/20 last:border-b-0">
                                                    <div className={cn(
                                                        'bg-muted/20 px-2 py-1 font-medium text-muted-foreground border-b border-border/10',
                                                        isMobile ? 'typography-micro' : 'typography-meta'
                                                    )}>
                                                        {hunk.file} (line {hunk.oldStart})
                                                    </div>
                                                    <div>
                                                        {(hunk.lines as any[]).map((line: any, lineIdx: number) => (
                                                            <div key={lineIdx} className="grid grid-cols-2 divide-x divide-border/20">
                                                                <div
                                                                    className={cn(
                                                                        'typography-meta font-mono leading-tight px-2 py-0.5 overflow-hidden',
                                                                        line.leftLine.type === 'context' && 'bg-transparent',
                                                                        line.leftLine.type === 'empty' && 'bg-transparent'
                                                                    )}
                                                                    style={line.leftLine.type === 'removed' ? { backgroundColor: 'var(--tools-edit-removed-bg)' } : {}}
                                                                >
                                                                    <div className="flex">
                                                                        <span className="text-muted-foreground/60 w-8 flex-shrink-0 text-right pr-2 self-start">
                                                                            {line.leftLine.lineNumber || ''}
                                                                        </span>
                                                                        <div className="flex-1 min-w-0">
                                                                            {line.leftLine.content && (
                                                                                <SyntaxHighlighter
                                                                                    style={syntaxTheme}
                                                                                    language={getLanguageFromExtension(input?.file_path || input?.filePath || hunk.file) || 'text'}
                                                                                    PreTag="div"
                                                                                    wrapLines
                                                                                    wrapLongLines
                                                                                    customStyle={{
                                                                                        margin: 0,
                                                                                        padding: 0,
                                                                                        fontSize: 'inherit',
                                                                                        lineHeight: 'inherit',
                                                                                        background: 'transparent !important',
                                                                                        borderRadius: 0,
                                                                                        overflow: 'visible',
                                                                                        whiteSpace: 'pre-wrap',
                                                                                        wordBreak: 'break-all',
                                                                                        overflowWrap: 'anywhere',
                                                                                    }}
                                                                                    codeTagProps={{
                                                                                        style: {
                                                                                            background: 'transparent !important',
                                                                                        },
                                                                                    }}
                                                                                >
                                                                                    {line.leftLine.content}
                                                                                </SyntaxHighlighter>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                                <div
                                                                    className={cn(
                                                                        'typography-meta font-mono leading-tight px-2 py-0.5 overflow-hidden',
                                                                        line.rightLine.type === 'context' && 'bg-transparent',
                                                                        line.rightLine.type === 'empty' && 'bg-transparent'
                                                                    )}
                                                                    style={line.rightLine.type === 'added' ? { backgroundColor: 'var(--tools-edit-added-bg)' } : {}}
                                                                >
                                                                    <div className="flex">
                                                                        <span className="text-muted-foreground/60 w-8 flex-shrink-0 text-right pr-2 self-start">
                                                                            {line.rightLine.lineNumber || ''}
                                                                        </span>
                                                                        <div className="flex-1 min-w-0">
                                                                            {line.rightLine.content && (
                                                                                <SyntaxHighlighter
                                                                                    style={syntaxTheme}
                                                                                    language={getLanguageFromExtension(input?.file_path || input?.filePath || hunk.file) || 'text'}
                                                                                    PreTag="div"
                                                                                    wrapLines
                                                                                    wrapLongLines
                                                                                    customStyle={{
                                                                                        margin: 0,
                                                                                        padding: 0,
                                                                                        fontSize: 'inherit',
                                                                                        lineHeight: 'inherit',
                                                                                        background: 'transparent !important',
                                                                                        borderRadius: 0,
                                                                                        overflow: 'visible',
                                                                                        whiteSpace: 'pre-wrap',
                                                                                        wordBreak: 'break-all',
                                                                                        overflowWrap: 'anywhere',
                                                                                    }}
                                                                                    codeTagProps={{
                                                                                        style: {
                                                                                            background: 'transparent !important',
                                                                                        },
                                                                                    }}
                                                                                >
                                                                                    {line.rightLine.content}
                                                                                </SyntaxHighlighter>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : hasStringOutput && outputString.trim() ? (
                                        <div className="typography-meta bg-muted/30 p-2 rounded border border-border/20 max-h-40 overflow-auto">
                                            <SyntaxHighlighter
                                                style={syntaxTheme}
                                                language={detectLanguageFromOutput(formatEditOutput(outputString, part.tool, metadata), part.tool, input)}
                                                PreTag="div"
                                                customStyle={{
                                                    ...toolDisplayStyles.getCollapsedStyles(),
                                                    padding: 0,
                                                    overflowX: 'visible',
                                                }}
                                                codeTagProps={{
                                                    style: {
                                                        background: 'transparent !important',
                                                    },
                                                }}
                                                wrapLongLines
                                            >
                                                {formatEditOutput(outputString, part.tool, metadata)}
                                            </SyntaxHighlighter>
                                        </div>
                                    ) : (
                                        <div className="typography-meta bg-muted/30 p-3 rounded border border-border/20 text-muted-foreground/70">
                                            No output produced
                                        </div>
                                    )}
                                </div>
                            )}

                            {state.status === 'error' && 'error' in state && (
                                <div>
                                    <div className={cn('font-medium text-muted-foreground mb-1', isMobile ? 'typography-micro' : 'typography-meta')}>Error:</div>
                                    <div className="typography-meta p-2 rounded border" style={{
                                        backgroundColor: 'var(--status-error-background)',
                                        color: 'var(--status-error)',
                                        borderColor: 'var(--status-error-border)',
                                    }}>
                                        {state.error}
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}
        </div>
    );
};

export default ToolPart;
