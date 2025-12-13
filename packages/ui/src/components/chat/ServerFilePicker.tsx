import React from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { RiCloseLine, RiCodeLine, RiFileImageLine, RiFileTextLine, RiFolder6Line, RiSearchLine } from '@remixicon/react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn, truncatePathMiddle } from '@/lib/utils';
import { useDirectoryStore } from '@/stores/useDirectoryStore';
import { opencodeClient } from '@/lib/opencode/client';
import { useDeviceInfo } from '@/lib/device';
import { MobileOverlayPanel } from '@/components/ui/MobileOverlayPanel';
import { useFileSearchStore } from '@/stores/useFileSearchStore';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useIsVSCodeRuntime } from '@/hooks/useRuntimeAPIs';

interface FileInfo {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  extension?: string;
  relativePath?: string;
}

interface ServerFilePickerProps {
  onFilesSelected: (files: FileInfo[]) => void;
  multiSelect?: boolean;
  children: React.ReactNode;
}

export const ServerFilePicker: React.FC<ServerFilePickerProps> = ({
  onFilesSelected,
  multiSelect = false,
  children
}) => {
  const { isMobile } = useDeviceInfo();
  const isVSCodeRuntime = useIsVSCodeRuntime();
  const isCompact = isMobile || isVSCodeRuntime;
  const { currentDirectory } = useDirectoryStore();
  const searchFiles = useFileSearchStore((state) => state.searchFiles);
  const [open, setOpen] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');
  const debouncedSearchQuery = useDebouncedValue(searchQuery, 200);
  const [selectedFiles, setSelectedFiles] = React.useState<Set<string>>(new Set());
  const [expandedDirs, setExpandedDirs] = React.useState<Set<string>>(new Set());
  const [fileTree, setFileTree] = React.useState<FileInfo[]>([]);
  const [searchResults, setSearchResults] = React.useState<FileInfo[]>([]);
  const [searching, setSearching] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [attaching, setAttaching] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const loadDirectory = React.useCallback(async (dirPath: string) => {
    setLoading(true);
    setError(null);
    try {
      const tempClient = opencodeClient.getApiClient();
      const response = await tempClient.file.list({
        query: {
          path: '.',
          directory: dirPath
        }
      });

      if (!response.data) {
        setFileTree([]);
        return;
      }

      const items = response.data
        .filter((item: { name: string; type: string; size?: number; absolute?: string }) => !item.name.startsWith('.'))
        .map((item: { name: string; type: string; size?: number; absolute?: string }) => {
          const extension = item.type === 'file'
            ? item.name.split('.').pop()?.toLowerCase()
            : undefined;

          return {
            name: item.name,
            path: item.absolute || `${dirPath}/${item.name}`,
            type: item.type as 'file' | 'directory',
            size: item.size || 0,
            extension
          };
        })
        .sort((a: FileInfo, b: FileInfo) => {
          if (a.type !== b.type) {
            return a.type === 'directory' ? -1 : 1;
          }
          return a.name.localeCompare(b.name);
        });

      setFileTree(items);
    } catch {
      setError('Failed to load directory contents');
      setFileTree([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if ((open || mobileOpen) && currentDirectory) {
      void loadDirectory(currentDirectory);
    }
  }, [open, mobileOpen, currentDirectory, loadDirectory]);

  React.useEffect(() => {
    if (!(open || mobileOpen) || !currentDirectory) {
      setSearchResults([]);
      setSearching(false);
      return;
    }

    const trimmedQuery = debouncedSearchQuery.trim();
    if (!trimmedQuery) {
      setSearchResults([]);
      setSearching(false);
      return;
    }

    let cancelled = false;
    setSearching(true);

    searchFiles(currentDirectory, trimmedQuery, 150)
      .then((hits) => {
        if (cancelled) {
          return;
        }
        const mappedHits: FileInfo[] = hits.map((hit) => ({
          name: hit.name,
          path: hit.path,
          type: 'file',
          extension: hit.extension,
          relativePath: hit.relativePath,
          size: 0,
        }));
        setSearchResults(mappedHits);
      })
      .catch(() => {
        if (!cancelled) {
          setSearchResults([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setSearching(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open, mobileOpen, currentDirectory, debouncedSearchQuery, searchFiles]);

  React.useEffect(() => {
    if (!open && !mobileOpen) {
      setSelectedFiles(new Set());
      setSearchQuery('');
      setSearchResults([]);
      setSearching(false);
    }
  }, [open, mobileOpen]);

  const getFileIcon = (file: FileInfo) => {
    if (file.type === 'directory') {
      return expandedDirs.has(file.path) ? (
        <RiFolder6Line className="h-3.5 w-3.5 text-primary/60" />
      ) : (
        <RiFolder6Line className="h-3.5 w-3.5 text-primary/60" />
      );
    }

    const ext = file.extension?.toLowerCase();
    switch (ext) {
      case 'ts':
      case 'tsx':
      case 'js':
      case 'jsx':
      case 'html':
      case 'css':
      case 'scss':
      case 'less':
        return <RiCodeLine className="h-3.5 w-3.5 text-blue-500" />;
      case 'json':
        return <RiCodeLine className="h-3.5 w-3.5 text-yellow-500" />;
      case 'md':
      case 'mdx':
        return <RiFileTextLine className="h-3.5 w-3.5 text-gray-500" />;
      case 'png':
      case 'jpg':
      case 'jpeg':
      case 'gif':
      case 'svg':
        return <RiFileImageLine className="h-3.5 w-3.5 text-green-500" />;
      default:
        return <RiFileTextLine className="h-3.5 w-3.5 text-muted-foreground" />;
    }
  };

  const toggleDirectory = async (dirPath: string) => {
    const isExpanded = expandedDirs.has(dirPath);

    if (isExpanded) {
      setExpandedDirs(prev => {
        const next = new Set(prev);
        next.delete(dirPath);
        return next;
      });
    } else {
      setExpandedDirs(prev => {
        const next = new Set(prev);
        next.add(dirPath);
        return next;
      });

      try {
        const tempClient = opencodeClient.getApiClient();
        const response = await tempClient.file.list({
          query: {
            path: '.',
            directory: dirPath
          }
        });

        if (response.data) {
          const subItems = response.data
            .filter((item: { name: string; type: string; size?: number; absolute?: string }) => !item.name.startsWith('.'))
            .map((item: { name: string; type: string; size?: number; absolute?: string }) => {
              const extension = item.type === 'file'
                ? item.name.split('.').pop()?.toLowerCase()
                : undefined;

              return {
                name: item.name,
                path: item.absolute || `${dirPath}/${item.name}`,
                type: item.type as 'file' | 'directory',
          size: 0,
                extension
              };
            });

          setFileTree(prev => {
            const filtered = prev.filter(item => !item.path.startsWith(dirPath + '/'));
            return [...filtered, ...subItems].sort((a, b) => {
              const aDepth = a.path.split('/').length;
              const bDepth = b.path.split('/').length;
              if (aDepth !== bDepth) return aDepth - bDepth;
              if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
              return a.name.localeCompare(b.name);
            });
          });
        }
      } catch { /* ignored */ }
    }
  };

  const toggleFileSelection = (filePath: string) => {
    if (multiSelect) {
      setSelectedFiles(prev => {
        const next = new Set(prev);
        if (next.has(filePath)) {
          next.delete(filePath);
        } else {
          next.add(filePath);
        }
        return next;
      });
    } else {
      setSelectedFiles(new Set([filePath]));
    }
  };

  const handleConfirm = async () => {
    const treeFileMap = new Map(
      fileTree
        .filter((file) => file.type === 'file')
        .map((file) => [file.path, file])
    );
    const searchFileMap = new Map(searchResults.map((file) => [file.path, file]));

    const selected = Array.from(selectedFiles)
      .map((filePath) => treeFileMap.get(filePath) ?? searchFileMap.get(filePath))
      .filter((file): file is FileInfo => Boolean(file));

    setAttaching(true);
    try {
      await onFilesSelected(selected);
      setSelectedFiles(new Set());
      setOpen(false);
      setMobileOpen(false);
    } finally {
      setAttaching(false);
    }
  };

  const rootItems = React.useMemo(() => {
    if (!currentDirectory) {
      return [];
    }

    return fileTree.filter((item) => {
      const itemDir = item.path.substring(0, item.path.lastIndexOf('/'));
      return itemDir === currentDirectory;
    });
  }, [fileTree, currentDirectory]);

  const isSearchActive = searchQuery.trim().length > 0;

  const getChildItems = (parentPath: string) => {
    return fileTree.filter(item => {
      const itemDir = item.path.substring(0, item.path.lastIndexOf('/'));
      return itemDir === parentPath;
    });
  };

  const getRelativePath = (fullPath: string) => {
    if (currentDirectory && fullPath.startsWith(currentDirectory)) {
      const relativePath = fullPath.substring(currentDirectory.length);
      return relativePath.startsWith('/') ? relativePath.substring(1) : relativePath;
    }
    return fullPath.split('/').pop() || fullPath;
  };

  const renderFileItem = (file: FileInfo, level: number) => {
    const rawLabel = isSearchActive
      ? file.relativePath || getRelativePath(file.path)
      : file.name;
    const shouldCompact = isSearchActive && rawLabel.includes('/') && rawLabel.length > 45;
    const displayLabel = shouldCompact
      ? truncatePathMiddle(rawLabel, { maxLength: isCompact ? 42 : 48 })
      : rawLabel;

    const row = (
      <div
        className={cn(
          "flex w-full items-center justify-start gap-1 px-2 py-1.5 rounded hover:bg-accent cursor-pointer typography-ui-label text-foreground text-left",
          file.type === 'file' && selectedFiles.has(file.path) && "bg-primary/10"
        )}
        style={{ paddingLeft: `${level * 12}px` }}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (file.type === 'file') {
            toggleFileSelection(file.path);
          }
        }}
      >
        <div className="flex flex-1 items-center justify-start gap-1">
          <span className="text-muted-foreground">{getFileIcon(file)}</span>
          <span className="flex-1 truncate text-foreground text-left max-w-[360px]" aria-label={rawLabel}>
            {displayLabel}
          </span>
        </div>
        {file.type === 'file' && selectedFiles.has(file.path) && (
          <div className="h-1.5 w-1.5 rounded-full bg-primary" />
        )}
      </div>
    );

    if (!shouldCompact) {
      return React.cloneElement(row, { key: file.path });
    }

    return (
      <Tooltip key={file.path} delayDuration={120}>
        <TooltipTrigger asChild>{row}</TooltipTrigger>
        <TooltipContent side="right" className="max-w-xs">
          <span className="typography-meta text-foreground/80 whitespace-pre-wrap break-all">
            {rawLabel}
          </span>
        </TooltipContent>
      </Tooltip>
    );
  };

  const renderFileTree = (file: FileInfo, level: number): React.ReactNode => {
    const isDirectory = file.type === 'directory';
    const children = isDirectory ? getChildItems(file.path) : [];
    const isExpanded = expandedDirs.has(file.path);

    return (
      <div key={file.path}>
        <button
          type="button"
        className={cn(
            'flex w-full items-center justify-start gap-1 px-2 py-1.5 rounded cursor-pointer typography-ui-label text-foreground text-left',
            !isDirectory && selectedFiles.has(file.path) && 'bg-primary/10'
          )}
          style={{ paddingLeft: `${level * 12}px` }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (isDirectory) {
              toggleDirectory(file.path);
            } else {
              toggleFileSelection(file.path);
            }
          }}
        >
          <span className="text-muted-foreground">{getFileIcon(file)}</span>
          <span className="flex-1 truncate text-foreground text-left">
            {file.name}
          </span>
          {!isDirectory && selectedFiles.has(file.path) && (
            <div className="h-1.5 w-1.5 rounded-full bg-primary" />
          )}
        </button>

        {isDirectory && isExpanded && children.length > 0 && (
          <div>
            {children.map((child) => renderFileTree(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  const summaryLabel = selectedFiles.size > 0
    ? `${selectedFiles.size} file${selectedFiles.size !== 1 ? 's' : ''} selected`
    : 'No files selected';

  const summarySection = (
    <div className="flex items-center justify-between px-3 py-2 shrink-0">
      <div className="typography-meta text-muted-foreground">{summaryLabel}</div>
      <Button
        size="sm"
        onClick={handleConfirm}
        disabled={selectedFiles.size === 0 || attaching}
        className="h-6 typography-meta"
      >
        {attaching ? 'Attaching...' : 'Attach Files'}
      </Button>
    </div>
  );

  const scrollAreaClass = isCompact ? 'flex-1 min-h-[240px]' : 'h-[300px]';

  const pickerBody = (
    <>
      <div className="px-3 py-2 border-b shrink-0">
        <div className="font-medium typography-ui-label text-foreground">Select Project Files</div>
      </div>
      <div className="px-3 py-2 border-b shrink-0">
        <div className="relative">
          <RiSearchLine className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search files..."
            className="pl-7 h-6 typography-ui-label"
            onClick={(e) => e.stopPropagation()}
          />
          {searchQuery && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setSearchQuery('');
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 hover:bg-accent rounded"
            >
              <RiCloseLine className="h-3 w-3"/>
            </button>
          )}
        </div>
      </div>
      <ScrollArea className={scrollAreaClass}>
        {loading && (
          <div className="flex items-center justify-center py-8">
            <div className="typography-ui-label text-muted-foreground">Loading files...</div>
          </div>
        )}

        {error && (
          <div className="flex items-center justify-center py-8">
            <div className="typography-ui-label text-destructive">{error}</div>
          </div>
        )}

        {!loading && !error && (
          <div className="py-1 px-2">
            {isSearchActive ? (
              searching ? (
                <div className="px-3 py-4 typography-ui-label text-muted-foreground text-center">
                  Searching files…
                </div>
              ) : (
                searchResults.map((file) => renderFileItem(file, 0))
              )
            ) : (
              rootItems.map((file) => renderFileTree(file, 0))
            )}

            {!isSearchActive && rootItems.length === 0 && (
              <div className="px-3 py-4 typography-ui-label text-muted-foreground text-center">
                No files in this directory
              </div>
            )}

            {isSearchActive && !searching && searchResults.length === 0 && (
              <div className="px-3 py-4 typography-ui-label text-muted-foreground text-center">
                No files found
              </div>
            )}
          </div>
        )}
      </ScrollArea>
    </>
  );

  const mobileTrigger = (
    <span
      className="inline-flex cursor-pointer"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setMobileOpen(true);
      }}
    >
      {children}
    </span>
  );

  if (isCompact) {
    return (
      <>
        {mobileTrigger}
        <MobileOverlayPanel
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          title="Select Project Files"
          footer={summarySection}
        >
          <div className="flex flex-col gap-0">{pickerBody}</div>
        </MobileOverlayPanel>
      </>
    );
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        {children}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-[520px] p-0 overflow-hidden flex flex-col ml-16"
        align="center"
        sideOffset={5}
      >
        {pickerBody}
        <DropdownMenuSeparator />
        {summarySection}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
