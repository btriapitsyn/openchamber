import React from 'react';
import { RiGitCommitLine, RiLoader4Line, RiRefreshLine } from '@remixicon/react';

import { useSessionStore } from '@/stores/useSessionStore';
import { useDirectoryStore } from '@/stores/useDirectoryStore';
import type { GitStatus } from '@/lib/api/types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { parseDiffToUnified } from '@/components/chat/message/toolRenderers';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { useThemeSystem } from '@/contexts/useThemeSystem';
import { generateSyntaxTheme } from '@/lib/theme/syntaxThemeGenerator';
import { getLanguageFromExtension } from '@/lib/toolHelpers';
import { useRuntimeAPIs } from '@/hooks/useRuntimeAPIs';
import { ScrollableOverlay } from '../ui/ScrollableOverlay';

type FileEntry = GitStatus['files'][number] & {
    insertions: number;
    deletions: number;
};

const getFileBadgeColor = (code: string) => {
    if (code === 'A') return 'var(--status-success)';
    if (code === 'D') return 'var(--status-error)';
    if (code === 'M') return 'var(--status-warning)';
    if (code === 'R') return 'var(--status-info)';
    if (code === '?') return 'var(--muted-foreground)';
    return 'var(--muted-foreground)';
};

const getFileStatusCode = (file: GitStatus['files'][number]) => {
    const working = (file.working_dir || '').trim();
    const index = (file.index || '').trim();
    return working || index || '•';
};

const formatDiffTotals = (insertions?: number, deletions?: number) => {
    const added = insertions ?? 0;
    const removed = deletions ?? 0;
    if (!added && !removed) return null;
    return (
        <span className="typography-meta flex flex-shrink-0 items-center gap-1 text-xs whitespace-nowrap">
            {added ? (
                <span style={{ color: 'var(--status-success)' }}>+{added}</span>
            ) : null}
            {removed ? (
                <span style={{ color: 'var(--status-error)' }}>-{removed}</span>
            ) : null}
        </span>
    );
};

type DiffTabSnapshot = {
    directory?: string;
    isGitRepo: boolean;
    status: GitStatus | null;
    statusError: string | null;
    selectedFile: string | null;
    diffText: string;
    diffError: string | null;
    diffCacheEntries: Array<[string, string]>;
};

let diffTabSnapshot: DiffTabSnapshot | null = null;

