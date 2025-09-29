import React from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Wrench } from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { cn } from '@/lib/utils';
import { toolDisplayStyles } from '@/lib/typography';
import { getToolMetadata, getLanguageFromExtension } from '@/lib/toolHelpers';
import {
    renderTodoOutput,
    renderListOutput,
    renderGrepOutput,
    renderGlobOutput,
    renderWebSearchOutput,
    formatInputForDisplay,
} from './toolRenderers';
import type { ToolPopupContent } from './types';

interface ToolOutputDialogProps {
    popup: ToolPopupContent;
    onOpenChange: (open: boolean) => void;
    syntaxTheme: any;
    isMobile: boolean;
}

const ToolOutputDialog: React.FC<ToolOutputDialogProps> = ({ popup, onOpenChange, syntaxTheme, isMobile }) => {
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
                    <div className="flex items-center gap-2 text-foreground typography-ui-label font-semibold">
                        {popup.metadata?.tool ? getToolMetadata(popup.metadata.tool).icon ?? <Wrench className="h-3.5 w-3.5 text-foreground" /> : (
                            <Wrench className="h-3.5 w-3.5 text-foreground" />
                        )}
                        <span className="truncate">{popup.title}</span>
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

                    {popup.isDiff && popup.diffHunks ? (
                        <div className="typography-meta">
                            {popup.diffHunks.map((hunk, hunkIdx) => (
                                <div key={hunkIdx} className="border-b border-border/20 last:border-b-0">
                                    <div
                                        className={cn('bg-muted/20 px-3 py-2 font-medium text-muted-foreground border-b border-border/10 sticky top-0 z-10', isMobile ? 'typography-micro' : 'typography-meta')}
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

                                if (tool === 'task') {
                                    return (
                                        <div className="prose prose-sm dark:prose-invert max-w-none">
                                            <ReactMarkdown
                                                remarkPlugins={[remarkGfm]}
                                                components={{
                                                    h1: ({ children }: any) => <h1 className="typography-ui-header font-bold mt-4 mb-3" style={{ color: 'var(--foreground)' }}>{children}</h1>,
                                                    h2: ({ children }: any) => <h2 className="typography-markdown font-semibold mt-3 mb-2" style={{ color: 'var(--foreground)' }}>{children}</h2>,
                                                    h3: ({ children }: any) => <h3 className="typography-markdown font-semibold mt-2 mb-1" style={{ color: 'var(--foreground)' }}>{children}</h3>,
                                                    p: ({ children }: any) => <p className="typography-ui-label mb-2 leading-relaxed">{children}</p>,
                                                    ul: ({ children }: any) => <ul className="list-disc pl-4 mb-2 space-y-1 typography-ui-label">{children}</ul>,
                                                    ol: ({ children }: any) => <ol className="list-decimal pl-4 mb-2 space-y-1 typography-ui-label">{children}</ol>,
                                                    li: ({ children }: any) => <li className="leading-relaxed">{children}</li>,
                                                    code: ({ className, children }: any) => {
                                                        const match = /language-(\w+)/.exec(className || '');
                                                        return match ? (
                                                            <SyntaxHighlighter
                                                                style={syntaxTheme}
                                                                language={match[1]}
                                                                PreTag="div"
                                                                customStyle={{
                                                                    fontSize: 'var(--markdown-code-block-font-size, 0.6875rem)',
                                                                    lineHeight: 'var(--markdown-code-block-line-height, 1.35)',
                                                                    marginTop: '0.5rem',
                                                                    marginBottom: '0.5rem',
                                                                }}
                                                            >
                                                                {String(children).replace(/\n$/, '')}
                                                            </SyntaxHighlighter>
                                                        ) : (
                                                            <code className="px-1 py-0.5 rounded typography-ui-label" style={{
                                                                backgroundColor: 'var(--muted)',
                                                                color: 'var(--foreground)',
                                                            }}>
                                                                {children}
                                                            </code>
                                                        );
                                                    },
                                                    blockquote: ({ children }: any) => (
                                                        <blockquote className="border-l-2 pl-3 my-2 typography-ui-label" style={{
                                                            borderColor: 'var(--primary)',
                                                            color: 'var(--muted-foreground)',
                                                        }}>
                                                            {children}
                                                        </blockquote>
                                                    ),
                                                    a: ({ children, href }: any) => (
                                                        <a href={href} className="underline typography-ui-label" style={{ color: 'var(--primary)' }} target="_blank" rel="noopener noreferrer">
                                                            {children}
                                                        </a>
                                                    ),
                                                }}
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
