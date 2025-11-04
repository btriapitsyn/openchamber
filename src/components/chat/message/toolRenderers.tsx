import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { Check } from '@phosphor-icons/react';

import { cn } from '@/lib/utils';
import { typography } from '@/lib/typography';
import { formatToolInput, detectToolOutputLanguage } from '@/lib/toolHelpers';

const cleanOutput = (output: string) => {
    let cleaned = output.replace(/^<file>\s*\n?/, '').replace(/\n?<\/file>\s*$/, '');
    cleaned = cleaned.replace(/^\s*\d{5}\|\s?/gm, '');
    return cleaned.trim();
};

export const hasLspDiagnostics = (output: string): boolean => {
    if (!output) return false;
    return output.includes('<file_diagnostics>') || output.includes('This file has errors') || output.includes('please fix');
};

const stripLspDiagnostics = (output: string): string => {
    if (!output) return '';
    return output.replace(/This file has errors.*?<\/file_diagnostics>/s, '').trim();
};

const formatInputForDisplay = (input: Record<string, unknown>, toolName?: string) => {
    if (!input || typeof input !== 'object') {
        return String(input);
    }
    return formatToolInput(input, toolName || '');
};

export const formatEditOutput = (output: string, toolName: string, metadata?: Record<string, unknown>): string => {
    let cleaned = cleanOutput(output);

    if ((toolName === 'edit' || toolName === 'multiedit') && hasLspDiagnostics(cleaned)) {
        cleaned = stripLspDiagnostics(cleaned);
    }

    if ((toolName === 'edit' || toolName === 'multiedit') && cleaned.trim().length === 0 && metadata?.diff) {
        // metadata.diff is unknown type from Record - safely convert to string
        const diff = metadata.diff;
        return typeof diff === 'string' ? diff : String(diff);
    }

    return cleaned;
};

export const renderListOutput = (output: string) => {
    try {
        const lines = output.trim().split('\n').filter(Boolean);
        if (lines.length === 0) return null;

        const items: Array<{ name: string; depth: number; isFile: boolean }> = [];
        lines.forEach((line) => {
            const match = line.match(/^(\s*)(.+)$/);
            if (match) {
                const [, spaces, name] = match;
                const depth = Math.floor(spaces.length / 2);
                const isFile = !name.endsWith('/');
                items.push({
                    name: name.replace(/\/$/, ''),
                    depth,
                    isFile,
                });
            }
        });

        return (
            <div className="p-3 bg-muted/20 rounded-xl border border-border/30 font-mono space-y-0.5" style={typography.micro}>
                {items.map((item, idx) => (
                    <div key={idx} className="min-w-0" style={{ paddingLeft: `${item.depth * 20}px` }}>
                        {item.isFile ? (
                            <span className="text-foreground/90 block truncate">{item.name}</span>
                        ) : (
                            <span className="font-semibold text-foreground block truncate">{item.name}/</span>
                        )}
                    </div>
                ))}
            </div>
        );
    } catch {
        return null;
    }
};

