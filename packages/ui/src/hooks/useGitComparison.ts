import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GitDiffResponse } from '@/lib/api/types';
import { getCommitFiles, getGitCommitDiff, getGitRangeDiff, getGitRangeFiles } from '@/lib/gitApi';
import { useI18n } from '@/lib/i18n';
import { getRuntimeKey } from '@/lib/runtime-switch';
import type { WalkthroughSource } from '@/lib/walkthrough/types';
import { useGitStore } from '@/stores/useGitStore';

export type GitComparisonSource = Extract<WalkthroughSource, { kind: 'branch' | 'commit' }>;

export interface GitComparisonFile {
  path: string;
  status: string;
  previousPath?: string;
  insertions: number;
  deletions: number;
}

type ComparisonFiles =
  | { key: string; status: 'loading' }
  | { key: string; status: 'ready'; files: GitComparisonFile[] }
  | { key: string; status: 'error'; message: string };

/** File-list authority shared by the stacked desktop view and mobile drill-down. */
export function useGitComparison(directory: string | null, source: GitComparisonSource | null, enabled = true, revision = '') {
  const { t } = useI18n();
  const runtimeKey = useGitStore((state) => state.runtimeKey);
  const key = directory && source ? JSON.stringify([runtimeKey, directory, source]) : null;
  const sourceRef = useRef({ key, source, enabled });
  sourceRef.current = { key, source, enabled };
  const [result, setResult] = useState<ComparisonFiles | null>(null);
  const generation = useRef(0);

  const refresh = useCallback(async () => {
    const { key: targetKey, source: target, enabled: active } = sourceRef.current;
    if (!enabled || !active || !key || targetKey !== key || !directory || !target) return;
    const request = ++generation.current;
    const runtime = getRuntimeKey();
    setResult((previous) => previous?.key === key && previous.status === 'ready' ? previous : { key, status: 'loading' });
    try {
      const files: GitComparisonFile[] = target.kind === 'branch'
        ? (await getGitRangeFiles(directory, { base: target.baseRef, head: target.headRef, includeWorkingTree: true }))
          .map((file) => ({ ...file, insertions: 0, deletions: 0 }))
        : (await getCommitFiles(directory, target.hash)).files
          .map((file) => ({ path: file.path, status: file.changeType, previousPath: file.previousPath, insertions: file.insertions, deletions: file.deletions }));
      if (generation.current !== request || getRuntimeKey() !== runtime) return;
      setResult({ key, status: 'ready', files });
    } catch (error) {
      if (generation.current !== request || getRuntimeKey() !== runtime) return;
      setResult({ key, status: 'error', message: error instanceof Error ? error.message : t('diffView.state.failedToLoadDiff') });
    }
  }, [directory, enabled, key, t]);

  useEffect(() => {
    void refresh();
    return () => { generation.current += 1; };
  }, [refresh, revision]);

  const current = result?.key === key ? result : null;
  const files = current?.status === 'ready' ? current.files : null;
  const filesByPath = useMemo(() => new Map((files ?? []).map((file) => [file.path, file])), [files]);
  const fetchDiff = useCallback(async (filePath: string, contextLines = 3): Promise<GitDiffResponse> => {
    const { key: targetKey, source: target, enabled: active } = sourceRef.current;
    const file = filesByPath.get(filePath);
    if (!directory || targetKey !== key || !target || !file || !enabled || !active) throw new Error(t('diffView.state.failedToLoadDiff'));
    return target.kind === 'branch'
      ? getGitRangeDiff(directory, { base: target.baseRef, head: target.headRef, path: filePath, contextLines, includeWorkingTree: true })
      : getGitCommitDiff(directory, { hash: target.hash, path: filePath, previousPath: file.previousPath, contextLines });
  }, [directory, enabled, filesByPath, key, t]);

  return {
    key,
    files,
    loading: Boolean(enabled && key && (!current || current.status === 'loading')),
    error: current?.status === 'error' ? current.message : null,
    refresh,
    fetchDiff,
  };
}
