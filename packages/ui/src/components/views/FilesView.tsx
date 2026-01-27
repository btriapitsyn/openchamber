import React from 'react';

import {
  RiArrowLeftSLine,
  RiClipboardLine,
  RiCloseLine,
  RiCodeLine,
  RiFileImageLine,
  RiFileTextLine,
  RiFileCopy2Line,
  RiCheckLine,
  RiFolder3Fill,
  RiFolderOpenFill,
  RiLoader4Line,
  RiRefreshLine,
  RiSearchLine,
  RiSave3Line,
  RiSendPlane2Line,
  RiTextWrap,
  RiMore2Fill,
  RiFileAddLine,
  RiFolderAddLine,
  RiDeleteBinLine,
  RiEditLine,
  RiFileCopyLine,
} from '@remixicon/react';
import { toast } from '@/components/ui';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { CodeMirrorEditor } from '@/components/ui/CodeMirrorEditor';
import { PreviewToggleButton } from './PreviewToggleButton';
import { SimpleMarkdownRenderer } from '@/components/chat/MarkdownRenderer';
import { languageByExtension } from '@/lib/codemirror/languageByExtension';
import { createFlexokiCodeMirrorTheme } from '@/lib/codemirror/flexokiTheme';
import { generateSyntaxTheme } from '@/lib/theme/syntaxThemeGenerator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useFileSearchStore } from '@/stores/useFileSearchStore';
import { useDeviceInfo } from '@/lib/device';
import { cn, getModifierLabel, hasModifier } from '@/lib/utils';
import { getLanguageFromExtension, getImageMimeType, isImageFile } from '@/lib/toolHelpers';
import { useRuntimeAPIs } from '@/hooks/useRuntimeAPIs';
import { EditorView } from '@codemirror/view';
import { useThemeSystem } from '@/contexts/useThemeSystem';
import { useSessionStore } from '@/stores/useSessionStore';
import { useConfigStore } from '@/stores/useConfigStore';
import { useContextStore } from '@/stores/contextStore';
import { useUIStore } from '@/stores/useUIStore';
import { opencodeClient } from '@/lib/opencode/client';
import { useDirectoryShowHidden } from '@/lib/directoryShowHidden';
import { useFilesViewShowGitignored } from '@/lib/filesViewShowGitignored';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { useEffectiveDirectory } from '@/hooks/useEffectiveDirectory';

type FileNode = {
  name: string;
  path: string;
  type: 'file' | 'directory';
  extension?: string;
  relativePath?: string;
};

