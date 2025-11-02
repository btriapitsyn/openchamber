import React from 'react';
import { CaretDown as ChevronDown, CaretRight as ChevronRight, TerminalWindow as Terminal, PencilSimple as FileEdit, FileText, File as FileCode, Folder as FolderOpen, Globe, MagnifyingGlass, GitBranch, Wrench, ListChecks as ListTodo, FileMagnifyingGlass } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getToolMetadata, getLanguageFromExtension } from '@/lib/toolHelpers';
import type { ToolPart as ToolPartType, ToolState as ToolStateUnion } from '@opencode-ai/sdk';
import { toolDisplayStyles } from '@/lib/typography';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { createAssistantMarkdownComponents } from '../markdownPresets';
import { useDirectoryStore } from '@/stores/useDirectoryStore';

import {
    renderListOutput,
    renderGrepOutput,
    renderGlobOutput,
    renderTodoOutput,
    renderWebSearchOutput,
    parseDiffToUnified,
    formatEditOutput,
    detectLanguageFromOutput,
    formatInputForDisplay,
    hasLspDiagnostics,
} from '../toolRenderers';

interface ToolPartProps {
    part: ToolPartType;
    isExpanded: boolean;
    onToggle: (toolId: string) => void;
    syntaxTheme: any;
    isMobile: boolean;
    onContentChange?: () => void;
    hasPrevTool?: boolean;
    hasNextTool?: boolean;
}

export const getToolIcon = (toolName: string) => {
    const iconClass = 'h-3.5 w-3.5 flex-shrink-0';
    const tool = toolName.toLowerCase();

    if (tool === 'edit' || tool === 'multiedit' || tool === 'str_replace' || tool === 'str_replace_based_edit_tool') {
        return <FileEdit className={iconClass} />;
    }
    if (tool === 'write' || tool === 'create' || tool === 'file_write') {
        return <FileText className={iconClass} />;
    }
    if (tool === 'read' || tool === 'view' || tool === 'file_read' || tool === 'cat') {
        return <FileText className={iconClass} />;
    }
    if (tool === 'bash' || tool === 'shell' || tool === 'cmd' || tool === 'terminal') {
        return <Terminal className={iconClass} />;
    }
    if (tool === 'list' || tool === 'ls' || tool === 'dir' || tool === 'list_files') {
        return <FolderOpen className={iconClass} />;
    }
    if (tool === 'search' || tool === 'grep' || tool === 'find' || tool === 'ripgrep') {
        return <MagnifyingGlass className={iconClass} />;
    }
    if (tool === 'glob') {
        return <FileMagnifyingGlass className={iconClass} />;
    }
    if (tool === 'fetch' || tool === 'curl' || tool === 'wget' || tool === 'webfetch') {
        return <Globe className={iconClass} />;
    }
    if (tool === 'web-search' || tool === 'websearch' || tool === 'search_web' || tool === 'google' || tool === 'bing' || tool === 'duckduckgo') {
        return <MagnifyingGlass className={iconClass} />;
    }
    if (tool === 'todowrite' || tool === 'todoread') {
        return <ListTodo className={iconClass} />;
    }
    if (tool.startsWith('git')) {
        return <GitBranch className={iconClass} />;
    }
    return <Wrench className={iconClass} />;
};

const formatDuration = (start: number, end?: number) => {
    const duration = end ? end - start : Date.now() - start;
    const seconds = duration / 1000;
    // Show minimum 0.1s for completed operations
    const displaySeconds = seconds < 0.05 && end !== undefined ? 0.1 : seconds;
    return `${displaySeconds.toFixed(1)}s`;
};

const parseDiffStats = (metadata?: any): { added: number; removed: number } | null => {
    if (!metadata?.diff) return null;

    const lines = metadata.diff.split('\n');
    let added = 0;
    let removed = 0;

    for (const line of lines) {
        if (line.startsWith('+') && !line.startsWith('+++')) added++;
        if (line.startsWith('-') && !line.startsWith('---')) removed++;
    }

    if (added === 0 && removed === 0) return null;
    return { added, removed };
};

