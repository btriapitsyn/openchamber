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
  FolderOpen, 
  Search, 
  X,
  Code,
  FileJson,
  FileType,
  Image,
  ChevronRight,
  ChevronDown
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDirectoryStore } from '@/stores/useDirectoryStore';
import { opencodeClient } from '@/lib/opencode/client';

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
  const { currentDirectory } = useDirectoryStore();
  const [open, setOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [selectedFiles, setSelectedFiles] = React.useState<Set<string>>(new Set());
  const [expandedDirs, setExpandedDirs] = React.useState<Set<string>>(new Set());
  const [fileTree, setFileTree] = React.useState<FileInfo[]>([]);
  const [allFiles, setAllFiles] = React.useState<FileInfo[]>([]); // Store all files for search
  const [loading, setLoading] = React.useState(false);
  const [attaching, setAttaching] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Load initial file tree and all files for search
  React.useEffect(() => {
    if (open && currentDirectory) {
      loadDirectory(currentDirectory);
      if (searchQuery) {
        loadAllFilesRecursively(currentDirectory);
      }
    }
  }, [open, currentDirectory]);

  // Load all files recursively when search starts
  React.useEffect(() => {
    if (open && currentDirectory && searchQuery) {
      const loadAll = async () => {
        setLoading(true);
        const files = await loadAllFilesRecursively(currentDirectory);
        setAllFiles(files);
        setLoading(false);
      };
      loadAll();
    }
  }, [searchQuery]);

  // Reset selection when closing
  React.useEffect(() => {
    if (!open) {
      setSelectedFiles(new Set());
      setSearchQuery('');
    }
  }, [open]);

  const loadAllFilesRecursively = async (dirPath: string): Promise<FileInfo[]> => {
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
        } else if (item.type === 'directory' && 
                   !item.name.includes('node_modules') && 
                   !item.name.includes('.git') &&
                   !item.name.includes('dist')) {
          // Recursively load subdirectories
          const subFiles = await loadAllFilesRecursively(fileInfo.path);
          files = files.concat(subFiles);
        }
      }
      
      return files;
    } catch (error) {
      console.error('Error loading directory recursively:', dirPath, error);
      return [];
    }
  };

  const loadDirectory = async (dirPath: string) => {
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
        .filter((item: any) => !item.name.startsWith('.'))
        .map((item: any) => {
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
    } catch (err) {
      setError('Failed to load directory contents');
      console.error('Error loading directory:', err);
      setFileTree([]);
    } finally {
      setLoading(false);
    }
  };

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
            .filter((item: any) => !item.name.startsWith('.'))
            .map((item: any) => {
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
      } catch (error) {
        console.error('Failed to load subdirectory:', error);
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
          "flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent cursor-pointer typography-sm",
          file.type === 'file' && selectedFiles.has(file.path) && "bg-primary/10"
        )}
        style={{ paddingLeft: `${level * 12 + 8}px` }}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (file.type === 'file') {
            toggleFileSelection(file.path);
          }
        }}
      >
        <div className="w-4" />
        {getFileIcon(file)}
        <span className="flex-1 truncate">
          {searchQuery && file.path !== file.name ? getRelativePath(file.path) : file.name}
        </span>
        {file.type === 'file' && selectedFiles.has(file.path) && (
          <div className="h-1.5 w-1.5 rounded-full bg-primary" />
        )}
      </div>
    );
  };
  
  const renderFileTree = (file: FileInfo, level: number): React.ReactNode => {
    const children = file.type === 'directory' ? getChildItems(file.path) : [];
    const isExpanded = expandedDirs.has(file.path);
    
    return (
      <div key={file.path}>
        <div
          className={cn(
            "flex items-center gap-1 px-2 py-1.5 rounded hover:bg-accent cursor-pointer typography-sm",
            file.type === 'file' && selectedFiles.has(file.path) && "bg-primary/10"
          )}
          style={{ paddingLeft: `${level * 12 + 8}px` }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (file.type === 'directory') {
              toggleDirectory(file.path);
            } else {
              toggleFileSelection(file.path);
            }
          }}
        >
          {file.type === 'directory' && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                toggleDirectory(file.path);
              }}
              className="p-0.5 hover:bg-background rounded"
            >
              {isExpanded ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
            </button>
          )}
          {file.type === 'file' && <div className="w-4" />}
          
          {getFileIcon(file)}
          
          <span className="flex-1 truncate ml-1">
            {file.name}
          </span>
          
          {file.type === 'file' && selectedFiles.has(file.path) && (
            <div className="h-1.5 w-1.5 rounded-full bg-primary" />
          )}
        </div>
        
        {isExpanded && children.length > 0 && (
          <div>
            {children.map(child => renderFileTree(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        {children}
      </DropdownMenuTrigger>
      <DropdownMenuContent 
        className="w-[400px] p-0 overflow-hidden" 
        align="end"
        sideOffset={5}
      >
        <div className="px-3 py-2 border-b">
          <div className="font-medium typography-sm">Select Project Files</div>
        </div>
        
        {/* Search Bar */}
        <div className="px-3 py-2 border-b">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search files..."
              className="pl-7 h-7 typography-sm"
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
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>

        {/* File Tree */}
        <ScrollArea className="h-[300px]">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <div className="typography-sm text-muted-foreground">Loading files...</div>
            </div>
          )}
          
          {error && (
            <div className="flex items-center justify-center py-8">
              <div className="typography-sm text-destructive">{error}</div>
            </div>
          )}

            {!loading && !error && (
              <div className="py-1 pl-1 pr-3">
                {searchQuery ? (
                  filteredFiles.map((file) => renderFileItem(file, 0))
                ) : (
                  filteredFiles.map((file) => renderFileTree(file, 0))
                )}
                
                {filteredFiles.length === 0 && (
                  <div className="px-3 py-4 typography-sm text-muted-foreground text-center">
                    {searchQuery ? 'No files found' : 'No files in this directory'}
                  </div>
                )}
              </div>
            )}
        </ScrollArea>

        {/* Footer always visible */}
        <DropdownMenuSeparator />
        <div className="flex items-center justify-between px-3 py-2">
          <div className="typography-xs text-muted-foreground">
            {selectedFiles.size > 0 
              ? `${selectedFiles.size} file${selectedFiles.size !== 1 ? 's' : ''} selected`
              : 'No files selected'
            }
          </div>
          <Button
            size="sm"
            onClick={handleConfirm}
            disabled={selectedFiles.size === 0 || attaching}
            className="h-7 typography-xs"
          >
            {attaching ? 'Attaching...' : 'Attach Files'}
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};