import React from 'react';
import {
  RiArrowGoBackLine,
  RiArrowGoForwardLine,
  RiCornerUpLeftLine,
  RiHome2Line,
  RiRefreshLine,
  RiFolder6Line,
  RiFileTextLine,
  RiCodeLine,
  RiImageLine,
  RiFile3Line,
} from '@remixicon/react';
import { cn } from '@/lib/utils';
import { opencodeClient } from '@/lib/opencode/client';
import { useDirectoryStore } from '@/stores/useDirectoryStore';
import { useDeviceInfo } from '@/lib/device';
import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Skeleton } from '@/components/ui/skeleton';

interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size?: number;
  modifiedTime?: number;
}

type FilePreviewData = {
  path: string;
  content: string;
};

export const FileBrowserView: React.FC = () => {
  const { isMobile } = useDeviceInfo();
  const {
    currentDirectory,
    directoryHistory,
    historyIndex,
    goBack,
    goForward,
    goToParent,
    goHome,
    setDirectory,
  } = useDirectoryStore();

  const [entries, setEntries] = React.useState<FileEntry[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [previewFile, setPreviewFile] = React.useState<FilePreviewData | null>(null);
  const [previewLoading, setPreviewLoading] = React.useState(false);
  const [isPreviewMode, setIsPreviewMode] = React.useState(false);
  const abortControllerRef = React.useRef<AbortController | null>(null);
  const currentPreviewPathRef = React.useRef<string | null>(null);

  const canGoBack = historyIndex > 0;
  const canGoForward = historyIndex < directoryHistory.length - 1;

  const loadDirectory = React.useCallback(async (dirPath: string) => {
    setLoading(true);
    setError(null);
    try {
      const fsEntries = await opencodeClient.listLocalDirectory(dirPath);
      const mappedEntries: FileEntry[] = fsEntries
        .filter((entry) => !entry.name.startsWith('.'))
        .map((entry) => ({
          name: entry.name,
          path: entry.path,
          isDirectory: entry.isDirectory,
          size: 0,
          modifiedTime: undefined,
        }))
        .sort((a, b) => {
          if (a.isDirectory !== b.isDirectory) {
            return a.isDirectory ? -1 : 1;
          }
          return a.name.localeCompare(b.name);
        });
      setEntries(mappedEntries);
    } catch {
      setError('Failed to load directory contents');
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadDirectory(currentDirectory);
  }, [currentDirectory, loadDirectory]);

  const handleNavigateToDirectory = (dirPath: string) => {
    setDirectory(dirPath);
  };

  React.useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const handleFileClick = async (entry: FileEntry) => {
    if (entry.isDirectory) {
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
      currentPreviewPathRef.current = null;
      handleNavigateToDirectory(entry.path);
      return;
    }

    // Enter preview mode
    setIsPreviewMode(true);

    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();
    currentPreviewPathRef.current = entry.path;

    setPreviewFile(null);
    setPreviewLoading(true);
    try {
      const content = await opencodeClient.readFile(entry.path);
      if (currentPreviewPathRef.current === entry.path) {
        setPreviewFile({
          path: entry.path,
          content,
        });
      }
    } catch {
      if (currentPreviewPathRef.current === entry.path) {
        setPreviewFile({
          path: entry.path,
          content: 'Failed to load file content',
        });
      }
    } finally {
      if (currentPreviewPathRef.current === entry.path) {
        setPreviewLoading(false);
      }
    }
  };

  const handleClosePreview = () => {
    setIsPreviewMode(false);
    setPreviewFile(null);
    currentPreviewPathRef.current = null;
    abortControllerRef.current?.abort();
  };

  const handleRefresh = () => {
    void loadDirectory(currentDirectory);
  };

  const getFileIcon = (entry: FileEntry) => {
    if (entry.isDirectory) {
      return <RiFolder6Line className="h-6 w-6 text-primary/60" />;
    }

    const ext = entry.name.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'ts':
      case 'tsx':
      case 'js':
      case 'jsx':
      case 'html':
      case 'css':
      case 'scss':
      case 'less':
      case 'py':
      case 'rb':
      case 'go':
      case 'rs':
      case 'java':
      case 'c':
      case 'cpp':
      case 'h':
      case 'hpp':
        return <RiCodeLine className="h-6 w-6 text-blue-500" />;
      case 'json':
      case 'yaml':
      case 'yml':
      case 'toml':
        return <RiCodeLine className="h-6 w-6 text-yellow-500" />;
      case 'md':
      case 'txt':
      case 'mdx':
        return <RiFileTextLine className="h-6 w-6 text-gray-500" />;
      case 'png':
      case 'jpg':
      case 'jpeg':
      case 'gif':
      case 'svg':
      case 'webp':
      case 'ico':
        return <RiImageLine className="h-6 w-6 text-green-500" />;
      default:
        return <RiFile3Line className="h-6 w-6 text-muted-foreground" />;
    }
  };

  const pathSegments = React.useMemo(() => {
    if (!currentDirectory || currentDirectory === '/') {
      return [{ label: '/', path: '/' }];
    }
    const parts = currentDirectory.split('/').filter(Boolean);
    let currentPath = '';
    return parts.map((part) => {
      currentPath += '/' + part;
      return { label: part, path: currentPath };
    });
  }, [currentDirectory]);

  const renderBreadcrumb = () => (
    <div className="flex items-center gap-1 px-3 py-2 border-b border-border/40 overflow-x-auto">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => void goHome()}
            className="flex h-7 w-7 items-center justify-center rounded hover:bg-accent transition-colors"
            aria-label="Go to home directory"
          >
            <RiHome2Line className="h-4 w-4 text-muted-foreground" />
          </button>
        </TooltipTrigger>
        <TooltipContent>Home</TooltipContent>
      </Tooltip>
      <span className="text-muted-foreground">/</span>
      {pathSegments.map((segment, index) => (
        <React.Fragment key={segment.path}>
          {index > 0 && <span className="text-muted-foreground">/</span>}
          <button
            type="button"
            onClick={() => setDirectory(segment.path)}
            className={cn(
              'px-1.5 py-0.5 rounded hover:bg-accent transition-colors typography-ui-label',
              segment.path === currentDirectory
                ? 'text-foreground font-medium'
                : 'text-muted-foreground'
            )}
          >
            {segment.label}
          </button>
        </React.Fragment>
      ))}
    </div>
  );

  const renderToolbar = () => (
    <div className="flex items-center gap-1 px-3 py-2 border-b border-border/40">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => void goBack()}
            disabled={!canGoBack}
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded transition-colors',
              canGoBack
                ? 'hover:bg-accent text-foreground'
                : 'text-muted-foreground/40 cursor-not-allowed'
            )}
            aria-label="Go back"
          >
            <RiArrowGoBackLine className="h-4 w-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent>Back</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => void goForward()}
            disabled={!canGoForward}
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded transition-colors',
              canGoForward
                ? 'hover:bg-accent text-foreground'
                : 'text-muted-foreground/40 cursor-not-allowed'
            )}
            aria-label="Go forward"
          >
            <RiArrowGoForwardLine className="h-4 w-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent>Forward</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => void goToParent()}
            disabled={currentDirectory === '/' || currentDirectory === useDirectoryStore.getState().homeDirectory}
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded transition-colors',
              currentDirectory === '/' || currentDirectory === useDirectoryStore.getState().homeDirectory
                ? 'text-muted-foreground/40 cursor-not-allowed'
                : 'hover:bg-accent text-foreground'
            )}
            aria-label="Go to parent directory"
          >
            <RiCornerUpLeftLine className="h-4 w-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent>Up</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={handleRefresh}
            className="flex h-8 w-8 items-center justify-center rounded hover:bg-accent text-foreground transition-colors"
            aria-label="Refresh"
          >
            <RiRefreshLine className="h-4 w-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent>Refresh</TooltipContent>
      </Tooltip>

      <div className="flex-1" />

      {isMobile && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void goHome()}
          className="h-8 typography-ui-label"
        >
          <RiHome2Line className="h-4 w-4 mr-1" />
          Home
        </Button>
      )}
    </div>
  );

  const renderFileList = () => (
    <ScrollableOverlay
      outerClassName="flex-1 min-h-0"
      className="p-2"
    >
      {loading ? (
        <div className="space-y-1">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-3 py-2">
              <Skeleton className="h-6 w-6 rounded" />
              <Skeleton className="h-4 w-32" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div role="alert" className="flex flex-col items-center justify-center py-12 px-4">
          <RiFile3Line className="h-12 w-12 text-destructive/50 mb-3" />
          <p className="typography-ui-label text-destructive text-center">{error}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            className="mt-3"
          >
            Retry
          </Button>
        </div>
      ) : entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 px-4">
          <RiFolder6Line className="h-12 w-12 text-muted-foreground/30 mb-3" />
          <p className="typography-ui-label text-muted-foreground text-center">
            This directory is empty
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-1">
          {entries.map((entry) => (
            <button
              key={entry.path}
              type="button"
              onClick={() => handleFileClick(entry)}
              aria-label={`${entry.isDirectory ? 'Folder' : 'File'}: ${entry.name}`}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg transition-colors',
                'hover:bg-accent text-left',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'
              )}
            >
              <div className="flex-shrink-0">{getFileIcon(entry)}</div>
              <div className="flex-1 min-w-0">
                <p className="typography-ui-label text-foreground truncate" title={entry.name}>
                  {entry.name}
                </p>
                {entry.isDirectory && (
                  <p className="typography-micro text-muted-foreground">
                    Folder
                  </p>
                )}
              </div>
              {!isMobile && entry.isDirectory && (
                <RiArrowGoForwardLine className="h-3.5 w-3.5 text-muted-foreground/0 group-hover:text-muted-foreground/50" />
              )}
            </button>
          ))}
        </div>
      )}
    </ScrollableOverlay>
  );

  const renderFilePreview = () => {
    if (!previewFile) return null;

    const fileName = previewFile.path.split('/').pop() || 'File Preview';
    const fileExt = fileName.split('.').pop()?.toLowerCase();
    const isHtml = fileExt === 'html' || fileExt === 'htm';
    const isText = previewFile.content.length < 100000;

    return (
      <div className="relative flex flex-col w-full overflow-hidden overscroll-none flex-1 min-h-0">
        <div className="px-3 py-2 border-b border-border/40 flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClosePreview}
            className="h-7 w-7 p-0"
          >
            <RiArrowGoBackLine className="h-4 w-4" />
          </Button>
          <span className="typography-ui-label font-medium truncate">{fileName}</span>
        </div>
        <ScrollableOverlay
          outerClassName="flex-1 min-h-0"
          className="p-0"
        >
          {previewLoading ? (
            <div className="p-4 space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          ) : isText ? (
            isHtml ? (
              <iframe
                srcDoc={previewFile.content}
                className="w-full flex-1 border-0"
                sandbox="allow-scripts"
              />
            ) : (
              <pre className="p-3 typography-code text-foreground overflow-auto whitespace-pre-wrap break-all">
                {previewFile.content}
              </pre>
            )
          ) : (
            <div className="flex flex-col items-center justify-center py-12 px-4">
              <RiFile3Line className="h-16 w-16 text-muted-foreground/30 mb-3" />
              <p className="typography-ui-label text-muted-foreground text-center">
                Binary file - preview not available
              </p>
              <p className="typography-micro text-muted-foreground/60 text-center mt-1">
                {previewFile.path}
              </p>
            </div>
          )}
        </ScrollableOverlay>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {renderToolbar()}
      {renderBreadcrumb()}
      {isPreviewMode ? renderFilePreview() : renderFileList()}
    </div>
  );
};

export default FileBrowserView;