const getRelativePath = (absolutePath: string, currentDirectory: string, isMobile: boolean): string => {
    // Mobile: show only filename
    if (isMobile) {
        return absolutePath.split('/').pop() || absolutePath;
    }

    // Desktop: show relative path
    if (absolutePath.startsWith(currentDirectory)) {
        const relativePath = absolutePath.substring(currentDirectory.length);
        // Remove leading slash if present
        return relativePath.startsWith('/') ? relativePath.substring(1) : relativePath;
    }

    // If not in current directory, show full path
    return absolutePath;
};

const getToolDescription = (part: ToolPartType, state: ToolStateUnion, isMobile: boolean, currentDirectory: string): string => {
    const metadata = 'metadata' in state ? (state as any).metadata : undefined;
    const input = 'input' in state ? (state as any).input : undefined;

    // For edit tools, try to show file path
    if ((part.tool === 'edit' || part.tool === 'multiedit') && input) {
        const filePath = input?.filePath || input?.file_path || input?.path || metadata?.filePath || metadata?.file_path || metadata?.path;
        if (filePath) {
            return getRelativePath(filePath, currentDirectory, isMobile);
        }
    }

    // For read/write tools, show file path
    if ((part.tool === 'read' || part.tool === 'write') && input) {
        const filePath = input?.filePath || input?.file_path || input?.path;
        if (filePath) {
            return getRelativePath(filePath, currentDirectory, isMobile);
        }
    }

    // For bash, show command (first line only)
    if (part.tool === 'bash' && input?.command) {
        const firstLine = input.command.split('\n')[0];
        return isMobile ? firstLine.substring(0, 50) : firstLine.substring(0, 100);
    }

    // For task, show description
    if (part.tool === 'task' && input?.description) {
        return isMobile ? input.description.substring(0, 40) : input.description.substring(0, 80);
    }

    // Fallback to description from metadata or input
    return (
        input?.description ||
        metadata?.description ||
        ('title' in state && state.title) ||
        ''
    );
};

