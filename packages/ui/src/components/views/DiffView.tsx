import React from 'react';
import { RiArrowDownSLine, RiArrowRightSLine, RiGitCommitLine, RiLoader4Line, RiTextWrap } from '@remixicon/react';

import { useUIStore } from '@/stores/useUIStore';
import { useEffectiveDirectory } from '@/hooks/useEffectiveDirectory';
import { useGitStore, useGitStatus, useIsGitRepo, useGitFileCount } from '@/stores/useGitStore';
import { cn } from '@/lib/utils';
import type { GitStatus } from '@/lib/api/types';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';
import { getLanguageFromExtension, isImageFile } from '@/lib/toolHelpers';
import { useRuntimeAPIs } from '@/hooks/useRuntimeAPIs';
import { DiffViewToggle } from '@/components/chat/message/DiffViewToggle';
import type { DiffViewMode } from '@/components/chat/message/types';
import { PierreDiffViewer } from './PierreDiffViewer';
import { useDeviceInfo } from '@/lib/device';

// Minimum width for side-by-side diff view (px)
const SIDE_BY_SIDE_MIN_WIDTH = 1100;
const DIFF_REQUEST_TIMEOUT_MS = 15000;

type FileEntry = GitStatus['files'][number] & {
    insertions: number;
    deletions: number;
    isNew: boolean;
};

type DiffData = { original: string; modified: string };

type DiffTabViewMode = 'single' | 'stacked';

type ChangeDescriptor = {
    code: string;
    color: string;
    description: string;
};

const CHANGE_DESCRIPTORS: Record<string, ChangeDescriptor> = {
    '?': { code: '?', color: 'var(--status-info)', description: 'Untracked file' },
    A: { code: 'A', color: 'var(--status-success)', description: 'New file' },
    D: { code: 'D', color: 'var(--status-error)', description: 'Deleted file' },
    R: { code: 'R', color: 'var(--status-info)', description: 'Renamed file' },
    C: { code: 'C', color: 'var(--status-info)', description: 'Copied file' },
    M: { code: 'M', color: 'var(--status-warning)', description: 'Modified file' },
};

const DEFAULT_CHANGE_DESCRIPTOR = CHANGE_DESCRIPTORS.M;

const DIFF_VIEW_MODE_OPTIONS: Array<{
    value: DiffTabViewMode;
    label: string;
    description: string;
}> = [
    {
        value: 'single',
        label: 'Single file',
        description: 'Show one file at a time',
    },
    {
        value: 'stacked',
        label: 'All files',
        description: 'Stack all modified files together',
    },
];

const getChangeSymbol = (file: GitStatus['files'][number]): string => {
    const indexCode = file.index?.trim();
    const workingCode = file.working_dir?.trim();

    if (indexCode && indexCode !== '?') return indexCode.charAt(0);
    if (workingCode) return workingCode.charAt(0);

    return indexCode?.charAt(0) || workingCode?.charAt(0) || 'M';
};

const describeChange = (file: GitStatus['files'][number]): ChangeDescriptor => {
    const symbol = getChangeSymbol(file);
    return CHANGE_DESCRIPTORS[symbol] ?? DEFAULT_CHANGE_DESCRIPTOR;
};

const isNewStatusFile = (file: GitStatus['files'][number]): boolean => {
    const { index, working_dir: workingDir } = file;
    return index === 'A' || workingDir === 'A' || index === '?' || workingDir === '?';
};

const formatDiffTotals = (insertions?: number, deletions?: number) => {
    const added = insertions ?? 0;
    const removed = deletions ?? 0;
    if (!added && !removed) return null;
    return (
        <span className="typography-meta flex flex-shrink-0 items-center gap-1 text-xs whitespace-nowrap">
            {added ? <span style={{ color: 'var(--status-success)' }}>+{added}</span> : null}
            {removed ? <span style={{ color: 'var(--status-error)' }}>-{removed}</span> : null}
        </span>
    );
};

interface FileSelectorProps {
    changedFiles: FileEntry[];
    selectedFile: string | null;
    selectedFileEntry: FileEntry | null;
    onSelectFile: (path: string) => void;
    isMobile: boolean;
    showModeSelector?: boolean;
    mode?: DiffTabViewMode;
    onModeChange?: (mode: DiffTabViewMode) => void;
}

