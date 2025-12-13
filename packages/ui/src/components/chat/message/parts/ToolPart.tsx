
import React from 'react';
import { RuntimeAPIContext } from '@/contexts/runtimeAPIContext';
import { RiArrowDownSLine, RiArrowRightSLine, RiFileEditLine, RiFileSearchLine, RiFileTextLine, RiFolder6Line, RiGitBranchLine, RiGlobalLine, RiListCheck3, RiMenuSearchLine, RiPencilLine, RiTerminalBoxLine, RiToolsLine } from '@remixicon/react';
import { Streamdown } from 'streamdown';
import { cn } from '@/lib/utils';
import { getToolMetadata, getLanguageFromExtension } from '@/lib/toolHelpers';
import type { ToolPart as ToolPartType, ToolState as ToolStateUnion } from '@opencode-ai/sdk';
import { toolDisplayStyles } from '@/lib/typography';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { useDirectoryStore } from '@/stores/useDirectoryStore';
import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';
import type { ContentChangeReason } from '@/hooks/useChatScrollManager';

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

type ToolStateWithMetadata = ToolStateUnion & { metadata?: Record<string, unknown>; input?: Record<string, unknown>; output?: string; error?: string; time?: { start: number; end?: number } };

interface ToolPartProps {
    part: ToolPartType;
    isExpanded: boolean;
    onToggle: (toolId: string) => void;
    syntaxTheme: { [key: string]: React.CSSProperties };
    isMobile: boolean;
    onContentChange?: (reason?: ContentChangeReason) => void;
    hasPrevTool?: boolean;
    hasNextTool?: boolean;
}

// eslint-disable-next-line react-refresh/only-export-components
export const getToolIcon = (toolName: string) => {
    const iconClass = 'h-3.5 w-3.5 flex-shrink-0';
    const tool = toolName.toLowerCase();

    if (tool === 'edit' || tool === 'multiedit' || tool === 'str_replace' || tool === 'str_replace_based_edit_tool') {
        return <RiPencilLine className={iconClass} />;
    }
    if (tool === 'write' || tool === 'create' || tool === 'file_write') {
        return <RiFileEditLine className={iconClass} />;
    }
    if (tool === 'read' || tool === 'view' || tool === 'file_read' || tool === 'cat') {
        return <RiFileTextLine className={iconClass} />;
    }
    if (tool === 'bash' || tool === 'shell' || tool === 'cmd' || tool === 'terminal') {
        return <RiTerminalBoxLine className={iconClass} />;
    }
    if (tool === 'list' || tool === 'ls' || tool === 'dir' || tool === 'list_files') {
        return <RiFolder6Line className={iconClass} />;
    }
    if (tool === 'search' || tool === 'grep' || tool === 'find' || tool === 'ripgrep') {
        return <RiMenuSearchLine className={iconClass} />;
    }
    if (tool === 'glob') {
        return <RiFileSearchLine className={iconClass} />;
    }
    if (tool === 'fetch' || tool === 'curl' || tool === 'wget' || tool === 'webfetch') {
        return <RiGlobalLine className={iconClass} />;
    }
    if (
        tool === 'web-search' ||
        tool === 'websearch' ||
        tool === 'search_web' ||
        tool === 'codesearch' ||
        tool === 'google' ||
        tool === 'bing' ||
        tool === 'duckduckgo' ||
        tool === 'perplexity'
    ) {
        return <RiGlobalLine className={iconClass} />;
    }
    if (tool === 'todowrite' || tool === 'todoread') {
        return <RiListCheck3 className={iconClass} />;
    }
    if (tool.startsWith('git')) {
        return <RiGitBranchLine className={iconClass} />;
    }
    return <RiToolsLine className={iconClass} />;
};

const formatDuration = (start: number, end?: number) => {
    const duration = end ? end - start : Date.now() - start;
    const seconds = duration / 1000;

    const displaySeconds = seconds < 0.05 && end !== undefined ? 0.1 : seconds;
    return `${displaySeconds.toFixed(1)}s`;
};