export const DiffTab: React.FC = () => {
    const { git } = useRuntimeAPIs();
    const { currentSessionId, sessions, worktreeMetadata: worktreeMap } = useSessionStore();
    const { currentDirectory: fallbackDirectory } = useDirectoryStore();

    const worktreeMetadata = currentSessionId ? worktreeMap.get(currentSessionId) ?? undefined : undefined;

    const currentSession = sessions.find((session) => session.id === currentSessionId);
    const sessionDirectory = (currentSession as Record<string, unknown>)?.directory as string | undefined;
    const effectiveDirectory = worktreeMetadata?.path ?? sessionDirectory ?? fallbackDirectory ?? undefined;

    const initialSnapshot = React.useMemo(() => {
        if (!diffTabSnapshot) return null;
        if (diffTabSnapshot.directory !== effectiveDirectory) return null;
        return diffTabSnapshot;
    }, [effectiveDirectory]);

    const { currentTheme } = useThemeSystem();
    const syntaxTheme = React.useMemo(() => generateSyntaxTheme(currentTheme), [currentTheme]);

    const [isGitRepo, setIsGitRepo] = React.useState<boolean>(initialSnapshot?.isGitRepo ?? false);
    const [status, setStatus] = React.useState<GitStatus | null>(initialSnapshot?.status ?? null);
    const [isLoadingStatus, setIsLoadingStatus] = React.useState(false);
    const [statusError, setStatusError] = React.useState<string | null>(initialSnapshot?.statusError ?? null);

    const [selectedFile, setSelectedFile] = React.useState<string | null>(initialSnapshot?.selectedFile ?? null);
    const selectedFileRef = React.useRef<string | null>(initialSnapshot?.selectedFile ?? null);

    React.useEffect(() => {
        selectedFileRef.current = selectedFile;
    }, [selectedFile]);

    const [isDiffLoading, setIsDiffLoading] = React.useState(false);
    const [diffError, setDiffError] = React.useState<string | null>(initialSnapshot?.diffError ?? null);
    const [diffText, setDiffText] = React.useState<string>(initialSnapshot?.diffText ?? '');

    const diffCacheRef = React.useRef<Map<string, string>>(new Map(initialSnapshot?.diffCacheEntries ?? []));

    React.useEffect(() => {
        const diffCache = diffCacheRef.current;
        return () => {
            if (!effectiveDirectory) {
                diffTabSnapshot = null;
                return;
            }

            diffTabSnapshot = {
                directory: effectiveDirectory,
                isGitRepo,
                status,
                statusError,
                selectedFile: selectedFileRef.current,
                diffText,
                diffError,
                diffCacheEntries: Array.from(diffCache.entries()),
            };
        };
    }, [effectiveDirectory, diffError, diffText, isGitRepo, status, statusError]);

    const changedFiles: FileEntry[] = React.useMemo(() => {
        if (!status?.files) return [];
        const diffStats = status.diffStats ?? {};

        return status.files
            .map((file) => ({
                ...file,
                insertions: diffStats[file.path]?.insertions ?? 0,
                deletions: diffStats[file.path]?.deletions ?? 0,
            }))
            .sort((a, b) => a.path.localeCompare(b.path));
    }, [status]);

    const selectedFileEntry = React.useMemo(() => {
        if (!selectedFile) return null;
        return changedFiles.find((file) => file.path === selectedFile) ?? null;
    }, [changedFiles, selectedFile]);

    const loadGitStatus = React.useCallback(async () => {
        if (!effectiveDirectory) {
            setStatus(null);
            setIsGitRepo(false);
            setSelectedFile(null);
            selectedFileRef.current = null;
            setDiffText('');
            setDiffError(null);
            setIsDiffLoading(false);
            diffCacheRef.current.clear();
            return;
        }

        setIsLoadingStatus(true);
        setStatusError(null);

        try {
            const repoCheck = await git.checkIsGitRepository(effectiveDirectory);
            setIsGitRepo(repoCheck);

            if (!repoCheck) {
                setStatus(null);
                setSelectedFile(null);
                selectedFileRef.current = null;
                setDiffText('');
                setDiffError(null);
                setIsDiffLoading(false);
                diffCacheRef.current.clear();
                return;
            }

            const statusResponse = await git.getGitStatus(effectiveDirectory);
            diffCacheRef.current.clear();
            setStatus(statusResponse);

            const currentSelectedPath = selectedFileRef.current;
            const hasSelected = currentSelectedPath
                ? statusResponse.files?.some((entry) => entry.path === currentSelectedPath)
                : false;

            if (currentSelectedPath && !hasSelected) {
                setSelectedFile(null);
                selectedFileRef.current = null;
                setDiffText('');
                setDiffError(null);
                setIsDiffLoading(false);
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to load git status';
            setStatusError(message);
            toast.error(message);
        } finally {
            setIsLoadingStatus(false);
        }
    }, [effectiveDirectory, git]);

    React.useEffect(() => {
        if (!effectiveDirectory) {
            return;
        }

        if (status) {
            return;
        }

        loadGitStatus();
    }, [effectiveDirectory, loadGitStatus, status]);

    React.useEffect(() => {
        if (effectiveDirectory) {
            return;
        }

        setStatus(null);
        setIsGitRepo(false);
        setSelectedFile(null);
        selectedFileRef.current = null;
        setDiffText('');
        setDiffError(null);
        setIsDiffLoading(false);
        diffCacheRef.current.clear();
        diffTabSnapshot = null;
    }, [effectiveDirectory]);

    React.useEffect(() => {
        if (!selectedFile && changedFiles.length > 0) {
            const nextPath = changedFiles[0].path;
            selectedFileRef.current = nextPath;
            setSelectedFile(nextPath);

            const cached = diffCacheRef.current.get(nextPath);
            if (cached !== undefined) {
                setDiffText(cached);
                setDiffError(null);
                setIsDiffLoading(false);
            } else {
                setDiffText('');
                setDiffError(null);
                setIsDiffLoading(true);
            }
        }
    }, [changedFiles, selectedFile]);

    const loadDiff = React.useCallback(async () => {
        if (!effectiveDirectory || !selectedFileEntry) {
            setDiffText('');
            setDiffError(null);
            setIsDiffLoading(false);
            return;
        }

        const cacheKey = selectedFileEntry.path;
        if (diffCacheRef.current.has(cacheKey)) {
            setDiffText(diffCacheRef.current.get(cacheKey) ?? '');
            setDiffError(null);
            setIsDiffLoading(false);
            return;
        }

        setIsDiffLoading(true);
        setDiffError(null);

        try {
            const response = await git.getGitDiff(effectiveDirectory, {
                path: selectedFileEntry.path,
            });

            const diff = response.diff ?? '';
            diffCacheRef.current.set(cacheKey, diff);
            setDiffText(diff);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to load diff';
            setDiffError(message);
            toast.error(message);
        } finally {
            setIsDiffLoading(false);
        }
    }, [effectiveDirectory, git, selectedFileEntry]);

    React.useEffect(() => {
        loadDiff();
    }, [loadDiff]);

    const activeFilePath = selectedFileEntry?.path ?? '';

    const renderUnifiedDiff = React.useMemo(() => {
        if (!diffText) return null;
        const hunks = parseDiffToUnified(diffText).map((hunk) => {
            const maxDigits = Math.min(
                5,
                Math.max(
                    1,
                    ...hunk.lines
                        .map((line) => {
                            if (typeof line.lineNumber !== 'number') return 0;
                            return line.lineNumber.toString().length;
                        })
                        .filter(Boolean)
                )
            );

            return {
                ...hunk,
                maxLineDigits: maxDigits,
            };
        });

        if (hunks.length === 0) {
            return (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    No changes detected for this file
                </div>
            );
        }

        return (
            <div className="flex h-full min-h-0 flex-1">
                <div className="min-h-0 min-w-0 flex-1 space-y-2.5 pr-1">
                    {hunks.map((hunk, hunkIdx) => {
                        const resolvedPath = hunk.file || activeFilePath;
                        const language = getLanguageFromExtension(resolvedPath) || 'text';
                        const lineNumberWidth = `${hunk.maxLineDigits ?? 3}ch`;

                        return (
                            <div
                                key={`${resolvedPath}-${hunkIdx}`}
                                className="max-h-[550px] min-w-0 overflow-hidden rounded-xl border border-border/20 bg-background/60"
                            >
                                <ScrollableOverlay
                                    outerClassName="max-h-[550px] min-w-0 p-0"
                                    className="w-full min-w-0"
                                    scrollbarClassName="overlay-scrollbar--flush overlay-scrollbar--dense overlay-scrollbar--zero"
                                    disableHorizontal={false}
                                >
                                    <div className="min-w-max px-2 py-0">
                                            {hunk.lines.map((line, idx) => (
                                                <div
                                                    key={idx}
                                                    className={cn(
                                                        'typography-meta flex items-center gap-3 -ml-2 -mr-2 pl-2 pr-6 py-0.5',
                                                        line.type === 'removed' && 'bg-[color:var(--tools-edit-removed-bg)]',
                                                        line.type === 'added' && 'bg-[color:var(--tools-edit-added-bg)]',
                                                        idx === 0 && 'pt-0.5',
                                                        idx === hunk.lines.length - 1 && 'pb-0.5'
                                                    )}
                                                    style={{ lineHeight: '1.08', minWidth: 'max-content' }}
                                                >
                                                    <span
                                                        className="flex h-full items-center justify-end text-muted-foreground/60 tabular-nums flex-shrink-0 font-mono"
                                                        style={{ width: lineNumberWidth }}
                                                    >
                                                        {line.lineNumber ?? ''}
                                                    </span>
                                                    <SyntaxHighlighter
                                                        style={syntaxTheme}
                                                        language={language}
                                                        PreTag="pre"
                                                        customStyle={{
                                                            margin: 0,
                                                            padding: 0,
                                                            fontSize: 'var(--text-code)',
                                                            lineHeight: '1.08',
                                                            background: 'transparent',
                                                            whiteSpace: 'pre',
                                                            overflow: 'visible',
                                                        }}
                                                        codeTagProps={{ style: { background: 'transparent' } }}
                                                    >
                                                        {line.content || ' '}
                                                    </SyntaxHighlighter>
                                                </div>
                                            ))}
                                        </div>
                                </ScrollableOverlay>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    }, [activeFilePath, diffText, syntaxTheme]);

    const renderContent = () => {
        if (!effectiveDirectory) {
            return (
                <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                    Select a session directory to view diffs
                </div>
            );
        }

        if (isLoadingStatus && !status) {
            return (
                <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
                    <RiLoader4Line size={16} className="animate-spin" />
                    Loading repository status…
                </div>
            );
        }

        if (!isGitRepo) {
            return (
                <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                    Not a git repository. Use the Git tab to initialize or change directories.
                </div>
            );
        }

        if (statusError && !status) {
            return (
                <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
                    <p className="text-sm text-destructive">{statusError}</p>
                    <Button size="sm" onClick={loadGitStatus}>
                        Retry
                    </Button>
                </div>
            );
        }

        if (changedFiles.length === 0) {
            return (
                <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                    Working tree clean — no changes to display
                </div>
            );
        }

        if (!selectedFileEntry) {
            return (
                <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                    Select a file to inspect its diff
                </div>
            );
        }

        const selectedStatusCode = getFileStatusCode(selectedFileEntry);
        const selectedStatusChar = selectedStatusCode.charAt(0) || selectedStatusCode;

        return (
            <div className="flex flex-1 min-h-0">
                <ScrollableOverlay outerClassName="flex-1 min-h-0" className="px-3 py-3 overflow-x-hidden">
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="min-w-[220px]">
                            <Select
                                value={selectedFile ?? undefined}
                                onValueChange={(value) => {
                                    selectedFileRef.current = value;
                                    setSelectedFile(value);
                                    setDiffError(null);

                                    const cached = diffCacheRef.current.get(value);
                                    if (cached !== undefined) {
                                        setDiffText(cached);
                                        setIsDiffLoading(false);
                                    } else {
                                        setDiffText('');
                                        setIsDiffLoading(true);
                                    }
                                }}
                            >
                                <SelectTrigger className="h-9 w-auto max-w-full">
                                    <SelectValue placeholder="Select file">
                                        {selectedFileEntry ? (
                                            <div className="flex w-full items-center justify-between gap-3">
                                    <div className="flex min-w-0 items-center gap-2">
                                            <span
                                                className="rounded px-1.5 py-0.5 text-[11px] font-semibold"
                                                style={{ color: getFileBadgeColor(selectedStatusChar) }}
                                            >
                                                {selectedStatusCode}
                                            </span>
                                                <span className="truncate typography-meta text-foreground">
                                                    {selectedFileEntry.path}
                                                </span>
                                                </div>
                                                {formatDiffTotals(
                                                    selectedFileEntry.insertions,
                                                    selectedFileEntry.deletions
                                                )}
                                            </div>
                                        ) : null}
                                    </SelectValue>
                                </SelectTrigger>
                                <SelectContent className="max-h-60 min-w-[320px] w-auto">
                                    {changedFiles.map((file) => {
                                        const statusCode = getFileStatusCode(file);
                                        const statusChar = statusCode.charAt(0) || statusCode;
                                        return (
                                            <SelectItem key={file.path} value={file.path}>
                                                <div className="flex w-full items-center justify-between gap-3">
                                                    <div className="flex min-w-0 items-center gap-2">
                                                        <span
                                                            className="rounded px-1.5 py-0.5 text-[11px] font-semibold"
                                                            style={{ color: getFileBadgeColor(statusChar) }}
                                                        >
                                                            {statusCode}
                                                        </span>
                                                    <span className="truncate typography-meta text-foreground">
                                                        {file.path}
                                                    </span>
                                                    </div>
                                                    {formatDiffTotals(file.insertions, file.deletions)}
                                                </div>
                                            </SelectItem>
                                        );
                                    })}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="flex-1" />
                    </div>

                    <div className="mt-3 flex-1 min-h-0">
                        {isDiffLoading ? (
                            <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
                                <RiLoader4Line size={16} className="animate-spin" />
                                Loading diff…
                            </div>
                        ) : diffError ? (
                            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                                <p className="text-sm text-destructive">{diffError}</p>
                                <Button size="sm" onClick={loadDiff}>
                                    Retry
                                </Button>
                            </div>
                        ) : !diffText ? (
                            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                                No changes detected for this file
                            </div>
                        ) : (
                            renderUnifiedDiff
                        )}
                    </div>
                </ScrollableOverlay>
            </div>
        );
    };

    return (
        <div className="flex h-full flex-col overflow-hidden" style={{ backgroundColor: 'var(--syntax-background)' }}>
            <div className="flex items-center gap-1.5 px-3 py-2" style={{ backgroundColor: 'var(--syntax-background)' }}>
                <div className="flex items-center gap-1 rounded-md px-2 py-1 text-muted-foreground">
                    <RiGitCommitLine size={16} />
                    <span className="typography-ui-label font-semibold text-foreground">
                        {isLoadingStatus && !status
                            ? 'Loading changes…'
                            : `${changedFiles.length} ${changedFiles.length === 1 ? 'file' : 'files'} changed`}
                    </span>
                </div>
                <div className="flex-1" />
                <Button
                    size="sm"
                    variant="default"
                    className="h-7 px-2 py-0"
                    onClick={loadGitStatus}
                    disabled={isLoadingStatus || !effectiveDirectory}
                    title="Refresh"
                >
                    <RiRefreshLine
                        size={16}
                        className={cn('transition-transform', isLoadingStatus && 'animate-spin')}
                    />
                    Refresh
                </Button>
            </div>

            {renderContent()}
        </div>
    );
};
