import React, { useMemo, useEffect } from 'react';
import { WorkerPoolContextProvider, useWorkerPool } from '@pierre/diffs/react';
import type { SupportedLanguages } from '@pierre/diffs';

import { useOptionalThemeSystem } from './useThemeSystem';
import { workerFactory } from '@/lib/diff/workerFactory';
import { ensurePierreThemeRegistered } from '@/lib/shiki/appThemeRegistry';
import { getDefaultTheme } from '@/lib/theme/themes';
// NOTE: keep provider lightweight; avoid main-thread diff parsing here.

// Preload common languages for faster initial diff rendering
const PRELOAD_LANGS: SupportedLanguages[] = [
  // Keep small; workers load others on-demand.
  'typescript',
  'javascript',
  'tsx',
  'jsx',
  'json',
  'markdown',
];

interface DiffWorkerProviderProps {
  children: React.ReactNode;
}

// Component that warms up the worker pool and precomputes diff ASTs
const WorkerPoolWarmup: React.FC<{
  children: React.ReactNode;
  renderTheme: { light: string; dark: string };
}> = ({ children, renderTheme }) => {
  const workerPool = useWorkerPool();

  useEffect(() => {
    if (!workerPool) {
      return;
    }

    // Important: WorkerPoolContextProvider uses a singleton and does not react to
    // prop changes. Update the worker pool render options explicitly.
    // Force-disable intra-line diff globally (word-level/char-level).
    void workerPool.setRenderOptions({ theme: renderTheme, lineDiffType: 'none' });
  }, [renderTheme, workerPool]);

  return <>{children}</>;
};

export const DiffWorkerProvider: React.FC<DiffWorkerProviderProps> = ({ children }) => {
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

  ensurePierreThemeRegistered(lightTheme);
  ensurePierreThemeRegistered(darkTheme);

  const highlighterOptions = useMemo(() => ({
    theme: {
      dark: darkTheme.metadata.id,
      light: lightTheme.metadata.id,
    },
    themeType: isDark ? ('dark' as const) : ('light' as const),
    langs: PRELOAD_LANGS,
  }), [darkTheme.metadata.id, isDark, lightTheme.metadata.id]);

  const renderTheme = useMemo(
    () => ({
      light: lightTheme.metadata.id,
      dark: darkTheme.metadata.id,
    }),
    [darkTheme.metadata.id, lightTheme.metadata.id],
  );

  return (
    <WorkerPoolContextProvider
      poolOptions={{
        workerFactory,
        poolSize: 2,
        totalASTLRUCacheSize: 50,
      }}
      highlighterOptions={highlighterOptions}
    >
      <WorkerPoolWarmup
        renderTheme={renderTheme}
      >
        {children}
      </WorkerPoolWarmup>
    </WorkerPoolContextProvider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export { useWorkerPool };