const FileSelector = React.memo<FileSelectorProps>(({
    changedFiles,
    selectedFile,
    selectedFileEntry,
    onSelectFile,
    isMobile,
    showModeSelector = false,
    mode,
    onModeChange,
}) => {
    const getLabel = React.useCallback((path: string) => {
        if (!isMobile) return path;
        const lastSlash = path.lastIndexOf('/');
        return lastSlash >= 0 ? path.slice(lastSlash + 1) : path;
    }, [isMobile]);

    if (changedFiles.length === 0) return null;

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button className="flex h-8 items-center gap-2 rounded-lg border border-input bg-transparent px-2 typography-ui-label text-foreground outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring">
                    {selectedFileEntry ? (
                        <div className="flex min-w-0 items-center gap-3">
                            <span className="min-w-0 flex-1 truncate typography-meta">
                                {getLabel(selectedFileEntry.path)}
                            </span>
                            {formatDiffTotals(selectedFileEntry.insertions, selectedFileEntry.deletions)}
                        </div>
                    ) : (
                        <span className="text-muted-foreground">Select file</span>
                    )}
                    <RiArrowDownSLine className="size-4 opacity-50" />
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="max-h-[70vh] min-w-[320px] overflow-y-auto">
                {showModeSelector && mode && onModeChange ? (
                    <>
                        <DropdownMenuLabel className="typography-meta text-muted-foreground">
                            View mode
                        </DropdownMenuLabel>
                        <DropdownMenuRadioGroup
                            value={mode}
                            onValueChange={(value) => onModeChange(value as DiffTabViewMode)}
                        >
                            {DIFF_VIEW_MODE_OPTIONS.map((option) => (
                                <DropdownMenuRadioItem
                                    key={option.value}
                                    value={option.value}
                                    className="items-center"
                                >
                                    <span className="typography-meta text-foreground">
                                        {option.label}
                                    </span>
                                </DropdownMenuRadioItem>
                            ))}
                        </DropdownMenuRadioGroup>
                        <DropdownMenuSeparator />
                    </>
                ) : null}
                <DropdownMenuRadioGroup value={selectedFile ?? ''} onValueChange={onSelectFile}>
                    {changedFiles.map((file) => (
                        <DropdownMenuRadioItem key={file.path} value={file.path}>
                            <div className="flex w-full min-w-0 items-center gap-3">
                                <span className="min-w-0 flex-1 truncate typography-meta">
                                    {getLabel(file.path)}
                                </span>
                                <span className="ml-auto">
                                    {formatDiffTotals(file.insertions, file.deletions)}
                                </span>
                            </div>
                        </DropdownMenuRadioItem>
                    ))}
                </DropdownMenuRadioGroup>
            </DropdownMenuContent>
        </DropdownMenu>
    );
});

interface DiffViewModeSelectorProps {
    mode: DiffTabViewMode;
    onModeChange: (mode: DiffTabViewMode) => void;
}

const DiffViewModeSelector = React.memo<DiffViewModeSelectorProps>(({ mode, onModeChange }) => {
    const currentOption =
        DIFF_VIEW_MODE_OPTIONS.find((option) => option.value === mode) ?? DIFF_VIEW_MODE_OPTIONS[0];

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button className="flex h-8 items-center gap-2 rounded-lg border border-input bg-transparent px-2 typography-ui-label text-foreground outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring">
                    <span className="min-w-0 truncate typography-meta">
                        {currentOption.label}
                    </span>
                    <RiArrowDownSLine className="size-4 opacity-50" />
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="min-w-[220px]">
                <DropdownMenuRadioGroup
                    value={mode}
                    onValueChange={(value) => onModeChange(value as DiffTabViewMode)}
                >
                    {DIFF_VIEW_MODE_OPTIONS.map((option) => (
                        <DropdownMenuRadioItem key={option.value} value={option.value}>
                            <div className="flex flex-col gap-0.5">
                                <span className="typography-meta text-foreground">
                                    {option.label}
                                </span>
                                <span className="typography-micro text-muted-foreground">
                                    {option.description}
                                </span>
                            </div>
                        </DropdownMenuRadioItem>
                    ))}
                </DropdownMenuRadioGroup>
            </DropdownMenuContent>
        </DropdownMenu>
    );
});

interface FileListProps {
    changedFiles: FileEntry[];
    selectedFile: string | null;
    onSelectFile: (path: string) => void;
}

const FileList = React.memo<FileListProps>(({
    changedFiles,
    selectedFile,
    onSelectFile,
}) => {
    if (changedFiles.length === 0) return null;

    return (
        <ScrollableOverlay outerClassName="flex-1 min-h-0" className="px-2 py-2">
            <ul className="flex flex-col gap-1">
                {changedFiles.map((file) => {
                    const descriptor = describeChange(file);
                    const isActive = selectedFile === file.path;

                    return (
                        <li key={file.path}>
                            <button
                                type="button"
                                onClick={() => onSelectFile(file.path)}
                                className={cn(
                                    'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors',
                                    isActive
                                        ? 'bg-accent/70 text-foreground'
                                        : 'text-muted-foreground hover:bg-accent/40 hover:text-foreground'
                                )}
                            >
                                <span
                                    className="typography-micro font-semibold w-4 text-center uppercase"
                                    style={{ color: descriptor.color }}
                                    title={descriptor.description}
                                    aria-label={descriptor.description}
                                >
                                    {descriptor.code}
                                </span>
                                <span
                                    className="min-w-0 flex-1 truncate typography-meta"
                                    style={{ direction: 'rtl', textAlign: 'left' }}
                                    title={file.path}
                                >
                                    {file.path}
                                </span>
                                {formatDiffTotals(file.insertions, file.deletions)}
                            </button>
                        </li>
                    );
                })}
            </ul>
        </ScrollableOverlay>
    );
});

// Image diff viewer for binary image files
interface ImageDiffViewerProps {
    filePath: string;
    diff: DiffData;
    isVisible: boolean;
    renderSideBySide: boolean;
}

