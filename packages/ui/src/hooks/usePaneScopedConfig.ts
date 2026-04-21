/**
 * Pane-scoped active config — each split-view pane should read model/agent/variant
 * from its session's saved selection, not the shared global config store.
 *
 * Also resolves the correct provider/model record for the pane's directory, so
 * non-focused panes whose sessions belong to a different directory still render
 * the right model name / provider icon.
 *
 * Falls back to global config when the pane's session has no saved selection,
 * which matches the default-for-new-sessions semantics.
 */

import React from 'react';
import { useConfigStore } from '@/stores/useConfigStore';
import { useSelectionStore } from '@/sync/selection-store';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { usePaneSessionId } from '@/contexts/paneContextValue';

type ProviderModel = Record<string, unknown> & { id?: string; name?: string };
type ProviderWithModelList = {
  id: string;
  name?: string;
  models?: ProviderModel[];
};

export type PaneScopedConfig = {
  providerId: string;
  modelId: string;
  agentName: string | undefined;
  variant: string | undefined;
  provider: ProviderWithModelList | undefined;
  model: ProviderModel | undefined;
};

const EMPTY_DIRECTORY_SCOPED = {} as Record<string, { providers?: ProviderWithModelList[] }>;

// Find provider across active + all directory-scoped snapshots — covers the
// non-focused pane case where its session belongs to a directory that isn't
// currently active.
const findProviderAnywhere = (
  providerId: string,
  activeProviders: ProviderWithModelList[],
  directoryScoped: Record<string, { providers?: ProviderWithModelList[] }>,
): ProviderWithModelList | undefined => {
  const fromActive = activeProviders.find((p) => p.id === providerId);
  if (fromActive) return fromActive;
  for (const snapshot of Object.values(directoryScoped)) {
    const providers = snapshot?.providers ?? [];
    const found = providers.find((p) => p.id === providerId);
    if (found) return found;
  }
  return undefined;
};

export function usePaneScopedConfig(): PaneScopedConfig {
  const paneSessionId = usePaneSessionId();

  const globalProviderId = useConfigStore((s) => s.currentProviderId);
  const globalModelId = useConfigStore((s) => s.currentModelId);
  const globalAgentName = useConfigStore((s) => s.currentAgentName);
  const globalVariant = useConfigStore((s) => s.currentVariant);

  const activeProviders = useConfigStore((s) => s.providers);
  const directoryScoped = useConfigStore((s) => (s.directoryScoped ?? EMPTY_DIRECTORY_SCOPED) as Record<string, { providers?: ProviderWithModelList[] }>);

  const savedModel = useSelectionStore((s) =>
    paneSessionId ? s.sessionModelSelections.get(paneSessionId) ?? null : null,
  );
  const savedAgent = useSelectionStore((s) =>
    paneSessionId ? s.sessionAgentSelections.get(paneSessionId) ?? null : null,
  );

  const providerId = savedModel?.providerId ?? globalProviderId;
  const modelId = savedModel?.modelId ?? globalModelId;
  const agentName = savedAgent ?? globalAgentName;

  const provider = React.useMemo(
    () => (providerId ? findProviderAnywhere(providerId, activeProviders, directoryScoped) : undefined),
    [providerId, activeProviders, directoryScoped],
  );

  const model = React.useMemo<ProviderModel | undefined>(() => {
    if (!provider || !modelId) return undefined;
    const list: ProviderModel[] = Array.isArray(provider.models) ? provider.models : [];
    return list.find((m) => m.id === modelId);
  }, [provider, modelId]);

  // Reactive variant — NEVER fall back to global for an attached session, since
  // global tracks the focused pane and would leak its variant into others.
  const savedVariant = useSelectionStore((s) =>
    paneSessionId && agentName
      ? s.sessionVariantByKey[`${paneSessionId}|${agentName}|${providerId}|${modelId}`]
      : undefined,
  );
  const variant = paneSessionId && agentName ? savedVariant : globalVariant;

  return { providerId, modelId, agentName, variant, provider, model };
}

/**
 * Returns the directory of the session bound to the nearest PaneProvider.
 * Non-reactive (reads store state on render) — provider/model look-ups that
 * depend on directory snapshot updates should depend on directoryScoped instead.
 */
export function usePaneSessionDirectory(): string | null {
  const paneSessionId = usePaneSessionId();
  const worktreeMap = useSessionUIStore((s) => s.worktreeMetadata);
  if (!paneSessionId) return null;
  const wtMeta = worktreeMap.get(paneSessionId);
  if (wtMeta?.path) return wtMeta.path;
  return useSessionUIStore.getState().getDirectoryForSession(paneSessionId);
}
