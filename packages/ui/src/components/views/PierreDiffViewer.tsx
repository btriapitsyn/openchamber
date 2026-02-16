import React, { useMemo, useRef, useState, useCallback, useEffect } from 'react';
// createPortal no longer needed — comments float absolutely outside shadow DOM
import {
  FileDiff as PierreFileDiff,
  VirtualizedFileDiff,
  Virtualizer,
  type FileContents,
  type FileDiffOptions,
  type SelectedLineRange,
  type DiffLineAnnotation,
  type AnnotationSide,
  type VirtualFileMetrics,
} from '@pierre/diffs';
import { InlineCommentCard, InlineCommentInput } from '@/components/comments';

import { useOptionalThemeSystem } from '@/contexts/useThemeSystem';
import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';
import { useWorkerPool } from '@/contexts/DiffWorkerProvider';
import { ensurePierreThemeRegistered, getResolvedShikiTheme } from '@/lib/shiki/appThemeRegistry';
import { getDefaultTheme } from '@/lib/theme/themes';

import { toast } from '@/components/ui';
import { useSessionStore } from '@/stores/useSessionStore';
import { useUIStore } from '@/stores/useUIStore';
import { useDeviceInfo } from '@/lib/device';
import { cn } from '@/lib/utils';
import { useInlineCommentDraftStore, type InlineCommentDraft } from '@/stores/useInlineCommentDraftStore';


interface PierreDiffViewerProps {
  original: string;
  modified: string;
  language: string;
  fileName?: string;
  renderSideBySide: boolean;
  wrapLines?: boolean;
  layout?: 'fill' | 'inline';
}

// CSS injected into Pierre's Shadow DOM for WebKit scroll optimization
// Note: avoid will-change and contain:paint as they break resize behavior
const WEBKIT_SCROLL_FIX_CSS = `
  :host {
    font-family: var(--font-mono);
    font-size: var(--text-code);
  }

  pre, [data-code] {
    font-family: var(--font-mono);
    font-size: var(--text-code);
  }

  /* Mobile touch selection support */
  [data-line-number] {
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
    cursor: pointer;
  }

  /* Ensure interactive line numbers work on touch */
  pre[data-interactive-line-numbers] [data-line-number] {
    touch-action: manipulation;
  }
  /* Match OpenCode hunk separator sizing */
  [data-diff-header],
  [data-diff] {
    [data-separator] {
      height: 24px !important;
    }
  }
  `;

// Fast cache key - use length + samples instead of full hash
function fnv1a32(input: string): string {
  // Fast + stable across runtimes; good enough for cache keys.
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    // hash *= 16777619 (but keep 32-bit)
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
  }
  return hash.toString(16);
}

function makeContentCacheKey(contents: string): string {
  // Avoid hashing full file; sample head+tail.
  const sample = contents.length > 400
    ? `${contents.slice(0, 200)}${contents.slice(-200)}`
    : contents;
  return `${contents.length}:${fnv1a32(sample)}`;
}

const extractSelectedCode = (original: string, modified: string, range: SelectedLineRange): string => {
  // Default to modified if side is ambiguous, as users mostly comment on new code
  const isOriginal = range.side === 'deletions';
  const content = isOriginal ? original : modified;
  const lines = content.split('\n');

  // Ensure bounds
  const from = Math.min(range.start, range.end);
  const to = Math.max(range.start, range.end);
  const startLine = Math.max(1, from);
  const endLine = Math.min(lines.length, to);

  if (startLine > endLine) return '';

  return lines.slice(startLine - 1, endLine).join('\n');
};

const isSameSelection = (left: SelectedLineRange | null, right: SelectedLineRange | null): boolean => {
  if (left === right) return true;
  if (!left || !right) return false;
  return left.start === right.start && left.end === right.end && left.side === right.side;
};

type AnnotationData = 
  | { type: 'saved' | 'edit'; draft: InlineCommentDraft }
  | { type: 'new'; selection: SelectedLineRange };

type SharedVirtualizer = {
  virtualizer: Virtualizer;
  release: () => void;
};

type VirtualizerTarget = {
  key: Document | HTMLElement;
  root: Document | HTMLElement;
  content: HTMLElement | undefined;
};

type VirtualizerEntry = {
  virtualizer: Virtualizer;
  refs: number;
};

const virtualizerCache = new WeakMap<Document | HTMLElement, VirtualizerEntry>();