const ImageDiffViewer = React.memo<ImageDiffViewerProps>(({
    filePath,
    diff,
    isVisible,
    renderSideBySide,
}) => {
    const hasOriginal = diff.original.length > 0;
    const hasModified = diff.modified.length > 0;

    if (!isVisible) {
        return <div className="absolute inset-0 hidden" />;
    }

    // Render side-by-side or stacked based on preference
    const containerClass = renderSideBySide
        ? 'flex flex-row gap-6 items-start justify-center h-full'
        : 'flex flex-col gap-4 items-center';

    const imageContainerClass = renderSideBySide
        ? 'flex flex-col items-center gap-2 flex-1 min-w-0 h-full'
        : 'flex flex-col items-center gap-2';

    return (
        <div className="absolute inset-0 overflow-auto p-4" style={{ contain: 'size layout' }}>
            <div className={containerClass}>
                {hasOriginal && (
                    <div className={imageContainerClass}>
                        <span className="typography-meta text-muted-foreground font-medium">Original</span>
                        <img
                            src={diff.original}
                            alt={`Original: ${filePath}`}
                            className={renderSideBySide ? "max-w-full max-h-[calc(100%-2rem)] object-contain" : "max-w-full object-contain"}
                            style={{ imageRendering: 'auto' }}
                        />
                    </div>
                )}
                {hasModified && (
                    <div className={imageContainerClass}>
                        <span className="typography-meta text-muted-foreground font-medium">
                            {hasOriginal ? 'Modified' : 'New'}
                        </span>
                        <img
                            src={diff.modified}
                            alt={`Modified: ${filePath}`}
                            className={renderSideBySide ? "max-w-full max-h-[calc(100%-2rem)] object-contain" : "max-w-full object-contain"}
                            style={{ imageRendering: 'auto' }}
                        />
                    </div>
                )}
            </div>
        </div>
    );
});

interface InlineImageDiffViewerProps {
    filePath: string;
    diff: DiffData;
    renderSideBySide: boolean;
}

const InlineImageDiffViewer = React.memo<InlineImageDiffViewerProps>(({
    filePath,
    diff,
    renderSideBySide,
}) => {
    const hasOriginal = diff.original.length > 0;
    const hasModified = diff.modified.length > 0;

    const containerClass = renderSideBySide
        ? 'flex flex-row gap-6 items-start justify-center'
        : 'flex flex-col gap-4 items-center';

    const imageContainerClass = renderSideBySide
        ? 'flex flex-col items-center gap-2 flex-1 min-w-0'
        : 'flex flex-col items-center gap-2';

    return (
        <div className="w-full overflow-auto p-4" style={{ contain: 'layout' }}>
            <div className={containerClass}>
                {hasOriginal && (
                    <div className={imageContainerClass}>
                        <span className="typography-meta text-muted-foreground font-medium">Original</span>
                        <img
                            src={diff.original}
                            alt={`Original: ${filePath}`}
                            className={renderSideBySide ? "max-w-full max-h-[70vh] object-contain" : "max-w-full object-contain"}
                            style={{ imageRendering: 'auto' }}
                        />
                    </div>
                )}
                {hasModified && (
                    <div className={imageContainerClass}>
                        <span className="typography-meta text-muted-foreground font-medium">
                            {hasOriginal ? 'Modified' : 'New'}
                        </span>
                        <img
                            src={diff.modified}
                            alt={`Modified: ${filePath}`}
                            className={renderSideBySide ? "max-w-full max-h-[70vh] object-contain" : "max-w-full object-contain"}
                            style={{ imageRendering: 'auto' }}
                        />
                    </div>
                )}
            </div>
        </div>
    );
});

interface InlineDiffViewerProps {
    filePath: string;
    diff: DiffData;
    renderSideBySide: boolean;
    wrapLines: boolean;
}

const InlineDiffViewer = React.memo<InlineDiffViewerProps>(({
    filePath,
    diff,
    renderSideBySide,
    wrapLines,
}) => {
    const language = React.useMemo(
        () => getLanguageFromExtension(filePath) || 'text',
        [filePath]
    );

    if (isImageFile(filePath)) {
        return (
            <InlineImageDiffViewer
                filePath={filePath}
                diff={diff}
                renderSideBySide={renderSideBySide}
            />
        );
    }

    return (
        <div className="w-full" style={{ contain: 'layout' }}>
            <PierreDiffViewer
                original={diff.original}
                modified={diff.modified}
                language={language}
                fileName={filePath}
                renderSideBySide={renderSideBySide}
                wrapLines={wrapLines}
                layout="inline"
            />
        </div>
    );
});

// Single diff viewer instance - stays mounted
interface SingleDiffViewerProps {
    filePath: string;
    diff: DiffData;
    isVisible: boolean;
    renderSideBySide: boolean;
    wrapLines: boolean;
}

