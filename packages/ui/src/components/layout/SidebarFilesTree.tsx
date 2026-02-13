import React from 'react';
import {
  RiArrowDownSLine,
  RiArrowRightSLine,
  RiCloseLine,
  RiFile3Line,
  RiFolder3Fill,
  RiFolderOpenFill,
  RiLoader4Line,
  RiRefreshLine,
  RiSearchLine,
} from '@remixicon/react';

import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useRuntimeAPIs } from '@/hooks/useRuntimeAPIs';
import { useEffectiveDirectory } from '@/hooks/useEffectiveDirectory';
import { useFileSearchStore } from '@/stores/useFileSearchStore';
import { useFilesViewTabsStore } from '@/stores/useFilesViewTabsStore';
import { useUIStore } from '@/stores/useUIStore';
import { useDirectoryShowHidden } from '@/lib/directoryShowHidden';
import { useFilesViewShowGitignored } from '@/lib/filesViewShowGitignored';
import { cn } from '@/lib/utils';
import { opencodeClient } from '@/lib/opencode/client';

type FileNode = {
  name: string;
  path: string;
  type: 'file' | 'directory';
  extension?: string;
  relativePath?: string;
};

const sortNodes = (items: FileNode[]) =>
  items.slice().sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === 'directory' ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });

const normalizePath = (value: string): string => {
  if (!value) return '';

  const raw = value.replace(/\\/g, '/');
  const hadUncPrefix = raw.startsWith('//');

  let normalized = raw.replace(/\/+$/g, '');
  normalized = normalized.replace(/\/+/g, '/');
  if (hadUncPrefix && !normalized.startsWith('//')) {
    normalized = `/${normalized}`;
  }

  if (normalized === '') {
    return raw.startsWith('/') ? '/' : '';
  }

  return normalized;
};

const isAbsolutePath = (value: string): boolean => {
  return value.startsWith('/') || value.startsWith('//') || /^[A-Za-z]:\//.test(value);
};

const shouldIgnoreEntryName = (name: string): boolean => name === 'node_modules';

const shouldIgnorePath = (path: string): boolean => {
  const normalized = normalizePath(path);
  return normalized === 'node_modules' || normalized.endsWith('/node_modules') || normalized.includes('/node_modules/');
};

