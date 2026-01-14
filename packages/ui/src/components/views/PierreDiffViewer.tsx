import React, { useMemo, useRef } from 'react';
import { FileDiff } from '@pierre/diffs/react';
import { parseDiffFromFile, type FileContents, type FileDiffMetadata } from '@pierre/diffs';

import { useOptionalThemeSystem } from '@/contexts/useThemeSystem';
import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';
import { ensureFlexokiThemesRegistered } from '@/lib/shiki/registerFlexokiThemes';
import { flexokiThemeNames } from '@/lib/shiki/flexokiThemes';

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

export const PierreDiffViewer: React.FC<PierreDiffViewerProps> = ({
  original,
  modified,
  language,
  fileName = 'file',
  renderSideBySide,
  wrapLines = false,
  layout = 'fill',
}) => {
  const themeSystem = useOptionalThemeSystem();
  const isDark = themeSystem?.currentTheme?.metadata?.variant === 'dark';

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
    enableLineSelection: false,
    enableHoverUtility: false,
    unsafeCSS: WEBKIT_SCROLL_FIX_CSS,
  }), [isDark, renderSideBySide, wrapLines]);

  const isInlineLayout = layout === 'inline';
 
  if (typeof window === 'undefined') {
    return null;
  }
 
  return (
    <ScrollableOverlay
      outerClassName={isInlineLayout ? "pierre-diff-wrapper w-full" : "pierre-diff-wrapper size-full"}
      disableHorizontal={false}
      fillContainer={!isInlineLayout}
    >
      <FileDiff
        fileDiff={fileDiff}
        options={options}
      />
    </ScrollableOverlay>
  );
};
