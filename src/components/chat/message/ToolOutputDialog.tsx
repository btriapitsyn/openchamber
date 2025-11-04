import React from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Wrench, TerminalWindow as Terminal, PencilSimple as FileEdit, FilePdf as FileText, Folder as FolderOpen, Globe, MagnifyingGlass, GitBranch, ListChecks as ListTodo, FileMagnifyingGlass, Brain, FileImage as ImageIcon } from '@phosphor-icons/react';
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
        return <Brain className={iconClass} />;
    }
    if (tool === 'image-preview') {
        return <ImageIcon className={iconClass} />;
    }
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
                            <Wrench className="h-3.5 w-3.5 text-foreground flex-shrink-0" />
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
                        {(popup.metadata?.input as any) &&
                            Object.keys(popup.metadata!.input as any).length > 0 &&
                            popup.metadata?.tool !== 'todowrite' &&
                            popup.metadata?.tool !== 'todoread' && (() => {
                                const meta = popup.metadata!;
                                return (
                                <div className="border-b border-border/20 p-4 -mx-3">
                                    <div className="typography-markdown font-medium text-muted-foreground mb-2 px-3">
                                        {meta.tool === 'bash'
                                            ? 'Command:'
                                            : meta.tool === 'task'
                                                ? 'Task Details:'
                                                : 'Input:'}
                                    </div>
                                    {meta.tool === 'bash' && (meta.input as any).command ? (
                                        <div className="bg-muted/30 rounded-xl border border-border/20 mx-3">
                                            <SyntaxHighlighter
                                                style={syntaxTheme}
                                                language="bash"
                                                PreTag="div"
                                                customStyle={toolDisplayStyles.getPopupStyles()}
                                                wrapLongLines
                                            >
                                                {(meta.input as any).command}
                                            </SyntaxHighlighter>
                                        </div>
                                    ) : meta.tool === 'task' && (meta.input as any).prompt ? (
                                        <pre
                                            className="bg-muted/30 p-3 rounded-xl border border-border/20 font-mono whitespace-pre-wrap text-foreground/90 mx-3"
                                            style={toolDisplayStyles.getPopupStyles()}
                                        >
                                            {(meta.input as any).description ? `Task: ${(meta.input as any).description}\n` : ''}
                                            {(meta.input as any).subagent_type ? `Agent Type: ${(meta.input as any).subagent_type}\n` : ''}
                                            {`Instructions:\n${(meta.input as any).prompt}`}
                                        </pre>
                                    ) : meta.tool === 'write' && (meta.input as any).content ? (
                                        <div className="bg-muted/30 rounded-xl border border-border/20 mx-3">
                                            <SyntaxHighlighter
                                                style={syntaxTheme}
                                                language={getLanguageFromExtension((meta.input as any).filePath || (meta.input as any).file_path || '') || 'text'}
                                                PreTag="div"
                                                customStyle={toolDisplayStyles.getPopupStyles()}
                                                wrapLongLines
                                            >
                                                {(meta.input as any).content}
                                            </SyntaxHighlighter>
                                        </div>
                                    ) : (
                                        <pre
                                            className="bg-muted/30 p-3 rounded-xl border border-border/20 font-mono whitespace-pre-wrap text-foreground/90 mx-3"
                                            style={toolDisplayStyles.getPopupStyles()}
                                        >
                                            {formatInputForDisplay(meta.input as any, meta.tool as string)}
                                        </pre>
                                    )}
                                </div>
                            );})()}

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
                                                        <SyntaxHighlighter
                                                            style={syntaxTheme}
                                                            language={getLanguageFromExtension((popup.metadata?.input as any)?.file_path || (popup.metadata?.input as any)?.filePath || (hunk as any).file) || 'text'}
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
                                            {(hunk as any).lines.map((line: any, lineIdx: number) => (
                                                <div key={lineIdx} className="grid grid-cols-2 divide-x divide-border/20">
                                                    <div
                                                        className={cn(
                                                            'typography-markdown font-mono px-3 py-0.5 overflow-hidden',
                                                            (line as Record<string, Record<string, string>>).leftLine.type === 'context' && 'bg-transparent',
                                                            (line as Record<string, Record<string, string>>).leftLine.type === 'empty' && 'bg-transparent'
                                                        )}
                                                        style={{
                                                            lineHeight: '1.1',
                                                            ...((line as Record<string, Record<string, string>>).leftLine.type === 'removed' ? { backgroundColor: 'var(--tools-edit-removed-bg)' } : {}),
                                                        }}
                                                    >
                                                        <div className="flex">
                                                            <span className="text-muted-foreground/60 w-10 flex-shrink-0 text-right pr-3 self-start select-none">
                                                                {(line as Record<string, Record<string, string>>).leftLine.lineNumber || ''}
                                                            </span>
                                                            <div className="flex-1 min-w-0">
                                                                {(line as Record<string, Record<string, string>>).leftLine.content && (
                                                                    <SyntaxHighlighter
                                                                        style={syntaxTheme}
                                                                        language={getLanguageFromExtension((popup.metadata?.input as any)?.file_path || (popup.metadata?.input as any)?.filePath || (hunk as any).file) || 'text'}
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
                                                                        {(line as Record<string, Record<string, string>>).leftLine.content}
                                                                    </SyntaxHighlighter>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div
                                                        className={cn(
                                                            'typography-markdown font-mono px-3 py-0.5 overflow-hidden',
                                                            (line as Record<string, Record<string, string>>).rightLine.type === 'context' && 'bg-transparent',
                                                            (line as Record<string, Record<string, string>>).rightLine.type === 'empty' && 'bg-transparent'
                                                        )}
                                                        style={{
                                                            lineHeight: '1.1',
                                                            ...((line as Record<string, Record<string, string>>).rightLine.type === 'added' ? { backgroundColor: 'var(--tools-edit-added-bg)' } : {}),
                                                        }}
                                                    >
                                                        <div className="flex">
                                                            <span className="text-muted-foreground/60 w-10 flex-shrink-0 text-right pr-3 self-start select-none">
                                                                {(line as Record<string, Record<string, string>>).rightLine.lineNumber || ''}
                                                            </span>
                                                            <div className="flex-1 min-w-0">
                                                                {(line as Record<string, Record<string, string>>).rightLine.content && (
                                                                    <SyntaxHighlighter
                                                                        style={syntaxTheme}
                                                                        language={getLanguageFromExtension((popup.metadata?.input as any)?.file_path || (popup.metadata?.input as any)?.filePath || (hunk as any).file) || 'text'}
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
                                                                        {(line as Record<string, Record<string, string>>).rightLine.content}
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
                                                }) as any}
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
                                    const offset = (popup.metadata?.input as any)?.offset ?? 0;
                                    const limit = (popup.metadata?.input as any)?.limit;

                                    // Detect informational messages (lines that start with parentheses)
                                    const isInfoMessage = (line: string) => line.trim().startsWith('(');

                                    return (
                                        <div>
                                            {lines.map((line: string, idx: number) => {
                                                // Check if this is an informational message
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
                            <div className="mb-2">Command completed successfully</div>
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