const VIRTUAL_METRICS: Partial<VirtualFileMetrics> = {
  lineHeight: 24,
  hunkSeparatorHeight: 24,
  fileGap: 0,
};

function resolveVirtualizerTarget(container: HTMLElement): VirtualizerTarget {
  const root = container.closest('[data-diff-virtual-root]');
  if (root instanceof HTMLElement) {
    const content = root.querySelector('[data-diff-virtual-content]');
    return {
      key: root,
      root,
      content: content instanceof HTMLElement ? content : undefined,
    };
  }

  return {
    key: document,
    root: document,
    content: undefined,
  };
}

function acquireSharedVirtualizer(container: HTMLElement): SharedVirtualizer | null {
  if (typeof document === 'undefined') return null;

  const target = resolveVirtualizerTarget(container);
  let entry = virtualizerCache.get(target.key);

  if (!entry) {
    const virtualizer = new Virtualizer();
    virtualizer.setup(target.root, target.content);
    entry = { virtualizer, refs: 0 };
    virtualizerCache.set(target.key, entry);
  }

  entry.refs += 1;
  let released = false;

  return {
    virtualizer: entry.virtualizer,
    release: () => {
      if (released) return;
      released = true;

      const current = virtualizerCache.get(target.key);
      if (!current) return;

      current.refs -= 1;
      if (current.refs > 0) return;

      current.virtualizer.cleanUp();
      virtualizerCache.delete(target.key);
    },
  };
}

