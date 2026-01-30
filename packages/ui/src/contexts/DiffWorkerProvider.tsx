import React, { useMemo, useEffect, useRef } from 'react';
import { WorkerPoolContextProvider, useWorkerPool } from '@pierre/diffs/react';
import { parseDiffFromFile, type FileContents } from '@pierre/diffs';
import type { SupportedLanguages } from '@pierre/diffs';

import { useOptionalThemeSystem } from './useThemeSystem';
import { workerFactory } from '@/lib/diff/workerFactory';
import { ensureFlexokiThemesRegistered } from '@/lib/shiki/registerFlexokiThemes';
import { flexokiThemeNames } from '@/lib/shiki/flexokiThemes';
import { useGitStore } from '@/stores/useGitStore';
import { getLanguageFromExtension } from '@/lib/toolHelpers';

// Preload common languages for faster initial diff rendering
const PRELOAD_LANGS: SupportedLanguages[] = [
  'typescript',
  'javascript',
  'tsx',
  'jsx',
  'json',
  'html',
  'css',
  'markdown',
  'yaml',
  'python',
  'rust',
  'go',
  'bash',
];

// Limit warmup to prevent memory bloat with many modified files
const WARMUP_MAX_FILES = 10;

// Matches cache key logic in `packages/ui/src/components/views/PierreDiffViewer.tsx`
function getPierreCacheKey(fileName: string, original: string, modified: string): string {
  const sampleOriginal = original.length > 100
    ? `${original.slice(0, 50)}${original.slice(-50)}`
    : original;
  const sampleModified = modified.length > 100
    ? `${modified.slice(0, 50)}${modified.slice(-50)}`
    : modified;
  return `${fileName}:${original.length}:${modified.length}:${sampleOriginal.length}:${sampleModified.length}`;
}

interface DiffWorkerProviderProps {
  children: React.ReactNode;
}

type IdleDeadlineLike = { timeRemaining(): number; didTimeout: boolean };

function scheduleWarmupWork(cb: (deadline?: IdleDeadlineLike) => void): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const id = window.setTimeout(() => cb(undefined), 0);
  return () => window.clearTimeout(id);
}

// Component that warms up the worker pool and precomputes diff ASTs
const WorkerPoolWarmup: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const workerPool = useWorkerPool();
  const activeDirectory = useGitStore((state) => state.activeDirectory);
  const lastStatusChange = useGitStore((state) => {
    if (!activeDirectory) return 0;
    return state.directories.get(activeDirectory)?.lastStatusChange ?? 0;
  });
  const diffCacheSize = useGitStore((state) => {
    if (!activeDirectory) return 0;
    return state.directories.get(activeDirectory)?.diffCache.size ?? 0;
  });

  const didDummyWarmupRef = useRef(false);
  const warmedStatusRef = useRef(new Map<string, number>());

  useEffect(() => {
    if (!workerPool || didDummyWarmupRef.current) return;

    didDummyWarmupRef.current = true;

    const dummyFile: FileContents = {
      name: 'warmup.ts',
      contents: 'const x = 1;',
      lang: 'typescript',
      cacheKey: 'warmup-file',
    };

    const dummyDiff = parseDiffFromFile(dummyFile, { ...dummyFile, contents: 'const x = 2;', cacheKey: 'warmup-file-2' });

    const dummyInstance = {
      onHighlightSuccess: () => {},
      onHighlightError: () => {},
    };

    workerPool.highlightDiffAST(dummyInstance, dummyDiff);
  }, [workerPool]);

  useEffect(() => {
    if (!workerPool || !activeDirectory) return;
    if (!lastStatusChange || diffCacheSize === 0) return;

    const dirState = useGitStore.getState().directories.get(activeDirectory);
    if (!dirState || dirState.diffCache.size === 0) return;

    const alreadyWarmedAt = warmedStatusRef.current.get(activeDirectory) ?? 0;
    if (alreadyWarmedAt >= dirState.lastStatusChange) return;

    // Only warm once per status-change tick
    warmedStatusRef.current.set(activeDirectory, dirState.lastStatusChange);

    let cancelled = false;
    let cancelScheduled: (() => void) | null = null;

    // Limit entries to prevent memory bloat with many modified files
    const allEntries = Array.from(dirState.diffCache.entries());
    const entries = allEntries.slice(0, WARMUP_MAX_FILES);

    let index = 0;

    const processChunk = (deadline?: IdleDeadlineLike) => {
      if (cancelled) return;

      const chunkStart = Date.now();
      while (index < entries.length) {
        if (deadline && deadline.timeRemaining() < 8) break;
        if (!deadline && Date.now() - chunkStart > 8) break;

        const [filePath, diff] = entries[index];
        index += 1;

        const language = getLanguageFromExtension(filePath) || 'text';
        const cacheKey = getPierreCacheKey(filePath, diff.original, diff.modified);

        const oldFile: FileContents = {
          name: filePath,
          contents: diff.original,
          lang: language as FileContents['lang'],
          cacheKey: `old-${cacheKey}`,
        };

        const newFile: FileContents = {
          name: filePath,
          contents: diff.modified,
          lang: language as FileContents['lang'],
          cacheKey: `new-${cacheKey}`,
        };

        const fileDiff = parseDiffFromFile(oldFile, newFile);

        // Use a unique instance per request so Pierre doesn't ignore earlier results.
        const instance = {
          onHighlightSuccess: () => {},
          onHighlightError: () => {},
        };

        workerPool.highlightDiffAST(instance, fileDiff);
      }

      if (index < entries.length) {
        cancelScheduled = scheduleWarmupWork(processChunk);
      }
    };

    // Kick off immediately, then continue in chunks.
    processChunk(undefined);

    if (index < entries.length) {
      cancelScheduled = scheduleWarmupWork(processChunk);
    }

    return () => {
      cancelled = true;
      cancelScheduled?.();
    };
  }, [workerPool, activeDirectory, lastStatusChange, diffCacheSize]);

  return <>{children}</>;
};

export const DiffWorkerProvider: React.FC<DiffWorkerProviderProps> = ({ children }) => {
  const themeSystem = useOptionalThemeSystem();
  const isDark = themeSystem?.currentTheme?.metadata?.variant === 'dark';

  ensureFlexokiThemesRegistered();

  const highlighterOptions = useMemo(() => ({
    theme: {
      dark: flexokiThemeNames.dark,
      light: flexokiThemeNames.light,
    },
    themeType: isDark ? ('dark' as const) : ('light' as const),
    langs: PRELOAD_LANGS,
  }), [isDark]);

  return (
    <WorkerPoolContextProvider
      poolOptions={{
        workerFactory,
        poolSize: 2,
        totalASTLRUCacheSize: 50,
      }}
      highlighterOptions={highlighterOptions}
    >
      <WorkerPoolWarmup>
        {children}
      </WorkerPoolWarmup>
    </WorkerPoolContextProvider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export { useWorkerPool };
