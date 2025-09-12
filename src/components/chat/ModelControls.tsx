import React from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { X, Bot, Sparkles } from 'lucide-react';
import { useConfigStore } from '@/stores/useConfigStore';
import { cn } from '@/lib/utils';

export const ModelControls: React.FC = () => {
  const {
    providers,
    agents,
    currentProviderId,
    currentModelId,
    currentAgentName,
    setProvider,
    setModel,
    setAgent,
    getCurrentProvider
  } = useConfigStore();

  const currentProvider = getCurrentProvider();
  const models = Array.isArray(currentProvider?.models) ? currentProvider.models : [];
  const currentAgent = agents.find(a => a.name === currentAgentName);

  const handleProviderChange = (providerId: string) => {
    setProvider(providerId);
  };

  const handleModelChange = (modelId: string) => {
    setModel(modelId);
  };

  const handleAgentChange = (agentName: string) => {
    setAgent(agentName === 'none' ? undefined : agentName);
  };

  const getModelDisplayName = (model: any) => {
    const name = model?.name || model?.id || '';
    if (name.length > 40) {
      return name.substring(0, 37) + '...';
    }
    return name;
  };

  const getProviderDisplayName = () => {
    const provider = providers.find(p => p.id === currentProviderId);
    return provider?.name || currentProviderId;
  };

  const getAgentDisplayName = () => {
    if (!currentAgentName) return 'No Agent';
    const agent = agents.find(a => a.name === currentAgentName);
    return agent?.name || currentAgentName;
  };

  return (
    <>
      <style>{`
        .model-controls [data-slot="select-trigger"] {
          box-shadow: none !important;
          outline: none !important;
          border: none !important;
          background: transparent !important;
          --tw-ring-offset-shadow: 0 0 #0000 !important;
          --tw-ring-shadow: 0 0 #0000 !important;
          --tw-shadow: 0 0 #0000 !important;
          --tw-shadow-colored: 0 0 #0000 !important;
        }
        .model-controls [data-slot="select-trigger"]:hover {
          box-shadow: none !important;
          outline: none !important;
          background: transparent !important;
          --tw-ring-offset-shadow: 0 0 #0000 !important;
          --tw-ring-shadow: 0 0 #0000 !important;
          --tw-shadow: 0 0 #0000 !important;
        }
        .model-controls [data-slot="select-trigger"]:focus {
          box-shadow: none !important;
          outline: none !important;
          background: transparent !important;
          --tw-ring-offset-shadow: 0 0 #0000 !important;
          --tw-ring-shadow: 0 0 #0000 !important;
          --tw-shadow: 0 0 #0000 !important;
        }
        .model-controls [data-slot="select-trigger"]:focus-visible {
          box-shadow: none !important;
          outline: none !important;
          background: transparent !important;
          --tw-ring-offset-shadow: 0 0 #0000 !important;
          --tw-ring-shadow: 0 0 #0000 !important;
          --tw-shadow: 0 0 #0000 !important;
          border: none !important;
        }
        .model-controls [data-slot="select-trigger"][data-state="open"] {
          box-shadow: none !important;
          outline: none !important;
          background: transparent !important;
          --tw-ring-offset-shadow: 0 0 #0000 !important;
          --tw-ring-shadow: 0 0 #0000 !important;
          --tw-shadow: 0 0 #0000 !important;
        }
      `}</style>
      <div className="w-full flex items-end justify-center px-4 h-10 model-controls">
        <div className="flex items-center gap-1.5">
          {/* Provider Selector */}
          <div className="flex items-center gap-1 px-2 rounded bg-accent/20 border border-border/20 h-7">
            <Sparkles className="h-3 w-3 text-primary/60" />
            <Select value={currentProviderId} onValueChange={handleProviderChange}>
              <SelectTrigger className="h-auto p-0 border-0 bg-transparent text-[11px] font-medium w-[85px]">
                <SelectValue>
                  {getProviderDisplayName()}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {providers.map((provider) => (
                  <SelectItem key={provider.id} value={provider.id} className="text-xs">
                    {provider.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Model Selector */}
          <div className="flex items-center gap-1 px-2 rounded bg-accent/20 border border-border/20 h-7">
            <div className="h-1 w-1 rounded-full bg-primary/60 flex-shrink-0" />
            <Select value={currentModelId || ''} onValueChange={handleModelChange}>
              <SelectTrigger className="h-auto p-0 border-0 bg-transparent text-[11px] font-medium w-[160px]">
                <SelectValue>
                  {models.length > 0 
                    ? (getModelDisplayName(models.find((m: any) => m.id === currentModelId)) || 'Select Model')
                    : 'No models available'}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="max-w-[300px]">
                {models.length > 0 ? (
                  models.map((model: any) => (
                    <SelectItem key={model.id} value={model.id} className="text-xs">
                      <span className="truncate">{getModelDisplayName(model)}</span>
                    </SelectItem>
                  ))
                ) : (
                  <SelectItem value="none" disabled className="text-xs text-muted-foreground">
                    No models available for this provider
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Agent Selector */}
          <div className={cn(
            "flex items-center gap-1 px-2 rounded border transition-colors h-7",
            currentAgentName 
              ? "bg-primary/10 border-primary/20" 
              : "bg-accent/20 border-border/20"
          )}>
            <Bot className={cn(
              "h-3 w-3 flex-shrink-0",
              currentAgentName ? "text-primary" : "text-muted-foreground"
            )} />
            <Select value={currentAgentName || 'none'} onValueChange={handleAgentChange}>
              <SelectTrigger className={cn(
                "h-auto p-0 border-0 bg-transparent text-[11px] font-medium w-[65px]",
                currentAgentName && "text-primary"
              )}>
                <SelectValue>
                  {getAgentDisplayName()}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none" className="text-xs">
                  <div className="flex items-center gap-1.5">
                    <div className="h-1 w-1 rounded-full bg-muted-foreground/50" />
                    <span>No Agent</span>
                  </div>
                </SelectItem>
                {agents.map((agent) => (
                  <SelectItem key={agent.name} value={agent.name} className="text-xs">
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-1.5">
                        <div className="h-1 w-1 rounded-full bg-primary" />
                        <span className="font-medium">{agent.name}</span>
                      </div>
                      {agent.description && (
                        <span className="text-[10px] text-muted-foreground line-clamp-1 max-w-[200px] ml-2.5">
                          {agent.description}
                        </span>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {currentAgentName && (
              <button
                onClick={() => setAgent(undefined)}
                className="p-0.5 hover:bg-background/60 rounded transition-colors"
                title="Clear agent"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
};