import React from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import createElement from 'react-syntax-highlighter/create-element';
import {
  RiArrowLeftSLine,
  RiClipboardLine,
  RiCloseLine,
  RiCodeLine,
  RiFileImageLine,
  RiFileTextLine,
  RiFolder3Fill,
  RiFolderOpenFill,
  RiLoader4Line,
  RiRefreshLine,
  RiSearchLine,
  RiTextWrap,
} from '@remixicon/react';
import { toast } from 'sonner';

import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useFileSearchStore } from '@/stores/useFileSearchStore';
import { useDeviceInfo } from '@/lib/device';
import { cn } from '@/lib/utils';
import { getLanguageFromExtension, getImageMimeType, isImageFile } from '@/lib/toolHelpers';
import { useRuntimeAPIs } from '@/hooks/useRuntimeAPIs';
import { useThemeSystem } from '@/contexts/useThemeSystem';
import { generateSyntaxTheme } from '@/lib/theme/syntaxThemeGenerator';
import { useSessionStore } from '@/stores/useSessionStore';
import { useDirectoryStore } from '@/stores/useDirectoryStore';
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

const normalizePath = (value: string): string => value.replace(/\\/g, '/');

const DEFAULT_IGNORED_DIR_NAMES = new Set(['node_modules']);

const shouldIgnoreEntryName = (name: string): boolean => DEFAULT_IGNORED_DIR_NAMES.has(name);

const shouldIgnorePath = (path: string): boolean => {
  const normalized = normalizePath(path);
  return normalized === 'node_modules' || normalized.endsWith('/node_modules') || normalized.includes('/node_modules/');
};

const useEffectiveDirectory = () => {
  const { currentSessionId, sessions, worktreeMetadata: worktreeMap } = useSessionStore();
  const { currentDirectory: fallbackDirectory } = useDirectoryStore();

  const worktreeMetadata = currentSessionId ? worktreeMap.get(currentSessionId) ?? undefined : undefined;
  const currentSession = sessions.find((session) => session.id === currentSessionId);
  type SessionWithDirectory = { directory?: string };
  const sessionDirectory = (currentSession as unknown as SessionWithDirectory | undefined)?.directory;

  return worktreeMetadata?.path ?? sessionDirectory ?? fallbackDirectory ?? '';
};

const MAX_HIGHLIGHT_CHARS = 200_000;
const MAX_VIEW_CHARS = 200_000;

const CODE_EXTENSIONS = new Set([
  // JavaScript/TypeScript
  'js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs', 'mts', 'cts',
  // Web
  'html', 'htm', 'xhtml', 'css', 'scss', 'sass', 'less', 'styl', 'stylus',
  'vue', 'svelte', 'astro',
  // Shell/Scripts
  'sh', 'bash', 'zsh', 'fish', 'ps1', 'psm1', 'bat', 'cmd',
  // Python
  'py', 'pyw', 'pyx', 'pxd', 'pxi',
  // Ruby
  'rb', 'erb', 'rake', 'gemspec',
  // PHP
  'php', 'phtml', 'php3', 'php4', 'php5', 'phps',
  // Java/JVM
  'java', 'kt', 'kts', 'scala', 'sc', 'groovy', 'gradle',
  // C/C++/Objective-C
  'c', 'h', 'cpp', 'cc', 'cxx', 'hpp', 'hxx', 'hh', 'm', 'mm',
  // C#/F#/.NET
  'cs', 'fs', 'fsx', 'fsi',
  // Go
  'go',
  // Rust
  'rs',
  // Swift
  'swift',
  // Dart
  'dart',
  // Lua
  'lua',
  // Perl
  'pl', 'pm', 'pod',
  // R
  'r', 'R', 'rmd',
  // Julia
  'jl',
  // Haskell
  'hs', 'lhs',
  // Elixir/Erlang
  'ex', 'exs', 'erl', 'hrl',
  // Clojure
  'clj', 'cljs', 'cljc', 'edn',
  // Lisp/Scheme
  'lisp', 'cl', 'el', 'scm', 'ss', 'rkt',
  // OCaml/ReasonML
  'ml', 'mli', 're', 'rei',
  // Nim
  'nim',
  // Zig
  'zig',
  // V
  'v',
  // Crystal
  'cr',
  // Kotlin Script
  'main.kts',
  // SQL
  'sql', 'psql', 'plsql',
  // GraphQL
  'graphql', 'gql',
  // Solidity
  'sol',
  // Assembly
  'asm', 's', 'S',
  // Makefile variants
  'mk',
  // Nix
  'nix',
  // Terraform
  'tf', 'tfvars',
  // Puppet
  'pp',
  // Ansible
  'ansible',
]);

