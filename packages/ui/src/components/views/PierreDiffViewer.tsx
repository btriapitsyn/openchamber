import React, { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { FileDiff as PierreFileDiff, type FileContents, type FileDiffOptions, type SelectedLineRange } from '@pierre/diffs';
import { RiMoreLine, RiDeleteBinLine, RiEditLine } from '@remixicon/react';

import { useOptionalThemeSystem } from '@/contexts/useThemeSystem';
import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';
import { useWorkerPool } from '@/contexts/DiffWorkerProvider';
import { ensurePierreThemeRegistered, getResolvedShikiTheme } from '@/lib/shiki/appThemeRegistry';
import { getDefaultTheme } from '@/lib/theme/themes';

import { toast } from '@/components/ui';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useSessionStore } from '@/stores/useSessionStore';
import { useUIStore } from '@/stores/useUIStore';
import { useDeviceInfo } from '@/lib/device';
import { cn, getModifierLabel } from '@/lib/utils';
import { useInlineCommentDraftStore } from '@/stores/useInlineCommentDraftStore';
import { useThemeSystem } from '@/contexts/useThemeSystem';


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

  :host, pre, [data-diffs], [data-code] {
    transform: translateZ(0);
    -webkit-transform: translateZ(0);
    -webkit-backface-visibility: hidden;
    backface-visibility: hidden;
  }

  pre, [data-code] {
    font-family: var(--font-mono);
    font-size: var(--text-code);
  }

  [data-code] {
    -webkit-overflow-scrolling: touch;
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
  /* Reduce hunk separator height */
  // [data-separator-content] {
  //   height: 24px !important;
  // }
  // [data-expand-button] {
  //   height: 24px !important;
  //   width: 24px !important;
  // }
  // [data-separator-multi-button] {
  //   row-gap: 0 !important;
  // }
  // [data-expand-up] {
  //   height: 12px !important;
  //   min-height: 12px !important;
  //   max-height: 12px !important;
  //   margin: 0 !important;
  //   margin-top: 3px !important;
  //   padding: 0 !important;
  //   border-radius: 4px 4px 0 0 !important;
  // }
  // [data-expand-down] {
  //   height: 12px !important;
  //   min-height: 12px !important;
  //   max-height: 12px !important;
  //   margin: 0 !important;
  //   margin-top: -3px !important;
  //   padding: 0 !important;
  //   border-radius: 0 0 4px 4px !important;
  // }
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
  const startLine = Math.max(1, range.start);
  const endLine = Math.min(lines.length, range.end);

  if (startLine > endLine) return '';

  return lines.slice(startLine - 1, endLine).join('\n');
};

const isSameSelection = (left: SelectedLineRange | null, right: SelectedLineRange | null): boolean => {
  if (left === right) return true;
  if (!left || !right) return false;
  return left.start === right.start && left.end === right.end && left.side === right.side;
};