export const PierreDiffViewer: React.FC<PierreDiffViewerProps> = ({
  original,
  modified,
  language,
  fileName,
  renderSideBySide,
  wrapLines,
  layout = 'fill',
}) => {
  const themeContext = useOptionalThemeSystem();
  
  const isDark = themeContext?.currentTheme.metadata.variant === 'dark';
  const lightTheme = themeContext?.availableThemes.find(t => t.metadata.id === themeContext.lightThemeId) ?? getDefaultTheme(false);
  const darkTheme = themeContext?.availableThemes.find(t => t.metadata.id === themeContext.darkThemeId) ?? getDefaultTheme(true);

  useUIStore();
  const { isMobile } = useDeviceInfo();
  
  const addDraft = useInlineCommentDraftStore((state) => state.addDraft);
  const updateDraft = useInlineCommentDraftStore((state) => state.updateDraft);
  const removeDraft = useInlineCommentDraftStore((state) => state.removeDraft);
  const allDrafts = useInlineCommentDraftStore((state) => state.drafts);
  const currentSessionId = useSessionStore((state) => state.currentSessionId);

  const getSessionKey = useCallback(() => {
    return currentSessionId ?? 'draft';
  }, [currentSessionId]);

  const [selection, setSelection] = useState<SelectedLineRange | null>(null);
  const [commentText, setCommentText] = useState('');
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
  const selectionRef = useRef<SelectedLineRange | null>(null);
  const editingDraftIdRef = useRef<string | null>(null);
  // Use a ref to track if we're currently applying a selection programmatically
  // to avoid loop with onLineSelected callback
  const isApplyingSelectionRef = useRef(false);
  const lastAppliedSelectionRef = useRef<SelectedLineRange | null>(null);

  useEffect(() => {
    selectionRef.current = selection;
  }, [selection]);

  useEffect(() => {
    editingDraftIdRef.current = editingDraftId;
  }, [editingDraftId]);

  const handleSelectionChange = useCallback((range: SelectedLineRange | null) => {
    // Ignore callbacks while we're programmatically applying selection
    if (isApplyingSelectionRef.current) {
      return;
    }

    const prevSelection = selectionRef.current;

    // Mobile tap-to-extend: if selection exists and new tap is on same side, extend range
    if (isMobile && prevSelection && range && range.side === prevSelection.side) {
      const start = Math.min(prevSelection.start, range.start);
      const end = Math.max(prevSelection.end, range.end);
      setSelection({ ...range, start, end });
    } else {
      setSelection(range);
    }

    // Clear editing state when selection changes user-driven
    if (range) {
      if (!editingDraftIdRef.current) {
        setCommentText('');
      }
    }
  }, [isMobile]);

  const handleCancelComment = useCallback(() => {
    setCommentText('');
    setSelection(null);
    setEditingDraftId(null);
  }, []);

  // Helper to generate consistent annotation IDs
  const getAnnotationId = useCallback((meta: AnnotationData): string => {
    if (meta.type === 'saved' || meta.type === 'edit') {
      return `draft-${meta.draft.id}`;
    } else if (meta.type === 'new') {
      return 'new-comment-input';
    }
    return '';
  }, []);

  const renderAnnotation = useCallback((annotation: DiffLineAnnotation<AnnotationData>) => {
    const div = document.createElement('div');
    // Invisible — comments are rendered as floating elements outside shadow DOM
    div.style.display = 'none';

    const meta = (annotation as DiffLineAnnotation<AnnotationData>).metadata;
    const id = getAnnotationId(meta);
    
    div.dataset.annotationId = id;
    return div;
  }, [getAnnotationId]);

  // Compute floating comment positions by finding target lines in Pierre's shadow DOM
  const findLineElement = useCallback((root: ShadowRoot, line: number, side?: string) => {
    const nodes = Array.from(
      root.querySelectorAll(`[data-line="${line}"], [data-alt-line="${line}"]`)
    ).filter((n): n is HTMLElement => n instanceof HTMLElement);
    if (nodes.length === 0) return undefined;
    if (!side) return nodes[0];
    const match = nodes.find((n) => {
      const lineType = n.closest('[data-line-type]')?.getAttribute('data-line-type') ?? n.getAttribute('data-line-type');
      if (side === 'deletions') return lineType === 'change-deletion';
      return lineType !== 'change-deletion';
    });
    return match ?? nodes[0];
  }, []);

  const getAnchorPositions = useCallback((wrapper: HTMLElement, root: ShadowRoot, range: { start: number; end: number; side?: string }) => {
    const wrapperRect = wrapper.getBoundingClientRect();
    const first = findLineElement(root, range.start, range.side);
    const last = findLineElement(root, range.end, range.side);

    // Bottom of last line (for below placement)
    const lastEl = last ?? first;
    const bottomTop = lastEl
      ? lastEl.getBoundingClientRect().top - wrapperRect.top + lastEl.getBoundingClientRect().height
      : undefined;

    // Top of first line (for above placement)
    const firstEl = first ?? last;
    const aboveTop = firstEl
      ? firstEl.getBoundingClientRect().top - wrapperRect.top
      : undefined;

    return { bottomTop, aboveTop };
  }, [findLineElement]);

  const [commentPositions, setCommentPositions] = useState<Record<string, { top: number; flipUp: boolean } | undefined>>({});
  type CommentPos = { top: number; flipUp: boolean };

  const COMMENT_POPOVER_HEIGHT = 200; // approximate height of comment popover

  const updateCommentPositions = useCallback(() => {
    const wrapper = diffRootRef.current;
    if (!wrapper) return;

    const host = wrapper.querySelector('diffs-container') ?? diffContainerRef.current?.querySelector('diffs-container');
    const shadow = (host as HTMLElement | null)?.shadowRoot;
    if (!shadow) return;

    const scrollContainer = wrapper.closest('.overlay-scrollbar-container') as HTMLElement | null;
    const viewportBottom = scrollContainer
      ? scrollContainer.getBoundingClientRect().bottom
      : window.innerHeight;

    const computePos = (range: { start: number; end: number; side?: string }): CommentPos | undefined => {
      const anchors = getAnchorPositions(wrapper, shadow, range);
      if (anchors.bottomTop === undefined) return undefined;

      // Check if placing below last line would overflow viewport
      const lastEl = findLineElement(shadow, range.end, range.side) ?? findLineElement(shadow, range.start, range.side);
      const flipUp = lastEl
        ? (lastEl.getBoundingClientRect().bottom + COMMENT_POPOVER_HEIGHT + 30) > viewportBottom
        : false;

      return {
        top: flipUp ? (anchors.aboveTop ?? anchors.bottomTop) : anchors.bottomTop,
        flipUp,
      };
    };

    const next: Record<string, CommentPos | undefined> = {};
    const sessionKey = getSessionKey();
    const sessionDrafts = sessionKey ? (allDrafts[sessionKey] ?? []) : [];
    const fileLabel = fileName || 'unknown';
    const fileDrafts = sessionDrafts.filter((d) => d.source === 'diff' && d.fileLabel === fileLabel);

    for (const d of fileDrafts) {
      const side = d.side === 'original' ? 'deletions' : 'additions';
      next[d.id] = computePos({ start: d.startLine, end: d.endLine, side });
    }

    if (selection && !editingDraftId) {
      const side = selection.side ?? 'additions';
      next['__new__'] = computePos({ start: selection.start, end: selection.end, side });
    }

    setCommentPositions(next);
  }, [allDrafts, editingDraftId, fileName, findLineElement, getAnchorPositions, getSessionKey, selection]);

  const updateCommentPositionsRef = useRef(updateCommentPositions);
  useEffect(() => {
    updateCommentPositionsRef.current = updateCommentPositions;
  }, [updateCommentPositions]);

  const handleSaveComment = useCallback((textToSave: string, rangeOverride?: SelectedLineRange) => {
    // Use provided range override or fall back to current selection
    const targetRange = rangeOverride ?? selection;
    if (!targetRange || !textToSave.trim()) return;

    const normalizedStart = Math.min(targetRange.start, targetRange.end);
    const normalizedEnd = Math.max(targetRange.start, targetRange.end);
    const normalizedRange: SelectedLineRange = {
      ...targetRange,
      start: normalizedStart,
      end: normalizedEnd,
    };

    const sessionKey = getSessionKey();
    if (!sessionKey) {
      toast.error('Select a session to save comment');
      return;
    }

    // Pierre selection range: { start, end, side }
    // Store needs { startLine, endLine, side: 'original'|'modified' }
    // Pierre side: 'additions' (right) | 'deletions' (left)
    const storeSide = normalizedRange.side === 'deletions' ? 'original' : 'modified';

    // Use deterministic code extraction instead of instance.getSelectedText()
    const selectedText = extractSelectedCode(original, modified, normalizedRange);

    if (editingDraftId) {
      updateDraft(sessionKey, editingDraftId, {
        fileLabel: fileName || 'unknown',
        startLine: normalizedRange.start,
        endLine: normalizedRange.end,
        side: storeSide,
        code: selectedText,
        language: language,
        text: textToSave.trim(),
      });
    } else {
      addDraft({
        sessionKey,
        source: 'diff',
        fileLabel: fileName || 'unknown',
        startLine: normalizedRange.start,
        endLine: normalizedRange.end,
        side: storeSide,
        code: selectedText,
        language: language,
        text: textToSave.trim(),
      });
    }

    setCommentText('');
    setSelection(null);
    setEditingDraftId(null);
  }, [selection, fileName, language, original, modified, addDraft, updateDraft, getSessionKey, editingDraftId]);


  const applySelection = useCallback((range: SelectedLineRange) => {
    setSelection(range);
    const instance = diffInstanceRef.current;
    if (!instance) return;
    try {
      isApplyingSelectionRef.current = true;
      instance.setSelectedLines(range);
      lastAppliedSelectionRef.current = range;
    } catch {
      // ignore
    } finally {
      isApplyingSelectionRef.current = false;
    }
  }, []);

  ensurePierreThemeRegistered(lightTheme);
  ensurePierreThemeRegistered(darkTheme);

  const diffThemeKey = `${lightTheme.metadata.id}:${darkTheme.metadata.id}:${isDark ? 'dark' : 'light'}`;

  const diffRootRef = useRef<HTMLDivElement | null>(null);
  const diffContainerRef = useRef<HTMLDivElement | null>(null);
  const diffInstanceRef = useRef<PierreFileDiff<unknown> | null>(null);
  const sharedVirtualizerRef = useRef<SharedVirtualizer | null>(null);
  const [, forceUpdate] = React.useReducer((x) => x + 1, 0);
  const workerPool = useWorkerPool(renderSideBySide ? 'split' : 'unified');

  const lightResolvedTheme = useMemo(() => getResolvedShikiTheme(lightTheme), [lightTheme]);
  const darkResolvedTheme = useMemo(() => getResolvedShikiTheme(darkTheme), [darkTheme]);

  // Fast-path: update base diff theme vars immediately.
  // Without this, already-mounted diffs can keep old bg/bars until async highlight completes.
  React.useLayoutEffect(() => {
    const root = diffRootRef.current;
    if (!root) return;

    const container = root.querySelector('diffs-container') as HTMLElement | null;
    if (!container) return;

    const currentResolved = isDark ? darkResolvedTheme : lightResolvedTheme;

    const getColor = (
      resolved: typeof currentResolved,
      key: string,
    ): string | undefined => {
      const colors = resolved.colors as Record<string, string> | undefined;
      return colors?.[key];
    };

    const lightAdd = getColor(lightResolvedTheme, 'terminal.ansiGreen');
    const lightDel = getColor(lightResolvedTheme, 'terminal.ansiRed');
    const lightMod = getColor(lightResolvedTheme, 'terminal.ansiBlue');

    const darkAdd = getColor(darkResolvedTheme, 'terminal.ansiGreen');
    const darkDel = getColor(darkResolvedTheme, 'terminal.ansiRed');
    const darkMod = getColor(darkResolvedTheme, 'terminal.ansiBlue');

    // Apply on host; vars inherit into shadow root.
    container.style.setProperty('--shiki-light', lightResolvedTheme.fg);
    container.style.setProperty('--shiki-light-bg', lightResolvedTheme.bg);
    if (lightAdd) container.style.setProperty('--shiki-light-addition-color', lightAdd);
    if (lightDel) container.style.setProperty('--shiki-light-deletion-color', lightDel);
    if (lightMod) container.style.setProperty('--shiki-light-modified-color', lightMod);

    container.style.setProperty('--shiki-dark', darkResolvedTheme.fg);
    container.style.setProperty('--shiki-dark-bg', darkResolvedTheme.bg);
    if (darkAdd) container.style.setProperty('--shiki-dark-addition-color', darkAdd);
    if (darkDel) container.style.setProperty('--shiki-dark-deletion-color', darkDel);
    if (darkMod) container.style.setProperty('--shiki-dark-modified-color', darkMod);

    container.style.setProperty('--diffs-bg', currentResolved.bg);
    container.style.setProperty('--diffs-fg', currentResolved.fg);

    const currentAdd = isDark ? darkAdd : lightAdd;
    const currentDel = isDark ? darkDel : lightDel;
    const currentMod = isDark ? darkMod : lightMod;
    if (currentAdd) container.style.setProperty('--diffs-addition-color-override', currentAdd);
    if (currentDel) container.style.setProperty('--diffs-deletion-color-override', currentDel);
    if (currentMod) container.style.setProperty('--diffs-modified-color-override', currentMod);

    // Pierre also inlines theme styles on <pre> inside shadow root.
    // Patch it too so already-expanded diffs switch instantly.
    const pre = container.shadowRoot?.querySelector('pre') as HTMLPreElement | null;
    if (pre) {
      pre.style.setProperty('--shiki-light', lightResolvedTheme.fg);
      pre.style.setProperty('--shiki-light-bg', lightResolvedTheme.bg);
      if (lightAdd) pre.style.setProperty('--shiki-light-addition-color', lightAdd);
      if (lightDel) pre.style.setProperty('--shiki-light-deletion-color', lightDel);
      if (lightMod) pre.style.setProperty('--shiki-light-modified-color', lightMod);

      pre.style.setProperty('--shiki-dark', darkResolvedTheme.fg);
      pre.style.setProperty('--shiki-dark-bg', darkResolvedTheme.bg);
      if (darkAdd) pre.style.setProperty('--shiki-dark-addition-color', darkAdd);
      if (darkDel) pre.style.setProperty('--shiki-dark-deletion-color', darkDel);
      if (darkMod) pre.style.setProperty('--shiki-dark-modified-color', darkMod);

      pre.style.setProperty('--diffs-bg', currentResolved.bg);
      pre.style.setProperty('--diffs-fg', currentResolved.fg);
      if (currentAdd) pre.style.setProperty('--diffs-addition-color-override', currentAdd);
      if (currentDel) pre.style.setProperty('--diffs-deletion-color-override', currentDel);
      if (currentMod) pre.style.setProperty('--diffs-modified-color-override', currentMod);
    }
  }, [darkResolvedTheme, diffThemeKey, isDark, lightResolvedTheme]);


  const options = useMemo(() => ({
    theme: {
      dark: darkTheme.metadata.id,
      light: lightTheme.metadata.id,
    },
    themeType: isDark ? ('dark' as const) : ('light' as const),
    diffStyle: renderSideBySide ? ('split' as const) : ('unified' as const),
    diffIndicators: 'none' as const,
    hunkSeparators: 'line-info-basic' as const,
    // Perf: disable intra-line diff (word-level) globally.
    lineDiffType: 'none' as const,
    maxLineDiffLength: 1000,
    maxLineLengthForHighlighting: 1000,
    expansionLineCount: 20,
    overflow: wrapLines ? ('wrap' as const) : ('scroll' as const),
    disableFileHeader: true,
    enableLineSelection: true,
    enableHoverUtility: false,
    onLineSelected: handleSelectionChange,
    unsafeCSS: WEBKIT_SCROLL_FIX_CSS,
    renderAnnotation,
  }), [darkTheme.metadata.id, isDark, lightTheme.metadata.id, renderSideBySide, wrapLines, handleSelectionChange, renderAnnotation]);


  const lineAnnotations = useMemo(() => {
    const sessionKey = getSessionKey();
    if (!sessionKey) return [];

    const sessionDrafts = allDrafts[sessionKey] ?? [];
    // Match file label logic - use basename
    const fileLabel = fileName || 'unknown';
    const fileDrafts = sessionDrafts.filter((d) => d.source === 'diff' && d.fileLabel === fileLabel);

    const anns: DiffLineAnnotation<AnnotationData>[] = [];

    fileDrafts.forEach((d) => {
      // Force cast to AnnotationSide to satisfy compiler
      const side = (d.side === 'original' ? 'deletions' : 'additions') as AnnotationSide;
      if (d.id === editingDraftId) {
        // Always show edit input (even on mobile)
        anns.push({
          lineNumber: d.endLine,
          side: side,
          metadata: { type: 'edit', draft: d },
        });
      } else {
        // Show saved cards on all devices
        anns.push({
          lineNumber: d.endLine,
          side: side,
          metadata: { type: 'saved', draft: d },
        });
      }
    });

    if (selection && !editingDraftId) {
      anns.push({
        lineNumber: selection.end,
        side: (selection.side ?? 'additions') as AnnotationSide,
        metadata: { type: 'new', selection },
      });
    }

    return anns;
  }, [allDrafts, getSessionKey, fileName, editingDraftId, selection]);

  const lineAnnotationsRef = useRef(lineAnnotations);

  useEffect(() => {
    lineAnnotationsRef.current = lineAnnotations;
  }, [lineAnnotations]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const container = diffContainerRef.current;
    if (!container) return;
    if (!workerPool) return;

    // Dispose previous instance
    diffInstanceRef.current?.cleanUp();
    diffInstanceRef.current = null;
    sharedVirtualizerRef.current?.release();
    sharedVirtualizerRef.current = null;
    container.innerHTML = '';

    const sharedVirtualizer = acquireSharedVirtualizer(container);
    sharedVirtualizerRef.current = sharedVirtualizer;

    const instance = sharedVirtualizer
      ? new VirtualizedFileDiff(
          options as unknown as FileDiffOptions<unknown>,
          sharedVirtualizer.virtualizer,
          VIRTUAL_METRICS,
          workerPool,
        )
      : new PierreFileDiff(options as unknown as FileDiffOptions<unknown>, workerPool);
    diffInstanceRef.current = instance;
    lastAppliedSelectionRef.current = null;

    const oldFile: FileContents = {
      name: fileName || '',
      contents: original,
      lang: language as FileContents['lang'],
      cacheKey: `old:${diffThemeKey}:${fileName}:${makeContentCacheKey(original)}`,
    };
    const newFile: FileContents = {
      name: fileName || '',
      contents: modified,
      lang: language as FileContents['lang'],
      cacheKey: `new:${diffThemeKey}:${fileName}:${makeContentCacheKey(modified)}`,
    };

    instance.render({
      oldFile,
      newFile,
      lineAnnotations: lineAnnotationsRef.current,
      containerWrapper: container,
    });

    // Update floating comment positions after Pierre renders
    requestAnimationFrame(() => {
      forceUpdate();
      updateCommentPositionsRef.current();
    });

    return () => {
      instance.cleanUp();
      if (diffInstanceRef.current === instance) {
        diffInstanceRef.current = null;
      }
      sharedVirtualizer?.release();
      if (sharedVirtualizer && sharedVirtualizerRef.current === sharedVirtualizer) {
        sharedVirtualizerRef.current = null;
      }
      container.innerHTML = '';
    };
  }, [diffThemeKey, fileName, language, modified, options, original, workerPool]);

  useEffect(() => {
    const instance = diffInstanceRef.current;
    if (!instance) return;

    instance.setLineAnnotations(lineAnnotations);
    requestAnimationFrame(() => {
      if (diffInstanceRef.current !== instance) return;
      try {
        instance.rerender();
      } catch (err) {
        void err;
      }
      forceUpdate();
      updateCommentPositions();
    });
  }, [lineAnnotations, updateCommentPositions]);

  useEffect(() => {
    const instance = diffInstanceRef.current;
    if (!instance) return;

    // Only push selection to the diff when clearing.
    // User-driven selections already originate from the diff itself.
    if (selection !== null) {
      return;
    }

    // Guard against feedback loops and redundant updates
    const lastApplied = lastAppliedSelectionRef.current;
    if (isSameSelection(selection, lastApplied)) {
      return;
    }

    try {
      isApplyingSelectionRef.current = true;
      instance.setSelectedLines(selection);
      lastAppliedSelectionRef.current = selection;
    } catch {
      // ignore
    } finally {
      isApplyingSelectionRef.current = false;
    }
  }, [selection]);

  useEffect(() => {
    const container = diffContainerRef.current;
    if (!container) return;

    let rafId: number | null = null;
    let cleanup = () => {};

    const setup = () => {
      const host = container.querySelector('diffs-container');
      const shadowRoot = host?.shadowRoot;
      if (!shadowRoot) {
        rafId = requestAnimationFrame(setup);
        return;
      }

      const onClickCapture = (event: Event) => {
        if (!(event instanceof MouseEvent) || event.button !== 0) return;
        if (!(event.target instanceof Element)) return;

        const numberCell = event.target.closest('[data-column-number]');
        if (!(numberCell instanceof HTMLElement)) return;

        const lineRaw = numberCell.getAttribute('data-column-number');
        const lineNumber = lineRaw ? parseInt(lineRaw, 10) : NaN;
        if (Number.isNaN(lineNumber)) return;

        const lineType =
          numberCell.closest('[data-line-type]')?.getAttribute('data-line-type')
          ?? numberCell.getAttribute('data-line-type');

        const side: AnnotationSide = lineType === 'change-deletion' ? 'deletions' : 'additions';

        handleSelectionChange({
          start: lineNumber,
          end: lineNumber,
          side,
        });

        event.preventDefault();
        event.stopPropagation();
      };

      shadowRoot.addEventListener('click', onClickCapture, true);
      cleanup = () => {
        shadowRoot.removeEventListener('click', onClickCapture, true);
      };
    };

    setup();

    return () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      cleanup();
    };
  }, [diffThemeKey, fileName, handleSelectionChange]);

  useEffect(() => {
    requestAnimationFrame(updateCommentPositions);
  }, [selection, editingDraftId, allDrafts, updateCommentPositions]);

  // MutationObserver to trigger re-renders when annotation DOM nodes are added/removed
  useEffect(() => {
    const container = diffContainerRef.current;
    if (!container) return;

    let observer: MutationObserver | null = null;
    let rafId: number | null = null;

    const setupObserver = () => {
      const diffsContainer = container.querySelector('diffs-container');
      if (!diffsContainer) return;

      // Watch for annotation nodes being added/removed
      observer = new MutationObserver((mutations) => {
        const hasAnnotationChanges = mutations.some(m => 
          Array.from(m.addedNodes).some(n => 
            n instanceof HTMLElement && n.hasAttribute('data-annotation-id')
          ) ||
          Array.from(m.removedNodes).some(n => 
            n instanceof HTMLElement && n.hasAttribute('data-annotation-id')
          )
        );

        if (hasAnnotationChanges) {
           // Debounce with RAF to batch multiple mutations
           if (rafId) cancelAnimationFrame(rafId);
           rafId = requestAnimationFrame(() => {
             forceUpdate();
             rafId = null;
           });
         }
      });

      // Observe both shadow root and light DOM
      if (diffsContainer.shadowRoot) {
        observer.observe(diffsContainer.shadowRoot, { childList: true, subtree: true });
      }
      observer.observe(diffsContainer, { childList: true, subtree: true });
    };

    // Delay setup to allow Pierre to initialize
    const timeoutId = setTimeout(setupObserver, 100);

    return () => {
      clearTimeout(timeoutId);
      if (rafId) cancelAnimationFrame(rafId);
      observer?.disconnect();
    };
  }, [diffThemeKey, fileName]); // Re-setup when diff changes

  if (typeof window === 'undefined') {
    return null;
  }

  // Floating comment elements positioned absolutely over the diff
  const sessionKey = getSessionKey();
  const sessionDrafts = sessionKey ? (allDrafts[sessionKey] ?? []) : [];
  const fileLabel = fileName || 'unknown';
  const fileDrafts = sessionDrafts.filter((d) => d.source === 'diff' && d.fileLabel === fileLabel);

  const floatingComments = (
    <>
      {fileDrafts.map((d) => {
        const pos = commentPositions[d.id];
        if (!pos) return null;

        const popoverStyle: React.CSSProperties = pos.flipUp
          ? { position: 'absolute', bottom: 'calc(100% + 4px)', right: -8, zIndex: 40, width: 380, maxWidth: 'min(380px, calc(100vw - 48px))', borderRadius: 14 }
          : { position: 'absolute', top: 'calc(100% + 4px)', right: -8, zIndex: 40, width: 380, maxWidth: 'min(380px, calc(100vw - 48px))', borderRadius: 14 };

        if (d.id === editingDraftId) {
          return (
            <div
              key={`edit-${d.id}`}
              style={{ position: 'absolute', right: 24, top: pos.top, zIndex: 100, pointerEvents: 'auto' }}
            >
              <div style={popoverStyle}>
                <InlineCommentInput
                  initialText={commentText}
                  fileLabel={(fileName?.split('/').pop()) ?? ''}
                  lineRange={{
                    start: d.startLine,
                    end: d.endLine,
                    side: d.side === 'original' ? 'deletions' : 'additions'
                  }}
                  isEditing={true}
                  onSave={handleSaveComment}
                  onCancel={handleCancelComment}
                />
              </div>
            </div>
          );
        }

        return (
          <div
            key={`saved-${d.id}`}
            style={{ position: 'absolute', right: 24, top: pos.top, zIndex: 30, pointerEvents: 'auto' }}
          >
            <InlineCommentCard
              draft={d}
              onEdit={() => {
                const side = d.side === 'original' ? 'deletions' : 'additions';
                applySelection({ start: d.startLine, end: d.endLine, side });
                setCommentText(d.text);
                setEditingDraftId(d.id);
              }}
              onDelete={() => removeDraft(d.sessionKey, d.id)}
            />
          </div>
        );
      })}

      {selection && !editingDraftId && commentPositions['__new__'] && (
        <div
          key="new-comment"
          style={{ position: 'absolute', right: 24, top: commentPositions['__new__'].top, zIndex: 100, pointerEvents: 'auto' }}
        >
          <div style={commentPositions['__new__'].flipUp
            ? { position: 'absolute', bottom: 'calc(100% + 4px)', right: -8, zIndex: 40, width: 380, maxWidth: 'min(380px, calc(100vw - 48px))', borderRadius: 14 }
            : { position: 'absolute', top: 'calc(100% + 4px)', right: -8, zIndex: 40, width: 380, maxWidth: 'min(380px, calc(100vw - 48px))', borderRadius: 14 }
          }>
            <InlineCommentInput
              initialText={commentText}
              fileLabel={(fileName?.split('/').pop()) ?? ''}
              lineRange={selection || undefined}
              isEditing={false}
              onSave={handleSaveComment}
              onCancel={handleCancelComment}
            />
          </div>
        </div>
      )}
    </>
  );

  if (layout === 'fill') {
    return (
      <div className={cn("flex flex-col relative", "size-full")} data-diff-virtual-root>
        <div className="flex-1 relative min-h-0">
          <ScrollableOverlay
            outerClassName="pierre-diff-wrapper size-full"
            disableHorizontal={false}
            fillContainer={true}
            data-diff-virtual-content
          >
            <div ref={diffRootRef} className="size-full relative">
              <div ref={diffContainerRef} className="size-full" />
              {floatingComments}
            </div>
          </ScrollableOverlay>
        </div>
      </div>
    );
  }

  // Fallback for 'inline' layout
  return (
    <div className={cn("relative", "w-full")}>
      <div ref={diffRootRef} className="pierre-diff-wrapper w-full overflow-x-auto overflow-y-visible relative">
        <div ref={diffContainerRef} className="w-full" />
        {floatingComments}
      </div>
    </div>
  );
};