const DATA_EXTENSIONS = new Set([
  // JSON variants
  'json', 'jsonc', 'json5', 'jsonl', 'ndjson', 'geojson',
  // YAML
  'yaml', 'yml',
  // TOML
  'toml',
  // XML variants
  'xml', 'xsl', 'xslt', 'xsd', 'dtd', 'plist',
  // Config files
  'ini', 'cfg', 'conf', 'config', 'env', 'properties',
  // CSV/TSV
  'csv', 'tsv',
  // Lock files
  'lock',
]);

const IMAGE_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'icns',
  'bmp', 'tiff', 'tif', 'psd', 'ai', 'eps', 'raw', 'cr2', 'nef',
  'heic', 'heif', 'avif', 'jxl',
]);

const DOCUMENT_EXTENSIONS = new Set([
  // Markdown
  'md', 'mdx', 'markdown', 'mdown', 'mkd',
  // Text
  'txt', 'text', 'rtf',
  // Docs
  'doc', 'docx', 'odt', 'pdf',
  // ReStructuredText
  'rst',
  // AsciiDoc
  'adoc', 'asciidoc',
  // Org
  'org',
  // LaTeX
  'tex', 'latex', 'bib',
]);

const getFileIcon = (extension?: string): React.ReactNode => {
  const ext = extension?.toLowerCase();
  
  if (ext && CODE_EXTENSIONS.has(ext)) {
    return <RiCodeLine className="h-4 w-4 flex-shrink-0 text-blue-500" />;
  }
  if (ext && DATA_EXTENSIONS.has(ext)) {
    return <RiCodeLine className="h-4 w-4 flex-shrink-0 text-yellow-500" />;
  }
  if (ext && IMAGE_EXTENSIONS.has(ext)) {
    return <RiFileImageLine className="h-4 w-4 flex-shrink-0 text-green-500" />;
  }
  if (ext && DOCUMENT_EXTENSIONS.has(ext)) {
    return <RiFileTextLine className="h-4 w-4 flex-shrink-0 text-muted-foreground" />;
  }
  return <RiFileTextLine className="h-4 w-4 flex-shrink-0 text-muted-foreground" />;
};