const ToolPart: React.FC<ToolPartProps> = ({ part, isExpanded, onToggle, syntaxTheme, isMobile, onContentChange, hasPrevTool = false, hasNextTool = false }) => {
    const state = part.state;
    const currentDirectory = useDirectoryStore((state) => state.currentDirectory);

    // Check if tool is finalized
    const isFinalized = state.status === 'completed' || state.status === 'error';
    const isRunning = state.status === 'running';
    const isError = state.status === 'error';

    // Live timer for running tools
    const [currentTime, setCurrentTime] = React.useState(Date.now());

    React.useEffect(() => {
        if (isRunning) {
            const timer = setInterval(() => {
                setCurrentTime(Date.now());
            }, 100);
            return () => clearInterval(timer);
        }
    }, [isRunning]);

    // Call onContentChange on mount only
    // Status changes (running → completed) are handled by messageStreamStates lifecycle tracking
    React.useEffect(() => {
        onContentChange?.();
    }, []);

    // Call onContentChange when user manually expands/collapses tool
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

    const diffStats = (part.tool === 'edit' || part.tool === 'multiedit') ? parseDiffStats(metadata) : null;
    const description = getToolDescription(part, state, isMobile, currentDirectory);
    const displayName = getToolMetadata(part.tool).displayName;

    return (
        <div className="my-1 pl-1">
            {/* Single-line collapsed view */}
            <div
                className={cn(
                    'group/tool flex items-center gap-2 px-2 py-1.5 rounded-xl cursor-pointer transition-colors'
                )}
                onClick={() => onToggle(part.id)}
            >
                <div className="flex items-center gap-2 flex-shrink-0">
                    {/* Icon with hover chevron replacement */}
                    <div className="relative h-3.5 w-3.5 flex-shrink-0">
                        {/* Tool icon - hidden on hover when not mobile, always hidden when expanded */}
                        <div
                            className={cn(
                                'absolute inset-0 transition-opacity',
                                isExpanded && 'opacity-0',
                                !isExpanded && !isMobile && 'group-hover/tool:opacity-0'
                            )}
                            style={isError ? { color: 'var(--status-error)' } : {}}
                        >
                            {getToolIcon(part.tool)}
                        </div>
                        {/* Chevron - shown on hover when not mobile, or always when expanded */}
                        <div
                            className={cn(
                                'absolute inset-0 transition-opacity flex items-center justify-center',
                                isExpanded && 'opacity-100',
                                !isExpanded && isMobile && 'opacity-0',
                                !isExpanded && !isMobile && 'opacity-0 group-hover/tool:opacity-100'
                            )}
                        >
                            {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                        </div>
                    </div>
                    <span
                        className="typography-meta font-medium"
                        style={isError ? { color: 'var(--status-error)' } : {}}
                    >
                        {displayName}
                    </span>
                </div>

                <div className="flex items-center gap-1 flex-1 min-w-0 typography-meta text-muted-foreground/70">
                    {description && (
                        <span className={cn("truncate", isMobile && "max-w-[120px]")}>
                            {description}
                        </span>
                    )}
                    {diffStats && (
                        <span className="text-muted-foreground/60 flex-shrink-0">
                            <span style={{ color: 'var(--status-success)' }}>+{diffStats.added}</span>
                            {' '}
                            <span style={{ color: 'var(--status-error)' }}>-{diffStats.removed}</span>
                        </span>
                    )}
                    {'time' in state && state.time && (
                        <span className="text-muted-foreground/80 flex-shrink-0">
                            {formatDuration(state.time.start, isFinalized && 'end' in state.time ? state.time.end : currentTime)}
                        </span>
                    )}
                </div>


            </div>

            {/* Expanded content */}
            {isExpanded && (
                <div
                    className={cn(
                        'relative pr-2 pb-2 pt-2 space-y-2 pl-[1.875rem]',
                        'before:absolute before:left-[0.875rem] before:w-px before:bg-border/80 before:content-[""]',
                        hasPrevTool ? 'before:top-[-0.45rem]' : 'before:top-[-0.25rem]',
                        hasNextTool ? 'before:bottom-[-0.6rem]' : 'before:bottom-0'
                    )}
                >
                    {(part.tool === 'todowrite' || part.tool === 'todoread') ? (
                        state.status === 'completed' && hasStringOutput ? (
                            renderTodoOutput(outputString) || (
                                <div className="typography-meta bg-muted/30 p-2 rounded-xl border border-border/20 text-muted-foreground">
                                    Unable to parse todo list
                                </div>
                            )
                        ) : state.status === 'error' && 'error' in state ? (
                            <div>
                                <div className="typography-meta font-medium text-muted-foreground mb-1">Error:</div>
                                <div className="typography-meta p-2 rounded-xl border" style={{
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
                                    <div className="typography-meta font-medium text-muted-foreground/80 mb-1">
                                        {input.command ? 'Command:' : 'Input:'}
                                    </div>
                                    {input.command && part.tool === 'bash' ? (
                                        <div className="max-h-60 overflow-hidden rounded-xl border border-border/20 bg-muted/30">
                                            <div className="typography-meta max-h-60 overflow-auto p-2">
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
                                        </div>
                                    ) : part.tool === 'write' && input.content ? (
                                        <div className="max-h-60 overflow-hidden rounded-xl border border-border/20 bg-muted/30">
                                            <div className="typography-meta max-h-60 overflow-auto p-2">
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
                                        </div>
                                    ) : (
                                        <div className="max-h-60 overflow-hidden rounded-xl border border-border/20 bg-muted/50">
                                            <pre className="typography-meta px-3 py-2 font-mono whitespace-pre-wrap break-words text-foreground/90 max-h-60 overflow-auto">
                                                {formatInputForDisplay(input, part.tool)}
                                            </pre>
                                        </div>
                                    )}
                                </div>
                            )}

                            {state.status === 'completed' && 'output' in state && (
                                <div>
                                    <div className="typography-meta font-medium text-muted-foreground/80 mb-1">
                                        Output:
                                    </div>
                                    {(part.tool === 'todowrite' || part.tool === 'todoread') && hasStringOutput ? (
                                        renderTodoOutput(outputString) || (
                                            <div className="max-h-60 overflow-hidden rounded-xl border border-border/20 bg-muted/30">
                                                <div className="typography-meta max-h-60 overflow-auto p-2">
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
                                            </div>
                                        )
                                    ) : part.tool === 'list' && hasStringOutput ? (
                                        renderListOutput(outputString) || (
                                            <div className="max-h-60 overflow-hidden rounded-xl border border-border/20 bg-muted/30">
                                                <pre className="typography-meta p-2 font-mono whitespace-pre-wrap max-h-60 overflow-auto">
                                                    {outputString}
                                                </pre>
                                            </div>
                                        )
                                    ) : part.tool === 'grep' && hasStringOutput ? (
                                        renderGrepOutput(outputString, isMobile) || (
                                            <div className="max-h-60 overflow-hidden rounded-xl border border-border/20 bg-muted/30">
                                                <pre className="typography-meta p-2 font-mono whitespace-pre-wrap max-h-60 overflow-auto">
                                                    {outputString}
                                                </pre>
                                            </div>
                                        )
                                    ) : part.tool === 'glob' && hasStringOutput ? (
                                        renderGlobOutput(outputString, isMobile) || (
                                            <div className="max-h-60 overflow-hidden rounded-xl border border-border/20 bg-muted/30">
                                                <pre className="typography-meta p-2 font-mono whitespace-pre-wrap max-h-60 overflow-auto">
                                                    {outputString}
                                                </pre>
                                            </div>
                                        )
                                    ) : part.tool === 'task' && hasStringOutput ? (
                                        <div className="max-h-60 overflow-hidden rounded-xl border border-border/20 bg-muted/20">
                                            <div
                                                className="p-3 max-h-60 overflow-auto"
                                                style={{ fontSize: 'var(--text-code)' }}
                                            >
                                                <ReactMarkdown
                                                    remarkPlugins={[remarkGfm]}
                                                    components={createAssistantMarkdownComponents({
                                                        syntaxTheme,
                                                        isMobile,
                                                        copiedCode: null,
                                                        onCopyCode: () => {},
                                                        allowAnimation: false,
                                                    })}
                                                >
                                                    {outputString}
                                                </ReactMarkdown>
                                            </div>
                                        </div>
                                     ) : (part.tool === 'web-search' || part.tool === 'websearch' || part.tool === 'search_web') && hasStringOutput ? (
                                        renderWebSearchOutput(outputString, syntaxTheme) || (
                                            <div className="max-h-60 overflow-hidden rounded-xl border border-border/20 bg-muted/30">
                                                <pre className="typography-meta p-2 font-mono whitespace-pre-wrap max-h-60 overflow-auto">
                                                    {outputString}
                                                </pre>
                                            </div>
                                        )
                                    ) : (part.tool === 'edit' || part.tool === 'multiedit') && ((!hasStringOutput && metadata?.diff) || (outputString.trim().length === 0 || hasLspDiagnostics(outputString))) && metadata?.diff ? (
                                        <div className="max-h-60 overflow-hidden rounded-xl border border-border/20 bg-muted/30">
                                            <div className="typography-meta max-h-60 overflow-y-auto p-2">
                                                {parseDiffToUnified(metadata!.diff).map((hunk, hunkIdx) => (
                                                    <div key={hunkIdx} className="border-b border-border/20 last:border-b-0">
                                                        <div className="bg-muted/20 px-2 py-1 typography-meta font-medium text-muted-foreground border-b border-border/10 break-words -mx-2">
                                                            {`${hunk.file} (line ${hunk.oldStart})`}
                                                        </div>
                                                        <div>
                                                            {hunk.lines.map((line, lineIdx) => (
                                                                <div
                                                                    key={lineIdx}
                                                                    className={cn(
                                                                        'typography-meta font-mono px-2 py-0.5 flex -mx-2',
                                                                        line.type === 'context' && 'bg-transparent',
                                                                        line.type === 'removed' && 'bg-transparent',
                                                                        line.type === 'added' && 'bg-transparent'
                                                                    )}
                                                                    style={
                                                                        line.type === 'removed'
                                                                            ? { backgroundColor: 'var(--tools-edit-removed-bg)' }
                                                                            : line.type === 'added'
                                                                                ? { backgroundColor: 'var(--tools-edit-added-bg)' }
                                                                                : {}
                                                                    }
                                                                >
                                                                    <span className="text-muted-foreground/60 w-8 flex-shrink-0 text-right pr-2 self-start select-none">
                                                                        {line.lineNumber || ''}
                                                                    </span>
                                                                    <div className="flex-1 min-w-0">
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
                                                                                background: 'transparent !important',
                                                                                borderRadius: 0,
                                                                                overflow: 'visible',
                                                                                whiteSpace: 'pre-wrap',
                                                                                wordBreak: 'break-all',
                                                                                overflowWrap: 'anywhere',
                                                                            }}
                                                                            codeTagProps={{
                                                                                style: { background: 'transparent !important' },
                                                                            }}
                                                                        >
                                                                            {line.content}
                                                                        </SyntaxHighlighter>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ) : hasStringOutput && outputString.trim() ? (
                                        part.tool === 'read' ? (
                                            <div className="max-h-60 overflow-hidden rounded-xl border border-border/20 bg-muted/30">
                                                <div className="typography-meta max-h-60 overflow-y-auto p-2">
                                                    {(() => {
                                                        const formattedOutput = formatEditOutput(outputString, part.tool, metadata);
                                                        const lines = formattedOutput.split('\n');

                                                        // Extract offset and limit from input
                                                        const offset = input?.offset ?? 0;
                                                        const limit = input?.limit;

                                                        // Detect informational messages (lines that start with parentheses)
                                                        const isInfoMessage = (line: string) => line.trim().startsWith('(');

                                                        return lines.map((line: string, idx: number) => {
                                                            // Check if this is an informational message
                                                            const isInfo = isInfoMessage(line);

                                                            // Calculate actual line number: offset represents lines skipped, so first line is offset + 1
                                                            const lineNumber = offset + idx + 1;

                                                            // Only show line number if it's actual code (not info message) and within limit
                                                            const shouldShowLineNumber = !isInfo && (limit === undefined || idx < limit);

                                                            return (
                                                                <div key={idx} className={`typography-meta font-mono flex ${isInfo ? 'text-muted-foreground/70 italic' : ''}`}>
                                                                    <span className="text-muted-foreground/60 w-8 flex-shrink-0 text-right pr-3 self-start select-none">
                                                                        {shouldShowLineNumber ? lineNumber : ''}
                                                                    </span>
                                                                    <div className="flex-1 min-w-0">
                                                                        {isInfo ? (
                                                                            <div className="whitespace-pre-wrap break-words">{line}</div>
                                                                        ) : (
                                                                            <SyntaxHighlighter
                                                                                style={syntaxTheme}
                                                                                language={detectLanguageFromOutput(formattedOutput, part.tool, input)}
                                                                                PreTag="div"
                                                                                wrapLines
                                                                                wrapLongLines
                                                                                customStyle={{
                                                                                    margin: 0,
                                                                                    padding: 0,
                                                                                    fontSize: 'inherit',
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
                                                                                {line}
                                                                            </SyntaxHighlighter>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            );
                                                        });
                                                    })()}
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="max-h-60 overflow-hidden rounded-xl border border-border/20 bg-muted/30">
                                                <div className="typography-meta max-h-60 overflow-y-auto p-2">
                                                    <SyntaxHighlighter
                                                        style={syntaxTheme}
                                                        language={detectLanguageFromOutput(formatEditOutput(outputString, part.tool, metadata), part.tool, input)}
                                                        PreTag="div"
                                                        customStyle={{
                                                            ...toolDisplayStyles.getCollapsedStyles(),
                                                            padding: 0,
                                                            overflow: 'visible',
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
                                            </div>
                                        )
                                    ) : (
                                        <div className="typography-meta bg-muted/30 p-3 rounded-xl border border-border/20 text-muted-foreground/70">
                                            No output produced
                                        </div>
                                    )}
                                </div>
                            )}

                            {state.status === 'error' && 'error' in state && (
                                <div>
                                    <div className="typography-meta font-medium text-muted-foreground/80 mb-1">Error:</div>
                                    <div className="typography-meta p-2 rounded-xl border" style={{
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
