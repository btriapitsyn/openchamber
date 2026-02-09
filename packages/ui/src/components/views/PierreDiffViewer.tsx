import React, { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { FileDiff as PierreFileDiff, type FileContents, type FileDiffOptions, type SelectedLineRange, type DiffLineAnnotation, type AnnotationSide } from '@pierre/diffs';
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

type AnnotationData = 
  | { type: 'saved' | 'edit'; draft: InlineCommentDraft }
  | { type: 'new'; selection: SelectedLineRange };

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
  const newSessionDraftOpen = useSessionStore((state) => state.newSessionDraft?.open);

  const getSessionKey = useCallback(() => {
    return currentSessionId ?? (newSessionDraftOpen ? 'draft' : null);
  }, [currentSessionId, newSessionDraftOpen]);

  const [selection, setSelection] = useState<SelectedLineRange | null>(null);
  const [commentText, setCommentText] = useState('');
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);

  // Use a ref to track if we're currently applying a selection programmatically
  // to avoid loop with onLineSelected callback
  const isApplyingSelectionRef = useRef(false);
  const lastAppliedSelectionRef = useRef<SelectedLineRange | null>(null);

  const handleSelectionChange = useCallback((range: SelectedLineRange | null) => {
    // Ignore callbacks while we're programmatically applying selection
    if (isApplyingSelectionRef.current) {
      return;
    }
    
    // Mobile tap-to-extend: if selection exists and new tap is on same side, extend range
    if (isMobile && selection && range && range.side === selection.side) {
      const start = Math.min(selection.start, range.start);
      const end = Math.max(selection.end, range.end);
      setSelection({ ...range, start, end });
      return;
    }
    
    setSelection(range);
    
    // Clear editing state when selection changes user-driven
    if (range) {
      // Don't clear if we're just updating the selection for the same draft?
      // For now, simple behavior: new selection = new comment flow
      if (!editingDraftId) {
        setCommentText('');
      }
    }
  }, [editingDraftId, isMobile, selection]);

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

  // Robust target resolver that checks shadow root, light DOM, and container
  const resolveAnnotationTarget = useCallback((id: string): HTMLElement | null => {
    if (!id || !diffContainerRef.current) return null;
    
    const diffsContainer = diffContainerRef.current.querySelector('diffs-container');
    if (!diffsContainer) return null;
    
    // Try shadow root first
    const shadowTarget = diffsContainer.shadowRoot?.querySelector(`[data-annotation-id="${id}"]`);
    if (shadowTarget) return shadowTarget as HTMLElement;
    
    // Try light DOM (slotted content)
    const lightTarget = diffsContainer.querySelector(`[data-annotation-id="${id}"]`);
    if (lightTarget) return lightTarget as HTMLElement;
    
    // Try container directly
    const containerTarget = diffContainerRef.current.querySelector(`[data-annotation-id="${id}"]`);
    if (containerTarget) return containerTarget as HTMLElement;
    
    return null;
  }, []);

  const renderAnnotation = useCallback((annotation: DiffLineAnnotation<AnnotationData>) => {
    const div = document.createElement('div');
    // Ensure full width and proper spacing
    div.className = 'w-full my-2';
    
    const meta = (annotation as DiffLineAnnotation<AnnotationData>).metadata;
    const id = getAnnotationId(meta);
    
    div.dataset.annotationId = id;
    return div;
  }, [getAnnotationId]);


  const handleSaveComment = useCallback((textToSave: string, rangeOverride?: SelectedLineRange) => {
    // Use provided range override or fall back to current selection
    const targetRange = rangeOverride ?? selection;
    if (!targetRange || !textToSave.trim()) return;

    const sessionKey = getSessionKey();
    if (!sessionKey) {
      toast.error('Select a session to save comment');
      return;
    }

    // Pierre selection range: { start, end, side }
    // Store needs { startLine, endLine, side: 'original'|'modified' }
    // Pierre side: 'additions' (right) | 'deletions' (left)
    const storeSide = targetRange.side === 'deletions' ? 'original' : 'modified';

    // Use deterministic code extraction instead of instance.getSelectedText()
    const selectedText = extractSelectedCode(original, modified, targetRange);

    if (editingDraftId) {
      updateDraft(sessionKey, editingDraftId, {
        fileLabel: fileName || 'unknown',
        startLine: targetRange.start,
        endLine: targetRange.end,
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
        startLine: targetRange.start,
        endLine: targetRange.end,
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
  const [, forceUpdate] = React.useReducer((x) => x + 1, 0);
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
      lineAnnotations,
      containerWrapper: container,
    });

    // Force update to render portals into new DOM elements created by Pierre
    requestAnimationFrame(() => forceUpdate());

    return () => {
      instance.cleanUp();
      if (diffInstanceRef.current === instance) {
        diffInstanceRef.current = null;
      }
      container.innerHTML = '';
    };
  }, [diffThemeKey, fileName, language, modified, options, original, workerPool, lineAnnotations]);

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

  // Render portals for inline comments with robust target resolution
  const portals = lineAnnotations.map((ann) => {
    const meta = (ann as DiffLineAnnotation<AnnotationData>).metadata;
    const id = getAnnotationId(meta);
    
    // Use robust resolver that checks shadow, light DOM, and container
    const target = resolveAnnotationTarget(id);
    
    // If target not found, skip rendering (will retry on next update cycle)
    if (!target) {
      return null;
    }

    if (meta.type === 'saved') {
      return createPortal(
        <InlineCommentCard
          key={id}
          draft={meta.draft}
          onEdit={() => {
            const side = meta.draft.side === 'original' ? 'deletions' : 'additions';
            applySelection({
              start: meta.draft.startLine,
              end: meta.draft.endLine,
              side,
            });
            setCommentText(meta.draft.text);
            setEditingDraftId(meta.draft.id);
          }}
          onDelete={() => removeDraft(meta.draft.sessionKey, meta.draft.id)}
        />,
        target,
        id
      );
    } else if (meta.type === 'edit') {
      return createPortal(
        <InlineCommentInput
          key={id}
          initialText={commentText}
          fileLabel={(fileName?.split('/').pop()) ?? ''}
          lineRange={{
            start: meta.draft.startLine,
            end: meta.draft.endLine,
            side: meta.draft.side === 'original' ? 'deletions' : 'additions'
          }}
          isEditing={true}
          onSave={handleSaveComment}
          onCancel={handleCancelComment}
        />,
        target,
        id
      );
    } else {
      return createPortal(
        <InlineCommentInput
          key={id}
          initialText={commentText}
          fileLabel={(fileName?.split('/').pop()) ?? ''}
          lineRange={selection || undefined}
          isEditing={false}
          onSave={handleSaveComment}
          onCancel={handleCancelComment}
        />,
        target,
        id
      );
    }
  });

  if (layout === 'fill') {
    return (
      <div className={cn("flex flex-col relative", "size-full")}>
        <div className="flex-1 relative min-h-0">
          <ScrollableOverlay
            outerClassName="pierre-diff-wrapper size-full"
            disableHorizontal={false}
            fillContainer={true}
          >
            <div ref={diffRootRef} className="size-full relative">
              <div ref={diffContainerRef} className="size-full" />
              {portals}
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
        {portals}
      </div>
    </div>
  );
};


