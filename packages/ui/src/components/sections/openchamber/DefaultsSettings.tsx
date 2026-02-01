import React from 'react';
import { RiInformationLine } from '@remixicon/react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ModelSelector } from '@/components/sections/agents/ModelSelector';
import { AgentSelector } from '@/components/sections/commands/AgentSelector';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { updateDesktopSettings } from '@/lib/persistence';
import { getDesktopSettings, isDesktopRuntime, isVSCodeRuntime } from '@/lib/desktop';
import { useConfigStore } from '@/stores/useConfigStore';
import { getRegisteredRuntimeAPIs } from '@/contexts/runtimeAPIRegistry';
import { getModifierLabel } from '@/lib/utils';

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

export const DefaultsSettings: React.FC = () => {
  const setProvider = useConfigStore((state) => state.setProvider);
  const setModel = useConfigStore((state) => state.setModel);
  const setAgent = useConfigStore((state) => state.setAgent);
  const setCurrentVariant = useConfigStore((state) => state.setCurrentVariant);
  const setSettingsDefaultModel = useConfigStore((state) => state.setSettingsDefaultModel);
  const setSettingsDefaultVariant = useConfigStore((state) => state.setSettingsDefaultVariant);
  const setSettingsDefaultAgent = useConfigStore((state) => state.setSettingsDefaultAgent);
  const settingsAutoCreateWorktree = useConfigStore((state) => state.settingsAutoCreateWorktree);
  const setSettingsAutoCreateWorktree = useConfigStore((state) => state.setSettingsAutoCreateWorktree);
  const providers = useConfigStore((state) => state.providers);

  const [defaultModel, setDefaultModel] = React.useState<string | undefined>();
  const [defaultVariant, setDefaultVariant] = React.useState<string | undefined>();
  const [defaultAgent, setDefaultAgent] = React.useState<string | undefined>();
  const [isLoading, setIsLoading] = React.useState(true);

  const parsedModel = React.useMemo(() => {
    return getDisplayModel(defaultModel, providers);
  }, [defaultModel, providers]);

  const isVSCode = React.useMemo(() => isVSCodeRuntime(), []);

  // Load current settings
  React.useEffect(() => {
    const loadSettings = async () => {
      try {
        let data: { defaultModel?: string; defaultVariant?: string; defaultAgent?: string } | null = null;

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
                  defaultModel: typeof settings.defaultModel === 'string' ? settings.defaultModel : undefined,
                  defaultVariant: typeof (settings as Record<string, unknown>).defaultVariant === 'string' ? ((settings as Record<string, unknown>).defaultVariant as string) : undefined,
                  defaultAgent: typeof settings.defaultAgent === 'string' ? settings.defaultAgent : undefined,
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
           const model = typeof data.defaultModel === 'string' && data.defaultModel.trim().length > 0 ? data.defaultModel.trim() : undefined;
           const variant = typeof data.defaultVariant === 'string' && data.defaultVariant.trim().length > 0 ? data.defaultVariant.trim() : undefined;
           const agent = typeof data.defaultAgent === 'string' && data.defaultAgent.trim().length > 0 ? data.defaultAgent.trim() : undefined;

           if (model !== undefined) {
             setDefaultModel(model);
           }
           if (variant !== undefined) {
             setDefaultVariant(variant);
           }
           if (agent !== undefined) {
             setDefaultAgent(agent);
           }
         }
      } catch (error) {
        console.warn('Failed to load defaults settings:', error);
      } finally {
        setIsLoading(false);
      }
    };
    loadSettings();
  }, []);


  const handleModelChange = React.useCallback(async (providerId: string, modelId: string) => {
    const newValue = providerId && modelId ? `${providerId}/${modelId}` : undefined;
    setDefaultModel(newValue);

    // Reset variant when model changes (model-specific)
    setDefaultVariant(undefined);
    setSettingsDefaultVariant(undefined);
    setCurrentVariant(undefined);

    // Update config store settings default (used by setAgent logic)
    setSettingsDefaultModel(newValue);

    // Also update current model immediately so new sessions use this model
    if (providerId && modelId) {
      const provider = providers.find((p) => p.id === providerId);
      if (provider) {
        setProvider(providerId);
        setModel(modelId);
      }
    }

     try {
       await updateDesktopSettings({
         defaultModel: newValue ?? '',
         defaultVariant: '',
       });

       if (!isDesktopRuntime()) {
         const response = await fetch('/api/config/settings', {
           method: 'PUT',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({ defaultModel: newValue }),
         });
         if (!response.ok) {
           console.warn('Failed to save default model to server:', response.status, response.statusText);
         }
       }
     } catch (error) {
       console.warn('Failed to save default model:', error);
     }
  }, [providers, setCurrentVariant, setProvider, setModel, setSettingsDefaultModel, setSettingsDefaultVariant]);

  const DEFAULT_VARIANT_VALUE = '__default__';

  const handleVariantChange = React.useCallback(async (variant: string) => {
    const newValue = variant === DEFAULT_VARIANT_VALUE ? undefined : (variant || undefined);
    setDefaultVariant(newValue);
    setSettingsDefaultVariant(newValue);
    setCurrentVariant(newValue);

    try {
      await updateDesktopSettings({
        defaultVariant: newValue ?? '',
      });
    } catch (error) {
      console.warn('Failed to save default variant:', error);
    }
  }, [setCurrentVariant, setSettingsDefaultVariant]);

  const handleAgentChange = React.useCallback(async (agentName: string) => {
    const newValue = agentName || undefined;
    setDefaultAgent(newValue);

    // Update config store settings default
    setSettingsDefaultAgent(newValue);

    // Update current agent (setAgent will respect settingsDefaultModel)
    if (agentName) {
      setAgent(agentName);
    }

    try {
      await updateDesktopSettings({
        defaultAgent: newValue ?? '',
      });
    } catch (error) {
      console.warn('Failed to save default agent:', error);
    }
  }, [setAgent, setSettingsDefaultAgent]);

  const availableVariants = React.useMemo(() => {
    if (!parsedModel.providerId || !parsedModel.modelId) return [];
    const provider = providers.find((p) => p.id === parsedModel.providerId);
    const model = provider?.models.find((m: Record<string, unknown>) => (m as { id?: string }).id === parsedModel.modelId) as
      | { variants?: Record<string, unknown> }
      | undefined;
    const variants = model?.variants;
    if (!variants) {
      return [];
    }
    return Object.keys(variants);
  }, [parsedModel.modelId, parsedModel.providerId, providers]);

  const supportsVariants = availableVariants.length > 0;

  React.useEffect(() => {
    if (!supportsVariants && defaultVariant) {
      setDefaultVariant(undefined);
      setSettingsDefaultVariant(undefined);
      setCurrentVariant(undefined);
      updateDesktopSettings({ defaultVariant: '' }).catch(() => {
        // best effort
      });
    }
  }, [defaultVariant, setCurrentVariant, setSettingsDefaultVariant, supportsVariants]);

  const handleAutoWorktreeChange = React.useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const enabled = e.target.checked;
    setSettingsAutoCreateWorktree(enabled);
    try {
      await updateDesktopSettings({
        autoCreateWorktree: enabled,
      });
    } catch (error) {
      console.warn('Failed to save auto create worktree setting:', error);
    }
  }, [setSettingsAutoCreateWorktree]);


  if (isLoading) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <h3 className="typography-ui-header font-semibold text-foreground">Session Defaults</h3>
          <Tooltip delayDuration={1000}>
            <TooltipTrigger asChild>
              <RiInformationLine className="h-3.5 w-3.5 text-muted-foreground/60 cursor-help" />
            </TooltipTrigger>
            <TooltipContent sideOffset={8} className="max-w-xs">
              Configure default behaviors for new sessions.
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

        <div className="space-y-3">
         <div className="flex flex-col gap-1.5">
           <label className="typography-ui-label text-muted-foreground">Default model</label>
           <ModelSelector
             providerId={parsedModel.providerId}
             modelId={parsedModel.modelId}
             onChange={handleModelChange}
           />
         </div>

         {supportsVariants && (
           <div className="flex flex-col gap-1.5">
             <label className="typography-ui-label text-muted-foreground">Default thinking</label>
             <Select value={defaultVariant ?? DEFAULT_VARIANT_VALUE} onValueChange={handleVariantChange}>
               <SelectTrigger className="w-auto max-w-xs typography-meta text-foreground">
                 <SelectValue placeholder="Thinking" />
               </SelectTrigger>
               <SelectContent>
                 <SelectItem value={DEFAULT_VARIANT_VALUE} className="pr-2 [&>span:first-child]:hidden">Default</SelectItem>
                 {availableVariants.map((variant) => (
                   <SelectItem key={variant} value={variant} className="pr-2 [&>span:first-child]:hidden">
                     {variant}
                   </SelectItem>
                 ))}
               </SelectContent>
             </Select>
           </div>
         )}
 
         <div className="flex flex-col gap-1.5">
           <label className="typography-ui-label text-muted-foreground">Default agent</label>
           <AgentSelector
             agentName={defaultAgent || ''}
             onChange={handleAgentChange}
           />
         </div>
       </div>

      {(parsedModel.providerId || defaultAgent) && (
        <div className="typography-meta text-muted-foreground">
          New sessions will start with:{' '}
          {parsedModel.providerId && (
            <span className="text-foreground">
              {parsedModel.providerId}/{parsedModel.modelId}
              {supportsVariants ? ` (${defaultVariant ?? 'default'})` : ''}
            </span>
          )}
          {parsedModel.providerId && defaultAgent && ' / '}
          {defaultAgent && <span className="text-foreground">{defaultAgent}</span>}
        </div>
      )}


      {!isVSCode && (
        <div className="pt-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox
              checked={settingsAutoCreateWorktree}
              onChange={(checked) => handleAutoWorktreeChange({ target: { checked } } as React.ChangeEvent<HTMLInputElement>)}
            />
            <span className="typography-ui-label text-foreground">
              Always create worktree for new sessions
            </span>
          </label>
          <p className="typography-meta text-muted-foreground pl-5 mt-1">
            {settingsAutoCreateWorktree
              ? `New session (Worktree): ${getModifierLabel()} + N  •  New session (Standard): Shift + ${getModifierLabel()} + N`
              : `New session (Standard): ${getModifierLabel()} + N  •  New session (Worktree): Shift + ${getModifierLabel()} + N`}
          </p>
        </div>
      )}
    </div>
  );
};
