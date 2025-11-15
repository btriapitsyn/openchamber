import React from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { RiBrainAi3Line, RiFileImageLine, RiFilePdfLine, RiFileSearchLine, RiFolder6Line, RiGitBranchLine, RiGlobalLine, RiListCheck3, RiPencilAiLine, RiSearchLine, RiTerminalBoxLine, RiToolsLine } from '@remixicon/react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { cn } from '@/lib/utils';
import { toolDisplayStyles } from '@/lib/typography';
import { getLanguageFromExtension } from '@/lib/toolHelpers';
import {
    renderTodoOutput,
    renderListOutput,
    renderGrepOutput,
    renderGlobOutput,
    renderWebSearchOutput,
    formatInputForDisplay,
    parseDiffToUnified,
    type UnifiedDiffHunk,
    type SideBySideDiffHunk,
    type SideBySideDiffLine,
} from './toolRenderers';
import type { ToolPopupContent, DiffViewMode } from './types';
import { createAssistantMarkdownComponents } from './markdownPresets';
import { DiffViewToggle } from './DiffViewToggle';

interface ToolOutputDialogProps {
    popup: ToolPopupContent;
    onOpenChange: (open: boolean) => void;
    syntaxTheme: { [key: string]: React.CSSProperties };
    isMobile: boolean;
}

const getToolIcon = (toolName: string) => {
    const iconClass = 'h-3.5 w-3.5 flex-shrink-0';
    const tool = toolName.toLowerCase();

    if (tool === 'reasoning') {
        return <RiBrainAi3Line className={iconClass} />;
    }
    if (tool === 'image-preview') {
        return <RiFileImageLine className={iconClass} />;
    }
    if (tool === 'edit' || tool === 'multiedit' || tool === 'str_replace' || tool === 'str_replace_based_edit_tool') {
        return <RiPencilAiLine className={iconClass} />;
    }
    if (tool === 'write' || tool === 'create' || tool === 'file_write') {
        return <RiFilePdfLine className={iconClass} />;
    }
    if (tool === 'read' || tool === 'view' || tool === 'file_read' || tool === 'cat') {
        return <RiFilePdfLine className={iconClass} />;
    }
    if (tool === 'bash' || tool === 'shell' || tool === 'cmd' || tool === 'terminal') {
        return <RiTerminalBoxLine className={iconClass} />;
    }
    if (tool === 'list' || tool === 'ls' || tool === 'dir' || tool === 'list_files') {
        return <RiFolder6Line className={iconClass} />;
    }
    if (tool === 'search' || tool === 'grep' || tool === 'find' || tool === 'ripgrep') {
        return <RiSearchLine className={iconClass} />;
    }
    if (tool === 'glob') {
        return <RiFileSearchLine className={iconClass} />;
    }
    if (tool === 'fetch' || tool === 'curl' || tool === 'wget' || tool === 'webfetch') {
        return <RiGlobalLine className={iconClass} />;
    }
    if (tool === 'web-search' || tool === 'websearch' || tool === 'search_web' || tool === 'google' || tool === 'bing' || tool === 'duckduckgo') {
        return <RiSearchLine className={iconClass} />;
    }
    if (tool === 'todowrite' || tool === 'todoread') {
        return <RiListCheck3 className={iconClass} />;
    }
    if (tool.startsWith('git')) {
        return <RiGitBranchLine className={iconClass} />;
    }
    return <RiToolsLine className={iconClass} />;
};

