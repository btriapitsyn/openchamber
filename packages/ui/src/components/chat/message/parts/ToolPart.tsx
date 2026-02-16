
import React from 'react';
import { RuntimeAPIContext } from '@/contexts/runtimeAPIContext';
import { RiArrowDownSLine, RiArrowRightSLine, RiBookLine, RiExternalLinkLine, RiFileEditLine, RiFileList2Line, RiFileSearchLine, RiFileTextLine, RiFolder6Line, RiGitBranchLine, RiGlobalLine, RiListCheck3, RiMenuSearchLine, RiPencilLine, RiSurveyLine, RiTaskLine, RiTerminalBoxLine, RiToolsLine } from '@remixicon/react';
import { cn } from '@/lib/utils';
import { SimpleMarkdownRenderer } from '../../MarkdownRenderer';
import { getToolMetadata, getLanguageFromExtension, isImageFile, getImageMimeType } from '@/lib/toolHelpers';
import type { ToolPart as ToolPartType, ToolState as ToolStateUnion } from '@opencode-ai/sdk/v2';
import { toolDisplayStyles } from '@/lib/typography';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { useDirectoryStore } from '@/stores/useDirectoryStore';
import { useSessionStore } from '@/stores/useSessionStore';
import { useUIStore } from '@/stores/useUIStore';
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
    parseReadToolOutput,
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

    if (tool === 'edit' || tool === 'multiedit' || tool === 'apply_patch' || tool === 'str_replace' || tool === 'str_replace_based_edit_tool') {
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
    if (tool === 'skill') {
        return <RiBookLine className={iconClass} />;
    }
    if (tool === 'question') {
        return <RiSurveyLine className={iconClass} />;
    }
    if (tool === 'plan_enter') {
        return <RiFileList2Line className={iconClass} />;
    }
    if (tool === 'plan_exit') {
        return <RiTaskLine className={iconClass} />;
    }
    if (tool.startsWith('git')) {
        return <RiGitBranchLine className={iconClass} />;
    }
    return <RiToolsLine className={iconClass} />;
};

const formatDuration = (start: number, end?: number, now: number = Date.now()) => {
    const duration = end ? end - start : now - start;
    const seconds = duration / 1000;

    const displaySeconds = seconds < 0.05 && end !== undefined ? 0.1 : seconds;
    return `${displaySeconds.toFixed(1)}s`;
};

const LiveDuration: React.FC<{ start: number; end?: number; active: boolean }> = ({ start, end, active }) => {
    const [now, setNow] = React.useState(() => Date.now());

    React.useEffect(() => {
        if (!active) {
            return;
        }
        const timer = window.setInterval(() => {
            setNow(Date.now());
        }, 100);
        return () => window.clearInterval(timer);
    }, [active]);

    return <>{formatDuration(start, end, now)}</>;
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

// Parse question tool output: "User has answered your questions: "Q1"="A1", "Q2"="A2". You can now..."
const parseQuestionOutput = (output: string): Array<{ question: string; answer: string }> | null => {
    const match = output.match(/^User has answered your questions:\s*(.+?)\.\s*You can now/s);
    if (!match) return null;

    const pairs: Array<{ question: string; answer: string }> = [];
    const content = match[1];

    // Match "question"="answer" pairs, handling multiline answers
    const pairRegex = /"([^"]+)"="([^"]*(?:[^"\\]|\\.)*)"/g;
    let pairMatch;
    while ((pairMatch = pairRegex.exec(content)) !== null) {
        pairs.push({
            question: pairMatch[1],
            answer: pairMatch[2],
        });
    }

    return pairs.length > 0 ? pairs : null;
};