export const SidebarFilesTree: React.FC = () => {
  const { files, runtime } = useRuntimeAPIs();
  const currentDirectory = useEffectiveDirectory() ?? '';
  const root = normalizePath(currentDirectory.trim());
  const showHidden = useDirectoryShowHidden();
  const showGitignored = useFilesViewShowGitignored();
  const searchFiles = useFileSearchStore((state) => state.searchFiles);
  const openContextFile = useUIStore((state) => state.openContextFile);

  const [searchQuery, setSearchQuery] = React.useState('');
  const debouncedSearchQuery = useDebouncedValue(searchQuery, 200);
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const [searchResults, setSearchResults] = React.useState<FileNode[]>([]);
  const [searching, setSearching] = React.useState(false);

  const [childrenByDir, setChildrenByDir] = React.useState<Record<string, FileNode[]>>({});
  const loadedDirsRef = React.useRef<Set<string>>(new Set());
  const inFlightDirsRef = React.useRef<Set<string>>(new Set());

  const EMPTY_PATHS: string[] = React.useMemo(() => [], []);
  const expandedPaths = useFilesViewTabsStore((state) => (root ? (state.byRoot[root]?.expandedPaths ?? EMPTY_PATHS) : EMPTY_PATHS));
  const selectedPath = useFilesViewTabsStore((state) => (root ? (state.byRoot[root]?.selectedPath ?? null) : null));
  const setSelectedPath = useFilesViewTabsStore((state) => state.setSelectedPath);
  const addOpenPath = useFilesViewTabsStore((state) => state.addOpenPath);
  const toggleExpandedPath = useFilesViewTabsStore((state) => state.toggleExpandedPath);

  const mapDirectoryEntries = React.useCallback((dirPath: string, entries: Array<{ name: string; path: string; isDirectory: boolean }>): FileNode[] => {
    const nodes = entries
      .filter((entry) => entry && typeof entry.name === 'string' && entry.name.length > 0)
      .filter((entry) => showHidden || !entry.name.startsWith('.'))
      .filter((entry) => showGitignored || !shouldIgnoreEntryName(entry.name))
      .map<FileNode>((entry) => {
        const name = entry.name;
        const normalizedEntryPath = normalizePath(entry.path || '');
        const path = normalizedEntryPath
          ? (isAbsolutePath(normalizedEntryPath)
            ? normalizedEntryPath
            : normalizePath(`${dirPath}/${normalizedEntryPath}`))
          : normalizePath(`${dirPath}/${name}`);
        const type = entry.isDirectory ? 'directory' : 'file';
        const extension = type === 'file' && name.includes('.') ? name.split('.').pop()?.toLowerCase() : undefined;
        return {
          name,
          path,
          type,
          extension,
        };
      });

    return sortNodes(nodes);
  }, [showGitignored, showHidden]);

  const loadDirectory = React.useCallback(async (dirPath: string) => {
    const normalizedDir = normalizePath(dirPath.trim());
    if (!normalizedDir) {
      return;
    }

    if (loadedDirsRef.current.has(normalizedDir) || inFlightDirsRef.current.has(normalizedDir)) {
      return;
    }

    inFlightDirsRef.current = new Set(inFlightDirsRef.current);
    inFlightDirsRef.current.add(normalizedDir);

    try {
      const respectGitignore = !showGitignored;
      let entries: Array<{ name: string; path: string; isDirectory: boolean }>;
      if (runtime.isDesktop) {
        const result = await files.listDirectory(normalizedDir, { respectGitignore });
        entries = result.entries.map((entry) => ({
          name: entry.name,
          path: entry.path,
          isDirectory: entry.isDirectory,
        }));
      } else {
        const result = await opencodeClient.listLocalDirectory(normalizedDir, { respectGitignore });
        entries = result.map((entry) => ({
          name: entry.name,
          path: entry.path,
          isDirectory: entry.isDirectory,
        }));
      }

      const mapped = mapDirectoryEntries(normalizedDir, entries);

      loadedDirsRef.current = new Set(loadedDirsRef.current);
      loadedDirsRef.current.add(normalizedDir);
      setChildrenByDir((prev) => ({ ...prev, [normalizedDir]: mapped }));
    } catch {
      setChildrenByDir((prev) => ({
        ...prev,
        [normalizedDir]: prev[normalizedDir] ?? [],
      }));
    } finally {
      inFlightDirsRef.current = new Set(inFlightDirsRef.current);
      inFlightDirsRef.current.delete(normalizedDir);
    }
  }, [files, mapDirectoryEntries, runtime.isDesktop, showGitignored]);

  const refreshRoot = React.useCallback(async () => {
    if (!root) {
      return;
    }

    loadedDirsRef.current = new Set();
    inFlightDirsRef.current = new Set();
    setChildrenByDir((prev) => (Object.keys(prev).length === 0 ? prev : {}));

    await loadDirectory(root);
  }, [loadDirectory, root]);

  React.useEffect(() => {
    if (!root) {
      return;
    }

    loadedDirsRef.current = new Set();
    inFlightDirsRef.current = new Set();
    setChildrenByDir((prev) => (Object.keys(prev).length === 0 ? prev : {}));
    void loadDirectory(root);
  }, [loadDirectory, root, showHidden, showGitignored]);

  React.useEffect(() => {
    if (!currentDirectory) {
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

    searchFiles(currentDirectory, trimmedQuery, 150, {
      includeHidden: showHidden,
      respectGitignore: !showGitignored,
    })
      .then((hits) => {
        if (cancelled) {
          return;
        }

        const mapped: FileNode[] = hits
          .filter((hit) => showGitignored || !shouldIgnorePath(hit.path))
          .map((hit) => ({
            name: hit.name,
            path: normalizePath(hit.path),
            type: 'file',
            extension: hit.extension,
            relativePath: hit.relativePath,
          }));

        setSearchResults(mapped);
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
  }, [currentDirectory, debouncedSearchQuery, searchFiles, showHidden, showGitignored]);

  const handleOpenFile = React.useCallback((node: FileNode) => {
    if (!root) {
      return;
    }

    setSelectedPath(root, node.path);
    addOpenPath(root, node.path);
    openContextFile(root, node.path);
  }, [addOpenPath, openContextFile, root, setSelectedPath]);

  const toggleDirectory = React.useCallback(async (dirPath: string) => {
    const normalized = normalizePath(dirPath);
    if (!root) {
      return;
    }

    toggleExpandedPath(root, normalized);
    if (!loadedDirsRef.current.has(normalized)) {
      await loadDirectory(normalized);
    }
  }, [loadDirectory, root, toggleExpandedPath]);

  const renderTree = React.useCallback((dirPath: string, depth: number): React.ReactNode => {
    const nodes = childrenByDir[dirPath] ?? [];

    return nodes.map((node) => {
      const isDir = node.type === 'directory';
      const isExpanded = isDir && expandedPaths.includes(node.path);
      const isActive = selectedPath === node.path;
      const isLoading = isDir && inFlightDirsRef.current.has(node.path);

      return (
        <li key={node.path} className="relative">
          <button
            type="button"
            onClick={() => (isDir ? void toggleDirectory(node.path) : handleOpenFile(node))}
            className={cn(
              'flex w-full items-center gap-1 rounded-md px-2 py-1 text-left typography-meta transition-colors',
              isActive ? 'bg-interactive-selection text-interactive-selection-foreground' : 'text-foreground hover:bg-interactive-hover/40'
            )}
            style={{ paddingLeft: `${8 + depth * 12}px` }}
            title={node.path}
          >
            {isDir ? (
              isLoading ? (
                <RiLoader4Line className="h-4 w-4 flex-shrink-0 animate-spin" />
              ) : isExpanded ? (
                <RiArrowDownSLine className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
              ) : (
                <RiArrowRightSLine className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
              )
            ) : (
              <span className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
            )}
            {isDir ? (
              isExpanded ? <RiFolderOpenFill className="h-4 w-4 flex-shrink-0 text-primary/60" /> : <RiFolder3Fill className="h-4 w-4 flex-shrink-0 text-primary/60" />
            ) : (
              <RiFile3Line className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
            )}
            <span className="min-w-0 flex-1 truncate">{node.name}</span>
          </button>
          {isDir && isExpanded && (
            <ul className="flex flex-col">{renderTree(node.path, depth + 1)}</ul>
          )}
        </li>
      );
    });
  }, [childrenByDir, expandedPaths, handleOpenFile, selectedPath, toggleDirectory]);

  const hasTree = Boolean(root && childrenByDir[root]);

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden bg-sidebar">
      <div className="flex items-center gap-2 border-b border-border/40 px-3 py-2">
        <div className="relative min-w-0 flex-1">
          <RiSearchLine className="pointer-events-none absolute left-2 top-2 h-4 w-4 text-muted-foreground" />
          <Input
            ref={searchInputRef}
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search files..."
            className="h-8 pl-8 pr-8 typography-meta"
          />
          {searchQuery.trim().length > 0 ? (
            <button
              type="button"
              aria-label="Clear search"
              className="absolute right-2 top-2 inline-flex h-4 w-4 items-center justify-center text-muted-foreground hover:text-foreground"
              onClick={() => {
                setSearchQuery('');
                searchInputRef.current?.focus();
              }}
            >
              <RiCloseLine className="h-4 w-4" />
            </button>
          ) : null}
        </div>
        <Button variant="ghost" size="sm" onClick={() => void refreshRoot()} className="h-8 w-8 p-0" title="Refresh">
          <RiRefreshLine className="h-4 w-4" />
        </Button>
      </div>

      <ScrollableOverlay outerClassName="flex-1 min-h-0" className="p-2">
        <ul className="flex flex-col gap-0.5">
          {searching ? (
            <li className="flex items-center gap-2 px-2 py-1 typography-meta text-muted-foreground">
              <RiLoader4Line className="h-4 w-4 animate-spin" />
              Searching...
            </li>
          ) : searchResults.length > 0 ? (
            searchResults.map((node) => {
              const isActive = selectedPath === node.path;
              return (
                <li key={node.path}>
                  <button
                    type="button"
                    onClick={() => handleOpenFile(node)}
                    className={cn(
                      'flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left typography-meta transition-colors',
                      isActive ? 'bg-interactive-selection text-interactive-selection-foreground' : 'text-foreground hover:bg-interactive-hover/40'
                    )}
                    title={node.path}
                  >
                    <RiFile3Line className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate" style={{ direction: 'rtl', textAlign: 'left' }}>
                      {node.relativePath ?? node.path}
                    </span>
                  </button>
                </li>
              );
            })
          ) : hasTree && root ? (
            renderTree(root, 0)
          ) : (
            <li className="px-2 py-1 typography-meta text-muted-foreground">Loading...</li>
          )}
        </ul>
      </ScrollableOverlay>
    </section>
  );
};