const parseDiffStats = (metadata?: Record<string, unknown>): { added: number; removed: number } | null => {
    if (!metadata?.diff || typeof metadata.diff !== 'string') return null;

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

    if (isMobile) {
        return absolutePath.split('/').pop() || absolutePath;
    }

    if (absolutePath.startsWith(currentDirectory)) {
        const relativePath = absolutePath.substring(currentDirectory.length);

        return relativePath.startsWith('/') ? relativePath.substring(1) : relativePath;
    }

    return absolutePath;
};

const getToolDescription = (part: ToolPartType, state: ToolStateUnion, isMobile: boolean, currentDirectory: string): string => {
    const stateWithData = state as ToolStateWithMetadata;
    const metadata = stateWithData.metadata;
    const input = stateWithData.input;

    if ((part.tool === 'edit' || part.tool === 'multiedit') && input) {
        const filePath = input?.filePath || input?.file_path || input?.path || metadata?.filePath || metadata?.file_path || metadata?.path;
        if (typeof filePath === 'string') {
            return getRelativePath(filePath, currentDirectory, isMobile);
        }
    }

    if ((part.tool === 'read' || part.tool === 'write') && input) {
        const filePath = input?.filePath || input?.file_path || input?.path;
        if (typeof filePath === 'string') {
            return getRelativePath(filePath, currentDirectory, isMobile);
        }
    }

    if (part.tool === 'bash' && input?.command && typeof input.command === 'string') {
        const firstLine = input.command.split('\n')[0];
        return isMobile ? firstLine.substring(0, 50) : firstLine.substring(0, 100);
    }

    if (part.tool === 'task' && input?.description && typeof input.description === 'string') {
        return isMobile ? input.description.substring(0, 40) : input.description.substring(0, 80);
    }

    const desc = input?.description || metadata?.description || ('title' in state && state.title) || '';
    return typeof desc === 'string' ? desc : '';
};

interface ToolScrollableSectionProps {
    children: React.ReactNode;
    maxHeightClass?: string;
    className?: string;
    outerClassName?: string;
    disableHorizontal?: boolean;
}

const ToolScrollableSection: React.FC<ToolScrollableSectionProps> = ({
    children,
    maxHeightClass = 'max-h-[60vh]',
    className,
    outerClassName,
    disableHorizontal = false,
}) => (
    <ScrollableOverlay
        outerClassName={cn('w-full min-w-0 flex-none overflow-hidden', maxHeightClass, outerClassName)}
        className={cn('tool-output-surface p-2 rounded-xl w-full min-w-0 border border-border/20 bg-transparent', className)}
        disableHorizontal={disableHorizontal}
    >
        <div className="w-full min-w-0">
            {children}
        </div>
    </ScrollableOverlay>
);

interface DiffPreviewProps {
    diff: string;
    syntaxTheme: { [key: string]: React.CSSProperties };
    input?: ToolStateWithMetadata['input'];
}

