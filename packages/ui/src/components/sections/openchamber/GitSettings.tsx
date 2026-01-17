import React from 'react';
import { RiInformationLine } from '@remixicon/react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ModelSelector } from '@/components/sections/agents/ModelSelector';
import { updateDesktopSettings } from '@/lib/persistence';
import { isDesktopRuntime, getDesktopSettings } from '@/lib/desktop';
import { useConfigStore } from '@/stores/useConfigStore';
import { getRegisteredRuntimeAPIs } from '@/contexts/runtimeAPIRegistry';

const FALLBACK_PROVIDER_ID = 'opencode';
const FALLBACK_MODEL_ID = 'big-pickle';

const getDisplayModel = (
  storedModel: string | undefined,
  providers: Array<{ id: string; models: Array<{ id: string }> }>
): { providerId: string; modelId: string } => {
  if (storedModel) {
    const parts = storedModel.split('/');
    if (parts.length === 2 && parts[0] && parts[1]) {
      return { providerId: parts[0], modelId: parts[1] };
    }
  }
  
  const fallbackProvider = providers.find(p => p.id === FALLBACK_PROVIDER_ID);
  if (fallbackProvider?.models.some(m => m.id === FALLBACK_MODEL_ID)) {
    return { providerId: FALLBACK_PROVIDER_ID, modelId: FALLBACK_MODEL_ID };
  }
  
  const firstProvider = providers[0];
  if (firstProvider?.models[0]) {
    return { providerId: firstProvider.id, modelId: firstProvider.models[0].id };
  }
  
  return { providerId: '', modelId: '' };
};

export const GitSettings: React.FC = () => {
  const settingsCommitMessageModel = useConfigStore((state) => state.settingsCommitMessageModel);
  const setSettingsCommitMessageModel = useConfigStore((state) => state.setSettingsCommitMessageModel);
  const settingsGitmojiEnabled = useConfigStore((state) => state.settingsGitmojiEnabled);
  const setSettingsGitmojiEnabled = useConfigStore((state) => state.setSettingsGitmojiEnabled);
  const providers = useConfigStore((state) => state.providers);

  const [isLoading, setIsLoading] = React.useState(true);

  const opencodeProviders = React.useMemo(() => {
    return providers.filter((provider) => provider.id === FALLBACK_PROVIDER_ID);
  }, [providers]);

  const parsedModel = React.useMemo(() => {
    const effectiveStoredModel = settingsCommitMessageModel?.startsWith(`${FALLBACK_PROVIDER_ID}/`)
      ? settingsCommitMessageModel
      : undefined;
    return getDisplayModel(effectiveStoredModel, opencodeProviders);
  }, [settingsCommitMessageModel, opencodeProviders]);

  // Load current settings
  React.useEffect(() => {
    const loadSettings = async () => {
      try {
        let data: { commitMessageModel?: string; gitmojiEnabled?: boolean } | null = null;

        // 1. Desktop runtime (Tauri)
        if (isDesktopRuntime()) {
          data = await getDesktopSettings();
        } else {
          // 2. Runtime settings API (VSCode)
          const runtimeSettings = getRegisteredRuntimeAPIs()?.settings;
          if (runtimeSettings) {
            try {
              const result = await runtimeSettings.load();
              const settings = result?.settings;
              if (settings) {
                data = {
                  commitMessageModel: typeof settings.commitMessageModel === 'string' ? settings.commitMessageModel : undefined,
                  gitmojiEnabled: typeof (settings as Record<string, unknown>).gitmojiEnabled === 'boolean'
                    ? ((settings as Record<string, unknown>).gitmojiEnabled as boolean)
                    : undefined,
                };
              }
            } catch {
              // Fall through to fetch
            }
          }

          // 3. Fetch API (Web)
          if (!data) {
            const response = await fetch('/api/config/settings', {
              method: 'GET',
              headers: { Accept: 'application/json' },
            });
            if (response.ok) {
              data = await response.json();
            }
          }
        }

        if (data) {
          const model = typeof data.commitMessageModel === 'string' && data.commitMessageModel.trim().length > 0
            ? data.commitMessageModel.trim()
            : undefined;
          setSettingsCommitMessageModel(model);
          if (typeof data.gitmojiEnabled === 'boolean') {
            setSettingsGitmojiEnabled(data.gitmojiEnabled);
          }
        }

      } catch (error) {
        console.warn('Failed to load git settings:', error);
      } finally {
        setIsLoading(false);
      }
    };
    loadSettings();
  }, [setSettingsCommitMessageModel, setSettingsGitmojiEnabled]);

  const handleModelChange = React.useCallback(async (providerId: string, modelId: string) => {
    const newValue = providerId && modelId ? `${providerId}/${modelId}` : undefined;
    setSettingsCommitMessageModel(newValue);

    try {
      await updateDesktopSettings({
        commitMessageModel: newValue ?? '',
      });
    } catch (error) {
      console.warn('Failed to save commit message model:', error);
    }
  }, [setSettingsCommitMessageModel]);

  const handleGitmojiChange = React.useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const enabled = event.target.checked;
    setSettingsGitmojiEnabled(enabled);
    try {
      await updateDesktopSettings({
        gitmojiEnabled: enabled,
      });
    } catch (error) {
      console.warn('Failed to save gitmoji setting:', error);
    }
  }, [setSettingsGitmojiEnabled]);

  if (isLoading) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <h3 className="typography-ui-header font-semibold text-foreground">Commit Messages</h3>
          <Tooltip delayDuration={1000}>
            <TooltipTrigger asChild>
              <RiInformationLine className="h-3.5 w-3.5 text-muted-foreground/60 cursor-help" />
            </TooltipTrigger>
            <TooltipContent sideOffset={8} className="max-w-xs">
              Configure how commit messages are generated.
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      <div className="space-y-3">
        <fieldset className="flex flex-col gap-1.5">
          <legend className="typography-ui-label text-muted-foreground">Model for generation</legend>
          <ModelSelector
            providerId={parsedModel.providerId}
            modelId={parsedModel.modelId}
            onChange={handleModelChange}
            allowedProviderIds={[FALLBACK_PROVIDER_ID]}
          />
          <p className="typography-meta text-muted-foreground mt-1">
            This model will be used to analyze diffs and suggest commit messages. 
            {!settingsCommitMessageModel && <> Default: <span className="text-foreground">opencode/big-pickle</span></>}
          </p>
        </fieldset>

        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="h-3.5 w-3.5 accent-primary"
              checked={settingsGitmojiEnabled}
              onChange={handleGitmojiChange}
            />
            <span className="typography-ui-label text-foreground">Enable gitmoji picker</span>
          </label>
          <p className="typography-meta text-muted-foreground pl-5.5">
            Adds a gitmoji selector to the Git commit message input.
          </p>
        </div>
      </div>
    </div>
  );
};
