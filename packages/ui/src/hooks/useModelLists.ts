import React from 'react';
import { useConfigStore } from '@/stores/useConfigStore';
import { useUIStore } from '@/stores/useUIStore';
import type { Provider } from '@opencode-ai/sdk/v2';

type ProviderModel = Provider["models"][string];
type ProviderWithModelList = Omit<Provider, "models"> & { models: ProviderModel[] };

export interface ModelListItem {
  provider: ProviderWithModelList;
  model: ProviderModel;
  providerID: string;
  modelID: string;
}

export const useModelLists = () => {
  const { providers } = useConfigStore();
  const favoriteModels = useUIStore((state) => state.favoriteModels);
  const hiddenModels = useUIStore((state) => state.hiddenModels);
  const recentModels = useUIStore((state) => state.recentModels);

  const isHidden = React.useCallback(
    (providerID: string, modelID: string) =>
      hiddenModels.some((h) => h.providerID === providerID && h.modelID === modelID),
    [hiddenModels]
  );

  const hiddenModelsList = React.useMemo(() => {
    return hiddenModels
      .map(({ providerID, modelID }) => {
        const provider = providers.find((p) => p.id === providerID);
        if (!provider) return null;
        const providerModels = Array.isArray(provider.models) ? provider.models : [];
        const model = providerModels.find((m: ProviderModel) => m.id === modelID);
        if (!model) return null;
        return { provider, model, providerID, modelID };
      })
      .filter((item): item is ModelListItem => item !== null);
  }, [hiddenModels, providers]);

  const favoriteModelsList = React.useMemo(() => {
    return favoriteModels
      .map(({ providerID, modelID }) => {
        const provider = providers.find((p) => p.id === providerID);
        if (!provider) return null;
        const providerModels = Array.isArray(provider.models) ? provider.models : [];
        const model = providerModels.find((m: ProviderModel) => m.id === modelID);
        if (!model) return null;
        return { provider, model, providerID, modelID };
      })
      .filter((item): item is ModelListItem => item !== null)
      .filter(({ providerID, modelID }) => !isHidden(providerID, modelID));
  }, [favoriteModels, providers, isHidden]);

  const recentModelsList = React.useMemo(() => {
    return recentModels
      .map(({ providerID, modelID }) => {
        const provider = providers.find((p) => p.id === providerID);
        if (!provider) return null;
        const providerModels = Array.isArray(provider.models) ? provider.models : [];
        const model = providerModels.find((m: ProviderModel) => m.id === modelID);
        if (!model) return null;
        return { provider, model, providerID, modelID };
      })
      .filter((item): item is ModelListItem => item !== null)
      .filter(({ providerID, modelID }) =>
        !favoriteModels.some((fav) => fav.providerID === providerID && fav.modelID === modelID)
      )
      .filter(({ providerID, modelID }) => !isHidden(providerID, modelID));
  }, [recentModels, providers, favoriteModels, isHidden]);

  return { favoriteModelsList, hiddenModelsList, recentModelsList };
};