const SingleDiffViewer = React.memo<SingleDiffViewerProps>(({
    filePath,
    diff,
    isVisible,
    renderSideBySide,
    wrapLines,
}) => {
    const language = React.useMemo(
        () => getLanguageFromExtension(filePath) || 'text',
        [filePath]
    );

    // Check if this is an image file
    if (isImageFile(filePath)) {
        return (
            <ImageDiffViewer
                filePath={filePath}
                diff={diff}
                isVisible={isVisible}
                renderSideBySide={renderSideBySide}
            />
        );
    }

    // Use display:none for hidden diffs to exclude from layout calculations during resize
    // This is faster for resize than visibility:hidden which keeps elements in layout flow
    if (!isVisible) {
        return (
            <div className="absolute inset-0 hidden">
                <PierreDiffViewer
                    original={diff.original}
                    modified={diff.modified}
                    language={language}
                    fileName={filePath}
                    renderSideBySide={renderSideBySide}
                    wrapLines={wrapLines}
                />
            </div>
        );
    }

    return (
        <div className="absolute inset-0" style={{ contain: 'size layout' }}>
            <PierreDiffViewer
                original={diff.original}
                modified={diff.modified}
                language={language}
                fileName={filePath}
                renderSideBySide={renderSideBySide}
                wrapLines={wrapLines}
            />
        </div>
    );
});

interface DiffViewerEntryProps {
    directory: string;
    filePath: string;
    isVisible: boolean;
    renderSideBySide: boolean;
    wrapLines: boolean;
}

const DiffViewerEntry = React.memo<DiffViewerEntryProps>(({
    directory,
    filePath,
    isVisible,
    renderSideBySide,
    wrapLines,
}) => {
    const cachedDiff = useGitStore(
        React.useCallback((state) => {
            return state.directories.get(directory)?.diffCache.get(filePath) ?? null;
        }, [directory, filePath])
    );

    const diffData = React.useMemo(() => {
        if (!cachedDiff) return null;
        return { original: cachedDiff.original, modified: cachedDiff.modified };
    }, [cachedDiff]);

    if (!diffData) return null;

    return (
        <SingleDiffViewer
            filePath={filePath}
            diff={diffData}
            isVisible={isVisible}
            renderSideBySide={renderSideBySide}
            wrapLines={wrapLines}
        />
    );
});

interface MultiFileDiffEntryProps {
    directory: string;
    file: FileEntry;
    layout: 'inline' | 'side-by-side';
    wrapLines: boolean;
    scrollRootRef: React.RefObject<HTMLElement | null>;
    isSelected: boolean;
    onSelect: (path: string) => void;
    registerSectionRef: (path: string, node: HTMLDivElement | null) => void;
}