const DiffPreview: React.FC<DiffPreviewProps> = ({ diff, syntaxTheme, input }) => (
    <div className="typography-code px-1 pb-1 pt-0 space-y-0">
        {parseDiffToUnified(diff).map((hunk, hunkIdx) => (
            <div key={hunkIdx} className="-mx-1 px-1 border-b border-border/20 last:border-b-0">
                <div className="bg-muted/20 px-2 py-1 typography-meta font-medium text-muted-foreground border-b border-border/10 break-words -mx-1">
                    {`${hunk.file} (line ${hunk.oldStart})`}
                </div>

                <div>
                    {hunk.lines.map((line, lineIdx) => (
                        <div
                            key={lineIdx}
                            className={cn(
                                'typography-code font-mono px-2 py-0.5 flex -mx-2',
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
                                    language={getLanguageFromExtension(typeof input?.file_path === 'string' ? input.file_path : typeof input?.filePath === 'string' ? input.filePath : hunk.file) || 'text'}
                                    PreTag="div"
                                    wrapLines
                                    wrapLongLines
                                customStyle={{
                                    margin: 0,
                                    padding: 0,
                                    fontSize: 'inherit',
                                    background: 'transparent',
                                    backgroundColor: 'transparent',
                                    borderRadius: 0,
                                    overflow: 'visible',
                                    whiteSpace: 'pre-wrap',
                                    wordBreak: 'break-all',
                                    overflowWrap: 'anywhere',
                                }}
                                codeTagProps={{
                                    style: { background: 'transparent', backgroundColor: 'transparent', fontSize: 'inherit' },
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
);

interface WriteInputPreviewProps {
    content: string;
    syntaxTheme: { [key: string]: React.CSSProperties };
    filePath?: string;
    displayPath: string;
}

const WriteInputPreview: React.FC<WriteInputPreviewProps> = ({ content, syntaxTheme, filePath, displayPath }) => {
    const lines = content.split('\n');
    const language = getLanguageFromExtension(filePath ?? '') || detectLanguageFromOutput(content, 'write', filePath ? { filePath } : undefined);

    const lineCount = Math.max(lines.length, 1);
    const headerLineLabel = lineCount === 1 ? 'line 1' : `lines 1-${lineCount}`;

    return (
        <div className="w-full min-w-0">
            <div className="bg-muted/20 px-2 py-1 typography-meta font-medium text-muted-foreground border border-border/10 rounded-lg mb-1">
                {`${displayPath} (${headerLineLabel})`}
            </div>
            <div className="space-y-0">
                {lines.map((line, lineIdx) => (
                    <div key={lineIdx} className="typography-code font-mono px-2 py-0.5 flex -mx-1">
                        <span className="text-muted-foreground/60 w-8 flex-shrink-0 text-right pr-2 self-start select-none">
                            {lineIdx + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                            <SyntaxHighlighter
                                style={syntaxTheme}
                                language={language || 'text'}
                                PreTag="div"
                                wrapLines
                                wrapLongLines
                                customStyle={{
                                    margin: 0,
                                    padding: 0,
                                    fontSize: 'inherit',
                                    background: 'transparent',
                                    backgroundColor: 'transparent',
                                    borderRadius: 0,
                                    overflow: 'visible',
                                    whiteSpace: 'pre-wrap',
                                    wordBreak: 'break-all',
                                    overflowWrap: 'anywhere',
                                }}
                                codeTagProps={{
                                    style: { background: 'transparent', backgroundColor: 'transparent', fontSize: 'inherit' },
                                }}
                            >
                                {line || ' '}
                            </SyntaxHighlighter>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

interface ToolExpandedContentProps {
    part: ToolPartType;
    state: ToolStateUnion;
    syntaxTheme: { [key: string]: React.CSSProperties };
    isMobile: boolean;
    currentDirectory: string;
    hasPrevTool: boolean;
    hasNextTool: boolean;
}

const ToolExpandedContent: React.FC<ToolExpandedContentProps> = ({
    part,
    state,
    syntaxTheme,
    isMobile,
    currentDirectory,
    hasPrevTool,
    hasNextTool,
}) => {
    const stateWithData = state as ToolStateWithMetadata;
    const metadata = stateWithData.metadata;
    const input = stateWithData.input;
    const rawOutput = stateWithData.output;
    const hasStringOutput = typeof rawOutput === 'string' && rawOutput.length > 0;
    const outputString = typeof rawOutput === 'string' ? rawOutput : '';

    const diffContent = typeof metadata?.diff === 'string' ? (metadata.diff as string) : null;
    const writeFilePath = part.tool === 'write'
        ? typeof input?.filePath === 'string'
            ? input.filePath
            : typeof input?.file_path === 'string'
                ? input.file_path
                : typeof input?.path === 'string'
                    ? input.path
                    : undefined
        : undefined;
    const writeInputContent = part.tool === 'write'
        ? typeof (input as { content?: unknown })?.content === 'string'
            ? (input as { content?: string }).content
            : typeof (input as { text?: unknown })?.text === 'string'
                ? (input as { text?: string }).text
                : null
        : null;
    const shouldShowWriteInputPreview = part.tool === 'write' && !!writeInputContent;
    const writeDisplayPath = shouldShowWriteInputPreview
        ? (writeFilePath ? getRelativePath(writeFilePath, currentDirectory, isMobile) : 'New file')
        : null;

    const inputTextContent = React.useMemo(() => {
        if (!input || typeof input !== 'object' || Object.keys(input).length === 0) {
            return '';
        }

        if ('command' in input && typeof input.command === 'string' && part.tool === 'bash') {
            return formatInputForDisplay(input, part.tool);
        }

        if (typeof (input as { content?: unknown }).content === 'string') {
            return (input as { content?: string }).content ?? '';
        }

        return formatInputForDisplay(input, part.tool);
    }, [input, part.tool]);
    const hasInputText = inputTextContent.trim().length > 0;

    const renderScrollableBlock = (
        content: React.ReactNode,
        options?: { maxHeightClass?: string; className?: string; disableHorizontal?: boolean; outerClassName?: string }
    ) => (
        <ToolScrollableSection
            maxHeightClass={options?.maxHeightClass}
            className={options?.className}
            disableHorizontal={options?.disableHorizontal}
            outerClassName={options?.outerClassName}
        >
            {content}
        </ToolScrollableSection>
    );

    const renderResultContent = () => {
        if (part.tool === 'todowrite' || part.tool === 'todoread') {
            if (state.status === 'completed' && hasStringOutput) {
                const todoContent = renderTodoOutput(outputString, { unstyled: true });
                return renderScrollableBlock(
                    todoContent ?? (
                        <div className="typography-meta text-muted-foreground">Unable to parse todo list</div>
                    )
                );
            }

            if (state.status === 'error' && 'error' in state) {
                return (
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
                );
            }

            return <div className="typography-meta text-muted-foreground">Processing todo list...</div>;
        }

        if (part.tool === 'list' && hasStringOutput) {
            const listOutput = renderListOutput(outputString, { unstyled: true });
            return renderScrollableBlock(
                listOutput ?? (
                    <pre className="typography-code font-mono whitespace-pre-wrap break-words w-full min-w-0">
                        {outputString}
                    </pre>
                )
            );
        }

        if (part.tool === 'grep' && hasStringOutput) {
            const grepOutput = renderGrepOutput(outputString, isMobile, { unstyled: true });
            return renderScrollableBlock(
                grepOutput ?? (
                    <pre className="typography-code font-mono whitespace-pre-wrap break-words w-full min-w-0">
                        {outputString}
                    </pre>
                )
            );
        }

        if (part.tool === 'glob' && hasStringOutput) {
            const globOutput = renderGlobOutput(outputString, isMobile, { unstyled: true });
            return renderScrollableBlock(
                globOutput ?? (
                    <pre className="typography-code font-mono whitespace-pre-wrap break-words w-full min-w-0">
                        {outputString}
                    </pre>
                )
            );
        }

        if (part.tool === 'task' && hasStringOutput) {
            return renderScrollableBlock(
                <div className="w-full min-w-0" style={{ fontSize: 'var(--text-code)' }}>
                    <Streamdown mode="static" className="streamdown-content streamdown-tool">
                        {outputString}
                    </Streamdown>
                </div>
            );
        }

        if ((part.tool === 'web-search' || part.tool === 'websearch' || part.tool === 'search_web') && hasStringOutput) {
            const webSearchContent = renderWebSearchOutput(outputString, syntaxTheme, { unstyled: true });
            return renderScrollableBlock(
                webSearchContent ?? (
                    <pre className="typography-code font-mono whitespace-pre-wrap break-words w-full min-w-0">
                        {outputString}
                    </pre>
                )
            );
        }

        if (part.tool === 'codesearch' && hasStringOutput) {
            return renderScrollableBlock(
                <div className="w-full min-w-0" style={{ fontSize: 'var(--text-code)' }}>
                    <Streamdown mode="static" className="streamdown-content streamdown-tool">
                        {outputString}
                    </Streamdown>
                </div>
            );
        }

        if ((part.tool === 'edit' || part.tool === 'multiedit') && ((!hasStringOutput && diffContent) || (outputString.trim().length === 0 || hasLspDiagnostics(outputString))) && diffContent) {
            return renderScrollableBlock(
                <DiffPreview diff={diffContent} syntaxTheme={syntaxTheme} input={input} />,
                { className: 'p-1' }
            );
        }

        if (hasStringOutput && outputString.trim()) {
            if (part.tool === 'read') {
                const formattedOutput = formatEditOutput(outputString, part.tool, metadata);
                const lines = formattedOutput.split('\n');
                const offset = typeof input?.offset === 'number' ? input.offset : 0;
                const limit = typeof input?.limit === 'number' ? input.limit : undefined;
                const isInfoMessage = (line: string) => line.trim().startsWith('(');

                return renderScrollableBlock(
                    <div className="typography-code w-full min-w-0 space-y-1">
                        {lines.map((line: string, idx: number) => {
                            const isInfo = isInfoMessage(line);
                            const lineNumber = offset + idx + 1;
                            const shouldShowLineNumber = !isInfo && (limit === undefined || idx < limit);

                            return (
                                <div key={idx} className={cn('typography-code font-mono flex w-full min-w-0', isInfo && 'text-muted-foreground/70 italic')}>
                                    <span className="text-muted-foreground/60 w-8 flex-shrink-0 text-right pr-3 self-start select-none">
                                        {shouldShowLineNumber ? lineNumber : ''}
                                    </span>
                                    <div className="flex-1 min-w-0">
                                        {isInfo ? (
                                            <div className="whitespace-pre-wrap break-words">{line}</div>
                                        ) : (
                                            <SyntaxHighlighter
                                                style={syntaxTheme}
                                                language={detectLanguageFromOutput(formattedOutput, part.tool, input as Record<string, unknown>)}
                                                PreTag="div"
                                                wrapLines
                                                wrapLongLines
                                                customStyle={{
                                                    margin: 0,
                                                    padding: 0,
                                                    fontSize: 'inherit',
                                                    background: 'transparent',
                                                    backgroundColor: 'transparent',
                                                    borderRadius: 0,
                                                    overflow: 'visible',
                                                    whiteSpace: 'pre-wrap',
                                                    wordBreak: 'break-all',
                                                    overflowWrap: 'anywhere',
                                                }}
                                                codeTagProps={{
                                                    style: {
                                                        background: 'transparent',
                                                        backgroundColor: 'transparent',
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
                    </div>,
                    { className: 'p-1' }
                );
            }

            return renderScrollableBlock(
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
                            background: 'transparent',
                            backgroundColor: 'transparent',
                        },
                    }}
                    wrapLongLines
                >
                    {formatEditOutput(outputString, part.tool, metadata)}
                </SyntaxHighlighter>,
                { className: 'p-1' }
            );
        }

        return renderScrollableBlock(
            <div className="typography-meta text-muted-foreground/70">No output produced</div>,
            { maxHeightClass: 'max-h-60' }
        );
    };

    return (
        <div
            className={cn(
                'relative pr-2 pb-2 pt-2 space-y-2 pl-[1.4375rem]',
                'before:absolute before:left-[0.4375rem] before:w-px before:bg-border/80 before:content-[""]',
                hasPrevTool ? 'before:top-[-0.45rem]' : 'before:top-[-0.25rem]',
                hasNextTool ? 'before:bottom-[-0.6rem]' : 'before:bottom-0'
            )}
        >
            {(part.tool === 'todowrite' || part.tool === 'todoread') ? (
                renderResultContent()
            ) : (
                <>
                    {shouldShowWriteInputPreview ? (
                        <div className="my-1">
                            {renderScrollableBlock(
                                <WriteInputPreview
                                    content={writeInputContent as string}
                                    syntaxTheme={syntaxTheme}
                                    filePath={writeFilePath}
                                    displayPath={writeDisplayPath ?? 'New file'}
                                />
                            )}
                        </div>
                    ) : hasInputText ? (
                        <div className="my-1">
                            {renderScrollableBlock(
                                <blockquote className="tool-input-text whitespace-pre-wrap break-words typography-meta italic text-muted-foreground/70">
                                    {inputTextContent}
                                </blockquote>,
                                { maxHeightClass: 'max-h-60', className: 'tool-input-surface' }
                            )}
                        </div>
                    ) : null}

                    {part.tool !== 'write' && state.status === 'completed' && 'output' in state && (
                        <div>
                            <div className="typography-meta font-medium text-muted-foreground/80 mb-1">
                                Result:
                            </div>
                            {renderResultContent()}
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
    );
};

const ToolPart: React.FC<ToolPartProps> = ({ part, isExpanded, onToggle, syntaxTheme, isMobile, onContentChange, hasPrevTool = false, hasNextTool = false }) => {
    const state = part.state;
    const currentDirectory = useDirectoryStore((s) => s.currentDirectory);

    const isFinalized = state.status === 'completed' || state.status === 'error';
    const isRunning = state.status === 'running';
    const isError = state.status === 'error';

    const [currentTime, setCurrentTime] = React.useState(Date.now());

    React.useEffect(() => {
        if (isRunning) {
            const timer = setInterval(() => {
                setCurrentTime(Date.now());
            }, 100);
            return () => clearInterval(timer);
        }
    }, [isRunning]);

    const previousExpandedRef = React.useRef<boolean | undefined>(isExpanded);

    React.useEffect(() => {
        if (!isFinalized) {
            return;
        }
        if (previousExpandedRef.current === isExpanded) {
            return;
        }
        previousExpandedRef.current = isExpanded;
        if (typeof isExpanded === 'boolean') {
            onContentChange?.('structural');
        }
    }, [isExpanded, isFinalized, onContentChange]);

    const stateWithData = state as ToolStateWithMetadata;
    const metadata = stateWithData.metadata;
    const input = stateWithData.input;
    const diffStats = (part.tool === 'edit' || part.tool === 'multiedit') ? parseDiffStats(metadata) : null;
    const description = getToolDescription(part, state, isMobile, currentDirectory);
    const displayName = getToolMetadata(part.tool).displayName;

    const runtime = React.useContext(RuntimeAPIContext);

    const handleMainClick = (e: React.MouseEvent) => {
        if (!runtime?.editor) {
            onToggle(part.id);
            return;
        }

        let filePath: unknown;
        if (part.tool === 'edit' || part.tool === 'multiedit') {
            filePath = input?.filePath || input?.file_path || input?.path || metadata?.filePath || metadata?.file_path || metadata?.path;
        } else if (['write', 'create', 'file_write', 'read', 'view', 'file_read', 'cat'].includes(part.tool)) {
            filePath = input?.filePath || input?.file_path || input?.path || metadata?.filePath || metadata?.file_path || metadata?.path;
        }

        if (typeof filePath === 'string') {
            e.stopPropagation();
            let absolutePath = filePath;
            if (!filePath.startsWith('/')) {
                absolutePath = currentDirectory.endsWith('/') ? currentDirectory + filePath : currentDirectory + '/' + filePath;
            }
            runtime.editor.openFile(absolutePath);
        } else {
            onToggle(part.id);
        }
    };

    if (!isFinalized) {
        return null;
    }

    return (
        <div className="my-1">
            {}
            <div
                className={cn(
                    'group/tool flex items-center gap-2 pr-2 pl-px py-1.5 rounded-xl cursor-pointer'
                )}
                onClick={handleMainClick}
            >
                <div className="flex items-center gap-2 flex-shrink-0">
                    {}
                    <div className="relative h-3.5 w-3.5 flex-shrink-0" onClick={(e) => { e.stopPropagation(); onToggle(part.id); }}>
                        {}
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
                        {}
                        <div
                            className={cn(
                                'absolute inset-0 transition-opacity flex items-center justify-center',
                                isExpanded && 'opacity-100',
                                !isExpanded && isMobile && 'opacity-0',
                                !isExpanded && !isMobile && 'opacity-0 group-hover/tool:opacity-100'
                            )}
                        >
                            {isExpanded ? <RiArrowDownSLine className="h-3.5 w-3.5" /> : <RiArrowRightSLine className="h-3.5 w-3.5" />}
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

            {}
            {isExpanded && (
                <ToolExpandedContent
                    part={part}
                    state={state}
                    syntaxTheme={syntaxTheme}
                    isMobile={isMobile}
                    currentDirectory={currentDirectory}
                    hasPrevTool={hasPrevTool}
                    hasNextTool={hasNextTool}
                />
            )}
        </div>
    );
};

export default ToolPart;
