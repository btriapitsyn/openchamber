import { useState, useCallback } from 'react';
import { createWorktreeSessionForNewBranch } from '@/lib/worktreeSessionCreator';
import { useRuntimeAPIs } from '@/hooks/useRuntimeAPIs';
import { useDirectoryStore } from '@/stores/useDirectoryStore';
import { useConfigStore } from '@/stores/useConfigStore';

export function useStartWork() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const apis = useRuntimeAPIs();
  const currentDirectory = useDirectoryStore((s) => s.currentDirectory);

  const startWork = useCallback(
    async (issueNumber: number) => {
      setLoading(true);
      setError(null);
      try {
        if (!apis.github) {
          throw new Error('GitHub API not available');
        }
        const result = await apis.github.startWorkOnIssue({
          directory: currentDirectory,
          issueNumber,
        });
        if (!result.ok || !result.data) {
          throw new Error(result.error?.message || 'Failed to start work on issue');
        }
        const { branch, sessionSeed, baseBranch } = result.data;
        const session = await createWorktreeSessionForNewBranch(currentDirectory, branch, baseBranch);
        if (session && sessionSeed) {
          const configState = useConfigStore.getState();
          const model = configState.settingsDefaultModel;
          if (!model) {
            throw new Error('No default model configured');
          }
          const [providerID, modelID] = model.split('/');
          if (!providerID || !modelID) {
            throw new Error('Invalid default model format');
          }
          const { opencodeClient } = await import('@/lib/opencode/client');
          await opencodeClient.sendMessage({
            id: session.id,
            providerID,
            modelID,
            text: sessionSeed,
          });
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to start work');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [apis.github, currentDirectory]
  );

  return { startWork, loading, error, currentDirectory };
}