const MultiFileDiffEntry = React.memo<MultiFileDiffEntryProps>(({
    directory,
    file,
    layout,
    wrapLines,
    scrollRootRef,
    isSelected,
    onSelect,
    registerSectionRef,
}) => {
    const { git } = useRuntimeAPIs();
    const cachedDiff = useGitStore(
        React.useCallback((state) => {
            return state.directories.get(directory)?.diffCache.get(file.path) ?? null;
        }, [directory, file.path])
    );
    const setDiff = useGitStore((state) => state.setDiff);
    const setDiffFileLayout = useUIStore((state) => state.setDiffFileLayout);

    const [isExpanded, setIsExpanded] = React.useState(true);
    const [hasBeenVisible, setHasBeenVisible] = React.useState(false);
    const [diffRetryNonce, setDiffRetryNonce] = React.useState(0);
    const [diffLoadError, setDiffLoadError] = React.useState<string | null>(null);
    const [isLoading, setIsLoading] = React.useState(false);
    const lastDiffRequestRef = React.useRef<string | null>(null);
    const sectionRef = React.useRef<HTMLDivElement | null>(null);

    const descriptor = React.useMemo(() => describeChange(file), [file]);
    const renderSideBySide = layout === 'side-by-side';

    const diffData = React.useMemo(() => {
        if (!cachedDiff) return null;
        return { original: cachedDiff.original, modified: cachedDiff.modified };
    }, [cachedDiff]);

    const setSectionRef = React.useCallback((node: HTMLDivElement | null) => {
        sectionRef.current = node;
        registerSectionRef(file.path, node);
    }, [file.path, registerSectionRef]);

    const handleOpenChange = React.useCallback((open: boolean) => {
        setIsExpanded(open);
        if (open) {
            setHasBeenVisible(true);
        }
    }, []);

    const handleSelect = React.useCallback(() => {
        onSelect(file.path);
    }, [file.path, onSelect]);

    React.useEffect(() => {
        if (!isExpanded || hasBeenVisible) return;
        const target = sectionRef.current;
        if (!target) return;

        if (!scrollRootRef.current || typeof IntersectionObserver === 'undefined') {
            setHasBeenVisible(true);
            return;
        }

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries.some((entry) => entry.isIntersecting)) {
                    setHasBeenVisible(true);
                    observer.disconnect();
                }
            },
            { root: scrollRootRef.current, rootMargin: '200px 0px', threshold: 0.1 }
        );

        observer.observe(target);
        return () => observer.disconnect();
    }, [hasBeenVisible, isExpanded, scrollRootRef]);

    React.useEffect(() => {
        if (!isExpanded || !hasBeenVisible) return;
        if (!directory || diffData) {
            lastDiffRequestRef.current = null;
            setIsLoading(false);
            return;
        }

        const requestKey = `${directory}::${file.path}::${diffRetryNonce}`;
        if (lastDiffRequestRef.current === requestKey) {
            return;
        }
        lastDiffRequestRef.current = requestKey;
        setDiffLoadError(null);
        setIsLoading(true);

        let cancelled = false;
        void (async () => {
            try {
                const fetchPromise = git.getGitFileDiff(directory, { path: file.path });
                const timeoutMs = DIFF_REQUEST_TIMEOUT_MS;
                const timeoutPromise = new Promise<never>((_, reject) => {
                    setTimeout(() => reject(new Error(`Timed out after ${timeoutMs}ms`)), timeoutMs);
                });

                const response = await Promise.race([fetchPromise, timeoutPromise]);
                if (cancelled) return;

                setDiff(directory, file.path, {
                    original: response.original ?? '',
                    modified: response.modified ?? '',
                });
                setIsLoading(false);
            } catch (error) {
                if (cancelled) return;
                const message = error instanceof Error ? error.message : String(error);
                setDiffLoadError(message);
                setIsLoading(false);
            }
        })();

        return () => {
            cancelled = true;
            if (lastDiffRequestRef.current === requestKey) {
                lastDiffRequestRef.current = null;
            }
        };
    }, [directory, diffData, diffRetryNonce, file.path, git, hasBeenVisible, isExpanded, setDiff]);

    return (
        <div ref={setSectionRef} className="scroll-mt-4">
            <Collapsible
                open={isExpanded}
                onOpenChange={handleOpenChange}
                className="group/collapsible"
            >
                <div className="sticky top-0 z-10 bg-background">
                    <CollapsibleTrigger
                        onClick={handleSelect}
                        className={cn(
                            'relative flex w-full items-center gap-2 px-3 py-1.5 transition-colors rounded-t-xl border border-border/60 overflow-hidden',
                            'bg-background hover:bg-background',
                            isExpanded ? 'rounded-b-none' : 'rounded-b-xl',
                            isSelected
                                ? 'text-primary'
                                : 'text-muted-foreground hover:text-foreground'
                        )}
                    >
                        <div className={cn(
                            'absolute inset-0 pointer-events-none transition-colors',
                            isSelected ? 'bg-primary/10' : 'group-hover:bg-accent/40'
                        )} />
                        <div className="relative flex min-w-0 flex-1 items-center gap-2">
                            <span className="flex size-5 items-center justify-center opacity-70 group-hover:opacity-100 transition-opacity">
                                {isExpanded ? (
                                    <RiArrowDownSLine className="size-4" />
                                ) : (
                                    <RiArrowRightSLine className="size-4" />
                                )}
                            </span>
                            <span
                                className="typography-micro font-semibold w-4 text-center uppercase"
                                style={{ color: descriptor.color }}
                                title={descriptor.description}
                                aria-label={descriptor.description}
                            >
                                {descriptor.code}
                            </span>
                            <span
                                className="min-w-0 flex-1 truncate typography-ui-label"
                                style={{ direction: 'rtl', textAlign: 'left' }}
                                title={file.path}
                            >
                                {file.path}
                            </span>
                        </div>
                        <div className="relative flex items-center gap-2">
                            {formatDiffTotals(file.insertions, file.deletions)}
                            <DiffViewToggle
                                mode={renderSideBySide ? 'side-by-side' : 'unified'}
                                onModeChange={(mode: DiffViewMode) => {
                                    const nextLayout: 'inline' | 'side-by-side' =
                                        mode === 'side-by-side' ? 'side-by-side' : 'inline';
                                    setDiffFileLayout(file.path, nextLayout);
                                }}
                                className="opacity-70"
                            />
                        </div>
                    </CollapsibleTrigger>
                </div>
                <CollapsibleContent>
                    <div className="relative border border-t-0 border-border/60 bg-background rounded-b-xl overflow-hidden">
                        {diffLoadError ? (
                            <div className="flex flex-col items-center gap-2 px-4 py-8 text-sm text-muted-foreground">
                                <div className="typography-ui-label font-semibold text-foreground">
                                    Failed to load diff
                                </div>
                                <div className="typography-meta text-muted-foreground max-w-[32rem] text-center">
                                    {diffLoadError}
                                </div>
                                <button
                                    type="button"
                                    className="typography-ui-label text-primary hover:underline"
                                    onClick={() => setDiffRetryNonce((nonce) => nonce + 1)}
                                >
                                    Retry
                                </button>
                            </div>
                        ) : null}
                        {isLoading && !diffData && !diffLoadError ? (
                            <div className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-muted-foreground">
                                <RiLoader4Line size={16} className="animate-spin" />
                                Loading diff…
                            </div>
                        ) : null}
                        {diffData ? (
                            <InlineDiffViewer
                                filePath={file.path}
                                diff={diffData}
                                renderSideBySide={renderSideBySide}
                                wrapLines={wrapLines}
                            />
                        ) : null}
                    </div>
                </CollapsibleContent>
            </Collapsible>
        </div>
    );
});

