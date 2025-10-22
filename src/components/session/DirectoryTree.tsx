import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  CaretRight as ChevronRight,
  CaretDown as ChevronDown,
  Folder,
  Folder as FolderOpen,
  PushPin as Pin,
  PushPinSlash as PinOff,
  Plus,
  Check,
  X
} from '@phosphor-icons/react';
import { cn, formatPathForDisplay } from '@/lib/utils';
import { opencodeClient } from '@/lib/opencode/client';
import { useFileSystemAccess } from '@/hooks/useFileSystemAccess';

interface DirectoryItem {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: DirectoryItem[];
  isExpanded?: boolean;
}

interface DirectoryTreeProps {
  currentPath: string;
  onSelectPath: (path: string) => void;
  triggerClassName?: string;
  variant?: 'dropdown' | 'inline';
  className?: string;
  selectionBehavior?: 'immediate' | 'deferred';
  onDoubleClickPath?: (path: string) => void;
  showHidden?: boolean;
}

export const DirectoryTree: React.FC<DirectoryTreeProps> = ({
  currentPath,
  onSelectPath,
  triggerClassName,
  variant = 'dropdown',
  className,
  selectionBehavior = 'immediate',
  onDoubleClickPath,
  showHidden = false,
}) => {
  const [directories, setDirectories] = React.useState<DirectoryItem[]>([]);
  const [expandedPaths, setExpandedPaths] = React.useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = React.useState(false);
  const [isOpen, setIsOpen] = React.useState(false);
  const [homeDirectory, setHomeDirectory] = React.useState<string>('');
  const [pinnedPaths, setPinnedPaths] = React.useState<Set<string>>(new Set());
  const [creatingInPath, setCreatingInPath] = React.useState<string | null>(null);
  const [newDirName, setNewDirName] = React.useState('');
  const inputRef = React.useRef<HTMLInputElement>(null);
  const { requestAccess, startAccessing, isDesktop } = useFileSystemAccess();
  const previousShowHidden = React.useRef(showHidden);

  // Handle directory selection with permission request on desktop
  const handleDirectorySelect = async (path: string) => {
    if (selectionBehavior === 'deferred') {
      onSelectPath(path);
      return;
    }

    if (isDesktop) {
      // Request access to the directory if on desktop
      const accessResult = await requestAccess(path);
      if (accessResult.success && accessResult.path) {
        // Start accessing the directory
        await startAccessing(accessResult.path);
        onSelectPath(accessResult.path);
      } else {
        console.error('Failed to get directory access:', accessResult.error);
        // Still try to select the path even if access request failed
        onSelectPath(path);
      }
    } else {
      onSelectPath(path);
    }
  };

  // Load home directory and pinned paths on mount
  React.useEffect(() => {
    opencodeClient.getSystemInfo().then(info => {
      setHomeDirectory(info.homeDirectory);
    });
    
    // Load pinned paths from localStorage
    const saved = localStorage.getItem('pinnedDirectories');
    if (saved) {
      try {
        const paths = JSON.parse(saved);
        setPinnedPaths(new Set(paths));
      } catch (e) {
        // Failed to load pinned directories
      }
    }
  }, []);

  // Save pinned paths whenever they change
  React.useEffect(() => {
    if (pinnedPaths.size > 0) {
      localStorage.setItem('pinnedDirectories', JSON.stringify(Array.from(pinnedPaths)));
    } else {
      localStorage.removeItem('pinnedDirectories');
    }
  }, [pinnedPaths]);

  React.useEffect(() => {
    if (previousShowHidden.current !== showHidden) {
      previousShowHidden.current = showHidden;
      setExpandedPaths(new Set());
    }
  }, [showHidden]);

  // Toggle pin status for a path
  const togglePin = (path: string) => {
    setPinnedPaths(prev => {
      const newSet = new Set(prev);
      if (newSet.has(path)) {
        newSet.delete(path);
      } else {
        newSet.add(path);
      }
      return newSet;
    });
  };

  // Get pinned directories with their names
  const pinnedDirectories = React.useMemo(() => {
    return Array.from(pinnedPaths).map(path => ({
      path,
      name: path.split('/').pop() || path
    })).sort((a, b) => a.name.localeCompare(b.name));
  }, [pinnedPaths]);

  // Load directory contents using filesystem endpoint with OpenCode fallback
  const loadDirectory = React.useCallback(async (path: string): Promise<DirectoryItem[]> => {
    const shouldInclude = (name: string) => showHidden || !name.startsWith('.');
    try {
      const filesystemEntries = await opencodeClient.listLocalDirectory(path);
      return filesystemEntries
        .filter((entry) => entry.isDirectory && shouldInclude(entry.name))
        .map((entry) => ({
          name: entry.name,
          path: entry.path.replace(/\\/g, '/'),
          isDirectory: true
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
    } catch (error) {
      try {
        // Fallback to OpenCode API if filesystem listing fails
        const tempClient = opencodeClient.getApiClient();
        const response = await tempClient.file.list({
          query: {
            path: '.',
            directory: path
          }
        });

        if (!response.data) {
          return [];
        }

        return response.data
          .filter((item: any) => item.type === 'directory' && shouldInclude(item.name))
          .map((item: any) => ({
            name: item.name,
            path: String(item.absolute || item.path || item.name).replace(/\\/g, '/'),
            isDirectory: true
          }))
          .sort((a: DirectoryItem, b: DirectoryItem) => a.name.localeCompare(b.name));
      } catch (fallbackError) {
        console.error('Failed to load directory listing:', fallbackError);
        return [];
      }
    }
  }, [showHidden]);

  // Load initial directory structure
  const shouldEnsureHomeDirectory = variant === 'inline' || isOpen;

  const loadInitialDirectories = React.useCallback(async () => {
    setIsLoading(true);
    try {
      // Get home directory if not already set
      let home = homeDirectory;
      if (!home) {
        const info = await opencodeClient.getSystemInfo();
        home = info.homeDirectory;
        setHomeDirectory(home);
      }
      
      const homeContents = await loadDirectory(home);
      setDirectories(homeContents);
    } catch (error) {
      // Failed to load directories
    } finally {
      setIsLoading(false);
    }
  }, [homeDirectory, loadDirectory]);

  React.useEffect(() => {
    if (shouldEnsureHomeDirectory && !homeDirectory) {
      opencodeClient.getSystemInfo().then(info => {
        setHomeDirectory(info.homeDirectory);
      });
    }
  }, [shouldEnsureHomeDirectory, homeDirectory]);

  // Load directories when home directory is set
  React.useEffect(() => {
    if ((variant === 'inline' || isOpen) && homeDirectory) {
      loadInitialDirectories();
    }
  }, [variant, isOpen, homeDirectory, loadInitialDirectories]);

  const toggleExpanded = async (item: DirectoryItem) => {
    const isCurrentlyExpanded = expandedPaths.has(item.path);
    const newExpanded = new Set(expandedPaths);

    if (isCurrentlyExpanded) {
      newExpanded.delete(item.path);
      setExpandedPaths(newExpanded);
      return;
    }

    newExpanded.add(item.path);
    setExpandedPaths(newExpanded);

    const children = await loadDirectory(item.path);
    const updateItems = (items: DirectoryItem[]): DirectoryItem[] => {
      return items.map((i) => {
        if (i.path === item.path) {
          return { ...i, children };
        }
        if (i.children) {
          return { ...i, children: updateItems(i.children) };
        }
        return i;
      });
    };
    setDirectories((prev) => updateItems(prev));
  };

  // Focus input when creating starts
  React.useEffect(() => {
    if (creatingInPath && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [creatingInPath]);

  // Generate unique directory name with auto-increment
  const generateUniqueDirName = (parentPath: string, children: DirectoryItem[] = []): string => {
    const baseName = 'new_directory';
    const existingNames = children.map(child => child.name);

    if (!existingNames.includes(baseName)) {
      return baseName;
    }

    // Find the highest number suffix
    let maxNumber = 1;
    const numberPattern = new RegExp(`^${baseName}(\\d+)$`);

    for (const name of existingNames) {
      const match = name.match(numberPattern);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxNumber) {
          maxNumber = num;
        }
      }
    }

    // Check if base name with number exists
    let counter = 2;
    while (existingNames.includes(`${baseName}${counter}`)) {
      counter++;
    }

    return `${baseName}${Math.max(counter, maxNumber + 1)}`;
  };

  // Start creating a new directory
  const startCreatingDirectory = async (parentItem: DirectoryItem) => {
    // Expand the parent if not already expanded
    if (!expandedPaths.has(parentItem.path)) {
      const newExpanded = new Set(expandedPaths);
      newExpanded.add(parentItem.path);
      setExpandedPaths(newExpanded);

      // Load children if not loaded
      if (!parentItem.children) {
        const children = await loadDirectory(parentItem.path);
        const updateItems = (items: DirectoryItem[]): DirectoryItem[] => {
          return items.map(i => {
            if (i.path === parentItem.path) {
              return { ...i, children };
            }
            if (i.children) {
              return { ...i, children: updateItems(i.children) };
            }
            return i;
          });
        };
        setDirectories((prev) => updateItems(prev));

        // Generate unique name based on loaded children
        const uniqueName = generateUniqueDirName(parentItem.path, children);
        setNewDirName(uniqueName);
      } else {
        const uniqueName = generateUniqueDirName(parentItem.path, parentItem.children);
        setNewDirName(uniqueName);
      }
    } else {
      const uniqueName = generateUniqueDirName(parentItem.path, parentItem.children);
      setNewDirName(uniqueName);
    }

    setCreatingInPath(parentItem.path);
  };

  // Create directory with the given name
  const createDirectory = async () => {
    if (!creatingInPath) return;

    const dirName = newDirName.trim() || 'new_directory';
    const fullPath = `${creatingInPath}/${dirName}`;

    try {
      await opencodeClient.createDirectory(fullPath);

      // Reload the parent directory to show the new folder
      const children = await loadDirectory(creatingInPath);
      const updateItems = (items: DirectoryItem[]): DirectoryItem[] => {
        return items.map(i => {
          if (i.path === creatingInPath) {
            return { ...i, children };
          }
          if (i.children) {
            return { ...i, children: updateItems(i.children) };
          }
          return i;
        });
      };
      setDirectories((prev) => updateItems(prev));

      // Clear creating state
      setCreatingInPath(null);
      setNewDirName('');
    } catch (error) {
      console.error('Failed to create directory:', error);
      // Keep the input open on error so user can try again
    }
  };

  // Cancel directory creation
  const cancelCreatingDirectory = () => {
    setCreatingInPath(null);
    setNewDirName('');
  };

  const renderTreeItem = (item: DirectoryItem, level: number = 0) => {
    const isExpanded = expandedPaths.has(item.path);
    const hasChildren = item.isDirectory;
    const isPinned = pinnedPaths.has(item.path);
    const isSelected = currentPath === item.path;
    const isInlineVariant = variant === 'inline';

    const rowContent = (
      <>
        {hasChildren && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleExpanded(item);
            }}
            className="p-0.5 hover:bg-accent rounded"
          >
            {isExpanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
          </button>
        )}
        {!hasChildren && <div className="w-4" />}

        <button
          onClick={(e) => {
            e.stopPropagation();
            handleDirectorySelect(item.path);
            if (variant === 'dropdown' && selectionBehavior === 'immediate') {
              setIsOpen(false);
            }
          }}
          onDoubleClick={(e) => {
            e.stopPropagation();
            if (onDoubleClickPath) {
              onDoubleClickPath(item.path);
            }
          }}
          className={cn(
            'flex items-center gap-1.5 flex-1 text-left transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/60 rounded',
            isInlineVariant ? (isSelected ? 'text-primary' : 'text-foreground') : 'text-foreground'
          )}
        >
          {isExpanded ? (
            <FolderOpen
              className={cn(
                'h-3.5 w-3.5 text-muted-foreground',
                isInlineVariant && isSelected && 'text-primary'
              )}
            />
          ) : (
            <Folder
              className={cn(
                'h-3.5 w-3.5 text-muted-foreground',
                isInlineVariant && isSelected && 'text-primary'
              )}
            />
          )}
          <span
            className={cn(
              'typography-ui-label font-medium truncate',
              isInlineVariant && isSelected ? 'text-primary' : 'text-foreground'
            )}
          >
            {item.name}
          </span>
        </button>

        <button
          onClick={(e) => {
            e.stopPropagation();
            startCreatingDirectory(item);
          }}
          className="p-1 opacity-0 group-hover:opacity-100 hover:bg-accent rounded transition-opacity"
          title="Create new directory"
        >
          <Plus className="h-3 w-3 text-muted-foreground" weight="regular" />
        </button>

        <button
          onClick={(e) => {
            e.stopPropagation();
            togglePin(item.path);
          }}
          className="p-1 opacity-0 group-hover:opacity-100 hover:bg-accent rounded transition-opacity"
          title={isPinned ? "Unpin directory" : "Pin directory"}
        >
          {isPinned ? (
            <PinOff className="h-3 w-3 text-primary" />
          ) : (
            <Pin className="h-3 w-3 text-muted-foreground" />
          )}
        </button>
      </>
    );

    if (variant === 'inline') {
      return (
        <div key={item.path}>
          <div
            className={cn(
              'group flex items-center gap-1 rounded px-2 py-1.5 text-left transition-colors hover:bg-accent/40',
              isSelected ? 'text-primary' : 'text-foreground'
            )}
            style={{ paddingLeft: `${level * 12 + 8}px` }}
          >
            {rowContent}
          </div>
          {isExpanded && (
            <>
              {creatingInPath === item.path && (
                <div
                  className="flex items-center gap-1 px-2 py-1.5"
                  style={{ paddingLeft: `${(level + 1) * 12 + 8}px` }}
                >
                  <div className="w-4" />
                  <Folder className="h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    ref={inputRef}
                    value={newDirName}
                    onChange={(e) => setNewDirName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        e.stopPropagation();
                        createDirectory();
                      } else if (e.key === 'Escape') {
                        e.preventDefault();
                        e.stopPropagation();
                        cancelCreatingDirectory();
                      }
                    }}
                    onBlur={createDirectory}
                    className="h-6 typography-meta flex-1 selection:bg-muted selection:text-muted-foreground"
                    placeholder="new_directory"
                  />
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      createDirectory();
                    }}
                    className="p-1 hover:bg-accent rounded"
                    title="Create directory"
                  >
                    <Check className="h-3 w-3 text-green-600" weight="bold" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      cancelCreatingDirectory();
                    }}
                    className="p-1 hover:bg-accent rounded"
                    title="Cancel"
                  >
                    <X className="h-3 w-3 text-muted-foreground" weight="bold" />
                  </button>
                </div>
              )}
              {item.children && item.children.map((child) => renderTreeItem(child, level + 1))}
            </>
          )}
        </div>
      );
    }

    return (
      <div key={item.path}>
        <DropdownMenuItem
          className={cn(
            'flex items-center gap-1 cursor-pointer group',
            currentPath === item.path && 'bg-accent'
          )}
          style={{ paddingLeft: `${level * 12 + 8}px` }}
          onSelect={(e) => {
            e.preventDefault();
          }}
        >
          {hasChildren && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleExpanded(item);
              }}
              className="p-0.5 hover:bg-accent rounded"
            >
              {isExpanded ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
            </button>
          )}
          {!hasChildren && <div className="w-4" />}
          {rowContent}
        </DropdownMenuItem>
        {isExpanded && (
          <div>
            {creatingInPath === item.path && (
              <div
                className="flex items-center gap-1 px-2 py-1.5"
                style={{ paddingLeft: `${(level + 1) * 12 + 8}px` }}
              >
                <div className="w-4" />
                <Folder className="h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  ref={inputRef}
                  value={newDirName}
                  onChange={(e) => setNewDirName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      e.stopPropagation();
                      createDirectory();
                    } else if (e.key === 'Escape') {
                      e.preventDefault();
                      e.stopPropagation();
                      cancelCreatingDirectory();
                    }
                  }}
                  onBlur={createDirectory}
                  className="h-6 typography-meta flex-1 selection:bg-muted selection:text-muted-foreground"
                  placeholder="new_directory"
                />
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    createDirectory();
                  }}
                  className="p-1 hover:bg-accent rounded"
                  title="Create directory"
                >
                  <Check className="h-3 w-3 text-green-600" weight="bold" />
                </button>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    cancelCreatingDirectory();
                  }}
                  className="p-1 hover:bg-accent rounded"
                  title="Cancel"
                >
                  <X className="h-3 w-3 text-muted-foreground" weight="bold" />
                </button>
              </div>
            )}
            {item.children && item.children.map((child) => renderTreeItem(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  const renderPinnedRow = (name: string, path: string) => {
    if (variant === 'inline') {
      const isSelected = currentPath === path;
      return (
        <div
          key={path}
          className={cn(
            'group flex items-center gap-2 px-2 py-1.5 transition-colors hover:bg-accent/40'
          )}
        >
          <button
            onClick={() => handleDirectorySelect(path)}
            onDoubleClick={(e) => {
              e.stopPropagation();
              if (onDoubleClickPath) {
                onDoubleClickPath(path);
              }
            }}
            className={cn(
              'flex flex-1 items-center gap-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/60 rounded',
              isSelected ? 'text-primary' : 'text-foreground'
            )}
          >
            <Folder
              className={cn(
                'h-3.5 w-3.5 text-muted-foreground',
                isSelected && 'text-primary'
              )}
            />
            <div className="flex-1 min-w-0">
              <div
                className={cn(
                  'typography-ui-label font-medium truncate',
                  isSelected ? 'text-primary' : 'text-foreground'
                )}
              >
                {name}
              </div>
              <div className="typography-meta text-muted-foreground truncate">
                {formatPathForDisplay(path, homeDirectory)}
              </div>
            </div>
          </button>
          <button
            onClick={() => togglePin(path)}
            className="p-1 opacity-0 group-hover:opacity-100 hover:bg-accent rounded transition-opacity"
            title="Unpin directory"
          >
            <PinOff className="h-3 w-3 text-primary" />
          </button>
        </div>
      );
    }

    return (
      <DropdownMenuItem
        key={path}
        onSelect={(e) => {
          e.preventDefault();
          handleDirectorySelect(path);
          if (selectionBehavior === 'immediate') {
            setIsOpen(false);
          }
        }}
        className={cn(
          'flex items-start gap-2 cursor-pointer group py-2',
          currentPath === path && 'bg-accent'
        )}
      >
        <Folder className="h-3.5 w-3.5 text-muted-foreground mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="typography-ui-label font-medium">{name}</div>
          <div className="typography-meta text-muted-foreground">
            {formatPathForDisplay(path, homeDirectory)}
          </div>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            togglePin(path);
          }}
          className="p-1 opacity-0 group-hover:opacity-100 hover:bg-accent rounded transition-opacity"
          title="Unpin directory"
        >
          <PinOff className="h-3 w-3 text-primary" />
        </button>
      </DropdownMenuItem>
    );
  };

  const directoryContent = (
    <>
      {pinnedDirectories.length > 0 && (
        <>
          <div className="px-2 py-1.5 typography-meta font-semibold text-muted-foreground">
            Pinned
          </div>
          {pinnedDirectories.map(({ name, path }) => renderPinnedRow(name, path))}
          {variant === 'dropdown' && <DropdownMenuSeparator />}
        </>
      )}

      <div className="px-2 py-1.5 typography-meta font-semibold text-muted-foreground">
        Browse
      </div>

      {isLoading ? (
        <div className="px-3 py-2 typography-ui-label text-muted-foreground">
          Loading...
        </div>
      ) : (
        directories.map((item) => renderTreeItem(item))
      )}

      {!isLoading && directories.length === 0 && (
        <div className="px-3 py-2 typography-ui-label text-muted-foreground">
          No directories found
        </div>
      )}
    </>
  );

  if (variant === 'inline') {
    return (
      <div className={cn('overflow-hidden rounded-xl border border-border/40 bg-sidebar/70', className)}>
        <div className="max-h-full overflow-y-auto">
          {directoryContent}
        </div>
      </div>
    );
  }

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className={cn(
            'w-full h-8 px-2.5 justify-between items-center rounded-lg border border-transparent bg-sidebar-accent/40 text-foreground/90 hover:bg-sidebar-accent/60 transition-colors typography-meta',
            triggerClassName
          )}
          aria-label="Select working directory"
        >
          <span className="flex items-center gap-1.5 min-w-0 flex-1">
            <FolderOpen className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
            <span className="truncate" title={currentPath}>
              {formatPathForDisplay(currentPath, homeDirectory)}
            </span>
          </span>
          <ChevronDown className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[350px] max-h-[500px] overflow-y-auto">
        {directoryContent}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