const getToolDescription = (part: ToolPartType, state: ToolStateUnion, isMobile: boolean, currentDirectory: string): string => {
    const stateWithData = state as ToolStateWithMetadata;
    const metadata = stateWithData.metadata;
    const input = stateWithData.input;

    if (part.tool === 'apply_patch') {
        const files = Array.isArray(metadata?.files) ? metadata?.files : [];
        const firstFile = files[0] as { relativePath?: string; filePath?: string } | undefined;
        const filePath = firstFile?.relativePath || firstFile?.filePath;
        if (files.length > 1) {
            return `${files.length} files`;
        }
        if (typeof filePath === 'string') {
            return getRelativePath(filePath, currentDirectory, isMobile);
        }
        return 'Patch';
    }

    // Question tool: show "Asked N question(s)"
    if (part.tool === 'question' && input?.questions && Array.isArray(input.questions)) {
        const count = input.questions.length;
        return `Asked ${count} question${count !== 1 ? 's' : ''}`;
    }

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

    if (part.tool === 'skill' && input?.name && typeof input.name === 'string') {
        return input.name;
    }

    if (part.tool === 'plan_enter') {
        return 'Switching to planning';
    }

    if (part.tool === 'plan_exit') {
        return 'Switching to building';
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
        className={cn('tool-output-surface p-2 rounded-xl w-full min-w-0 bg-transparent', className)}
        style={{ borderWidth: '1px', borderColor: 'var(--tools-border)' }}
        disableHorizontal={disableHorizontal}
    >
        <div className="w-full min-w-0">
            {children}
        </div>
    </ScrollableOverlay>
);

type TaskToolSummaryEntry = {
    id?: string;
    tool?: string;
    state?: {
        status?: string;
        title?: string;
    };
};

const getTaskSummaryLabel = (entry: TaskToolSummaryEntry): string => {
    const title = entry.state?.title;
    if (typeof title === 'string' && title.trim().length > 0) {
        return title;
    }
    if (typeof entry.tool === 'string' && entry.tool.trim().length > 0) {
        return entry.tool;
    }
    return 'tool';
};

const stripTaskMetadataFromOutput = (output: string): string => {
    // Strip only a trailing <task_metadata>...</task_metadata> block.
    return output.replace(/\n*<task_metadata>[\s\S]*?<\/task_metadata>\s*$/i, '').trimEnd();
};

const TaskToolSummary: React.FC<{
    entries: TaskToolSummaryEntry[];
    isExpanded: boolean;
    hasPrevTool: boolean;
    hasNextTool: boolean;
    output?: string;
    sessionId?: string;
}> = ({ entries, isExpanded, hasPrevTool, hasNextTool, output, sessionId }) => {
    const setCurrentSession = useSessionStore((state) => state.setCurrentSession);
    const completedEntries = React.useMemo(() => {
        return entries.filter((entry) => entry.state?.status === 'completed');
    }, [entries]);

    const trimmedOutput = typeof output === 'string'
        ? stripTaskMetadataFromOutput(output)
        : '';
    const hasOutput = trimmedOutput.length > 0;
    const [isOutputExpanded, setIsOutputExpanded] = React.useState(false);

    const handleOpenSession = (event: React.MouseEvent) => {
        event.stopPropagation();
        if (sessionId) {
            setCurrentSession(sessionId);
        }
    };

    if (completedEntries.length === 0 && !hasOutput && !sessionId) {
        return null;
    }

    const visibleEntries = isExpanded ? completedEntries : completedEntries.slice(-6);
    const hiddenCount = Math.max(0, completedEntries.length - visibleEntries.length);

    return (
        <div
            className={cn(
                'relative pr-2 pb-2 pt-2 space-y-2 pl-[1.4375rem]',
                'before:absolute before:left-[0.4375rem] before:w-px before:bg-border/80 before:content-[""]',
                hasPrevTool ? 'before:top-[-0.45rem]' : 'before:top-[-0.25rem]',
                hasNextTool ? 'before:bottom-[-0.6rem]' : 'before:bottom-0'
            )}
        >
            {completedEntries.length > 0 ? (
                <ToolScrollableSection maxHeightClass={isExpanded ? 'max-h-[40vh]' : 'max-h-56'} disableHorizontal>
                    <div className="w-full min-w-0 space-y-1">
                        {hiddenCount > 0 ? (
                            <div className="typography-micro text-muted-foreground/70">+{hiddenCount} more…</div>
                        ) : null}

                        {visibleEntries.map((entry, idx) => {
                            const toolName = typeof entry.tool === 'string' && entry.tool.trim().length > 0 ? entry.tool : 'tool';
                            const label = getTaskSummaryLabel(entry);

                            const displayName = getToolMetadata(toolName).displayName;

                            return (
                                <div key={entry.id ?? `${toolName}-${idx}`} className="flex items-center gap-2 min-w-0">
                                    <span className="flex-shrink-0 text-foreground/80">{getToolIcon(toolName)}</span>
                                    <span className="typography-meta text-foreground/80 flex-shrink-0">{displayName}</span>
                                    <span className="typography-meta text-muted-foreground/70 truncate">{label}</span>
                                </div>
                            );
                        })}
                    </div>
                </ToolScrollableSection>
            ) : null}

            {sessionId && (
                <button
                    type="button"
                    className="flex items-center gap-2 typography-meta text-primary hover:text-primary/80 w-full"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={handleOpenSession}
                >
                    <RiExternalLinkLine className="h-3.5 w-3.5 flex-shrink-0" />
                    <span className="typography-meta text-primary font-medium">Open subAgent session</span>
                </button>
            )}

            {hasOutput ? (
                <div className={cn('space-y-1', (completedEntries.length > 0 || sessionId) && 'pt-1')}
                >
                    <button
                        type="button"
                        className="flex items-center gap-2 typography-meta text-foreground/80 hover:text-foreground w-full"
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={(event) => {
                            event.stopPropagation();
                            setIsOutputExpanded((prev) => !prev);
                        }}
                    >
                        {isOutputExpanded ? (
                            <RiArrowDownSLine className="h-3.5 w-3.5 flex-shrink-0" />
                        ) : (
                            <RiArrowRightSLine className="h-3.5 w-3.5 flex-shrink-0" />
                        )}
                        <span className="typography-meta text-foreground/80 font-medium">Output</span>
                    </button>
                    {isOutputExpanded ? (
                        <ToolScrollableSection maxHeightClass="max-h-[50vh]">
                            <div className="w-full min-w-0">
                                <SimpleMarkdownRenderer content={trimmedOutput} variant="tool" />
                            </div>
                        </ToolScrollableSection>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
};

interface DiffPreviewProps {
    diff: string;
    syntaxTheme: { [key: string]: React.CSSProperties };
    input?: ToolStateWithMetadata['input'];
}

const DiffPreview: React.FC<DiffPreviewProps> = React.memo(({ diff, syntaxTheme, input }) => (
    <div className="typography-code px-1 pb-1 pt-0 space-y-0">
        {parseDiffToUnified(diff).map((hunk, hunkIdx) => (
            <div key={hunkIdx} className="-mx-1 px-1 last:border-b-0" style={{ borderBottomWidth: '1px', borderBottomColor: 'var(--tools-border)' }}>
                <div className="bg-muted/20 px-2 py-1 typography-meta font-medium text-muted-foreground break-words -mx-1" style={{ borderBottomWidth: '1px', borderBottomColor: 'var(--tools-border)' }}>
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
                            <span className="w-10 flex-shrink-0 text-right pr-3 select-none border-r mr-3 -my-0.5 py-0.5" style={{ color: 'var(--tools-edit-line-number)', borderColor: 'var(--tools-border)' }}>
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
                                    color: line.type === 'removed' ? 'var(--tools-edit-removed)' : line.type === 'added' ? 'var(--tools-edit-added)' : 'inherit',
                                }}
                                codeTagProps={{
                                    style: { 
                                        background: 'transparent', 
                                        backgroundColor: 'transparent', 
                                        fontSize: 'inherit',
                                        color: line.type === 'removed' ? 'var(--tools-edit-removed)' : line.type === 'added' ? 'var(--tools-edit-added)' : 'inherit',
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
));

DiffPreview.displayName = 'DiffPreview';

interface WriteInputPreviewProps {
    content: string;
    syntaxTheme: { [key: string]: React.CSSProperties };
    filePath?: string;
    displayPath: string;
}

const WriteInputPreview: React.FC<WriteInputPreviewProps> = React.memo(({ content, syntaxTheme, filePath, displayPath }) => {
    const lines = React.useMemo(() => content.split('\n'), [content]);
    const language = React.useMemo(
        () => getLanguageFromExtension(filePath ?? '') || detectLanguageFromOutput(content, 'write', filePath ? { filePath } : undefined),
        [content, filePath]
    );

    const lineCount = Math.max(lines.length, 1);
    const headerLineLabel = lineCount === 1 ? 'line 1' : `lines 1-${lineCount}`;

    return (
        <div className="w-full min-w-0">
            <div className="bg-muted/20 px-2 py-1 typography-meta font-medium text-muted-foreground rounded-lg mb-1" style={{ borderWidth: '1px', borderColor: 'var(--tools-border)' }}>
                {`${displayPath} (${headerLineLabel})`}
            </div>
            <div className="space-y-0">
                {lines.map((line, lineIdx) => (
                    <div key={lineIdx} className="typography-code font-mono px-2 py-0.5 flex -mx-1">
                        <span className="w-10 flex-shrink-0 text-right pr-3 select-none border-r mr-3 -my-0.5 py-0.5" style={{ color: 'var(--tools-edit-line-number)', borderColor: 'var(--tools-border)' }}>
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
});

WriteInputPreview.displayName = 'WriteInputPreview';

interface ImagePreviewProps {
    content: string;
    filePath: string;
    displayPath: string;
}

const ImagePreview: React.FC<ImagePreviewProps> = React.memo(({ content, filePath, displayPath }) => {
    const mimeType = getImageMimeType(filePath);
    const isSvg = filePath.toLowerCase().endsWith('.svg');

    // For SVG, content might be raw XML, otherwise assume base64
    const imageSrc = React.useMemo(() => {
        if (isSvg && !content.startsWith('data:')) {
            // Raw SVG content
            return `data:image/svg+xml;base64,${btoa(content)}`;
        }
        if (content.startsWith('data:')) {
            return content;
        }
        // Assume base64 encoded
        return `data:${mimeType};base64,${content}`;
    }, [content, mimeType, isSvg]);

    return (
        <div className="w-full min-w-0">
            <div className="bg-muted/20 px-2 py-1 typography-meta font-medium text-muted-foreground rounded-lg mb-2" style={{ borderWidth: '1px', borderColor: 'var(--tools-border)' }}>
                {displayPath}
            </div>
            <div className="flex justify-center p-4 bg-muted/10 rounded-lg" style={{ borderWidth: '1px', borderColor: 'var(--tools-border)' }}>
                <img
                    src={imageSrc}
                    alt={displayPath}
                    className="max-w-full max-h-96 object-contain rounded"
                    style={{ imageRendering: 'auto' }}
                />
            </div>
        </div>
    );
});

ImagePreview.displayName = 'ImagePreview';

interface ToolExpandedContentProps {
    part: ToolPartType;
    state: ToolStateUnion;
    syntaxTheme: { [key: string]: React.CSSProperties };
    isMobile: boolean;
    currentDirectory: string;
    hasPrevTool: boolean;
    hasNextTool: boolean;
}

const ToolExpandedContent: React.FC<ToolExpandedContentProps> = React.memo(({
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
    const isWriteImageFile = writeFilePath ? isImageFile(writeFilePath) : false;
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
    const hasInputText = part.tool !== 'apply_patch' && inputTextContent.trim().length > 0;

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
        // Question tool: show parsed Q&A summary
        if (part.tool === 'question') {
            if (state.status === 'completed' && hasStringOutput) {
                const parsedQA = parseQuestionOutput(outputString);
                if (parsedQA && parsedQA.length > 0) {
                    return renderScrollableBlock(
                        <div className="space-y-2">
                            {parsedQA.map((qa, index) => (
                                <div key={index} className="space-y-0.5">
                                    <div className="typography-micro text-muted-foreground">{qa.question}</div>
                                    <div className="typography-meta text-foreground whitespace-pre-wrap">{qa.answer}</div>
                                </div>
                            ))}
                        </div>,
                        { maxHeightClass: 'max-h-[40vh]' }
                    );
                }
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

            return <div className="typography-meta text-muted-foreground">Awaiting response...</div>;
        }

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
                <div className="w-full min-w-0">
                    <SimpleMarkdownRenderer content={outputString} variant="tool" />
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
                <div className="w-full min-w-0">
                    <SimpleMarkdownRenderer content={outputString} variant="tool" />
                </div>
            );
        }

        if (part.tool === 'skill' && hasStringOutput) {
            return renderScrollableBlock(
                <div className="w-full min-w-0">
                    <SimpleMarkdownRenderer content={outputString} variant="tool" />
                </div>
            );
        }

        if ((part.tool === 'edit' || part.tool === 'multiedit' || part.tool === 'apply_patch') && diffContent) {
            return renderScrollableBlock(
                <DiffPreview diff={diffContent} syntaxTheme={syntaxTheme} input={input} />,
                { className: 'p-1' }
            );
        }

        if (hasStringOutput && outputString.trim()) {
            if (part.tool === 'read') {
                const parsedReadOutput = parseReadToolOutput(outputString);
                const offset = typeof input?.offset === 'number' ? input.offset : 0;
                const contentForLanguage = parsedReadOutput.lines.map((line) => line.text).join('\n');
                let fallbackLineCursor = offset;
                const hasExplicitLineNumbers = parsedReadOutput.lines.some((line) => line.lineNumber !== null);

                return renderScrollableBlock(
                    <div className="typography-code w-full min-w-0 space-y-1">
                        {parsedReadOutput.lines.map((line, idx) => {
                            if (line.lineNumber !== null) {
                                fallbackLineCursor = line.lineNumber;
                            }
                            const shouldAssignFallbackLineNumber =
                                parsedReadOutput.type === 'file'
                                && !hasExplicitLineNumbers
                                && line.lineNumber === null
                                && !line.isInfo;
                            const effectiveLineNumber = line.lineNumber ?? (shouldAssignFallbackLineNumber
                                ? (fallbackLineCursor += 1)
                                : null);
                            const shouldShowLineNumber = !line.isInfo && effectiveLineNumber !== null;

                            return (
                                <div key={idx} className={cn('typography-code font-mono flex w-full min-w-0', line.isInfo && 'text-muted-foreground/70 italic')}>
                                    <span className="w-10 flex-shrink-0 text-right pr-3 select-none border-r mr-3 -my-0.5 py-0.5" style={{ color: 'var(--tools-edit-line-number)', borderColor: 'var(--tools-border)' }}>
                                        {shouldShowLineNumber ? effectiveLineNumber : ''}
                                    </span>
                                    <div className="flex-1 min-w-0">
                                        {line.isInfo ? (
                                            <div className="whitespace-pre-wrap break-words">{line.text}</div>
                                        ) : (
                                            <SyntaxHighlighter
                                                style={syntaxTheme}
                                                language={detectLanguageFromOutput(contentForLanguage, part.tool, input as Record<string, unknown>)}
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
                                                {line.text}
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
                'relative pr-2 pb-2 pt-2 space-y-2 pl-[1.4375rem]'
            )}
        >
            <div 
                className="absolute left-[0.4375rem] w-px"
                style={{
                    backgroundColor: 'var(--tools-border)',
                    top: hasPrevTool ? '-0.45rem' : '-0.25rem',
                    bottom: hasNextTool ? '-0.6rem' : '0',
                    width: '1px'
                }}
            ></div>
            {(part.tool === 'todowrite' || part.tool === 'todoread' || part.tool === 'question') ? (
                renderResultContent()
            ) : (
                <>
                    {shouldShowWriteInputPreview && isWriteImageFile ? (
                        <div className="my-1">
                            {renderScrollableBlock(
                                <ImagePreview
                                    content={writeInputContent as string}
                                    filePath={writeFilePath as string}
                                    displayPath={writeDisplayPath ?? 'New file'}
                                />
                            )}
                        </div>
                    ) : shouldShowWriteInputPreview ? (
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
});

ToolExpandedContent.displayName = 'ToolExpandedContent';

const ToolPart: React.FC<ToolPartProps> = ({ part, isExpanded, onToggle, syntaxTheme, isMobile, onContentChange, hasPrevTool = false, hasNextTool = false }) => {
    const state = part.state;
    const currentDirectory = useDirectoryStore((s) => s.currentDirectory);

    const isTaskTool = part.tool.toLowerCase() === 'task';

    const isFinalized = state.status === 'completed' || state.status === 'error';
    const isActive = state.status === 'running' || state.status === 'pending';
    const isError = state.status === 'error';



    const previousExpandedRef = React.useRef<boolean | undefined>(isExpanded);

    React.useEffect(() => {
        if (!isFinalized && !isTaskTool) {
            return;
        }
        if (previousExpandedRef.current === isExpanded) {
            return;
        }
        previousExpandedRef.current = isExpanded;
        if (typeof isExpanded === 'boolean') {
            onContentChange?.('structural');
        }
    }, [isExpanded, isFinalized, isTaskTool, onContentChange]);

    const stateWithData = state as ToolStateWithMetadata;
    const metadata = stateWithData.metadata;
    const input = stateWithData.input;
    const time = stateWithData.time;

    // Pin start/end so a server-side time reset doesn't reset UI duration.
    const pinnedTaskTimeRef = React.useRef<{ start?: number; end?: number }>({});
    const lastPinnedTaskIdRef = React.useRef<string>(part.id);

    if (lastPinnedTaskIdRef.current !== part.id) {
        lastPinnedTaskIdRef.current = part.id;
        pinnedTaskTimeRef.current = {};
    }

    if (isTaskTool) {
        if (typeof time?.start === 'number') {
            const pinnedStart = pinnedTaskTimeRef.current.start;
            if (typeof pinnedStart !== 'number' || time.start < pinnedStart) {
                pinnedTaskTimeRef.current.start = time.start;
            }
        }
        if (typeof time?.end === 'number') {
            pinnedTaskTimeRef.current.end = time.end;
        }
    }

    const effectiveTimeStart = isTaskTool ? (pinnedTaskTimeRef.current.start ?? time?.start) : time?.start;
    const effectiveTimeEnd = isTaskTool ? (pinnedTaskTimeRef.current.end ?? time?.end) : time?.end;

    const taskSessionId = React.useMemo<string | undefined>(() => {
        if (!isTaskTool) {
            return undefined;
        }
        const candidate = metadata as { sessionId?: string } | undefined;
        return typeof candidate?.sessionId === 'string' ? candidate.sessionId : undefined;
    }, [isTaskTool, metadata]);

    const taskSummaryEntries = React.useMemo<TaskToolSummaryEntry[]>(() => {
        if (!isTaskTool) {
            return [];
        }
        const candidate = (metadata as { summary?: unknown } | undefined)?.summary;
        if (!Array.isArray(candidate)) {
            return [];
        }
        return candidate.filter((entry): entry is TaskToolSummaryEntry => typeof entry === 'object' && entry !== null) as TaskToolSummaryEntry[];
    }, [isTaskTool, metadata]);


    const taskSummaryLenRef = React.useRef<number>(taskSummaryEntries.length);
    React.useEffect(() => {
        if (!isTaskTool) {
            return;
        }
        if (taskSummaryLenRef.current === taskSummaryEntries.length) {
            return;
        }
        taskSummaryLenRef.current = taskSummaryEntries.length;
        onContentChange?.('structural');
    }, [isTaskTool, onContentChange, taskSummaryEntries.length]);

    const diffStats = (part.tool === 'edit' || part.tool === 'multiedit' || part.tool === 'apply_patch') ? parseDiffStats(metadata) : null;
    const description = getToolDescription(part, state, isMobile, currentDirectory);
    const displayName = getToolMetadata(part.tool).displayName;
    
    // Get justification text (tool title/description) when setting is enabled
    const showTextJustificationActivity = useUIStore((state) => state.showTextJustificationActivity);
    const justificationText = React.useMemo(() => {
        if (!showTextJustificationActivity) return null;
        if (part.tool === 'apply_patch') return null;
        // Get title or description from state - this is the "yapping" text like "Shows system information"
        const title = (stateWithData as { title?: string }).title;
        if (typeof title === 'string' && title.trim().length > 0) {
            return title;
        }
        const inputDesc = input?.description;
        if (typeof inputDesc === 'string' && inputDesc.trim().length > 0) {
            return inputDesc;
        }
        return null;
    }, [showTextJustificationActivity, part.tool, stateWithData, input]);

    const runtime = React.useContext(RuntimeAPIContext);

    const handleMainClick = (e: React.MouseEvent) => {
        if (isTaskTool || !runtime?.editor) {
            onToggle(part.id);
            return;
        }

        let filePath: unknown;
        if (part.tool === 'edit' || part.tool === 'multiedit') {
            filePath = input?.filePath || input?.file_path || input?.path || metadata?.filePath || metadata?.file_path || metadata?.path;
        } else if (part.tool === 'apply_patch') {
            const files = Array.isArray(metadata?.files) ? metadata?.files : [];
            const firstFile = files[0] as { relativePath?: string; filePath?: string } | undefined;
            filePath = firstFile?.relativePath || firstFile?.filePath;
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

    if (!isFinalized && !isTaskTool) {
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
                            style={!isTaskTool && isError ? { color: 'var(--status-error)' } : { color: 'var(--tools-icon)' }}
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
                        style={!isTaskTool && isError ? { color: 'var(--status-error)' } : { color: 'var(--tools-title)' }}
                    >
                        {displayName}
                    </span>
                </div>

                <div className="flex items-center gap-1 flex-1 min-w-0 typography-meta" style={{ color: 'var(--tools-description)' }}>
                    {justificationText && (
                        <span className={cn("truncate italic", isMobile && "max-w-[120px]")} style={{ color: 'var(--tools-description)', opacity: 0.8 }}>
                            {justificationText}
                        </span>
                    )}
                    {!justificationText && description && (
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
                    {typeof effectiveTimeStart === 'number' && (
                        <span className="text-muted-foreground/80 flex-shrink-0">
                            <LiveDuration
                                start={effectiveTimeStart}
                                end={typeof effectiveTimeEnd === 'number' ? effectiveTimeEnd : undefined}
                                active={Boolean(isTaskTool && isActive && typeof effectiveTimeEnd !== 'number')}
                            />
                        </span>
                    )}
                </div>
            </div>

            {}
            {isTaskTool && (taskSummaryEntries.length > 0 || isActive || isFinalized || taskSessionId) ? (
                <TaskToolSummary
                    entries={taskSummaryEntries}
                    isExpanded={isExpanded}
                    hasPrevTool={hasPrevTool}
                    hasNextTool={hasNextTool}
                    output={typeof stateWithData.output === 'string' ? stateWithData.output : undefined}
                    sessionId={taskSessionId}
                />
            ) : null}

            {!isTaskTool && isExpanded ? (
                <ToolExpandedContent
                    part={part}
                    state={state}
                    syntaxTheme={syntaxTheme}
                    isMobile={isMobile}
                    currentDirectory={currentDirectory}
                    hasPrevTool={hasPrevTool}
                    hasNextTool={hasNextTool}
                />
            ) : null}
        </div>
    );
};

export default ToolPart;