export const DiffView: React.FC = () => {
    const { git } = useRuntimeAPIs();
    const effectiveDirectory = useEffectiveDirectory();
    const { screenWidth, isMobile } = useDeviceInfo();

    const isGitRepo = useIsGitRepo(effectiveDirectory ?? null);
    const status = useGitStatus(effectiveDirectory ?? null);
    const isLoadingStatus = useGitStore((state) => state.isLoadingStatus);
    const { setActiveDirectory, fetchStatus, setDiff } = useGitStore();
	 
    const [selectedFile, setSelectedFile] = React.useState<string | null>(null);
    const [diffRetryNonce, setDiffRetryNonce] = React.useState(0);
    const [diffLoadError, setDiffLoadError] = React.useState<string | null>(null);
    const lastDiffRequestRef = React.useRef<string | null>(null);

    const pendingDiffFile = useUIStore((state) => state.pendingDiffFile);
    const setPendingDiffFile = useUIStore((state) => state.setPendingDiffFile);
    const diffLayoutPreference = useUIStore((state) => state.diffLayoutPreference);
    const diffFileLayout = useUIStore((state) => state.diffFileLayout);
    const setDiffFileLayout = useUIStore((state) => state.setDiffFileLayout);
    const diffWrapLinesStore = useUIStore((state) => state.diffWrapLines);
    const setDiffWrapLines = useUIStore((state) => state.setDiffWrapLines);
    const diffViewMode = useUIStore((state) => state.diffViewMode);
    const setDiffViewMode = useUIStore((state) => state.setDiffViewMode);
    // Default to wrap on mobile
    const diffWrapLines = isMobile || diffWrapLinesStore;

    const isStackedView = diffViewMode === 'stacked';
    const isMobileLayout = isMobile || screenWidth <= 768;
    const showFileSidebar = !isMobileLayout && screenWidth >= 1024;
    const diffScrollRef = React.useRef<HTMLElement | null>(null);
    const fileSectionRefs = React.useRef(new Map<string, HTMLDivElement | null>());
    const pendingScrollTargetRef = React.useRef<string | null>(null);

    const changedFiles: FileEntry[] = React.useMemo(() => {
        if (!status?.files) return [];
        const diffStats = status.diffStats ?? {};

        return status.files
            .map((file) => ({
                ...file,
                insertions: diffStats[file.path]?.insertions ?? 0,
                deletions: diffStats[file.path]?.deletions ?? 0,
                isNew: isNewStatusFile(file),
            }))
            .sort((a, b) => a.path.localeCompare(b.path));
    }, [status]);

    const selectedFileEntry = React.useMemo(() => {
        if (!selectedFile) return null;
        return changedFiles.find((file) => file.path === selectedFile) ?? null;
    }, [changedFiles, selectedFile]);

    const getLayoutForFile = React.useCallback((file: FileEntry): 'inline' | 'side-by-side' => {
        const override = diffFileLayout[file.path];
        if (override) return override;

        if (diffLayoutPreference === 'inline') {
            return 'inline';
        }

        if (diffLayoutPreference === 'side-by-side') {
            return 'side-by-side';
        }

        const isNarrow = screenWidth < SIDE_BY_SIDE_MIN_WIDTH;
        if (file.isNew || isNarrow) {
            return 'inline';
        }

        return 'side-by-side';
    }, [diffFileLayout, diffLayoutPreference, screenWidth]);

    const currentLayoutForSelectedFile = React.useMemo<'inline' | 'side-by-side' | null>(() => {
        if (!selectedFileEntry) return null;
        return getLayoutForFile(selectedFileEntry);
    }, [getLayoutForFile, selectedFileEntry]);

    // Fetch git status on mount
    React.useEffect(() => {
        if (effectiveDirectory) {
            setActiveDirectory(effectiveDirectory);
            const dirState = useGitStore.getState().directories.get(effectiveDirectory);
            if (!dirState?.status) {
                fetchStatus(effectiveDirectory, git);
            }
        }
    }, [effectiveDirectory, setActiveDirectory, fetchStatus, git]);

    // Handle pending diff file from external navigation
    React.useEffect(() => {
        if (pendingDiffFile) {
            setSelectedFile(pendingDiffFile);
            setPendingDiffFile(null);
            if (isStackedView) {
                pendingScrollTargetRef.current = pendingDiffFile;
            }
        }
    }, [isStackedView, pendingDiffFile, setPendingDiffFile]);

    // Auto-select first file (skip if we have a pending file to consume)
    React.useEffect(() => {
        if (!selectedFile && !pendingDiffFile && changedFiles.length > 0) {
            setSelectedFile(changedFiles[0].path);
        }
    }, [changedFiles, selectedFile, pendingDiffFile]);

    React.useEffect(() => {
        if (!isStackedView) {
            pendingScrollTargetRef.current = null;
            return;
        }

        const target = pendingScrollTargetRef.current;
        if (!target) return;

        const node = fileSectionRefs.current.get(target);
        if (!node) return;

        node.scrollIntoView({ behavior: 'smooth', block: 'start' });
        pendingScrollTargetRef.current = null;
    }, [changedFiles, isStackedView]);

    // Clear selection if file no longer exists
    React.useEffect(() => {
        if (selectedFile && changedFiles.length > 0) {
            const stillExists = changedFiles.some((f) => f.path === selectedFile);
            if (!stillExists) {
                setSelectedFile(changedFiles[0]?.path ?? null);
            }
        }
    }, [changedFiles, selectedFile]);

    const registerSectionRef = React.useCallback((path: string, node: HTMLDivElement | null) => {
        const map = fileSectionRefs.current;
        if (node) {
            map.set(path, node);
        } else {
            map.delete(path);
        }
    }, []);

    const scrollToFile = React.useCallback((path: string, behavior: ScrollBehavior = 'smooth') => {
        const node = fileSectionRefs.current.get(path);
        if (!node) return false;
        node.scrollIntoView({ behavior, block: 'start' });
        return true;
    }, []);

    const handleSelectFile = React.useCallback((value: string) => {
        setSelectedFile(value);
    }, []);

    const handleSelectFileAndScroll = React.useCallback((value: string) => {
        setSelectedFile(value);
        if (isStackedView && !scrollToFile(value)) {
            pendingScrollTargetRef.current = value;
        }
    }, [isStackedView, scrollToFile]);

    const handleDiffViewModeChange = React.useCallback((mode: DiffTabViewMode) => {
        setDiffViewMode(mode);
        if (mode === 'stacked' && selectedFile && !scrollToFile(selectedFile, 'auto')) {
            pendingScrollTargetRef.current = selectedFile;
        }
    }, [scrollToFile, selectedFile, setDiffViewMode]);

    const handleHeaderLayoutChange = React.useCallback((mode: DiffViewMode) => {
        const nextLayout: 'inline' | 'side-by-side' =
            mode === 'side-by-side' ? 'side-by-side' : 'inline';

        if (isStackedView) {
            changedFiles.forEach((file) => {
                setDiffFileLayout(file.path, nextLayout);
            });
            return;
        }

        if (!selectedFileEntry) return;
        setDiffFileLayout(selectedFileEntry.path, nextLayout);
    }, [changedFiles, isStackedView, selectedFileEntry, setDiffFileLayout]);

    const renderSideBySide = (currentLayoutForSelectedFile ?? 'side-by-side') === 'side-by-side';
    const showFileSelector = !isStackedView || !showFileSidebar;

    const selectedCachedDiff = useGitStore(React.useCallback((state) => {
        if (!effectiveDirectory || !selectedFile) return null;
        return state.directories.get(effectiveDirectory)?.diffCache.get(selectedFile) ?? null;
    }, [effectiveDirectory, selectedFile]));

    const hasCurrentDiff = !!selectedCachedDiff;
    const isCurrentFileLoading = !isStackedView && !!selectedFile && !hasCurrentDiff;

    React.useEffect(() => {
        if (isStackedView) {
            return;
        }

        setDiffLoadError(null);

        if (!effectiveDirectory || !selectedFile) {
            lastDiffRequestRef.current = null;
            return;
        }

        if (selectedCachedDiff) {
            lastDiffRequestRef.current = null;
            return;
        }

        const requestKey = `${effectiveDirectory}::${selectedFile}::${diffRetryNonce}`;
        if (lastDiffRequestRef.current === requestKey) {
            return;
        }
        lastDiffRequestRef.current = requestKey;

        let cancelled = false;
        void (async () => {
            try {
                const fetchPromise = git.getGitFileDiff(effectiveDirectory, { path: selectedFile });
                const timeoutMs = DIFF_REQUEST_TIMEOUT_MS;
                const timeoutPromise = new Promise<never>((_, reject) => {
                    setTimeout(() => reject(new Error(`Timed out after ${timeoutMs}ms`)), timeoutMs);
                });

                const response = await Promise.race([fetchPromise, timeoutPromise]);
                if (cancelled) return;

                setDiff(effectiveDirectory, selectedFile, {
                    original: response.original ?? '',
                    modified: response.modified ?? '',
                });
            } catch (error) {
                if (cancelled) return;
                const message = error instanceof Error ? error.message : String(error);
                setDiffLoadError(message);
            }
        })();

        return () => {
            cancelled = true;
            if (lastDiffRequestRef.current === requestKey) {
                // Allow a retry if this request was cancelled due to directory/path churn.
                lastDiffRequestRef.current = null;
            }
        };
    }, [effectiveDirectory, isStackedView, selectedFile, selectedCachedDiff, git, setDiff, diffRetryNonce]);

    // Render all diff viewers - they stay mounted
    const renderAllDiffViewers = () => {
        if (!effectiveDirectory || changedFiles.length === 0) return null;

        return changedFiles.map((file) => (
            <DiffViewerEntry
                key={file.path}
                directory={effectiveDirectory}
                filePath={file.path}
                isVisible={file.path === selectedFile}
                renderSideBySide={renderSideBySide}
                wrapLines={diffWrapLines}
            />
        ));
    };

    const renderStackedDiffView = () => {
        if (!effectiveDirectory) return null;

        return (
            <div className="flex flex-1 min-h-0 h-full gap-3 px-3 pb-3 pt-2">
                {showFileSidebar && (
                    <section className="hidden lg:flex w-72 flex-col rounded-xl border border-border/60 bg-background/70 overflow-hidden">
                        <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/40">
                            <span className="typography-ui-header font-semibold text-foreground">Files</span>
                            <span className="typography-meta text-muted-foreground">{changedFiles.length}</span>
                        </div>
                        <FileList
                            changedFiles={changedFiles}
                            selectedFile={selectedFile}
                            onSelectFile={handleSelectFileAndScroll}
                        />
                    </section>
                )}
                <ScrollableOverlay
                    ref={diffScrollRef}
                    outerClassName="flex-1 min-h-0 h-full"
                    className="pr-2"
                    disableHorizontal
                >
                    <div className="flex flex-col gap-3">
                        {changedFiles.map((file) => (
                            <MultiFileDiffEntry
                                key={file.path}
                                directory={effectiveDirectory}
                                file={file}
                                layout={getLayoutForFile(file)}
                                wrapLines={diffWrapLines}
                                scrollRootRef={diffScrollRef}
                                isSelected={file.path === selectedFile}
                                onSelect={handleSelectFile}
                                registerSectionRef={registerSectionRef}
                            />
                        ))}
                    </div>
                </ScrollableOverlay>
            </div>
        );
    };

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

        if (isGitRepo === false) {
            return (
                <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                    Not a git repository. Use the Git tab to initialize or change directories.
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

        if (isStackedView) {
            return renderStackedDiffView();
        }

        return (
            <div className="flex flex-1 min-h-0 overflow-hidden px-3 py-3 relative">
                {renderAllDiffViewers()}
                {isCurrentFileLoading && !hasCurrentDiff && (
                    <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                        {diffLoadError ? (
                            <div className="flex flex-col items-center gap-2">
                                <div className="typography-ui-label font-semibold text-foreground">
                                    Failed to load diff
                                </div>
                                <div className="typography-meta text-muted-foreground max-w-[32rem] text-center">
                                    {diffLoadError}
                                </div>
                                <button
                                    type="button"
                                    className="typography-ui-label text-primary hover:underline"
                                    onClick={() => {
                                        setDiffLoadError(null);
                                        setDiffRetryNonce((n) => n + 1);
                                    }}
                                >
                                    Retry
                                </button>
                            </div>
                        ) : (
                            <>
                                <RiLoader4Line size={16} className="animate-spin" />
                                Loading diff…
                            </>
                        )}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="flex h-full flex-col overflow-hidden bg-background">
            <div className="flex items-center gap-3 px-3 py-2 bg-background">
                {!isMobile && (
                    <div className="flex items-center gap-1 rounded-md px-2 py-1 text-muted-foreground shrink-0">
                        <RiGitCommitLine size={16} />
                        <span className="typography-ui-label font-semibold text-foreground">
                            {isLoadingStatus && !status
                                ? 'Loading changes…'
                                : `${changedFiles.length} ${changedFiles.length === 1 ? 'file' : 'files'} changed`}
                        </span>
                    </div>
                )}
                {!isMobileLayout && (
                    <DiffViewModeSelector mode={diffViewMode} onModeChange={handleDiffViewModeChange} />
                )}
                {showFileSelector && (
                    <FileSelector
                        changedFiles={changedFiles}
                        selectedFile={selectedFile}
                        selectedFileEntry={selectedFileEntry}
                        onSelectFile={handleSelectFileAndScroll}
                        isMobile={isMobileLayout}
                        showModeSelector={isMobileLayout}
                        mode={diffViewMode}
                        onModeChange={handleDiffViewModeChange}
                    />
                )}
                <div className="flex-1" />
                {selectedFileEntry && (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDiffWrapLines(!diffWrapLinesStore)}
                        className={cn(
                            'h-5 w-5 p-0 transition-opacity',
                            diffWrapLines ? 'text-foreground opacity-100' : 'text-muted-foreground opacity-60 hover:opacity-100'
                        )}
                        title={diffWrapLines ? 'Disable line wrap' : 'Enable line wrap'}
                    >
                        <RiTextWrap className="size-4" />
                    </Button>
                )}
                {selectedFileEntry && currentLayoutForSelectedFile && (
                    <DiffViewToggle
                        mode={currentLayoutForSelectedFile === 'side-by-side' ? 'side-by-side' : 'unified'}
                        onModeChange={handleHeaderLayoutChange}
                    />
                )}
            </div>

            {renderContent()}
        </div>
    );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useDiffFileCount = (): number => {
    const { git } = useRuntimeAPIs();
    const effectiveDirectory = useEffectiveDirectory();

    const { setActiveDirectory, fetchStatus } = useGitStore();
    const fileCount = useGitFileCount(effectiveDirectory ?? null);

    React.useEffect(() => {
        if (effectiveDirectory) {
            setActiveDirectory(effectiveDirectory);

            const dirState = useGitStore.getState().directories.get(effectiveDirectory);
            if (!dirState?.status) {
                fetchStatus(effectiveDirectory, git);
            }
        }
    }, [effectiveDirectory, setActiveDirectory, fetchStatus, git]);

    return fileCount;
};
