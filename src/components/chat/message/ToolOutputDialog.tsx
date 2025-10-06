import React from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Wrench, TerminalTag as Terminal, EditPencil as FileEdit, JournalPage as FileText, Page as FileCode, Folder as FolderOpen, Globe, Search, GitBranch, ListSelect as ListTodo, DocMagnifyingGlassIn as FileSearch, Brain } from 'iconoir-react';
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
    syntaxTheme: any;
    isMobile: boolean;
}

const getToolIcon = (toolName: string) => {
    const iconClass = 'h-3.5 w-3.5 flex-shrink-0';
    const tool = toolName.toLowerCase();

    if (tool === 'reasoning') {
        return <Brain className={iconClass} />;
    }
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
    if (tool === 'glob') {
        return <FileSearch className={iconClass} />;
    }
    if (tool === 'fetch' || tool === 'curl' || tool === 'wget' || tool === 'webfetch') {
        return <Globe className={iconClass} />;
    }
    if (tool === 'web-search' || tool === 'websearch' || tool === 'search_web' || tool === 'google' || tool === 'bing' || tool === 'duckduckgo') {
        return <Search className={iconClass} />;
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
                    'overflow-hidden flex flex-col pt-3 pb-4 px-4 gap-1',
                    '[&>button]:top-1.5',
                    isMobile ? '[&>button]:right-1' : '[&>button]:top-2.5 [&>button]:right-4'
                )}
                style={{ maxWidth: '95vw', width: '95vw', maxHeight: '90vh' }}
            >
                <div className="flex-shrink-0 pb-1">
                    <div className="flex items-start gap-2 text-foreground typography-ui-label font-semibold">
                        {popup.metadata?.tool ? getToolIcon(popup.metadata.tool) : (
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

                <div className="flex-1 overflow-y-scroll rounded-lg border border-border/30 bg-muted/10">
                    {popup.metadata?.input && Object.keys(popup.metadata.input).length > 0 &&
                        popup.metadata?.tool !== 'todowrite' &&
                        popup.metadata?.tool !== 'todoread' && (
                            <div className="border-b border-border/20 p-4">
                                <div className="typography-meta font-medium text-muted-foreground mb-2">
                                    {popup.metadata.tool === 'bash'
                                        ? 'Command:'
                                        : popup.metadata.tool === 'task'
                                            ? 'Task Details:'
                                            : 'Input:'}
                                </div>
                                {popup.metadata.tool === 'bash' && popup.metadata.input.command ? (
                                    <div className="bg-muted/30 rounded border border-border/20 overflow-hidden">
                                        <SyntaxHighlighter
                                            style={syntaxTheme}
                                            language="bash"
                                            PreTag="div"
                                            customStyle={toolDisplayStyles.getPopupStyles()}
                                            wrapLongLines
                                        >
                                            {popup.metadata.input.command}
                                        </SyntaxHighlighter>
                                    </div>
                                ) : popup.metadata.tool === 'task' && popup.metadata.input.prompt ? (
                                    <pre className="bg-muted/30 p-3 rounded border border-border/20 font-mono whitespace-pre-wrap text-foreground/90" style={toolDisplayStyles.getPopupStyles()}>
                                        {popup.metadata.input.description ? `Task: ${popup.metadata.input.description}\n` : ''}
                                        {popup.metadata.input.subagent_type ? `Agent Type: ${popup.metadata.input.subagent_type}\n` : ''}
                                        {`Instructions:\n${popup.metadata.input.prompt}`}
                                    </pre>
                                ) : popup.metadata.tool === 'write' && popup.metadata.input.content ? (
                                    <div className="bg-muted/30 rounded border border-border/20 overflow-hidden">
                                        <SyntaxHighlighter
                                            style={syntaxTheme}
                                            language={getLanguageFromExtension(popup.metadata.input.filePath || popup.metadata.input.file_path || '') || 'text'}
                                            PreTag="div"
                                            customStyle={toolDisplayStyles.getPopupStyles()}
                                            wrapLongLines
                                        >
                                            {popup.metadata.input.content}
                                        </SyntaxHighlighter>
                                    </div>
                                ) : (
                                    <pre className="bg-muted/30 p-3 rounded border border-border/20 font-mono whitespace-pre-wrap text-foreground/90" style={toolDisplayStyles.getPopupStyles()}>
                                        {formatInputForDisplay(popup.metadata.input, popup.metadata.tool)}
                                    </pre>
                                )}
                            </div>
                        )}

                    {popup.isDiff ? (
                        diffViewMode === 'unified' ? (
                            <div className="typography-meta">
                                {parseDiffToUnified(popup.content).map((hunk, hunkIdx) => (
                                    <div key={hunkIdx} className="border-b border-border/20 last:border-b-0">
                                        <div
                                            className={cn('bg-muted/20 px-3 py-2 font-medium text-muted-foreground border-b border-border/10 sticky top-0 z-10 break-words', isMobile ? 'typography-micro' : 'typography-meta')}
                                        >
                                            {hunk.file} (line {hunk.oldStart})
                                        </div>
                                        <div>
                                            {hunk.lines.map((line, lineIdx) => (
                                                <div
                                                    key={lineIdx}
                                                    className={cn(
                                                        'typography-meta font-mono px-3 py-0.5 flex',
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
                                                            language={getLanguageFromExtension(popup.metadata?.input?.file_path || popup.metadata?.input?.filePath || hunk.file) || 'text'}
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
                            <div className="typography-meta">
                                {popup.diffHunks.map((hunk, hunkIdx) => (
                                    <div key={hunkIdx} className="border-b border-border/20 last:border-b-0">
                                        <div
                                            className={cn('bg-muted/20 px-3 py-2 font-medium text-muted-foreground border-b border-border/10 sticky top-0 z-10 break-words', isMobile ? 'typography-micro' : 'typography-meta')}
                                        >
                                            {hunk.file} (line {hunk.oldStart})
                                        </div>
                                        <div>
                                            {hunk.lines.map((line: any, lineIdx: number) => (
                                                <div key={lineIdx} className="grid grid-cols-2 divide-x divide-border/20">
                                                    <div
                                                        className={cn(
                                                            'typography-meta font-mono px-3 py-0.5 overflow-hidden',
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
                                                                        language={getLanguageFromExtension(popup.metadata?.input?.file_path || popup.metadata?.input?.filePath || hunk.file) || 'text'}
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
                                                            'typography-meta font-mono px-3 py-0.5 overflow-hidden',
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
                                                                        language={getLanguageFromExtension(popup.metadata?.input?.file_path || popup.metadata?.input?.filePath || hunk.file) || 'text'}
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
                        ) : null
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
                                            <pre className="typography-meta bg-muted/30 p-2 rounded border border-border/20 font-mono whitespace-pre-wrap">
                                                {popup.content}
                                            </pre>
                                        )
                                    );
                                }

                                if (tool === 'grep') {
                                    return (
                                        renderGrepOutput(popup.content, isMobile) || (
                                            <pre className="typography-meta bg-muted/30 p-2 rounded border border-border/20 font-mono whitespace-pre-wrap">
                                                {popup.content}
                                            </pre>
                                        )
                                    );
                                }

                                if (tool === 'glob') {
                                    return (
                                        renderGlobOutput(popup.content, isMobile) || (
                                            <pre className="typography-meta bg-muted/30 p-2 rounded border border-border/20 font-mono whitespace-pre-wrap">
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
                                                    onShowPopup: () => {},
                                                    allowAnimation: false,
                                                })}
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
                        <div className="p-8 text-muted-foreground typography-ui-label">
                            <div className="mb-2">Command completed successfully</div>
                            <div className="typography-meta">No output was produced</div>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default ToolOutputDialog;