export const PierreDiffViewer: React.FC<PierreDiffViewerProps> = ({
  original,
  modified,
  language,
  fileName = 'file',
  renderSideBySide,
  wrapLines = false,
  layout = 'fill',
}) => {
  const { isMobile } = useDeviceInfo();
  const { inputBarOffset, isKeyboardOpen } = useUIStore();

  const themeSystem = useOptionalThemeSystem();
  const isDark = themeSystem?.currentTheme?.metadata?.variant === 'dark';

  const fallbackLight = getDefaultTheme(false);
  const fallbackDark = getDefaultTheme(true);

  const lightThemeId = themeSystem?.lightThemeId ?? fallbackLight.metadata.id;
  const darkThemeId = themeSystem?.darkThemeId ?? fallbackDark.metadata.id;

  const lightTheme =
    themeSystem?.availableThemes.find((theme) => theme.metadata.id === lightThemeId) ??
    fallbackLight;
  const darkTheme =
    themeSystem?.availableThemes.find((theme) => theme.metadata.id === darkThemeId) ??
    fallbackDark;

  const [selection, setSelection] = useState<SelectedLineRange | null>(null);
  const [commentText, setCommentText] = useState('');
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
  const [pendingFocus, setPendingFocus] = useState(false);
  const commentContainerRef = useRef<HTMLDivElement>(null);
  const commentInputRef = useRef<HTMLTextAreaElement | null>(null);

  // Refs to prevent infinite loops when syncing selection with diff instance
  const selectionRef = useRef<SelectedLineRange | null>(null);
  const isApplyingSelectionRef = useRef(false);
  const lastAppliedSelectionRef = useRef<SelectedLineRange | null>(null);

  // Keep selectionRef in sync with state
  useEffect(() => {
    selectionRef.current = selection;
  }, [selection]);

  // Calculate initial center and width synchronously to avoid flicker
  const getMainContentMetrics = useCallback(() => {
    if (isMobile) return { center: '50%', width: '100vw' };
    const mainContent = document.querySelector('main.flex-1');
    if (mainContent) {
      const rect = mainContent.getBoundingClientRect();
      return {
        center: `${rect.left + rect.width / 2}px`,
        width: `${rect.width}px`
      };
    }
    return { center: '50%', width: '100vw' };
  }, [isMobile]);

  const [mainContentMetrics, setMainContentMetrics] = useState(getMainContentMetrics);
  const mainContentCenter = mainContentMetrics.center;
  const mainContentWidth = mainContentMetrics.width;

  const currentSessionId = useSessionStore(state => state.currentSessionId);
  const newSessionDraftOpen = useSessionStore(state => state.newSessionDraft?.open);

  // Inline comment drafts
  const addDraft = useInlineCommentDraftStore(state => state.addDraft);
  const updateDraft = useInlineCommentDraftStore(state => state.updateDraft);
  const removeDraft = useInlineCommentDraftStore(state => state.removeDraft);
  const allDrafts = useInlineCommentDraftStore(state => state.drafts);

  // Filter drafts locally to avoid returning new array refs from selector
  const drafts = useMemo(() => {
    const sessionKey = currentSessionId ?? (newSessionDraftOpen ? 'draft' : '');
    if (!sessionKey) return [];
    return (allDrafts[sessionKey] ?? []).filter(
      d => d.source === 'diff' && d.fileLabel === fileName
    );
  }, [currentSessionId, newSessionDraftOpen, fileName, allDrafts]);

  const { currentTheme } = useThemeSystem();

  // Get session key for drafts
  const getSessionKey = useCallback(() => {
    return currentSessionId ?? (newSessionDraftOpen ? 'draft' : null);
  }, [currentSessionId, newSessionDraftOpen]);

  // Update main content metrics on resize
  useEffect(() => {
    if (isMobile) return;

    const updateMetrics = () => {
      setMainContentMetrics(getMainContentMetrics());
    };

    window.addEventListener('resize', updateMetrics);
    return () => window.removeEventListener('resize', updateMetrics);
  }, [isMobile, getMainContentMetrics]);

  // Stable handler that uses refs to avoid recreating on selection changes
  const handleSelectionChange = useCallback((range: SelectedLineRange | null) => {
    // Ignore callbacks while we're programmatically applying selection
    if (isApplyingSelectionRef.current) {
      return;
    }

    const lastApplied = lastAppliedSelectionRef.current;
    if (isSameSelection(range, lastApplied)) {
      return;
    }

    const currentSelection = selectionRef.current;
    if (isSameSelection(range, currentSelection)) {
      return;
    }

    // On mobile: implement "tap to extend" behavior
    // If user taps a new single line while we have an existing selection, extend the range
    if (isMobile && range && currentSelection && range.start === range.end) {
      const tappedLine = range.start;
      const existingStart = currentSelection.start;
      const existingEnd = currentSelection.end;

      // Extend the selection to include the tapped line
      const newStart = Math.min(existingStart, existingEnd, tappedLine);
      const newEnd = Math.max(existingStart, existingEnd, tappedLine);

      // Only extend if tapping outside current selection
      if (tappedLine < existingStart || tappedLine > existingEnd) {
        setSelection({
          ...range,
          start: newStart,
          end: newEnd,
        });
        return;
      }
    }

    setSelection(range);
    if (!range) {
      setCommentText('');
      setEditingDraftId(null);
      setPendingFocus(false);
    }
  }, [isMobile]);

  // Dismiss selection when clicking outside line numbers (desktop behavior)
  useEffect(() => {
    if (!selection) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      // Check if click is inside the comment UI portal
      if (commentContainerRef.current?.contains(target)) return;

      // Check if click is inside toast (sonner)
      if (target.closest('[data-sonner-toast]') || target.closest('[data-sonner-toaster]')) return;

      // Check if click is on a line number (inside shadow DOM)
      const path = e.composedPath();
      const isLineNumber = path.some((el) => {
        if (el instanceof HTMLElement) {
          return el.hasAttribute('data-line-number') || el.closest?.('[data-line-number]');
        }
        return false;
      });

      if (!isLineNumber) {
        setSelection(null);
        setCommentText('');
        setEditingDraftId(null);
        setPendingFocus(false);
      }
    };

    // Use timeout to avoid immediate dismissal from the same click that selected
    const timeoutId = setTimeout(() => {
      document.addEventListener('click', handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('click', handleClickOutside);
    };
  }, [selection]);

  const handleCancelComment = useCallback(() => {
    setCommentText('');
    setSelection(null);
    setEditingDraftId(null);
    setPendingFocus(false);
  }, []);

  useEffect(() => {
    if (!pendingFocus || !selection || isMobile) return;
    if (typeof window === 'undefined') return;
    const frame = window.requestAnimationFrame(() => {
      const input = commentInputRef.current;
      input?.focus();
      if (input) {
        const length = input.value.length;
        input.setSelectionRange(length, length);
      }
      setPendingFocus(false);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [pendingFocus, selection, isMobile]);

  const handleSaveComment = useCallback(() => {
    if (!selection || !commentText.trim()) return;

    const sessionKey = getSessionKey();
    if (!sessionKey) {
      toast.error('Select a session to save comment');
      return;
    }

    const code = extractSelectedCode(original, modified, selection);
    const side = selection.side === 'deletions' ? 'original' : 'modified';

    if (editingDraftId) {
      updateDraft(sessionKey, editingDraftId, {
        fileLabel: fileName,
        startLine: selection.start,
        endLine: selection.end,
        side,
        code,
        language,
        text: commentText.trim(),
      });
    } else {
      addDraft({
        sessionKey,
        source: 'diff',
        fileLabel: fileName,
        startLine: selection.start,
        endLine: selection.end,
        side,
        code,
        language,
        text: commentText.trim(),
      });
    }

    // Clear selection and comment text
    setCommentText('');
    setSelection(null);
    setEditingDraftId(null);

    toast.success(editingDraftId ? 'Comment updated' : 'Comment saved');
  }, [selection, commentText, original, modified, fileName, language, addDraft, updateDraft, getSessionKey, editingDraftId]);

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
  const workerPool = useWorkerPool();

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
    hunkSeparators: 'line-info' as const,
    // Perf: disable intra-line diff (word-level) globally.
    lineDiffType: 'none' as const,
    overflow: wrapLines ? ('wrap' as const) : ('scroll' as const),
    disableFileHeader: true,
    enableLineSelection: true,
    enableHoverUtility: false,
    onLineSelected: handleSelectionChange,
    unsafeCSS: WEBKIT_SCROLL_FIX_CSS,
  }), [darkTheme.metadata.id, isDark, lightTheme.metadata.id, renderSideBySide, wrapLines, handleSelectionChange]);

  // Imperative render (like upstream OpenCode): avoids `parseDiffFromFile` on main thread.
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const container = diffContainerRef.current;
    if (!container) return;
    if (!workerPool) return;

    // Dispose previous instance
    diffInstanceRef.current?.cleanUp();
    diffInstanceRef.current = null;
    container.innerHTML = '';

    const instance = new PierreFileDiff(options as unknown as FileDiffOptions<unknown>, workerPool);
    diffInstanceRef.current = instance;
    lastAppliedSelectionRef.current = null;

    const oldFile: FileContents = {
      name: fileName,
      contents: original,
      lang: language as FileContents['lang'],
      cacheKey: `old:${diffThemeKey}:${fileName}:${makeContentCacheKey(original)}`,
    };
    const newFile: FileContents = {
      name: fileName,
      contents: modified,
      lang: language as FileContents['lang'],
      cacheKey: `new:${diffThemeKey}:${fileName}:${makeContentCacheKey(modified)}`,
    };

    instance.render({
      oldFile,
      newFile,
      lineAnnotations: [],
      containerWrapper: container,
    });

    return () => {
      instance.cleanUp();
      if (diffInstanceRef.current === instance) {
        diffInstanceRef.current = null;
      }
      container.innerHTML = '';
    };
  }, [diffThemeKey, fileName, language, modified, options, original, workerPool]);

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

  if (typeof window === 'undefined') {
    return null;
  }

  // Extracted Comment Interface Content for reuse in Portal or In-Flow
  const renderCommentContent = () => {
    if (!selection) return null;
    return (
      <div
        className="flex flex-col items-center gap-2 px-4"
        style={{ width: `min(calc(${mainContentWidth} - 2rem), 42rem)` }}
      >
        <div
          className="w-full rounded-xl flex flex-col relative shadow-lg border border-border/80 focus-within:border-primary/70 focus-within:ring-1 focus-within:ring-primary/50"
          style={{
            backgroundColor: themeSystem?.currentTheme?.colors?.surface?.subtle,
          }}
        >
          {/* Textarea - auto-grows from 1 line to max 5 lines */}
          <Textarea
            ref={commentInputRef}
            value={commentText}
            onChange={(e) => {
              setCommentText(e.target.value);
              // Auto-resize textarea
              const textarea = e.target;
              textarea.style.height = 'auto';
              const lineHeight = 20; // approx line height
              const maxHeight = lineHeight * 5 + 8; // 5 lines + padding
              textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
            }}
            placeholder="Type your comment..."
            outerClassName="focus-within:ring-0"
            className="min-h-[28px] max-h-[108px] resize-none border-0 px-3 pt-2 pb-1 rounded-none appearance-none hover:border-transparent bg-transparent dark:bg-transparent overflow-y-auto focus:ring-0 focus:shadow-none"
            autoFocus={!isMobile}
            rows={1}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleSaveComment();
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                handleCancelComment();
              }
            }}
          />
          {/* Footer with Cancel and Comment buttons */}
          <div className="px-2.5 py-1 flex items-center justify-between gap-x-2">
            <span className="text-xs text-muted-foreground">
              {fileName.split('/').pop()}:{selection.start}-{selection.end}
            </span>
            <div className="flex items-center gap-x-2">
              {!isMobile && (
                <span className="text-xs text-muted-foreground">
                  {getModifierLabel()}+⏎
                </span>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleCancelComment}
                className="h-7 px-2 text-xs"
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={handleSaveComment}
                disabled={!commentText.trim()}
                className="h-7 px-2 text-xs"
                style={{
                  backgroundColor: currentTheme?.colors?.status?.success,
                  color: currentTheme?.colors?.status?.successForeground,
                }}
              >
                {editingDraftId ? 'Save' : 'Comment'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Render saved comment cards
  const renderSavedComments = () => {
    if (drafts.length === 0) return null;

    return (
      <div className="absolute inset-0 pointer-events-none z-40">
        {drafts.map(draft => {
          // Approximate line placement; shadow DOM prevents direct line querying.
          const lineHeight = 24;
          const top = (draft.startLine - 1) * lineHeight;

          return (
            <div
              key={draft.id}
              className="absolute pointer-events-auto"
              style={{
                top: `${top}px`,
                right: '8px',
                maxWidth: '300px',
              }}
            >
              <div
                className="rounded-lg border p-2 shadow-md"
                style={{
                  backgroundColor: currentTheme?.colors?.surface?.elevated,
                  borderColor: currentTheme?.colors?.interactive?.border,
                }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-muted-foreground mb-1">
                      {draft.fileLabel}:{draft.startLine}-{draft.endLine}
                      {draft.side && ` (${draft.side})`}
                    </div>
                    <div className="text-sm line-clamp-3">{draft.text}</div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="flex-shrink-0 p-1 rounded hover:bg-[var(--interactive-hover)] text-muted-foreground"
                      >
                        <RiMoreLine className="h-4 w-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      onCloseAutoFocus={(event) => event.preventDefault()}
                    >
                      <DropdownMenuItem
                        onClick={() => {
                          const selectionSide = draft.side === 'original' ? 'deletions' : 'additions';
                          applySelection({
                            start: draft.startLine,
                            end: draft.endLine,
                            side: selectionSide,
                          });
                          setCommentText(draft.text);
                          setEditingDraftId(draft.id);
                          setPendingFocus(true);
                        }}
                      >
                        <RiEditLine className="h-4 w-4 mr-2" />
                        Edit comment
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => removeDraft(draft.sessionKey, draft.id)}
                        className="text-destructive"
                      >
                        <RiDeleteBinLine className="h-4 w-4 mr-2" />
                        Delete comment
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const commentContent = renderCommentContent();

  // If we're in the main diff view ('fill' layout), render In-Flow (like ChatInput).
  // If we're in an inline diff ('inline' layout), render via Portal (fixed over content).
  if (layout === 'fill') {
    return (
      <div
        className={cn("flex flex-col relative", "size-full")}
        style={{
          // Apply keyboard padding to the main container, just like ChatContainer
          paddingBottom: isMobile ? 'var(--oc-keyboard-inset, 0px)' : undefined
        }}
      >
        <div className="flex-1 relative min-h-0">
          <ScrollableOverlay
            outerClassName="pierre-diff-wrapper size-full"
            disableHorizontal={false}
            fillContainer={true}
          >
            <div ref={diffRootRef} className="size-full relative">
              <div ref={diffContainerRef} className="size-full" />
              {renderSavedComments()}
            </div>
          </ScrollableOverlay>
        </div>

        {/* Render Input overlay at the bottom */}
        {selection && (
          <div
            className={cn(
              "pointer-events-auto absolute bottom-0 left-0 right-0 pb-2 transition-none z-50 flex justify-center w-full",
              isMobile && isKeyboardOpen ? "ios-keyboard-safe-area" : "bottom-safe-area"
            )}
            style={{
              marginBottom: isMobile
                ? (!isKeyboardOpen && inputBarOffset > 0 ? `${inputBarOffset}px` : '16px')
                : '16px'
            }}
            data-keyboard-avoid="true"
            data-comment-ui="true"
            ref={commentContainerRef}
          >
            {commentContent}
          </div>
        )}
      </div>
    );
  }

  // Fallback for 'inline' layout: use Portal behavior
  // Use simple div with overflow-x-auto to avoid nested ScrollableOverlay issues in Chrome
  return (
    <div className={cn("relative", "w-full")}>
      <div ref={diffRootRef} className="pierre-diff-wrapper w-full overflow-x-auto overflow-y-visible relative">
        <div ref={diffContainerRef} className="w-full" />
        {renderSavedComments()}
      </div>

      {selection && createPortal(
        <div
          className="fixed inset-0 z-50 flex flex-col justify-end items-start pointer-events-none transition-none transform-gpu"
          style={{
            paddingBottom: isMobile ? 'var(--oc-keyboard-inset, 0px)' : '0px',
            isolation: 'isolate'
          }}
        >
          <div
            className={cn(
              "pointer-events-auto relative pb-2 transition-none",
              isMobile && isKeyboardOpen ? "ios-keyboard-safe-area" : "bottom-safe-area"
            )}
            style={{
              marginLeft: mainContentCenter,
              transform: 'translateX(-50%)',
              marginBottom: isMobile
                ? (!isKeyboardOpen && inputBarOffset > 0 ? `${inputBarOffset}px` : '16px')
                : '16px'
            }}
            data-keyboard-avoid="true"
            data-comment-ui="true"
            ref={commentContainerRef}
          >
            {commentContent}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