const ToolOutputDialog: React.FC<ToolOutputDialogProps> = ({ popup, onOpenChange, syntaxTheme, isMobile }) => {
    const [diffViewMode, setDiffViewMode] = React.useState<DiffViewMode>(isMobile ? 'unified' : 'side-by-side');

    return (
        <Dialog open={popup.open} onOpenChange={onOpenChange}>
            <DialogContent
                className={cn(
                    'overflow-hidden flex flex-col min-h-0 pt-3 pb-4 px-4 gap-1',
                    '[&>button]:top-1.5',
                    isMobile ? 'w-[95vw] max-w-[95vw]' : 'max-w-5xl',
                    isMobile ? '[&>button]:right-1' : '[&>button]:top-2.5 [&>button]:right-4'
                )}
                style={{ maxHeight: '90vh' }}
            >
                <div className="flex-shrink-0 pb-1">
                    <div className="flex items-start gap-2 text-foreground typography-ui-header font-semibold">
                        {popup.metadata?.tool ? getToolIcon(popup.metadata.tool as string) : (
                            <RiToolsLine className="h-3.5 w-3.5 text-foreground flex-shrink-0" />
                        )}
                        <span className="break-words flex-1 leading-tight">{popup.title}</span>
                        {popup.isDiff && (
                            <DiffViewToggle
                                mode={diffViewMode}
                                onModeChange={setDiffViewMode}
                                className="mr-8 flex-shrink-0"
                            />
                        )}
                    </div>
                </div>
                <div className="flex-1 min-h-0 rounded-xl border border-border/30 bg-muted/10 overflow-hidden">
                    <div className="h-full max-h-[75vh] overflow-y-auto px-3 pr-4">
                        {popup.metadata?.input && typeof popup.metadata.input === 'object' &&
                            Object.keys(popup.metadata.input).length > 0 &&
                            popup.metadata?.tool !== 'todowrite' &&
                            popup.metadata?.tool !== 'todoread' ? (() => {
                                const meta = popup.metadata!;
                                const input = meta.input as Record<string, unknown>;
                                // Helper to safely extract string/number values from record
                                const getInputValue = (key: string): string | null => {
                                  const val = input[key];
                                  return typeof val === 'string' ? val : (typeof val === 'number' ? String(val) : null);
                                };
                                return (
                                <div className="border-b border-border/20 p-4 -mx-3">
                                    <div className="typography-markdown font-medium text-muted-foreground mb-2 px-3">
                                        {meta.tool === 'bash'
                                            ? 'RiCommandLine:'
                                            : meta.tool === 'task'
                                                ? 'Task Details:'
                                                : 'Input:'}
                                    </div>
                                    {meta.tool === 'bash' && getInputValue('command') ? (
                                        <div className="bg-muted/30 rounded-xl border border-border/20 mx-3">
                                            <SyntaxHighlighter
                                                style={syntaxTheme}
                                                language="bash"
                                                PreTag="div"
                                                customStyle={toolDisplayStyles.getPopupStyles()}
                                                wrapLongLines
                                            >
                                                {getInputValue('command')!}
                                            </SyntaxHighlighter>
                                        </div>
                                    ) : meta.tool === 'task' && getInputValue('prompt') ? (
                                        <pre
                                            className="bg-muted/30 p-3 rounded-xl border border-border/20 font-mono whitespace-pre-wrap text-foreground/90 mx-3"
                                            style={toolDisplayStyles.getPopupStyles()}
                                        >
                                            {getInputValue('description') ? `Task: ${getInputValue('description')}\n` : ''}
                                            {getInputValue('subagent_type') ? `Agent Type: ${getInputValue('subagent_type')}\n` : ''}
                                            {`Instructions:\n${getInputValue('prompt')}`}
                                        </pre>
                                    ) : meta.tool === 'write' && getInputValue('content') ? (
                                        <div className="bg-muted/30 rounded-xl border border-border/20 mx-3">
                                            <SyntaxHighlighter
                                                style={syntaxTheme}
                                                language={getLanguageFromExtension(getInputValue('filePath') || getInputValue('file_path') || '') || 'text'}
                                                PreTag="div"
                                                customStyle={toolDisplayStyles.getPopupStyles()}
                                                wrapLongLines
                                            >
                                                {getInputValue('content')!}
                                            </SyntaxHighlighter>
                                        </div>
                                    ) : (
                                        <pre
                                            className="bg-muted/30 p-3 rounded-xl border border-border/20 font-mono whitespace-pre-wrap text-foreground/90 mx-3"
                                            style={toolDisplayStyles.getPopupStyles()}
                                        >
                                            {formatInputForDisplay(input, meta.tool as string)}
                                        </pre>
                                    )}
                                </div>
                            );
                            })() : null}

                        {popup.isDiff ? (
                            diffViewMode === 'unified' ? (
                            <div className="typography-markdown">
                                {parseDiffToUnified(popup.content).map((hunk, hunkIdx) => (
                                    <div key={hunkIdx} className="border-b border-border/20 last:border-b-0">
                                        <div
                                            className={cn('bg-muted/20 px-3 py-2 font-medium text-muted-foreground border-b border-border/10 sticky top-0 z-10 break-words -mx-3', isMobile ? 'typography-micro' : 'typography-markdown')}
                                        >
                                            {`${hunk.file} (line ${hunk.oldStart})`}
                                        </div>
                                        <div>
                                            {hunk.lines.map((line, lineIdx) => (
                                                <div
                                                    key={lineIdx}
                                                    className={cn(
                                                        'typography-markdown font-mono px-3 py-0.5 flex',
                                                        line.type === 'context' && 'bg-transparent',
                                                        line.type === 'removed' && 'bg-transparent',
                                                        line.type === 'added' && 'bg-transparent'
                                                    )}
                                                    style={{
                                                        lineHeight: '1.1',
                                                        ...(line.type === 'removed'
                                                            ? { backgroundColor: 'var(--tools-edit-removed-bg)' }
                                                            : line.type === 'added'
                                                                ? { backgroundColor: 'var(--tools-edit-added-bg)' }
                                                                : {}),
                                                    }}
                                                >
                                                    <span className="text-muted-foreground/60 w-10 flex-shrink-0 text-right pr-3 self-start select-none">
                                                        {line.lineNumber || ''}
                                                    </span>
                                                    <div className="flex-1 min-w-0">
                                                        {(() => {
                                                          const inputFile = (typeof popup.metadata?.input === 'object' && popup.metadata.input !== null)
                                                            ? ((popup.metadata.input as Record<string, unknown>).file_path || (popup.metadata.input as Record<string, unknown>).filePath)
                                                            : null;
                                                          const fileStr = typeof inputFile === 'string' ? inputFile : '';
                                                          const hunkFile = (typeof hunk === 'object' && hunk !== null && 'file' in hunk) ? (hunk as UnifiedDiffHunk).file : null;
                                                          const hunkFileStr = typeof hunkFile === 'string' ? hunkFile : '';
                                                          const finalFile = fileStr || hunkFileStr || '';
                                                          return (
                                                            <SyntaxHighlighter
                                                              style={syntaxTheme}
                                                              language={getLanguageFromExtension(finalFile) || 'text'}
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
                                                            {line.content}
                                                            </SyntaxHighlighter>
                                                          );
                                                        })()}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : popup.diffHunks ? (
                            <div className="typography-markdown">
                                {popup.diffHunks.map((hunk, hunkIdx) => (
                                    <div key={hunkIdx} className="border-b border-border/20 last:border-b-0">
                                        <div
                                            className={cn('bg-muted/20 px-3 py-2 font-medium text-muted-foreground border-b border-border/10 sticky top-0 z-10 break-words -mx-3', isMobile ? 'typography-micro' : 'typography-markdown')}
                                        >
                                            {`${hunk.file} (line ${hunk.oldStart})`}
                                        </div>
                                        <div>
                                            {(hunk as unknown as SideBySideDiffHunk).lines.map((line: SideBySideDiffLine, lineIdx: number) => (
                                                <div key={lineIdx} className="grid grid-cols-2 divide-x divide-border/20">
                                                    <div
                                                        className={cn(
                                                            'typography-markdown font-mono px-3 py-0.5 overflow-hidden',
                                                            line.leftLine.type === 'context' && 'bg-transparent',
                                                            line.leftLine.type === 'empty' && 'bg-transparent'
                                                        )}
                                                        style={{
                                                            lineHeight: '1.1',
                                                            ...(line.leftLine.type === 'removed' ? { backgroundColor: 'var(--tools-edit-removed-bg)' } : {}),
                                                        }}
                                                    >
                                                        <div className="flex">
                                                            <span className="text-muted-foreground/60 w-10 flex-shrink-0 text-right pr-3 self-start select-none">
                                                                {line.leftLine.lineNumber || ''}
                                                            </span>
                                                            <div className="flex-1 min-w-0">
                                                                {line.leftLine.content && (
                                                                    <SyntaxHighlighter
                                                                        style={syntaxTheme}
                                                                        language={(() => {
                                                                          const input = popup.metadata?.input;
                                                                          const inputObj = typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {};
                                                                          const filePath = inputObj.file_path || inputObj.filePath;
                                                                          const hunkFile = (hunk as unknown as UnifiedDiffHunk).file;
                                                                          return getLanguageFromExtension(typeof filePath === 'string' ? filePath : hunkFile) || 'text';
                                                                        })()}
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
                                                                        {line.leftLine.content}
                                                                    </SyntaxHighlighter>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div
                                                        className={cn(
                                                            'typography-markdown font-mono px-3 py-0.5 overflow-hidden',
                                                            line.rightLine.type === 'context' && 'bg-transparent',
                                                            line.rightLine.type === 'empty' && 'bg-transparent'
                                                        )}
                                                        style={{
                                                            lineHeight: '1.1',
                                                            ...(line.rightLine.type === 'added' ? { backgroundColor: 'var(--tools-edit-added-bg)' } : {}),
                                                        }}
                                                    >
                                                        <div className="flex">
                                                            <span className="text-muted-foreground/60 w-10 flex-shrink-0 text-right pr-3 self-start select-none">
                                                                {line.rightLine.lineNumber || ''}
                                                            </span>
                                                            <div className="flex-1 min-w-0">
                                                                {line.rightLine.content && (
                                                                    <SyntaxHighlighter
                                                                        style={syntaxTheme}
                                                                        language={(() => {
                                                                          const input = popup.metadata?.input;
                                                                          const inputObj = typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {};
                                                                          const filePath = inputObj.file_path || inputObj.filePath;
                                                                          const hunkFile = (hunk as unknown as UnifiedDiffHunk).file;
                                                                          return getLanguageFromExtension(typeof filePath === 'string' ? filePath : hunkFile) || 'text';
                                                                        })()}
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
                        ) : null
                    ) : popup.image ? (
                        <div className="p-4">
                            <div className="flex flex-col items-center gap-3">
                                <div className="max-h-[70vh] overflow-hidden rounded-2xl border border-border/40 bg-muted/10">
                                    <img
                                        src={popup.image.url}
                                        alt={popup.image.filename || popup.title || 'Image preview'}
                                        className="block h-full max-h-[70vh] w-auto max-w-full object-contain"
                                        loading="lazy"
                                    />
                                </div>
                                {popup.image.filename && (
                                    <span className="typography-meta text-muted-foreground text-center">
                                        {popup.image.filename}
                                    </span>
                                )}
                            </div>
                        </div>
                    ) : popup.content ? (
                        <div className="p-4">
                            {(() => {
                                const tool = popup.metadata?.tool;

                                if (tool === 'todowrite' || tool === 'todoread') {
                                    return (
                                        renderTodoOutput(popup.content) || (
                                            <SyntaxHighlighter
                                                style={syntaxTheme}
                                                language="json"
                                                PreTag="div"
                                                wrapLongLines
                                                customStyle={toolDisplayStyles.getPopupContainerStyles()}
                                                codeTagProps={{ style: { background: 'transparent !important' } }}
                                            >
                                                {popup.content}
                                            </SyntaxHighlighter>
                                        )
                                    );
                                }

                                if (tool === 'list') {
                                    return (
                                        renderListOutput(popup.content) || (
                                            <pre className="typography-markdown bg-muted/30 p-2 rounded-xl border border-border/20 font-mono whitespace-pre-wrap">
                                                {popup.content}
                                            </pre>
                                        )
                                    );
                                }

                                if (tool === 'grep') {
                                    return (
                                        renderGrepOutput(popup.content, isMobile) || (
                                            <pre className="typography-markdown bg-muted/30 p-2 rounded-xl border border-border/20 font-mono whitespace-pre-wrap">
                                                {popup.content}
                                            </pre>
                                        )
                                    );
                                }

                                if (tool === 'glob') {
                                    return (
                                        renderGlobOutput(popup.content, isMobile) || (
                                            <pre className="typography-markdown bg-muted/30 p-2 rounded-xl border border-border/20 font-mono whitespace-pre-wrap">
                                                {popup.content}
                                            </pre>
                                        )
                                    );
                                }

                                if (tool === 'task' || tool === 'reasoning') {
                                    return (
                                        <div
                                            className={tool === 'reasoning' ? "text-muted-foreground/70" : ""}
                                            style={{ fontSize: 'var(--text-meta)' }}
                                        >
                                            <ReactMarkdown
                                                remarkPlugins={[remarkGfm]}
                                                components={createAssistantMarkdownComponents({
                                                    syntaxTheme,
                                                    isMobile,
                                                    copiedCode: null,
                                                    onCopyCode: () => {},
                                                    allowAnimation: false,
                                                }) as Record<string, unknown>}
                                            >
                                                {popup.content}
                                            </ReactMarkdown>
                                        </div>
                                    );
                                }

                                if (tool === 'web-search' || tool === 'websearch' || tool === 'search_web') {
                                    return (
                                        renderWebSearchOutput(popup.content, syntaxTheme) || (
                                            <SyntaxHighlighter
                                                style={syntaxTheme}
                                                language="text"
                                                PreTag="div"
                                                wrapLongLines
                                                customStyle={toolDisplayStyles.getPopupContainerStyles()}
                                                codeTagProps={{ style: { background: 'transparent !important' } }}
                                            >
                                                {popup.content}
                                            </SyntaxHighlighter>
                                        )
                                    );
                                }

                                if (tool === 'read') {
                                    const lines = popup.content.split('\n');

                                    // Extract offset and limit from input metadata
                                    const inputMeta = popup.metadata?.input;
                                    const inputObj = typeof inputMeta === 'object' && inputMeta !== null ? (inputMeta as Record<string, unknown>) : {};
                                    const offset = typeof inputObj.offset === 'number' ? inputObj.offset : 0;
                                    const limit = typeof inputObj.limit === 'number' ? inputObj.limit : undefined;

                                    // Detect informational messages (lines that start with parentheses)
                                    const isInfoMessage = (line: string) => line.trim().startsWith('(');

                                    return (
                                        <div>
                                            {lines.map((line: string, idx: number) => {
                                                // RiCheckLine if this is an informational message
                                                const isInfo = isInfoMessage(line);

                                                // Calculate actual line number: offset represents lines skipped, so first line is offset + 1
                                                const lineNumber = offset + idx + 1;

                                                // Only show line number if it's actual code (not info message) and within limit
                                                const shouldShowLineNumber = !isInfo && (limit === undefined || idx < limit);

                                                return (
                                                    <div key={idx} className={`typography-markdown font-mono flex ${isInfo ? 'text-muted-foreground/70 italic' : ''}`}>
                                                        <span className="text-muted-foreground/60 w-10 flex-shrink-0 text-right pr-4 self-start select-none">
                                                            {shouldShowLineNumber ? lineNumber : ''}
                                                        </span>
                                                        <div className="flex-1 min-w-0">
                                                            {isInfo ? (
                                                                <div className="whitespace-pre-wrap break-words">{line}</div>
                                                            ) : (
                                                                <SyntaxHighlighter
                                                                    style={syntaxTheme}
                                                                    language={popup.language || 'text'}
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
                                            })}
                                        </div>
                                    );
                                }

                                return (
                                    <SyntaxHighlighter
                                        style={syntaxTheme}
                                        language={popup.language || 'text'}
                                        PreTag="div"
                                        wrapLongLines
                                        customStyle={toolDisplayStyles.getPopupContainerStyles()}
                                        codeTagProps={{ style: { background: 'transparent !important' } }}
                                    >
                                        {popup.content}
                                    </SyntaxHighlighter>
                                );
                            })()}
                        </div>
                    ) : (
                        <div className="p-8 text-muted-foreground typography-ui-header">
                            <div className="mb-2">RiCommandLine completed successfully</div>
                            <div className="typography-markdown">No output was produced</div>
                        </div>
                    )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default ToolOutputDialog;
