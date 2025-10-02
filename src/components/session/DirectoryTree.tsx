import React from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { 
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  Pin,
  PinOff
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { opencodeClient } from '@/lib/opencode/client';

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
}

export const DirectoryTree: React.FC<DirectoryTreeProps> = ({ 
  currentPath, 
  onSelectPath,
  triggerClassName,
  variant = 'dropdown',
  className,
}) => {
  const [directories, setDirectories] = React.useState<DirectoryItem[]>([]);
  const [expandedPaths, setExpandedPaths] = React.useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = React.useState(false);
  const [isOpen, setIsOpen] = React.useState(false);
  const [homeDirectory, setHomeDirectory] = React.useState<string>('');
  const [pinnedPaths, setPinnedPaths] = React.useState<Set<string>>(new Set());

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

  // Load directory contents using OpenCode API
  const loadDirectory = async (path: string): Promise<DirectoryItem[]> => {
    try {
      // Use the API correctly: path="." with directory parameter for context
      const tempClient = opencodeClient.getApiClient();
      const response = await tempClient.file.list({
        query: { 
          path: '.',  // List current directory
          directory: path  // With this directory as context
        }
      });
      
      if (!response.data) {
        return [];
      }
      
      // Filter and transform to only directories (excluding dot directories)
      const directories = response.data
        .filter((item: any) => item.type === 'directory' && !item.name.startsWith('.'))
        .map((item: any) => ({
          name: item.name,
          path: item.absolute,  // Use the absolute path from the response
          isDirectory: true
        }))
        .sort((a: DirectoryItem, b: DirectoryItem) => 
          a.name.localeCompare(b.name)
        );
      
      return directories;
    } catch (error) {
      // Failed to load directory
      return [];
    }
  };

  // Load initial directory structure
  const shouldEnsureHomeDirectory = variant === 'inline' || isOpen;

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
  }, [variant, isOpen, homeDirectory]);

  const loadInitialDirectories = async () => {
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
  };

  const toggleExpanded = async (item: DirectoryItem) => {
    const newExpanded = new Set(expandedPaths);
    
    if (expandedPaths.has(item.path)) {
      newExpanded.delete(item.path);
    } else {
      newExpanded.add(item.path);
      
      // Load children if not already loaded
      if (!item.children) {
        const children = await loadDirectory(item.path);
        // Update the item with children
        const updateItems = (items: DirectoryItem[]): DirectoryItem[] => {
          return items.map(i => {
            if (i.path === item.path) {
              return { ...i, children };
            }
            if (i.children) {
              return { ...i, children: updateItems(i.children) };
            }
            return i;
          });
        };
        setDirectories(updateItems(directories));
      }
    }
    
    setExpandedPaths(newExpanded);
  };

  const renderTreeItem = (item: DirectoryItem, level: number = 0) => {
    const isExpanded = expandedPaths.has(item.path);
    const hasChildren = item.isDirectory;
    const isPinned = pinnedPaths.has(item.path);

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
            onSelectPath(item.path);
            if (variant === 'dropdown') {
              setIsOpen(false);
            }
          }}
          className="flex items-center gap-1.5 flex-1 text-left"
        >
          {isExpanded ? (
            <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <Folder className="h-3.5 w-3.5 text-muted-foreground" />
          )}
          <span className="typography-ui-label truncate">{item.name}</span>
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
              'group flex items-center gap-1 rounded px-2 py-1.5 text-left text-foreground transition-colors hover:bg-accent/50',
              currentPath === item.path && 'bg-accent'
            )}
            style={{ paddingLeft: `${level * 12 + 8}px` }}
          >
            {rowContent}
          </div>
          {isExpanded && item.children && item.children.map((child) => renderTreeItem(child, level + 1))}
        </div>
      );
    }

    return (
      <div key={item.path}>
        <DropdownMenuItem
          className={cn(
            "flex items-center gap-1 cursor-pointer group",
            currentPath === item.path && "bg-accent"
          )}
          style={{ paddingLeft: `${(level * 12) + 8}px` }}
          onSelect={(e) => {
            e.preventDefault(); // Prevent dropdown from closing
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
        
        {isExpanded && item.children && (
          <div>
            {item.children.map(child => renderTreeItem(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  const formatDisplayPath = (path: string) => {
    if (homeDirectory && path.startsWith(homeDirectory)) {
      return path.replace(homeDirectory, '~');
    }
    return path;
  };

  const renderPinnedRow = (name: string, path: string) => {
    if (variant === 'inline') {
      return (
        <div
          key={path}
          className={cn(
            'group flex items-center gap-2 px-2 py-1.5 transition-colors hover:bg-accent/50',
            currentPath === path && 'bg-accent'
          )}
        >
          <button
            onClick={() => onSelectPath(path)}
            className="flex flex-1 items-center gap-2 text-left"
          >
            <Folder className="h-3.5 w-3.5 text-muted-foreground" />
            <div className="flex-1 min-w-0">
              <div className="typography-ui-label font-medium truncate">{name}</div>
              <div className="typography-meta text-muted-foreground truncate">
                {formatDisplayPath(path)}
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
          onSelectPath(path);
          setIsOpen(false);
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
            {formatDisplayPath(path)}
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
      <div className={cn('max-h-80 overflow-y-auto rounded-md border border-border/40 bg-sidebar/70', className)}>
        {directoryContent}
      </div>
    );
  }

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className={cn(
            'w-full h-8 px-2.5 justify-between items-center rounded-md border border-transparent bg-sidebar-accent/40 text-foreground/90 hover:bg-sidebar-accent/60 transition-colors typography-meta',
            triggerClassName
          )}
          aria-label="Select working directory"
        >
          <span className="flex items-center gap-1.5 min-w-0 flex-1">
            <FolderOpen className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
            <span className="truncate" title={currentPath}>
              {formatDisplayPath(currentPath)}
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