type SelectedLineRange = {
  start: number;
  end: number;
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

const isMarkdownFile = (path: string): boolean => {
  if (!path) return false;
  const ext = path.toLowerCase().split('.').pop();
  return ext === 'md' || ext === 'markdown';
};

export const FilesView: React.FC = () => {
  const { files, runtime } = useRuntimeAPIs();
  const { currentTheme } = useThemeSystem();
  React.useMemo(() => generateSyntaxTheme(currentTheme), [currentTheme]);
  const { isMobile, screenWidth } = useDeviceInfo();
  const showHidden = useDirectoryShowHidden();
  const showGitignored = useFilesViewShowGitignored();

  const currentDirectory = useEffectiveDirectory() ?? '';
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

  const [draftContent, setDraftContent] = React.useState('');
  const [isSaving, setIsSaving] = React.useState(false);

  const [confirmDiscardOpen, setConfirmDiscardOpen] = React.useState(false);
  const pendingSelectFileRef = React.useRef<FileNode | null>(null);
  const pendingTabRef = React.useRef<import('@/stores/useUIStore').MainTab | null>(null);
  const skipDirtyOnceRef = React.useRef(false);
  const copiedContentTimeoutRef = React.useRef<number | null>(null);
  const copiedPathTimeoutRef = React.useRef<number | null>(null);

  const [activeDialog, setActiveDialog] = React.useState<'createFile' | 'createFolder' | 'rename' | 'delete' | null>(null);
  const [dialogData, setDialogData] = React.useState<{ path: string; name?: string; type?: 'file' | 'directory' } | null>(null);
  const [dialogInputValue, setDialogInputValue] = React.useState('');
  const [isDialogSubmitting, setIsDialogSubmitting] = React.useState(false);
  const [contextMenuPath, setContextMenuPath] = React.useState<string | null>(null);
  const [copiedContent, setCopiedContent] = React.useState(false);
  const [copiedPath, setCopiedPath] = React.useState(false);

  // Markdown view mode (global, not per-file)
  const [mdViewMode, setMdViewMode] = React.useState<'preview' | 'edit'>('edit');

  const canCreateFile = Boolean(files.writeFile);
  const canCreateFolder = Boolean(files.createDirectory);
  const canRename = Boolean(files.rename);
  const canDelete = Boolean(files.delete);

  const handleOpenDialog = React.useCallback((type: 'createFile' | 'createFolder' | 'rename' | 'delete', data: { path: string; name?: string; type?: 'file' | 'directory' }) => {
    setActiveDialog(type);
    setDialogData(data);
    setDialogInputValue(type === 'rename' ? data.name || '' : '');
    setIsDialogSubmitting(false);
  }, []);

  // Line selection state for commenting
  const [lineSelection, setLineSelection] = React.useState<SelectedLineRange | null>(null);
  const [commentText, setCommentText] = React.useState('');
  const isSelectingRef = React.useRef(false);
  const selectionStartRef = React.useRef<number | null>(null);

  // Session/config for sending comments
  const sendMessage = useSessionStore((state) => state.sendMessage);
  const currentSessionId = useSessionStore((state) => state.currentSessionId);
  const { currentProviderId, currentModelId, currentAgentName, currentVariant } = useConfigStore();
  const getSessionAgentSelection = useContextStore((state) => state.getSessionAgentSelection);
  const getAgentModelForSession = useContextStore((state) => state.getAgentModelForSession);
  const getAgentModelVariantForSession = useContextStore((state) => state.getAgentModelVariantForSession);
  const setActiveMainTab = useUIStore((state) => state.setActiveMainTab);
  const setMainTabGuard = useUIStore((state) => state.setMainTabGuard);
  const { inputBarOffset, isKeyboardOpen } = useUIStore();


  // Global mouseup to end drag selection
  React.useEffect(() => {
    const handleGlobalMouseUp = () => {
      isSelectingRef.current = false;
      selectionStartRef.current = null;
    };
    document.addEventListener('mouseup', handleGlobalMouseUp);
    return () => document.removeEventListener('mouseup', handleGlobalMouseUp);
  }, []);

  // Clear selection when file changes
  React.useEffect(() => {
    setLineSelection(null);
    setCommentText('');
    setMainTabGuard(null);
    setDraftContent('');
    setIsSaving(false);
  }, [selectedFile?.path, setMainTabGuard]);

  React.useEffect(() => {
    return () => {
      if (copiedContentTimeoutRef.current !== null) {
        window.clearTimeout(copiedContentTimeoutRef.current);
      }
      if (copiedPathTimeoutRef.current !== null) {
        window.clearTimeout(copiedPathTimeoutRef.current);
      }
    };
  }, []);

  // Click outside to dismiss selection
  React.useEffect(() => {
    if (!lineSelection) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      
      // Check if click is inside comment UI
      const commentUI = document.querySelector('[data-comment-ui]');
      if (commentUI?.contains(target)) return;
      
      // Check if click is on CM gutter (only gutter should not dismiss)
      if (target.closest('.cm-gutterElement')) return;

      // Check if click is inside toast (sonner)
      if (target.closest('[data-sonner-toast]') || target.closest('[data-sonner-toaster]')) return;

      // Clicking anywhere else (including code content) dismisses selection
      setLineSelection(null);
      setCommentText('');
    };

    const timeoutId = setTimeout(() => {
      document.addEventListener('click', handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('click', handleClickOutside);
    };
  }, [lineSelection]);

  // Extract selected code
  const extractSelectedCode = React.useCallback((content: string, range: SelectedLineRange): string => {
    const lines = content.split('\n');
    const startLine = Math.max(1, range.start);
    const endLine = Math.min(lines.length, range.end);
    if (startLine > endLine) return '';
    return lines.slice(startLine - 1, endLine).join('\n');
  }, []);

  // Send comment handler
  const handleSendComment = React.useCallback(async () => {
    if (!lineSelection || !commentText.trim() || !selectedFile) return;
    if (!currentSessionId) {
      toast.error('Select a session to send comment');
      return;
    }

    // Get session-specific agent/model/variant with fallback to config values
    const sessionAgent = getSessionAgentSelection(currentSessionId) || currentAgentName;
    const sessionModel = sessionAgent ? getAgentModelForSession(currentSessionId, sessionAgent) : null;
    const effectiveProviderId = sessionModel?.providerId || currentProviderId;
    const effectiveModelId = sessionModel?.modelId || currentModelId;

    if (!effectiveProviderId || !effectiveModelId) {
      toast.error('Select a model to send comment');
      return;
    }

    const effectiveVariant = sessionAgent && effectiveProviderId && effectiveModelId
      ? getAgentModelVariantForSession(currentSessionId, sessionAgent, effectiveProviderId, effectiveModelId) ?? currentVariant
      : currentVariant;

    const code = extractSelectedCode(fileContent, lineSelection);
    const language = getLanguageFromExtension(selectedFile.path) || 'text';
    const fileName = selectedFile.name;
    const startLine = lineSelection.start;
    const endLine = lineSelection.end;

    const message = `Comment on \`${fileName}\` lines ${startLine}-${endLine}:\n\`\`\`${language}\n${code}\n\`\`\`\n\n${commentText}`;

    // Clear state and switch to chat immediately
    setCommentText('');
    setLineSelection(null);
    setActiveMainTab('chat');

    void sendMessage(
      message,
      effectiveProviderId,
      effectiveModelId,
      sessionAgent,
      undefined,
      undefined,
      undefined,
      effectiveVariant
    ).catch((e) => {
      console.error('Failed to send comment', e);
    });
  }, [lineSelection, commentText, selectedFile, fileContent, currentSessionId, currentProviderId, currentModelId, currentAgentName, currentVariant, extractSelectedCode, sendMessage, setActiveMainTab, getSessionAgentSelection, getAgentModelForSession, getAgentModelVariantForSession]);

  const mapDirectoryEntries = React.useCallback((dirPath: string, entries: Array<{ name: string; path: string; isDirectory: boolean }>): FileNode[] => {
    const nodes = entries
      .filter((entry) => entry && typeof entry.name === 'string' && entry.name.length > 0)
      .filter((entry) => showHidden || !entry.name.startsWith('.'))
      .filter((entry) => showGitignored || !shouldIgnoreEntryName(entry.name))
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

  React.useEffect(() => {
    if (!currentDirectory) {
      return;
    }

    void refreshRoot();
  }, [currentDirectory, refreshRoot, showGitignored]);

  const MD_VIEWER_MODE_KEY = 'openchamber:files:md-viewer-mode';

  // Load markdown view mode preference from localStorage on mount
  React.useEffect(() => {
    try {
      const stored = localStorage.getItem(MD_VIEWER_MODE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed === 'preview' || parsed === 'edit') {
          setMdViewMode(parsed);
        }
      }
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  // Save markdown view mode preference to localStorage
  const saveMdViewMode = React.useCallback((mode: 'preview' | 'edit') => {
    setMdViewMode(mode);
    try {
      localStorage.setItem(MD_VIEWER_MODE_KEY, JSON.stringify(mode));
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  // Get the view mode for a markdown file (from state, default to 'edit')
  const getMdViewMode = React.useCallback((): 'preview' | 'edit' => {
    return mdViewMode;
  }, [mdViewMode]);

  const handleDialogSubmit = React.useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!dialogData || !activeDialog) return;

    setIsDialogSubmitting(true);
    try {
      if (activeDialog === 'createFile') {
        if (!dialogInputValue.trim()) throw new Error('Filename is required');
        const parentPath = dialogData.path;
        // Handle root path or empty path
        const prefix = parentPath ? `${parentPath}/` : '';
        const newPath = normalizePath(`${prefix}${dialogInputValue.trim()}`);

        if (!files.writeFile) throw new Error('Write not supported');
        const result = await files.writeFile(newPath, '');
        if (result.success) {
          toast.success('File created');
          await refreshRoot();
        }
      } else if (activeDialog === 'createFolder') {
        if (!dialogInputValue.trim()) throw new Error('Folder name is required');
        const parentPath = dialogData.path;
        const prefix = parentPath ? `${parentPath}/` : '';
        const newPath = normalizePath(`${prefix}${dialogInputValue.trim()}`);

        const result = await files.createDirectory(newPath);
        if (result.success) {
          toast.success('Folder created');
          await refreshRoot();
        }
      } else if (activeDialog === 'rename') {
        if (!dialogInputValue.trim()) throw new Error('Name is required');
        const oldPath = dialogData.path;
        const parentDir = oldPath.split('/').slice(0, -1).join('/');
        const prefix = parentDir ? `${parentDir}/` : '';
        const newPath = normalizePath(`${prefix}${dialogInputValue.trim()}`);

        if (files.rename) {
            const result = await files.rename(oldPath, newPath);
            if (result.success) {
                toast.success('Renamed successfully');
                await refreshRoot();
                if (selectedFile?.path === oldPath) {
                    setSelectedFile(null);
                }
            }
        } else {
            toast.error("Rename not supported");
        }
      } else if (activeDialog === 'delete') {
        if (files.delete) {
            const result = await files.delete(dialogData.path);
            if (result.success) {
                toast.success('Deleted successfully');
                await refreshRoot();
                if (selectedFile?.path === dialogData.path || selectedFile?.path.startsWith(dialogData.path + '/')) {
                    setSelectedFile(null);
                    setFileContent('');
                }
            }
        } else {
             toast.error("Delete not supported");
        }
      }
      setActiveDialog(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Operation failed');
    } finally {
      setIsDialogSubmitting(false);
    }
  }, [activeDialog, dialogData, dialogInputValue, files, refreshRoot, selectedFile]);

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
      return;
    }

    void refreshRoot();
  }, [currentDirectory, refreshRoot, showGitignored]);

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

    searchFiles(currentDirectory, trimmedQuery, 150, {
      includeHidden: showHidden,
      respectGitignore: !showGitignored,
    })
      .then((hits) => {
        if (cancelled) {
          return;
        }

        const filtered = hits.filter((hit) => showGitignored || !shouldIgnorePath(hit.path));

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
  }, [currentDirectory, debouncedSearchQuery, fuzzyScore, searchFiles, showHidden, showGitignored]);

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

  const displayedContent = React.useMemo(() => {
    return fileContent.length > MAX_VIEW_CHARS
      ? `${fileContent.slice(0, MAX_VIEW_CHARS)}\n\n… truncated …`
      : fileContent;
  }, [fileContent]);

  const isDirty = React.useMemo(() => draftContent !== displayedContent, [draftContent, displayedContent]);

  const saveDraft = React.useCallback(async () => {
    if (!selectedFile || !files.writeFile) {
      toast.error('Saving not supported');
      return;
    }

    if (!isDirty) {
      return;
    }

    setIsSaving(true);

    try {
      const result = await files.writeFile(selectedFile.path, draftContent);
      if (!result?.success) {
        throw new Error('Failed to write file');
      }
      setFileContent(draftContent);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Save failed');
    } finally {
      setIsSaving(false);
    }
  }, [draftContent, files, isDirty, selectedFile]);

  React.useEffect(() => {
    if (!isDirty) {
      setMainTabGuard(null);
      return;
    }

    const guard = (_nextTab: import('@/stores/useUIStore').MainTab) => {
      if (skipDirtyOnceRef.current) {
        skipDirtyOnceRef.current = false;
        return true;
      }
      setConfirmDiscardOpen(true);
      pendingTabRef.current = _nextTab;
      return false;
    };

    setMainTabGuard(guard);

    return () => {
      const currentGuard = useUIStore.getState().mainTabGuard;
      if (currentGuard === guard) {
        setMainTabGuard(null);
      }
    };
  }, [isDirty, setMainTabGuard]);

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!hasModifier(e)) {
        return;
      }

      if (e.key.toLowerCase() !== 's') {
        return;
      }

      e.preventDefault();
      if (!isSaving) {
        void saveDraft();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSaving, saveDraft]);

  const handleSelectFile = React.useCallback(async (node: FileNode) => {
    if (skipDirtyOnceRef.current) {
      skipDirtyOnceRef.current = false;
    } else if (isDirty) {
      setConfirmDiscardOpen(true);
      pendingSelectFileRef.current = node;
      return;
    }

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
      setDraftContent(content.length > MAX_VIEW_CHARS
        ? `${content.slice(0, MAX_VIEW_CHARS)}\n\n… truncated …`
        : content);
    } catch (error) {
      setFileContent('');
      setDraftContent('');
      setFileError(error instanceof Error ? error.message : 'Failed to read file');
    } finally {
      setFileLoading(false);
    }
  }, [isDirty, isMobile, readFile, runtime.isDesktop]);

  const discardAndContinue = React.useCallback(() => {
    const nextFile = pendingSelectFileRef.current;
    const nextTab = pendingTabRef.current;

    pendingSelectFileRef.current = null;
    pendingTabRef.current = null;

    // Allow one guarded navigation (tab/file) without re-opening dialog.
    skipDirtyOnceRef.current = true;

    setConfirmDiscardOpen(false);

    // Discard draft by reverting back to last loaded content
    setDraftContent(displayedContent);

    if (nextFile) {
      void handleSelectFile(nextFile);
      return;
    }

    if (nextTab) {
      setMainTabGuard(null);
      useUIStore.getState().setActiveMainTab(nextTab);
    }
  }, [displayedContent, handleSelectFile, setMainTabGuard]);

  const saveAndContinue = React.useCallback(async () => {
    const nextFile = pendingSelectFileRef.current;
    const nextTab = pendingTabRef.current;

    pendingSelectFileRef.current = null;
    pendingTabRef.current = null;

    // We'll proceed after saving; suppress guard reopening.
    skipDirtyOnceRef.current = true;

    setConfirmDiscardOpen(false);

    await saveDraft();

    if (nextFile) {
      await handleSelectFile(nextFile);
      return;
    }

    if (nextTab) {
      setMainTabGuard(null);
      useUIStore.getState().setActiveMainTab(nextTab);
    }
  }, [handleSelectFile, saveDraft, setMainTabGuard]);

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

    return nodes.map((node, index) => {
      const isDir = node.type === 'directory';
      const isExpanded = isDir && expandedDirs.has(node.path);
      const isActive = selectedFile?.path === node.path;
      const isLoading = isDir && inFlightDirsRef.current.has(node.path);
      const isLast = index === nodes.length - 1;

      return (
        <li key={node.path} className="relative">
          {depth > 0 && (
            <>
              <span className="absolute top-3.5 left-[-12px] w-3 h-px bg-border/40" />
              {isLast && (
                <span className="absolute top-3.5 bottom-0 left-[-13px] w-[2px] bg-background" />
              )}
            </>
          )}
          <div
            className="group relative flex items-center"
            onContextMenu={(event) => {
              if (!canRename && !canCreateFile && !canCreateFolder && !canDelete) {
                return;
              }
              event.preventDefault();
              setContextMenuPath(node.path);
            }}
          >
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
                'flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-foreground transition-colors pr-8 select-none',
                isActive ? 'bg-accent/70' : 'hover:bg-accent/40'
              )}
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
            {(canRename || canCreateFile || canCreateFolder || canDelete) && (
              <div className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 focus-within:opacity-100">
                <DropdownMenu
                  open={contextMenuPath === node.path}
                  onOpenChange={(open) => setContextMenuPath(open ? node.path : null)}
                >
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-6 w-6">
                      <RiMore2Fill className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" onCloseAutoFocus={() => setContextMenuPath(null)}>
                    {canRename && (
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleOpenDialog('rename', node); }}>
                        <RiEditLine className="mr-2 h-4 w-4" /> Rename
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={(e) => {
                      e.stopPropagation();
                      void navigator.clipboard.writeText(node.path);
                      toast.success('Path copied');
                    }}>
                      <RiFileCopyLine className="mr-2 h-4 w-4" /> Copy Path
                    </DropdownMenuItem>
                    {isDir && (canCreateFile || canCreateFolder) && (
                      <>
                        <DropdownMenuSeparator />
                        {canCreateFile && (
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleOpenDialog('createFile', node); }}>
                            <RiFileAddLine className="mr-2 h-4 w-4" /> New File
                          </DropdownMenuItem>
                        )}
                        {canCreateFolder && (
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleOpenDialog('createFolder', node); }}>
                            <RiFolderAddLine className="mr-2 h-4 w-4" /> New Folder
                          </DropdownMenuItem>
                        )}
                      </>
                    )}
                    {canDelete && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={(e) => { e.stopPropagation(); handleOpenDialog('delete', node); }}
                          className="text-destructive focus:text-destructive"
                        >
                          <RiDeleteBinLine className="mr-2 h-4 w-4" /> Delete
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
          </div>
          {isDir && isExpanded && (
            <ul className="flex flex-col gap-1 ml-3 pl-3 border-l border-border/40 relative">
              {renderTree(node.path, depth + 1)}
            </ul>
          )}
        </li>
      );
    });
  }, [childrenByDir, expandedDirs, handleSelectFile, selectedFile?.path, toggleDirectory, handleOpenDialog, canCreateFile, canCreateFolder, canRename, canDelete, contextMenuPath, setContextMenuPath]);

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
  const canCopyPath = Boolean(selectedFile && displaySelectedPath.length > 0);
  const canEdit = Boolean(selectedFile && !isSelectedImage && files.writeFile && fileContent.length <= MAX_VIEW_CHARS);

  const editorExtensions = React.useMemo(() => {
    if (!selectedFile?.path) {
      return [createFlexokiCodeMirrorTheme(currentTheme)];
    }

    const extensions = [createFlexokiCodeMirrorTheme(currentTheme)];
    const language = languageByExtension(selectedFile.path);
    if (language) {
      extensions.push(language);
    }
    if (wrapLines) {
      extensions.push(EditorView.lineWrapping);
    }
    return extensions;
  }, [currentTheme, selectedFile?.path, wrapLines]);

  const imageSrc = selectedFile?.path && isSelectedImage
    ? (runtime.isDesktop
      ? (isSelectedSvg
        ? `data:${getImageMimeType(selectedFile.path)};utf8,${encodeURIComponent(fileContent)}`
        : desktopImageSrc)
      : (isSelectedSvg
        ? `data:${getImageMimeType(selectedFile.path)};utf8,${encodeURIComponent(fileContent)}`
        : `/api/fs/raw?path=${encodeURIComponent(selectedFile.path)}`))
    : '';




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

  const renderDialogs = () => (
    <Dialog open={!!activeDialog} onOpenChange={(open) => !open && setActiveDialog(null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {activeDialog === 'createFile' && 'Create File'}
            {activeDialog === 'createFolder' && 'Create Folder'}
            {activeDialog === 'rename' && 'Rename'}
            {activeDialog === 'delete' && 'Delete'}
          </DialogTitle>
          <DialogDescription>
            {activeDialog === 'createFile' && `Create a new file in ${dialogData?.path ?? 'root'}`}
            {activeDialog === 'createFolder' && `Create a new folder in ${dialogData?.path ?? 'root'}`}
            {activeDialog === 'rename' && `Rename ${dialogData?.name}`}
            {activeDialog === 'delete' && `Are you sure you want to delete ${dialogData?.name}? This action cannot be undone.`}
          </DialogDescription>
        </DialogHeader>

        {activeDialog !== 'delete' && (
          <div className="py-4">
            <Input
              value={dialogInputValue}
              onChange={(e) => setDialogInputValue(e.target.value)}
              placeholder={activeDialog === 'rename' ? 'New name' : 'Name'}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  void handleDialogSubmit();
                }
              }}
              autoFocus
            />
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setActiveDialog(null)} disabled={isDialogSubmitting}>
            Cancel
          </Button>
          <Button
            variant={activeDialog === 'delete' ? 'destructive' : 'default'}
            onClick={() => void handleDialogSubmit()}
            disabled={isDialogSubmitting || (activeDialog !== 'delete' && !dialogInputValue.trim())}
          >
            {isDialogSubmitting ? <RiLoader4Line className="animate-spin" /> : (
                activeDialog === 'delete' ? 'Delete' : 'Confirm'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  // Comment UI component
  const renderCommentUI = () => {
    if (!lineSelection || !selectedFile) return null;
    return (
      <div
        data-comment-ui
        className="flex flex-col items-center gap-2 px-4"
        style={{ width: 'min(100vw - 1rem, 42rem)' }}
      >
        <div className="w-full rounded-xl border bg-background flex flex-col relative shadow-lg" style={{ borderColor: 'var(--primary)' }}>
          <Textarea
            value={commentText}
            onChange={(e) => {
              setCommentText(e.target.value);
              const textarea = e.target;
              textarea.style.height = 'auto';
              const lineHeight = 20;
              const maxHeight = lineHeight * 5 + 8;
              textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
            }}
            placeholder="Type your comment..."
            className="min-h-[28px] max-h-[108px] resize-none border-0 px-3 pt-2 pb-1 shadow-none rounded-none appearance-none focus:shadow-none focus-visible:shadow-none focus-visible:border-transparent focus-visible:ring-0 focus-visible:ring-transparent hover:border-transparent bg-transparent dark:bg-transparent focus-visible:outline-none overflow-y-auto"
            autoFocus={!isMobile}
            rows={1}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleSendComment();
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                setLineSelection(null);
                setCommentText('');
              }
            }}
          />
          <div className="px-2.5 py-1 flex items-center justify-between gap-x-1.5">
            <span className="text-xs text-muted-foreground">
              {selectedFile.name}:{lineSelection.start}-{lineSelection.end}
            </span>
            <div className="flex items-center gap-x-1.5">
              {!isMobile && (
                <span className="text-xs text-muted-foreground">
                  {getModifierLabel()}+⏎
                </span>
              )}
              <button
                type="button"
                onTouchEnd={(e) => {
                  if (commentText.trim()) {
                    e.preventDefault();
                    handleSendComment();
                  }
                }}
                onClick={() => {
                  if (!isMobile) {
                    handleSendComment();
                  }
                }}
                disabled={!commentText.trim()}
                className={cn(
                  "h-7 w-7 flex items-center justify-center text-muted-foreground transition-none outline-none focus:outline-none flex-shrink-0",
                  commentText.trim() ? "text-primary hover:text-primary" : "opacity-30"
                )}
                aria-label="Send comment"
              >
                <RiSendPlane2Line className="h-[18px] w-[18px]" />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const fileViewer = (
    <div
      className="relative flex h-full min-h-0 min-w-0 w-full flex-col overflow-hidden"
    >
      <Dialog open={confirmDiscardOpen} onOpenChange={(open) => {
        // Intentionally no "cancel" action. Keep dialog modal.
        if (!open) {
          setConfirmDiscardOpen(true);
        }
      }}>
        <DialogContent showCloseButton={false} className="max-w-md">
          <DialogHeader>
            <DialogTitle>Unsaved changes</DialogTitle>
            <DialogDescription>
              Save your edits before continuing?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => void saveAndContinue()}
              disabled={isSaving}
              className="border-[var(--status-success-border)] bg-[var(--status-success-background)] text-[var(--status-success)] hover:bg-[rgb(var(--status-success)/0.2)]"
            >
              Save changes
            </Button>
            <Button variant="destructive" onClick={discardAndContinue}>Discard</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <div className="flex min-w-0 items-center gap-2 border-b border-border/40 px-3 py-1.5 flex-shrink-0">
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

        <div className="flex items-center gap-1">
          {canEdit && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void saveDraft()}
              disabled={!isDirty || isSaving}
              className="h-5 w-5 p-0 text-[color:var(--status-success)] opacity-70 hover:opacity-100"
              title={`Save (${getModifierLabel()}+S)`}
              aria-label={`Save (${getModifierLabel()}+S)`}
            >
              {isSaving ? (
                <RiLoader4Line className="h-4 w-4 animate-spin" />
              ) : (
                <RiSave3Line className="h-4 w-4" />
              )}
            </Button>
          )}

          {canEdit && selectedFile && !isSelectedImage && (
            <span aria-hidden="true" className="mx-1 h-4 w-px bg-border/60" />
          )}

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

          {(canCopy || canCopyPath || (selectedFile && isMarkdownFile(selectedFile.path))) && (canEdit || (selectedFile && !isSelectedImage)) && (
            <span aria-hidden="true" className="mx-1 h-4 w-px bg-border/60" />
          )}

          {selectedFile && isMarkdownFile(selectedFile.path) && (
            <PreviewToggleButton
              currentMode={getMdViewMode()}
              onToggle={() => saveMdViewMode(getMdViewMode() === 'preview' ? 'edit' : 'preview')}
            />
          )}

          {canCopy && (
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(fileContent);
                  setCopiedContent(true);
                  if (copiedContentTimeoutRef.current !== null) {
                    window.clearTimeout(copiedContentTimeoutRef.current);
                  }
                  copiedContentTimeoutRef.current = window.setTimeout(() => {
                    setCopiedContent(false);
                  }, 1200);
                } catch {
                  toast.error('Copy failed');
                }
              }}
              className="h-5 w-5 p-0"
              title="Copy file contents"
              aria-label="Copy file contents"
            >
              {copiedContent ? (
                <RiCheckLine className="h-4 w-4 text-[color:var(--status-success)]" />
              ) : (
                <RiClipboardLine className="h-4 w-4" />
              )}
            </Button>
          )}

          {canCopyPath && (
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(displaySelectedPath);
                  setCopiedPath(true);
                  if (copiedPathTimeoutRef.current !== null) {
                    window.clearTimeout(copiedPathTimeoutRef.current);
                  }
                  copiedPathTimeoutRef.current = window.setTimeout(() => {
                    setCopiedPath(false);
                  }, 1200);
                } catch {
                  toast.error('Copy failed');
                }
              }}
              className="h-5 w-5 p-0"
              title={`Copy file path (${displaySelectedPath})`}
              aria-label={`Copy file path (${displaySelectedPath})`}
            >
              {copiedPath ? (
                <RiCheckLine className="h-4 w-4 text-[color:var(--status-success)]" />
              ) : (
                <RiFileCopy2Line className="h-4 w-4" />
              )}
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 min-w-0 relative">
        <ScrollableOverlay outerClassName="h-full min-w-0" className="h-full min-w-0">
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
          ) : selectedFile && isMarkdownFile(selectedFile.path) && getMdViewMode() === 'preview' ? (
            <div className="h-full overflow-auto p-3">
              {fileContent.length > 500 * 1024 && (
                <div className="mb-3 rounded-md border border-warning/20 bg-warning/10 px-3 py-2 text-sm text-warning">
                  ⚠️ This file is large ({Math.round(fileContent.length / 1024)}KB). Preview may be limited.
                </div>
              )}
              <ErrorBoundary
                fallback={
                  <div className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2">
                    <div className="mb-1 font-medium text-destructive">Preview unavailable</div>
                    <div className="text-sm text-muted-foreground">
                      Switch to edit mode to fix the issue.
                    </div>
                  </div>
                }
              >
                <SimpleMarkdownRenderer content={fileContent} className="typography-markdown-body" />
              </ErrorBoundary>
            </div>
          ) : (
            <div className="h-full">
              <CodeMirrorEditor
                value={draftContent}
                onChange={setDraftContent}
                extensions={editorExtensions}
                className="h-full"
                highlightLines={lineSelection
                  ? {
                    start: Math.min(lineSelection.start, lineSelection.end),
                    end: Math.max(lineSelection.start, lineSelection.end),
                  }
                  : undefined}
                lineNumbersConfig={{
                  domEventHandlers: {
                    mousedown: (view: EditorView, line: { from: number; to: number }, event: Event) => {
                      if (!(event instanceof MouseEvent)) {
                        return false;
                      }
                      if (event.button !== 0) {
                        return false;
                      }
                      event.preventDefault();

                      const lineNumber = view.state.doc.lineAt(line.from).number;

                      // Mobile: tap-to-extend selection
                      if (isMobile && lineSelection && !event.shiftKey) {
                        const start = Math.min(lineSelection.start, lineSelection.end, lineNumber);
                        const end = Math.max(lineSelection.start, lineSelection.end, lineNumber);
                        setLineSelection({ start, end });
                        isSelectingRef.current = false;
                        selectionStartRef.current = null;
                        return true;
                      }

                      isSelectingRef.current = true;
                      selectionStartRef.current = lineNumber;

                      if (lineSelection && event.shiftKey) {
                        const start = Math.min(lineSelection.start, lineNumber);
                        const end = Math.max(lineSelection.end, lineNumber);
                        setLineSelection({ start, end });
                      } else {
                        setLineSelection({ start: lineNumber, end: lineNumber });
                      }

                      return true;
                    },
                    mouseover: (view: EditorView, line: { from: number; to: number }, event: Event) => {
                      if (!(event instanceof MouseEvent)) {
                        return false;
                      }
                      if (event.buttons !== 1) {
                        return false;
                      }
                      if (!isSelectingRef.current || selectionStartRef.current === null) {
                        return false;
                      }

                      const lineNumber = view.state.doc.lineAt(line.from).number;
                      const start = Math.min(selectionStartRef.current, lineNumber);
                      const end = Math.max(selectionStartRef.current, lineNumber);
                      setLineSelection({ start, end });
                      return false;
                    },
                    mouseup: () => {
                      isSelectingRef.current = false;
                      selectionStartRef.current = null;
                      return false;
                    },
                  },
                }}
              />
            </div>
          )}
        </ScrollableOverlay>
      </div>

      {/* Comment UI floating at bottom */}
      {lineSelection && (
        <div
          className="pointer-events-none absolute inset-0 z-50 flex flex-col justify-end"
          style={{ 
            paddingBottom: isMobile ? 'var(--oc-keyboard-inset, 0px)' : '0px'
          }}
        >
          <div
            className={cn(
              "pointer-events-auto pb-2 transition-none w-full flex justify-center",
              isMobile && isKeyboardOpen ? "ios-keyboard-safe-area" : "bottom-safe-area"
            )}
            style={{
              marginBottom: isMobile
                ? (!isKeyboardOpen && inputBarOffset > 0 ? `${inputBarOffset}px` : '16px')
                : '16px'
            }}
            data-keyboard-avoid="true"
          >
            {renderCommentUI()}
          </div>
        </div>
      )}
    </div>
  );

  const hasTree = Boolean(root && childrenByDir[root]);

  const treePanel = (
    <section className={cn(
      "flex min-h-0 flex-col overflow-hidden",
      isMobile ? "h-full w-full bg-background" : "h-full rounded-xl border border-border/60 bg-background/70"
    )}>
      <div className={cn("flex flex-col gap-2 py-2", isMobile ? "px-3" : "px-2")}>
        <div className="flex items-center gap-2">
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
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleOpenDialog('createFile', { path: currentDirectory, type: 'directory' })}
            className="h-8 w-8 p-0 flex-shrink-0"
            title="New File"
          >
            <RiFileAddLine className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleOpenDialog('createFolder', { path: currentDirectory, type: 'directory' })}
            className="h-8 w-8 p-0 flex-shrink-0"
            title="New Folder"
          >
            <RiFolderAddLine className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void refreshRoot()} className="h-8 w-8 p-0 flex-shrink-0">
            <RiRefreshLine className="h-4 w-4" />
          </Button>
        </div>
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
      {renderDialogs()}
      {isMobile ? (
        showMobilePageContent ? (
          fileViewer
        ) : (
          treePanel
        )
       ) : (
         <div className="flex flex-1 min-h-0 min-w-0 gap-3 px-3 pb-3 pt-2">
           {screenWidth >= 1024 && (
             <div className="w-72 flex-shrink-0 min-h-0 overflow-hidden">
               {treePanel}
             </div>
           )}
           <div className="flex-1 min-h-0 min-w-0 overflow-hidden rounded-xl border border-border/60 bg-background">
             {fileViewer}
           </div>
         </div>
       )}
    </div>
  );
};