export const renderGrepOutput = (output: string, isMobile: boolean) => {
    try {
        const lines = output.trim().split('\n').filter(Boolean);
        if (lines.length === 0) return null;

        const fileGroups: Record<string, Array<{ lineNum: string; content: string }>> = {};

        lines.forEach((line) => {
            const match = line.match(/^(.+?):(\d+):(.*)$/) || line.match(/^(.+?):(.*)$/);
            if (match) {
                const [, filepath, lineNumOrContent, content] = match;
                const lineNum = content !== undefined ? lineNumOrContent : '';
                const actualContent = content !== undefined ? content : lineNumOrContent;

                if (!fileGroups[filepath]) {
                    fileGroups[filepath] = [];
                }
                fileGroups[filepath].push({ lineNum, content: actualContent });
            }
        });

        return (
            <div className="space-y-3 p-3 bg-muted/20 rounded-xl border border-border/30">
                {Object.entries(fileGroups).map(([filepath, matches]) => (
                    <div key={filepath} className="space-y-1">
                        <div className="flex items-center gap-2 min-w-0" style={isMobile ? typography.ui.caption : typography.micro}>
                            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: 'var(--primary)' }} />
                            <span className="font-medium text-foreground truncate">{filepath}</span>
                            <span className="text-muted-foreground flex-shrink-0">({matches.length} match{matches.length !== 1 ? 'es' : ''})</span>
                        </div>
                        <div className="pl-4 space-y-0.5">
                            {matches.map((match, idx) => (
                                <div key={idx} className="flex gap-2 typography-meta font-mono">
                                    {match.lineNum && <span className="text-muted-foreground min-w-[3rem] text-right">{match.lineNum}:</span>}
                                    <span className="text-foreground break-all">{match.content}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        );
    } catch {
        return null;
    }
};

export const renderGlobOutput = (output: string, isMobile: boolean) => {
    try {
        const paths = output.trim().split('\n').filter(Boolean);
        if (paths.length === 0) return null;

        const groups: Record<string, string[]> = {};
        paths.forEach((path) => {
            const lastSlash = path.lastIndexOf('/');
            const dir = lastSlash > 0 ? path.substring(0, lastSlash) : '/';
            const filename = lastSlash >= 0 ? path.substring(lastSlash + 1) : path;

            if (!groups[dir]) {
                groups[dir] = [];
            }
            groups[dir].push(filename);
        });

        const sortedDirs = Object.keys(groups).sort();

        return (
            <div className="space-y-2 p-3 bg-muted/20 rounded-xl border border-border/30">
                <div className="typography-meta text-muted-foreground mb-2">
                    Found {paths.length} file{paths.length !== 1 ? 's' : ''}
                </div>
                {sortedDirs.map((dir) => (
                    <div key={dir} className="space-y-1">
                        <div className={cn('font-medium text-muted-foreground', isMobile ? 'typography-micro' : 'typography-meta')}>
                            {dir}/
                        </div>
                        <div className={cn('pl-4 grid gap-1', isMobile ? 'grid-cols-1' : 'grid-cols-2')}>
                            {groups[dir].sort().map((filename) => (
                                <div key={filename} className={cn('flex items-center gap-2 min-w-0', isMobile ? 'typography-micro' : 'typography-meta')}>
                                    <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: 'var(--status-info)', opacity: 0.6 }} />
                                    <span className="text-foreground font-mono truncate">{filename}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        );
    } catch {
        return null;
    }
};

type Todo = {
    id?: string;
    content: string;
    status: 'in_progress' | 'pending' | 'completed' | 'cancelled';
    priority?: 'high' | 'medium' | 'low';
};

export const renderTodoOutput = (output: string) => {
    try {
        const todos = JSON.parse(output) as Todo[];
        if (!Array.isArray(todos)) {
            return null;
        }

        const todosByStatus = {
            in_progress: todos.filter((t) => t.status === 'in_progress'),
            pending: todos.filter((t) => t.status === 'pending'),
            completed: todos.filter((t) => t.status === 'completed'),
            cancelled: todos.filter((t) => t.status === 'cancelled'),
        };

        const getPriorityDot = (priority?: string) => {
            const baseClasses = 'w-2 h-2 rounded-full flex-shrink-0 mt-1';
            switch (priority) {
                case 'high':
                    return <div className={baseClasses} style={{ backgroundColor: 'var(--status-error)' }} />;
                case 'medium':
                    return <div className={baseClasses} style={{ backgroundColor: 'var(--primary)' }} />;
                case 'low':
                    return <div className={baseClasses} style={{ backgroundColor: 'var(--status-info)' }} />;
                default:
                    return <div className={baseClasses} style={{ backgroundColor: 'var(--muted-foreground)', opacity: 0.5 }} />;
            }
        };

        return (
            <div className="space-y-3 p-3 bg-muted/20 rounded-xl border border-border/30">
                <div className="flex gap-4 typography-meta pb-2 border-b border-border/20">
                    <span className="font-medium" style={{ color: 'var(--muted-foreground)' }}>Total: {todos.length}</span>
                    {todosByStatus.in_progress.length > 0 && (
                        <span className="font-medium" style={{ color: 'var(--foreground)' }}>In Progress: {todosByStatus.in_progress.length}</span>
                    )}
                    {todosByStatus.pending.length > 0 && (
                        <span style={{ color: 'var(--muted-foreground)' }}>Pending: {todosByStatus.pending.length}</span>
                    )}
                    {todosByStatus.completed.length > 0 && (
                        <span style={{ color: 'var(--status-success)' }}>Completed: {todosByStatus.completed.length}</span>
                    )}
                    {todosByStatus.cancelled.length > 0 && (
                        <span style={{ color: 'var(--muted-foreground)', opacity: 0.5 }}>Cancelled: {todosByStatus.cancelled.length}</span>
                    )}
                </div>

                {todosByStatus.in_progress.length > 0 && (
                    <div className="space-y-2">
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: 'var(--foreground)' }} />
                            <span className="typography-meta font-semibold text-foreground uppercase tracking-wide">In Progress</span>
                        </div>
                        <div className="space-y-1.5 pl-4">
                            {todosByStatus.in_progress.map((todo, idx) => (
                                <div key={todo.id || idx} className="flex items-start gap-2">
                                    {getPriorityDot(todo.priority)}
                                    <span className="typography-meta text-foreground flex-1 leading-relaxed">{todo.content}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {todosByStatus.pending.length > 0 && (
                    <div className="space-y-2">
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-muted-foreground/50" />
                            <span className="typography-meta font-semibold text-muted-foreground uppercase tracking-wide">Pending</span>
                        </div>
                        <div className="space-y-1.5 pl-4">
                            {todosByStatus.pending.map((todo, idx) => (
                                <div key={todo.id || idx} className="flex items-start gap-2">
                                    {getPriorityDot(todo.priority)}
                                    <span className="typography-meta text-foreground flex-1 leading-relaxed">{todo.content}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {todosByStatus.completed.length > 0 && (
                    <div className="space-y-2">
                        <div className="flex items-center gap-2">
                            <Check className="w-3 h-3" style={{ color: 'var(--status-success)' }} weight="bold" />
                            <span className="typography-meta font-semibold uppercase tracking-wide" style={{ color: 'var(--status-success)' }}>Completed</span>
                        </div>
                        <div className="space-y-1.5 pl-4">
                            {todosByStatus.completed.map((todo, idx) => (
                                <div key={todo.id || idx} className="flex items-start gap-2">
                                    <Check className="w-3 h-3 mt-0.5 flex-shrink-0" style={{ color: 'var(--status-success)', opacity: 0.7 }} weight="bold" />
                                    <span className="typography-meta text-foreground flex-1 leading-relaxed">{todo.content}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {todosByStatus.cancelled.length > 0 && (
                    <div className="space-y-2">
                        <div className="flex items-center gap-2">
                            <span className="w-3 h-3 text-muted-foreground/50">×</span>
                            <span className="typography-meta font-semibold text-muted-foreground/50 uppercase tracking-wide">Cancelled</span>
                        </div>
                        <div className="space-y-1.5 pl-4">
                            {todosByStatus.cancelled.map((todo, idx) => (
                                <div key={todo.id || idx} className="flex items-start gap-2">
                                    <span className="w-3 h-3 text-muted-foreground/50 mt-0.5 flex-shrink-0">×</span>
                                    <span className="typography-meta text-muted-foreground/50 line-through flex-1 leading-relaxed">{todo.content}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        );
    } catch {
        return null;
    }
};

export const renderWebSearchOutput = (output: string, syntaxTheme: { [key: string]: React.CSSProperties }) => {
    try {
        return (
            <div className="typography-meta max-w-none p-3 bg-muted/20 rounded-xl border border-border/20">
                <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                        h1: ({ children }: { children?: React.ReactNode }) => <h1 className="typography-markdown font-bold mt-3 mb-2" style={{ color: 'var(--foreground)' }}>{children}</h1>,
                        h2: ({ children }: { children?: React.ReactNode }) => <h2 className="typography-markdown font-semibold mt-2 mb-1" style={{ color: 'var(--foreground)' }}>{children}</h2>,
                        h3: ({ children }: { children?: React.ReactNode }) => <h3 className="typography-ui-label font-semibold mt-2 mb-1" style={{ color: 'var(--foreground)' }}>{children}</h3>,
                        p: ({ children }: { children?: React.ReactNode }) => <p className="typography-meta mb-2 leading-relaxed" style={{ color: 'var(--foreground)' }}>{children}</p>,
                        ul: ({ children }: { children?: React.ReactNode }) => <ul className="list-disc pl-4 mb-2 space-y-0.5 typography-meta" style={{ color: 'var(--foreground)' }}>{children}</ul>,
                        ol: ({ children }: { children?: React.ReactNode }) => <ol className="list-decimal pl-4 mb-2 space-y-0.5 typography-meta" style={{ color: 'var(--foreground)' }}>{children}</ol>,
                        li: ({ children }: { children?: React.ReactNode }) => <li className="leading-relaxed" style={{ color: 'var(--foreground)' }}>{children}</li>,
                        code: ({ className, children }: { className?: string; children?: React.ReactNode }) => {
                            const match = /language-(\w+)/.exec(className || '');
                            return match ? (
                                <SyntaxHighlighter
                                    style={syntaxTheme}
                                    language={match[1]}
                                    PreTag="div"
                                    customStyle={{
                                        fontSize: 'var(--code-block-font-size, 0.6875rem)',
                                        lineHeight: 'var(--code-block-line-height, 1.35)',
                                        marginTop: '0.5rem',
                                        marginBottom: '0.5rem',
                                    }}
                                >
                                    {String(children).replace(/\n$/, '')}
                                </SyntaxHighlighter>
                            ) : (
                                <code className="px-1 py-0.5 rounded typography-meta" style={{
                                    backgroundColor: 'var(--muted)',
                                    color: 'var(--foreground)',
                                }}>
                                    {children}
                                </code>
                            );
                        },
                        blockquote: ({ children }: { children?: React.ReactNode }) => (
                            <blockquote className="border-l-2 pl-3 my-2 typography-meta" style={{
                                borderColor: 'var(--primary)',
                                color: 'var(--muted-foreground)',
                            }}>
                                {children}
                            </blockquote>
                        ),
                        a: ({ children, href }: { children?: React.ReactNode; href?: string }) => (
                            <a href={href} className="underline typography-meta" style={{ color: 'var(--primary)' }} target="_blank" rel="noopener noreferrer">
                                {children}
                            </a>
                        ),
                    }}
                >
                    {output}
                </ReactMarkdown>
            </div>
        );
    } catch {
        return null;
    }
};

export type DiffLineType = 'context' | 'added' | 'removed';

export interface UnifiedDiffLine {
    type: DiffLineType;
    lineNumber: number | null;
    content: string;
}

export interface UnifiedDiffHunk {
    file: string;
    oldStart: number;
    newStart: number;
    lines: UnifiedDiffLine[];
}

export interface SideBySideDiffLine {
    leftLine: { type: 'context' | 'removed' | 'empty'; lineNumber: number | null; content: string };
    rightLine: { type: 'context' | 'added' | 'empty'; lineNumber: number | null; content: string };
}

export interface SideBySideDiffHunk {
    file: string;
    oldStart: number;
    newStart: number;
    lines: SideBySideDiffLine[];
}

export const parseDiffToUnified = (diffText: string): UnifiedDiffHunk[] => {
    const lines = diffText.split('\n');
    let currentFile = '';
    const hunks: UnifiedDiffHunk[] = [];

    let i = 0;
    while (i < lines.length) {
        const line = lines[i];

        if (line.startsWith('Index:') || line.startsWith('===') || line.startsWith('---') || line.startsWith('+++')) {
            if (line.startsWith('Index:')) {
                currentFile = line.split(' ')[1].split('/').pop() || 'file';
            }
            i++;
            continue;
        }

        if (line.startsWith('@@')) {
            const match = line.match(/@@ -(\d+),\d+ \+(\d+),\d+ @@/);
            const oldStart = match ? parseInt(match[1]) : 0;
            const newStart = match ? parseInt(match[2]) : 0;

            const unifiedLines: UnifiedDiffLine[] = [];
            let lineNum = newStart;
            let j = i + 1;

            while (j < lines.length && !lines[j].startsWith('@@') && !lines[j].startsWith('Index:')) {
                const contentLine = lines[j];
                if (contentLine.startsWith('+')) {
                    unifiedLines.push({ type: 'added', lineNumber: lineNum, content: contentLine.substring(1) });
                    lineNum++;
                } else if (contentLine.startsWith('-')) {
                    unifiedLines.push({ type: 'removed', lineNumber: null, content: contentLine.substring(1) });
                } else if (contentLine.startsWith(' ')) {
                    unifiedLines.push({ type: 'context', lineNumber: lineNum, content: contentLine.substring(1) });
                    lineNum++;
                }
                j++;
            }

            hunks.push({
                file: currentFile,
                oldStart,
                newStart,
                lines: unifiedLines,
            });

            i = j;
            continue;
        }

        i++;
    }

    return hunks;
};

export const parseDiffToLines = (diffText: string): SideBySideDiffHunk[] => {
    const lines = diffText.split('\n');
    let currentFile = '';
    const hunks: SideBySideDiffHunk[] = [];

    let i = 0;
    while (i < lines.length) {
        const line = lines[i];

        if (line.startsWith('Index:') || line.startsWith('===') || line.startsWith('---') || line.startsWith('+++')) {
            if (line.startsWith('Index:')) {
                currentFile = line.split(' ')[1].split('/').pop() || 'file';
            }
            i++;
            continue;
        }

        if (line.startsWith('@@')) {
            const match = line.match(/@@ -(\d+),\d+ \+(\d+),\d+ @@/);
            const oldStart = match ? parseInt(match[1]) : 0;
            const newStart = match ? parseInt(match[2]) : 0;

            const changes: Array<{
                type: 'context' | 'added' | 'removed';
                content: string;
                oldLine?: number;
                newLine?: number;
            }> = [];

            let oldLineNum = oldStart;
            let newLineNum = newStart;
            let j = i + 1;

            while (j < lines.length && !lines[j].startsWith('@@') && !lines[j].startsWith('Index:')) {
                const contentLine = lines[j];
                if (contentLine.startsWith('+')) {
                    changes.push({ type: 'added', content: contentLine.substring(1), newLine: newLineNum });
                    newLineNum++;
                } else if (contentLine.startsWith('-')) {
                    changes.push({ type: 'removed', content: contentLine.substring(1), oldLine: oldLineNum });
                    oldLineNum++;
                } else if (contentLine.startsWith(' ')) {
                    changes.push({
                        type: 'context',
                        content: contentLine.substring(1),
                        oldLine: oldLineNum,
                        newLine: newLineNum,
                    });
                    oldLineNum++;
                    newLineNum++;
                }
                j++;
            }

            const alignedLines: Array<{
                leftLine: { type: 'context' | 'removed' | 'empty'; lineNumber: number | null; content: string };
                rightLine: { type: 'context' | 'added' | 'empty'; lineNumber: number | null; content: string };
            }> = [];

            const leftSide: Array<{ type: 'context' | 'removed'; lineNumber: number; content: string }> = [];
            const rightSide: Array<{ type: 'context' | 'added'; lineNumber: number; content: string }> = [];

            changes.forEach((change) => {
                if (change.type === 'context') {
                    leftSide.push({ type: 'context', lineNumber: change.oldLine!, content: change.content });
                    rightSide.push({ type: 'context', lineNumber: change.newLine!, content: change.content });
                } else if (change.type === 'removed') {
                    leftSide.push({ type: 'removed', lineNumber: change.oldLine!, content: change.content });
                } else if (change.type === 'added') {
                    rightSide.push({ type: 'added', lineNumber: change.newLine!, content: change.content });
                }
            });

            const alignmentPoints: Array<{ leftIdx: number; rightIdx: number }> = [];

            leftSide.forEach((leftItem, leftIdx) => {
                if (leftItem.type === 'context') {
                    const rightIdx = rightSide.findIndex((rightItem, rIdx) =>
                        rightItem.type === 'context' &&
                        rightItem.content === leftItem.content &&
                        !alignmentPoints.some((ap) => ap.rightIdx === rIdx)
                    );
                    if (rightIdx >= 0) {
                        alignmentPoints.push({ leftIdx, rightIdx });
                    }
                }
            });

            alignmentPoints.sort((a, b) => a.leftIdx - b.leftIdx);

            let leftIdx = 0;
            let rightIdx = 0;
            let alignIdx = 0;

            while (leftIdx < leftSide.length || rightIdx < rightSide.length) {
                const nextAlign = alignIdx < alignmentPoints.length ? alignmentPoints[alignIdx] : null;

                if (nextAlign && leftIdx === nextAlign.leftIdx && rightIdx === nextAlign.rightIdx) {
                    const leftItem = leftSide[leftIdx];
                    const rightItem = rightSide[rightIdx];

                    alignedLines.push({
                        leftLine: {
                            type: 'context',
                            lineNumber: leftItem.lineNumber,
                            content: leftItem.content,
                        },
                        rightLine: {
                            type: 'context',
                            lineNumber: rightItem.lineNumber,
                            content: rightItem.content,
                        },
                    });

                    leftIdx++;
                    rightIdx++;
                    alignIdx++;
                } else {
                    const needProcessLeft = leftIdx < leftSide.length && (!nextAlign || leftIdx < nextAlign.leftIdx);
                    const needProcessRight = rightIdx < rightSide.length && (!nextAlign || rightIdx < nextAlign.rightIdx);

                    if (needProcessLeft && needProcessRight) {
                        const leftItem = leftSide[leftIdx];
                        const rightItem = rightSide[rightIdx];

                        alignedLines.push({
                            leftLine: {
                                type: leftItem.type,
                                lineNumber: leftItem.lineNumber,
                                content: leftItem.content,
                            },
                            rightLine: {
                                type: rightItem.type,
                                lineNumber: rightItem.lineNumber,
                                content: rightItem.content,
                            },
                        });

                        leftIdx++;
                        rightIdx++;
                    } else if (needProcessLeft) {
                        const leftItem = leftSide[leftIdx];
                        alignedLines.push({
                            leftLine: {
                                type: leftItem.type,
                                lineNumber: leftItem.lineNumber,
                                content: leftItem.content,
                            },
                            rightLine: {
                                type: 'empty',
                                lineNumber: null,
                                content: '',
                            },
                        });
                        leftIdx++;
                    } else if (needProcessRight) {
                        const rightItem = rightSide[rightIdx];
                        alignedLines.push({
                            leftLine: {
                                type: 'empty',
                                lineNumber: null,
                                content: '',
                            },
                            rightLine: {
                                type: rightItem.type,
                                lineNumber: rightItem.lineNumber,
                                content: rightItem.content,
                            },
                        });
                        rightIdx++;
                    } else {
                        break;
                    }
                }
            }

            hunks.push({
                file: currentFile,
                oldStart,
                newStart,
                lines: alignedLines,
            });

            i = j;
            continue;
        }

        i++;
    }

    return hunks;
};

export const detectLanguageFromOutput = (output: string, toolName: string, input?: Record<string, unknown>) => {
    return detectToolOutputLanguage(toolName, output, input);
};

export { formatInputForDisplay };