export const FilesView: React.FC = () => {
  const { files, runtime } = useRuntimeAPIs();
  const { currentTheme } = useThemeSystem();
  const syntaxTheme = React.useMemo(() => generateSyntaxTheme(currentTheme), [currentTheme]);
  const { isMobile } = useDeviceInfo();

  const currentDirectory = useEffectiveDirectory();
  const root = normalizePath(currentDirectory);
  const searchFiles = useFileSearchStore((state) => state.searchFiles);

  const [searchQuery, setSearchQuery] = React.useState('');
  const debouncedSearchQuery = useDebouncedValue(searchQuery, 200);
  const searchInputRef = React.useRef<HTMLInputElement>(null);

  const [showMobilePageContent, setShowMobilePageContent] = React.useState(false);
  const [wrapLines, setWrapLines] = React.useState(isMobile);

  const [expandedDirs, setExpandedDirs] = React.useState<Set<string>>(new Set());
  const [childrenByDir, setChildrenByDir] = React.useState<Record<string, FileNode[]>>({});
  const loadedDirsRef = React.useRef<Set<string>>(new Set());
  const inFlightDirsRef = React.useRef<Set<string>>(new Set());

  const [searchResults, setSearchResults] = React.useState<FileNode[]>([]);
  const [searching, setSearching] = React.useState(false);

  const [selectedFile, setSelectedFile] = React.useState<FileNode | null>(null);
  const [fileContent, setFileContent] = React.useState<string>('');
  const [fileLoading, setFileLoading] = React.useState(false);
  const [fileError, setFileError] = React.useState<string | null>(null);
  const [desktopImageSrc, setDesktopImageSrc] = React.useState<string>('');

  const mapDirectoryEntries = React.useCallback((dirPath: string, entries: Array<{ name: string; path: string; isDirectory: boolean }>): FileNode[] => {
    const nodes = entries
      .filter((entry) => entry && typeof entry.name === 'string' && entry.name.length > 0)
      .filter((entry) => !entry.name.startsWith('.'))
      .filter((entry) => !shouldIgnoreEntryName(entry.name))
      .map<FileNode>((entry) => {
        const name = entry.name;
        const path = normalizePath(entry.path || `${dirPath}/${name}`);
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
  }, []);

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
      // Use gitignore filtering for both desktop and web
      let entries: Array<{ name: string; path: string; isDirectory: boolean }>;
      if (runtime.isDesktop) {
        const result = await files.listDirectory(normalizedDir, { respectGitignore: true });
        entries = result.entries.map((entry) => ({
          name: entry.name,
          path: entry.path,
          isDirectory: entry.isDirectory,
        }));
      } else {
        const result = await opencodeClient.listLocalDirectory(normalizedDir, { respectGitignore: true });
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
  }, [files, mapDirectoryEntries, runtime.isDesktop]);

  const refreshRoot = React.useCallback(async () => {
    const normalizedRoot = normalizePath(currentDirectory.trim());
    if (!normalizedRoot) {
      return;
    }

    loadedDirsRef.current = new Set();
    inFlightDirsRef.current = new Set();
    setExpandedDirs(new Set());
    setChildrenByDir({});

    await loadDirectory(normalizedRoot);
  }, [currentDirectory, loadDirectory]);



  React.useEffect(() => {
    if (!currentDirectory) {
      return;
    }

    void refreshRoot();
    setSelectedFile(null);
    setFileContent('');
    setFileError(null);
    setDesktopImageSrc('');
    setShowMobilePageContent(false);
  }, [currentDirectory, refreshRoot]);

  const fuzzyScore = React.useCallback((query: string, candidate: string): number | null => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return 0;
    }

    const c = candidate.toLowerCase();
    let score = 0;
    let lastIndex = -1;
    let consecutive = 0;

    for (let i = 0; i < q.length; i += 1) {
      const ch = q[i];
      if (!ch || ch === ' ') {
        continue;
      }

      const idx = c.indexOf(ch, lastIndex + 1);
      if (idx === -1) {
        return null;
      }

      const gap = idx - lastIndex - 1;
      if (gap === 0) {
        consecutive += 1;
      } else {
        consecutive = 0;
      }

      score += 10;
      score += Math.max(0, 18 - idx);
      score -= Math.max(0, gap);

      if (idx === 0) {
        score += 12;
      } else {
        const prev = c[idx - 1];
        if (prev === '/' || prev === '_' || prev === '-' || prev === '.' || prev === ' ') {
          score += 10;
        }
      }

      score += consecutive > 0 ? 12 : 0;
      lastIndex = idx;
    }

    score += Math.max(0, 24 - Math.round(c.length / 3));
    return score;
  }, []);

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

    const normalizedQueryLower = trimmedQuery.toLowerCase();
    let cancelled = false;
    setSearching(true);

    searchFiles(currentDirectory, trimmedQuery, 150)
      .then((hits) => {
        if (cancelled) {
          return;
        }

        const filtered = hits.filter((hit) => !shouldIgnorePath(hit.path));

        // Apply fuzzy scoring and sort by score
        const ranked = filtered
          .map((hit) => {
            const label = hit.relativePath || hit.name || hit.path;
            const score = fuzzyScore(normalizedQueryLower, label);
            return score === null ? null : { hit, score, labelLength: label.length };
          })
          .filter(Boolean) as Array<{ hit: typeof hits[0]; score: number; labelLength: number }>;

        ranked.sort((a, b) => (
          b.score - a.score
          || a.labelLength - b.labelLength
          || a.hit.path.localeCompare(b.hit.path)
        ));

        const mapped: FileNode[] = ranked.map(({ hit }) => ({
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
  }, [currentDirectory, debouncedSearchQuery, fuzzyScore, searchFiles]);

  const readFile = React.useCallback(async (path: string): Promise<string> => {
    if (files.readFile) {
      const result = await files.readFile(path);
      return result.content ?? '';
    }

    const response = await fetch(`/api/fs/read?path=${encodeURIComponent(path)}`);
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error((error as { error?: string }).error || 'Failed to read file');
    }
    return response.text();
  }, [files]);

  const handleSelectFile = React.useCallback(async (node: FileNode) => {
    setSelectedFile(node);
    setFileError(null);
    setDesktopImageSrc('');

    const selectedIsImage = isImageFile(node.path);

    if (isMobile) {
      setShowMobilePageContent(true);
    }

    const isSvg = node.path.toLowerCase().endsWith('.svg');

    // Desktop: binary images are loaded via readFileBinary (data URL).
    if (runtime.isDesktop && selectedIsImage && !isSvg) {
      setFileContent('');
      setFileLoading(true);
      return;
    }

    // Web: binary images should not be read as utf8.
    if (!runtime.isDesktop && selectedIsImage && !isSvg) {
      setFileContent('');
      setFileLoading(false);
      return;
    }

    setFileLoading(true);

    try {
      const content = await readFile(node.path);
      setFileContent(content);
    } catch (error) {
      setFileContent('');
      setFileError(error instanceof Error ? error.message : 'Failed to read file');
    } finally {
      setFileLoading(false);
    }
  }, [isMobile, readFile, runtime.isDesktop]);

  const toggleDirectory = React.useCallback(async (dirPath: string) => {
    const normalized = normalizePath(dirPath);
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(normalized)) {
        next.delete(normalized);
      } else {
        next.add(normalized);
      }
      return next;
    });

    if (!loadedDirsRef.current.has(normalized)) {
      await loadDirectory(normalized);
    }
  }, [loadDirectory]);

  const renderTree = React.useCallback((dirPath: string, depth: number): React.ReactNode => {
    const nodes = childrenByDir[dirPath] ?? [];

    return nodes.map((node) => {
      const isDir = node.type === 'directory';
      const isExpanded = isDir && expandedDirs.has(node.path);
      const isActive = selectedFile?.path === node.path;
      const isLoading = isDir && inFlightDirsRef.current.has(node.path);

      return (
        <li key={node.path}>
          <button
            type="button"
            onClick={() => {
              if (isDir) {
                void toggleDirectory(node.path);
              } else {
                void handleSelectFile(node);
              }
            }}
            className={cn(
              'flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-foreground transition-colors',
              isActive ? 'bg-accent/70' : 'hover:bg-accent/40'
            )}
            style={{ paddingLeft: `${8 + depth * 12}px` }}
          >
            {isDir ? (
              isLoading ? (
                <RiLoader4Line className="h-4 w-4 flex-shrink-0 animate-spin" />
              ) : isExpanded ? (
                <RiFolderOpenFill className="h-4 w-4 flex-shrink-0 text-primary/60" />
              ) : (
                <RiFolder3Fill className="h-4 w-4 flex-shrink-0 text-primary/60" />
              )
            ) : (
              getFileIcon(node.extension)
            )}
            <span
              className="min-w-0 flex-1 truncate typography-meta"
              title={node.path}
            >
              {node.name}
            </span>
          </button>
          {isDir && isExpanded && (
            <ul className="flex flex-col gap-1">
              {renderTree(node.path, depth + 1)}
            </ul>
          )}
        </li>
      );
    });
  }, [childrenByDir, expandedDirs, handleSelectFile, selectedFile?.path, toggleDirectory]);

  const viewerLanguage = selectedFile?.path ? getLanguageFromExtension(selectedFile.path) || 'text' : 'text';
  const contentForViewer = fileContent.length > MAX_VIEW_CHARS
    ? `${fileContent.slice(0, MAX_VIEW_CHARS)}\n\n… truncated …`
    : fileContent;
  const shouldHighlight = contentForViewer.length <= MAX_HIGHLIGHT_CHARS;
  const isSelectedImage = Boolean(selectedFile?.path && isImageFile(selectedFile.path));
  const isSelectedSvg = Boolean(selectedFile?.path && selectedFile.path.toLowerCase().endsWith('.svg'));
  const displaySelectedPath = React.useMemo(() => {
    if (!selectedFile?.path) return '';
    const normalizedFilePath = normalizePath(selectedFile.path);
    if (root && normalizedFilePath.startsWith(root)) {
      const relative = normalizedFilePath.slice(root.length);
      return relative.startsWith('/') ? relative.slice(1) : relative;
    }
    return normalizedFilePath;
  }, [selectedFile?.path, root]);



  const canCopy = Boolean(selectedFile && (!isSelectedImage || isSelectedSvg) && fileContent.length > 0);

  const imageSrc = selectedFile?.path && isSelectedImage
    ? (runtime.isDesktop
      ? (isSelectedSvg
        ? `data:${getImageMimeType(selectedFile.path)};utf8,${encodeURIComponent(fileContent)}`
        : desktopImageSrc)
      : (isSelectedSvg
        ? `data:${getImageMimeType(selectedFile.path)};utf8,${encodeURIComponent(fileContent)}`
        : `/api/fs/raw?path=${encodeURIComponent(selectedFile.path)}`))
    : '';

  const codeRenderer = React.useCallback(({
    rows,
    stylesheet,
    useInlineStyles,
  }: {
    rows: unknown[];
    stylesheet: unknown;
    useInlineStyles: boolean;
  }) => {
    const gutterWidthCh = Math.max(3, String(rows.length).length + 1);

    return (
      <div>
        {rows.map((row, index) => (
          <div
            key={index}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              lineHeight: '1.5rem',
            }}
          >
            <span
              style={{
                width: `${gutterWidthCh}ch`,
                flexShrink: 0,
                paddingRight: '1.75ch',
                textAlign: 'right',
                color: 'hsl(var(--muted-foreground))',
                opacity: 0.35,
                fontSize: '0.8em',
                lineHeight: '1.5rem',
                 pointerEvents: 'none',
                 userSelect: 'none',
                 WebkitUserSelect: 'none',
                 MozUserSelect: 'none',
                 msUserSelect: 'none',
              }}
            >
              {index + 1}
            </span>
            <code
              style={{
                flex: 1,
                minWidth: 0,
                display: 'block',
                whiteSpace: wrapLines ? 'pre-wrap' : 'pre',
                overflowWrap: wrapLines ? 'break-word' : 'normal',
                tabSize: 2,
              }}
            >
              {createElement({ node: row, stylesheet, useInlineStyles, key: index })}
            </code>
          </div>
        ))}
      </div>
    );
  }, [wrapLines]);


  React.useEffect(() => {
    let cancelled = false;

    const resolveDesktopImage = async () => {
      if (!runtime.isDesktop || !selectedFile?.path || !isSelectedImage || isSelectedSvg) {
        setDesktopImageSrc('');
        return;
      }

      setFileError(null);

      try {
        if (files.readFileBinary) {
          const result = await files.readFileBinary(selectedFile.path);
          if (!cancelled) {
            setDesktopImageSrc(result.dataUrl);
          }
          return;
        }

        const core = await import('@tauri-apps/api/core');
        const convertFileSrc = (core as { convertFileSrc?: (path: string, protocol?: string) => string }).convertFileSrc;
        if (!convertFileSrc) {
          return;
        }

        const src = convertFileSrc(selectedFile.path, 'asset');
        if (!cancelled) {
          setDesktopImageSrc(src);
        }
      } catch (error) {
        if (!cancelled) {
          setDesktopImageSrc('');
          setFileError(error instanceof Error ? error.message : 'Failed to read file');
        }
      } finally {
        if (!cancelled) {
          setFileLoading(false);
        }
      }
    };

    void resolveDesktopImage();

    return () => {
      cancelled = true;
    };
  }, [files, isSelectedImage, isSelectedSvg, runtime.isDesktop, selectedFile?.path]);

  const fileViewer = (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border/40 px-3 py-1.5">
        {isMobile && showMobilePageContent && (
          <button
            type="button"
            onClick={() => setShowMobilePageContent(false)}
            aria-label="Back"
            className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center p-2 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <RiArrowLeftSLine className="h-5 w-5" />
          </button>
        )}

        <div className="min-w-0 flex-1">
          <div className="typography-ui-label font-medium truncate">
            {selectedFile ? selectedFile.name : 'Select a file'}
          </div>
          {selectedFile && !isMobile && (
            <div className="typography-meta text-muted-foreground truncate" title={displaySelectedPath}>
              {displaySelectedPath}
            </div>
          )}
        </div>

        <div className="flex items-center gap-0">
          {selectedFile && !isSelectedImage && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setWrapLines(!wrapLines)}
              className={cn(
                'h-5 w-5 p-0 transition-opacity',
                wrapLines ? 'text-foreground opacity-100' : 'text-muted-foreground opacity-60 hover:opacity-100'
              )}
              title={wrapLines ? 'Disable line wrap' : 'Enable line wrap'}
            >
              <RiTextWrap className="size-4" />
            </Button>
          )}

          {canCopy && (
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(fileContent);
                  toast.success('Copied');
                } catch {
                  toast.error('Copy failed');
                }
              }}
              className="gap-1"
            >
              <RiClipboardLine className="h-4 w-4" />
              Copy
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <ScrollableOverlay outerClassName="h-full" className="h-full">
          {!selectedFile ? (
            <div className="p-3 typography-ui text-muted-foreground">Pick a file from the tree.</div>
          ) : fileLoading ? (
            <div className="p-3 flex items-center gap-2 typography-ui text-muted-foreground">
              <RiLoader4Line className="h-4 w-4 animate-spin" />
              Loading…
            </div>
          ) : fileError ? (
            <div className="p-3 typography-ui text-[color:var(--status-error)]">{fileError}</div>
          ) : isSelectedImage ? (
            <div className="flex h-full items-center justify-center p-3">
              <img
                src={imageSrc}
                alt={selectedFile?.name ?? 'Image'}
                className="max-w-full max-h-[70vh] object-contain rounded-md border border-border/30 bg-primary/10"
              />
            </div>
          ) : (
            <div className="p-3">
              <SyntaxHighlighter
                language={shouldHighlight ? viewerLanguage : 'text'}
                style={syntaxTheme}
                PreTag="div"
                renderer={codeRenderer}
                customStyle={{
                  margin: 0,
                  padding: 0,
                  background: 'transparent',
                  fontSize: 'var(--text-code)',
                  lineHeight: '1.5rem',
                  overflowX: 'auto',
                  overflowY: 'visible',
                  whiteSpace: 'normal',
                }}
                codeTagProps={{
                  style: {
                    fontStyle: 'normal',
                    lineHeight: '1.5rem',
                  },
                }}
              >
                {contentForViewer}
              </SyntaxHighlighter>
            </div>
          )}
        </ScrollableOverlay>
      </div>
    </div>
  );

  const hasTree = Boolean(root && childrenByDir[root]);

  const treePanel = (
    <section className={cn(
      "flex min-h-0 flex-col overflow-hidden",
      isMobile ? "h-full w-full bg-background" : "h-full rounded-xl border border-border/60 bg-background/70"
    )}>
      <div className={cn("flex items-center gap-2 py-2", isMobile ? "px-3" : "px-2")}>
        <div className="relative flex-1 min-w-0">
          <RiSearchLine className="pointer-events-none absolute left-2 top-2 h-4 w-4 text-muted-foreground" />
          <Input
            ref={searchInputRef}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search files…"
            className="h-8 pl-8 pr-8 typography-meta"
          />
          {searchQuery.trim().length > 0 && (
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
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={() => void refreshRoot()} className="h-8 w-8 p-0 flex-shrink-0">
          <RiRefreshLine className="h-4 w-4" />
        </Button>
      </div>

      <ScrollableOverlay outerClassName="flex-1 min-h-0" className={cn("py-2", isMobile ? "px-3" : "px-2")}>
        <ul className="flex flex-col">
          {searching ? (
            <li className="flex items-center gap-1.5 px-2 py-1 typography-meta text-muted-foreground">
              <RiLoader4Line className="h-4 w-4 animate-spin" />
              Searching…
            </li>
          ) : searchResults.length > 0 ? (
            searchResults.map((node) => {
              const isActive = selectedFile?.path === node.path;
              return (
                <li key={node.path}>
                  <button
                    type="button"
                    onClick={() => void handleSelectFile(node)}
                    className={cn(
                      'flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-foreground transition-colors',
                      isActive ? 'bg-accent/70' : 'hover:bg-accent/40'
                    )}
                  >
                    {getFileIcon(node.extension)}
                    <span
                      className="min-w-0 flex-1 truncate typography-meta"
                      style={{ direction: 'rtl', textAlign: 'left' }}
                      title={node.path}
                    >
                      {node.relativePath ?? node.path}
                    </span>
                  </button>
                </li>
              );
            })
          ) : hasTree ? (
            renderTree(root, 0)
          ) : (
            <li className="px-2 py-1 typography-meta text-muted-foreground">Loading…</li>
          )}
        </ul>
      </ScrollableOverlay>
    </section>
  );

  return (
    <div className="flex h-full min-h-0 overflow-hidden bg-background">
      {isMobile ? (
        showMobilePageContent ? (
          fileViewer
        ) : (
          treePanel
        )
      ) : (
        <div className="flex flex-1 min-h-0 min-w-0 gap-3 px-3 pb-3 pt-2">
          <div className="w-72 flex-shrink-0 min-h-0 overflow-hidden">
            {treePanel}
          </div>
          <div className="flex-1 min-h-0 min-w-0 overflow-hidden rounded-xl border border-border/60 bg-background">
            {fileViewer}
          </div>
        </div>
      )}
    </div>
  );
};
