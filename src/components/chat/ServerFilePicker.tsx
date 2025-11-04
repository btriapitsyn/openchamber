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
import {
  FileText,
  Folder,
  Folder as FolderOpen,
  MagnifyingGlass as Search,
  X,
  Code,
  Code as FileJson,
  FileCode as FileType,
  FileImage as Image,
} from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { useDirectoryStore } from '@/stores/useDirectoryStore';
import { opencodeClient } from '@/lib/opencode/client';
import { useDeviceInfo } from '@/lib/device';
import { MobileOverlayPanel } from '@/components/ui/MobileOverlayPanel';

interface FileInfo {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  extension?: string;
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
  const { currentDirectory } = useDirectoryStore();
  const [open, setOpen] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [selectedFiles, setSelectedFiles] = React.useState<Set<string>>(new Set());
  const [expandedDirs, setExpandedDirs] = React.useState<Set<string>>(new Set());
  const [fileTree, setFileTree] = React.useState<FileInfo[]>([]);
  const [allFiles, setAllFiles] = React.useState<FileInfo[]>([]); // Store all files for search
  const [loading, setLoading] = React.useState(false);
  const [attaching, setAttaching] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const loadAllFilesRecursively = React.useCallback(async (dirPath: string): Promise<FileInfo[]> => {
    try {
      const tempClient = opencodeClient.getApiClient();
      const response = await tempClient.file.list({
        query: { 
          path: '.',
          directory: dirPath
        }
      });
      
      if (!response.data) return [];
      
      let files: FileInfo[] = [];
      
      for (const item of response.data) {
        if (item.name.startsWith('.')) continue;
        
        const extension = item.type === 'file' 
          ? item.name.split('.').pop()?.toLowerCase() 
          : undefined;
        
        const fileInfo: FileInfo = {
          name: item.name,
          path: item.absolute || `${dirPath}/${item.name}`,
          type: item.type as 'file' | 'directory',
          size: 0,
          extension
        };
        
        if (item.type === 'file') {
          files.push(fileInfo);
        } else if (
          item.type === 'directory' && 
          !item.name.includes('node_modules') && 
          !item.name.includes('.git') &&
          !item.name.includes('dist')
        ) {
          // Recursively load subdirectories
          const subFiles = await loadAllFilesRecursively(fileInfo.path);
          files = files.concat(subFiles);
        }
      }
      
      return files;
    } catch {
      return [];
    }
  }, []);

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

  // Load initial file tree and all files for search
  React.useEffect(() => {
    if ((open || mobileOpen) && currentDirectory) {
      void loadDirectory(currentDirectory);
      if (searchQuery) {
        void loadAllFilesRecursively(currentDirectory);
      }
    }
  }, [open, mobileOpen, currentDirectory, searchQuery, loadDirectory, loadAllFilesRecursively]);

  // Load all files recursively when search starts
  React.useEffect(() => {
    if ((open || mobileOpen) && currentDirectory && searchQuery) {
      const loadAll = async () => {
        setLoading(true);
        const files = await loadAllFilesRecursively(currentDirectory);
        setAllFiles(files);
        setLoading(false);
      };
      void loadAll();
    }
  }, [searchQuery, open, mobileOpen, currentDirectory, loadAllFilesRecursively]);

  // Reset selection when closing
  React.useEffect(() => {
    if (!open && !mobileOpen) {
      setSelectedFiles(new Set());
      setSearchQuery('');
    }
  }, [open, mobileOpen]);

  const getFileIcon = (file: FileInfo) => {
    if (file.type === 'directory') {
      return expandedDirs.has(file.path) ? (
        <FolderOpen className="h-3.5 w-3.5 text-primary/60" />
      ) : (
        <Folder className="h-3.5 w-3.5 text-primary/60" />
      );
    }

    const ext = file.extension?.toLowerCase();
    switch (ext) {
      case 'ts':
      case 'tsx':
      case 'js':
      case 'jsx':
        return <Code className="h-3.5 w-3.5 text-blue-500" />;
      case 'json':
        return <FileJson className="h-3.5 w-3.5 text-yellow-500" />;
      case 'md':
      case 'mdx':
        return <FileType className="h-3.5 w-3.5 text-gray-500" />;
      case 'png':
      case 'jpg':
      case 'jpeg':
      case 'gif':
      case 'svg':
        return <Image className="h-3.5 w-3.5 text-green-500" />;
      default:
        return <FileText className="h-3.5 w-3.5 text-muted-foreground" />;
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
      } catch {
        // Failed to load subdirectory
      }
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
    const selected = fileTree.filter(f => 
      f.type === 'file' && selectedFiles.has(f.path)
    );
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

  const filteredFiles = React.useMemo(() => {
    if (!searchQuery) {
      // When not searching, show tree structure
      const rootPath = currentDirectory;
      const rootItems = fileTree.filter(item => {
        const itemDir = item.path.substring(0, item.path.lastIndexOf('/'));
        return itemDir === rootPath;
      });
      return rootItems;
    }
    
    // When searching, use all files loaded recursively
    const query = searchQuery.toLowerCase();
    const searchSource = allFiles.length > 0 ? allFiles : fileTree;
    return searchSource.filter(file => 
      file.name.toLowerCase().includes(query) && file.type === 'file'
    );
  }, [fileTree, allFiles, searchQuery, currentDirectory]);
  
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
    return (
      <div
        key={file.path}
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
          <span className="flex-1 truncate text-foreground text-left">
            {searchQuery && file.path !== file.name ? getRelativePath(file.path) : file.name}
          </span>
        </div>
        {file.type === 'file' && selectedFiles.has(file.path) && (
          <div className="h-1.5 w-1.5 rounded-full bg-primary" />
        )}
      </div>
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

  const scrollAreaClass = isMobile ? 'flex-1 min-h-[240px]' : 'h-[300px]';

  const pickerBody = (
    <>
      <div className="px-3 py-2 border-b shrink-0">
        <div className="font-medium typography-ui-label text-foreground">Select Project Files</div>
      </div>
      <div className="px-3 py-2 border-b shrink-0">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
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
              <X className="h-3 w-3"  weight="bold"/>
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
            {searchQuery ? (
              filteredFiles.map((file) => renderFileItem(file, 0))
            ) : (
              filteredFiles.map((file) => renderFileTree(file, 0))
            )}

            {filteredFiles.length === 0 && (
              <div className="px-3 py-4 typography-ui-label text-muted-foreground text-center">
                {searchQuery ? 'No files found' : 'No files in this directory'}
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

  if (isMobile) {
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
        className="w-[400px] p-0 overflow-hidden flex flex-col"
        align="end"
        sideOffset={5}
      >
        {pickerBody}
        <DropdownMenuSeparator />
        {summarySection}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
