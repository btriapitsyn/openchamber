import React, { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { FileDiff } from '@pierre/diffs/react';
import { parseDiffFromFile, type FileContents, type FileDiffMetadata, type SelectedLineRange } from '@pierre/diffs';
import { RiSendPlane2Line } from '@remixicon/react';

import { useOptionalThemeSystem } from '@/contexts/useThemeSystem';
import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';
import { ensureFlexokiThemesRegistered } from '@/lib/shiki/registerFlexokiThemes';
import { flexokiThemeNames } from '@/lib/shiki/flexokiThemes';

import { toast } from 'sonner';
import { Textarea } from '@/components/ui/textarea';
import { useSessionStore } from '@/stores/useSessionStore';
import { useConfigStore } from '@/stores/useConfigStore';
import { useContextStore } from '@/stores/contextStore';
import { useUIStore } from '@/stores/useUIStore';
import { useDeviceInfo } from '@/lib/device';
import { cn, getModifierLabel } from '@/lib/utils';


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
  [data-separator-content] {
    height: 24px !important;
  }
  [data-expand-button] {
    height: 24px !important;
    width: 24px !important;
  }
  [data-separator-multi-button] {
    row-gap: 0 !important;
  }
  [data-expand-up] {
    height: 12px !important;
    min-height: 12px !important;
    max-height: 12px !important;
    margin: 0 !important;
    margin-top: 3px !important;
    padding: 0 !important;
    border-radius: 4px 4px 0 0 !important;
  }
  [data-expand-down] {
    height: 12px !important;
    min-height: 12px !important;
    max-height: 12px !important;
    margin: 0 !important;
    margin-top: -3px !important;
    padding: 0 !important;
    border-radius: 0 0 4px 4px !important;
  }
`;

// Fast cache key - use length + samples instead of full hash
function getCacheKey(fileName: string, original: string, modified: string): string {
  // Sample a few characters instead of hashing entire content
  const sampleOriginal = original.length > 100
    ? `${original.slice(0, 50)}${original.slice(-50)}`
    : original;
  const sampleModified = modified.length > 100
    ? `${modified.slice(0, 50)}${modified.slice(-50)}`
    : modified;
  return `${fileName}:${original.length}:${modified.length}:${sampleOriginal.length}:${sampleModified.length}`;
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

export const PierreDiffViewer: React.FC<PierreDiffViewerProps> = ({
  original,
  modified,
  language,
  fileName = 'file',
  renderSideBySide,
  wrapLines = false,
  layout = 'fill',
}) => {
  const isInlineLayout = layout === 'inline';
  const { isMobile } = useDeviceInfo();
  const { inputBarOffset, isKeyboardOpen } = useUIStore();
  
  const themeSystem = useOptionalThemeSystem();
  const isDark = themeSystem?.currentTheme?.metadata?.variant === 'dark';

  const setActiveMainTab = useUIStore(state => state.setActiveMainTab);

  const [selection, setSelection] = useState<SelectedLineRange | null>(null);
  const [commentText, setCommentText] = useState('');

  
  // Calculate initial center synchronously to avoid flicker
  const getMainContentCenter = useCallback(() => {
    if (isMobile) return '50%';
    const mainContent = document.querySelector('main.flex-1');
    if (mainContent) {
      const rect = mainContent.getBoundingClientRect();
      return `${rect.left + rect.width / 2}px`;
    }
    return '50%';
  }, [isMobile]);
  
  const [mainContentCenter, setMainContentCenter] = useState<string>(getMainContentCenter);
  
  const sendMessage = useSessionStore(state => state.sendMessage);
  const currentSessionId = useSessionStore(state => state.currentSessionId);
  const { currentProviderId, currentModelId, currentAgentName, currentVariant } = useConfigStore();
  const getSessionAgentSelection = useContextStore(state => state.getSessionAgentSelection);
  const getAgentModelForSession = useContextStore(state => state.getAgentModelForSession);
  const getAgentModelVariantForSession = useContextStore(state => state.getAgentModelVariantForSession);
  
  // Update main content center on resize
  useEffect(() => {
    if (isMobile) return;
    
    const updateCenter = () => {
      setMainContentCenter(getMainContentCenter());
    };
    
    window.addEventListener('resize', updateCenter);
    return () => window.removeEventListener('resize', updateCenter);
  }, [isMobile, getMainContentCenter]);

  const handleSelectionChange = useCallback((range: SelectedLineRange | null) => {
    // On mobile: implement "tap to extend" behavior
    // If user taps a new single line while we have an existing selection, extend the range
    if (isMobile && range && selection && range.start === range.end) {
      const tappedLine = range.start;
      const existingStart = selection.start;
      const existingEnd = selection.end;
      
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
    }
  }, [isMobile, selection]);

  // Dismiss selection when clicking outside line numbers (desktop behavior)
  useEffect(() => {
    if (!selection) return;
    
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      
      // Check if click is inside the comment UI portal
      const commentUI = document.querySelector('[data-comment-ui]');
      if (commentUI?.contains(target)) return;

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

  const handleSendComment = useCallback(async () => {
    if (!selection || !commentText.trim()) return;
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
    
    const code = extractSelectedCode(original, modified, selection);
    const startLine = selection.start;
    const endLine = selection.end;
    const side = selection.side === 'deletions' ? 'original' : 'modified';
    
    const message = `Comment on \`${fileName}\` lines ${startLine}-${endLine} (${side}):\n\`\`\`${language}\n${code}\n\`\`\`\n\n${commentText}`;
    
    // Clear state and switch tab immediately for responsive UX
    setCommentText('');
    setSelection(null);
    setActiveMainTab('chat');
    
    try {
      await sendMessage(
        message,
        effectiveProviderId,
        effectiveModelId,
        sessionAgent,
        undefined,
        undefined,
        undefined,
        effectiveVariant
      );
    } catch (e) {
      console.error("Failed to send comment", e);
    }
  }, [selection, commentText, original, modified, fileName, language, sendMessage, currentSessionId, currentProviderId, currentModelId, currentAgentName, currentVariant, setActiveMainTab, getSessionAgentSelection, getAgentModelForSession, getAgentModelVariantForSession]);

  ensureFlexokiThemesRegistered();

  // Cache the last computed diff to avoid recomputing on every render
  const diffCacheRef = useRef<{
    key: string;
    fileDiff: FileDiffMetadata;
  } | null>(null);

  // Pre-parse the diff with cacheKey for worker pool caching
  const fileDiff = useMemo(() => {
    const cacheKey = getCacheKey(fileName, original, modified);

    // Return cached diff if inputs haven't changed
    if (diffCacheRef.current?.key === cacheKey) {
      return diffCacheRef.current.fileDiff;
    }

    const oldFile: FileContents = {
      name: fileName,
      contents: original,
      lang: language as FileContents['lang'],
      cacheKey: `old-${cacheKey}`,
    };

    const newFile: FileContents = {
      name: fileName,
      contents: modified,
      lang: language as FileContents['lang'],
      cacheKey: `new-${cacheKey}`,
    };

    const diff = parseDiffFromFile(oldFile, newFile);

    // Cache the result
    diffCacheRef.current = { key: cacheKey, fileDiff: diff };

    return diff;
  }, [fileName, original, modified, language]);

  const options = useMemo(() => ({
    theme: {
      dark: flexokiThemeNames.dark,
      light: flexokiThemeNames.light,
    },
    themeType: isDark ? ('dark' as const) : ('light' as const),
    diffStyle: renderSideBySide ? ('split' as const) : ('unified' as const),
    diffIndicators: 'none' as const,
    hunkSeparators: 'line-info' as const,
    lineDiffType: 'word-alt' as const,
    overflow: wrapLines ? ('wrap' as const) : ('scroll' as const),
    disableFileHeader: true,
    enableLineSelection: true,
    enableHoverUtility: false,
    onLineSelected: handleSelectionChange,
    unsafeCSS: WEBKIT_SCROLL_FIX_CSS,
  }), [isDark, renderSideBySide, wrapLines, handleSelectionChange]);
 
  if (typeof window === 'undefined') {
    return null;
  }
 
  // Extracted Comment Interface Content for reuse in Portal or In-Flow
  const renderCommentContent = () => {
    if (!selection) return null;
    return (
      <div 
        className="flex flex-col items-center gap-2 px-4"
        style={{ width: 'min(100vw - 1rem, 42rem)' }}
      >
        <div className="w-full rounded-xl border bg-sidebar flex flex-col relative shadow-lg" style={{ borderColor: 'var(--primary)' }}>
          {/* Textarea - auto-grows from 1 line to max 5 lines */}
          <Textarea
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
                setSelection(null);
                setCommentText('');
              }
            }}
          />
          {/* Footer */}
          <div className="px-2.5 py-1 flex items-center justify-between gap-x-1.5">
            <span className="text-xs text-muted-foreground">
              {fileName.split('/').pop()}:{selection.start}-{selection.end}
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
                  // On mobile, handle send via touchend to avoid race with selection clearing
                  if (commentText.trim()) {
                    e.preventDefault();
                    handleSendComment();
                  }
                }}
                onClick={() => {
                  // Desktop click handler
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
            <FileDiff
              fileDiff={fileDiff}
              options={options}
              selectedLines={selection}
            />
          </ScrollableOverlay>
        </div>
        
        {/* Render Input In-Flow at the bottom */}
        {selection && (
          <div 
            className={cn(
              "pointer-events-auto relative pb-2 transition-none z-50 flex justify-center",
              isMobile && isKeyboardOpen ? "ios-keyboard-safe-area" : "bottom-safe-area"
            )}
            style={{
              marginBottom: isMobile 
                ? (!isKeyboardOpen && inputBarOffset > 0 ? `${inputBarOffset}px` : '16px')
                : '16px'
            }}
            data-keyboard-avoid="true"
          >
            {commentContent}
          </div>
        )}
      </div>
    );
  }

  // Fallback for 'inline' layout: use Portal behavior
  return (
    <div className={cn("relative", "w-full")}>
      <ScrollableOverlay
        outerClassName="pierre-diff-wrapper w-full"
        disableHorizontal={false}
        fillContainer={false}
      >
        <FileDiff
          fileDiff={fileDiff}
          options={options}
          selectedLines={selection}
        />
      </ScrollableOverlay>
      
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
          >
            {commentContent}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
