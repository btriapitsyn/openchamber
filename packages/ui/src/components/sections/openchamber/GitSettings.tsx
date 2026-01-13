import React from 'react';
import { RiInformationLine } from '@remixicon/react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ModelSelector } from '@/components/sections/agents/ModelSelector';
import { updateDesktopSettings } from '@/lib/persistence';
import { isDesktopRuntime, getDesktopSettings } from '@/lib/desktop';
import { useConfigStore } from '@/stores/useConfigStore';
import { getRegisteredRuntimeAPIs } from '@/contexts/runtimeAPIRegistry';

export const GitSettings: React.FC = () => {
  const settingsCommitMessageModel = useConfigStore((state) => state.settingsCommitMessageModel);
  const setSettingsCommitMessageModel = useConfigStore((state) => state.setSettingsCommitMessageModel);

  const [isLoading, setIsLoading] = React.useState(true);

  // Parse "provider/model" string into separate parts
  const parsedModel = React.useMemo(() => {
    if (!settingsCommitMessageModel) return { providerId: '', modelId: '' };
    const parts = settingsCommitMessageModel.split('/');
    if (parts.length !== 2) return { providerId: '', modelId: '' };
    return { providerId: parts[0] || '', modelId: parts[1] || '' };
  }, [settingsCommitMessageModel]);

  // Load current settings
  React.useEffect(() => {
    const loadSettings = async () => {
      try {
        let data: { commitMessageModel?: string } | null = null;

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
           const model = typeof data.commitMessageModel === 'string' && data.commitMessageModel.trim().length > 0 ? data.commitMessageModel.trim() : undefined;
           if (model !== undefined) {
             setSettingsCommitMessageModel(model);
           }
         }
      } catch (error) {
        console.warn('Failed to load git settings:', error);
      } finally {
        setIsLoading(false);
      }
    };
    loadSettings();
  }, [setSettingsCommitMessageModel]);

  const handleModelChange = React.useCallback(async (providerId: string, modelId: string) => {
    const newValue = providerId && modelId ? `${providerId}/${modelId}` : undefined;
    setSettingsCommitMessageModel(newValue);

     try {
       await updateDesktopSettings({
         commitMessageModel: newValue ?? '',
       });

       if (!isDesktopRuntime()) {
         const response = await fetch('/api/config/settings', {
           method: 'PUT',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({ commitMessageModel: newValue }),
         });
         if (!response.ok) {
           console.warn('Failed to save commit message model to server:', response.status, response.statusText);
         }
       }
     } catch (error) {
       console.warn('Failed to save commit message model:', error);
     }
  }, [setSettingsCommitMessageModel]);

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
        <div className="flex flex-col gap-1.5">
          <label className="typography-ui-label text-muted-foreground">Model for generation</label>
          <ModelSelector
            providerId={parsedModel.providerId}
            modelId={parsedModel.modelId}
            onChange={handleModelChange}
          />
          <p className="typography-meta text-muted-foreground mt-1">
            This model will be used to analyze diffs and suggest commit messages. 
            Default: <span className="text-foreground">big-pickle</span>
          </p>
        </div>
      </div>
    </div>
  );
};
