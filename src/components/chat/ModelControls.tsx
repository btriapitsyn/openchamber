import React from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { X, Sparkles, Settings, ChevronDown, FolderOpen } from 'lucide-react';
import { useConfigStore } from '@/stores/useConfigStore';
import { useSessionStore } from '@/stores/useSessionStore';
import { cn } from '@/lib/utils';
import { ServerFilePicker } from './ServerFilePicker';
import { getAgentColor } from '@/lib/agentColors';

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
  
  const sessionStore = useSessionStore();
  const currentSessionId = sessionStore.currentSessionId;
  const getLastMessageModel = sessionStore.getLastMessageModel;
  const addServerFile = sessionStore.addServerFile;
  const messages = sessionStore.messages;
  const saveSessionModelSelection = sessionStore.saveSessionModelSelection;
  const getSessionModelSelection = sessionStore.getSessionModelSelection;
  const saveSessionAgentSelection = sessionStore.saveSessionAgentSelection;
  const getSessionAgentSelection = sessionStore.getSessionAgentSelection;
  const saveAgentModelForSession = sessionStore.saveAgentModelForSession;
  const getAgentModelForSession = sessionStore.getAgentModelForSession;

  const currentProvider = getCurrentProvider();
  const models = Array.isArray(currentProvider?.models) ? currentProvider.models : [];

  // Track previous values to detect changes
  const prevSessionIdRef = React.useRef<string | null>(null);
  const prevAgentNameRef = React.useRef<string | undefined>(undefined);
  
  // Per-session agent-specific model memory
  const sessionAgentModelsRef = React.useRef<Map<string, Map<string, { providerID: string; modelID: string }>>>(new Map());
  
  // Auto-switch to session's last used model when session changes (one-time)
  React.useEffect(() => {
    try {
      if (currentSessionId && currentSessionId !== prevSessionIdRef.current) {
        prevSessionIdRef.current = currentSessionId;

        // Initialize sessionAgentModelsRef for this session
        if (!sessionAgentModelsRef.current.has(currentSessionId)) {
          const sessionMap = new Map();

          // Get session-specific model selection
          const sessionModelSelection = getSessionModelSelection(currentSessionId);
          if (sessionModelSelection) {
            sessionMap.set('__session_model__', {
              providerID: sessionModelSelection.providerId,
              modelID: sessionModelSelection.modelId
            });
          }

          sessionAgentModelsRef.current.set(currentSessionId, sessionMap);
        }

        // Get session-specific agent selection (after model selection is set up)
        if (getSessionAgentSelection && typeof getSessionAgentSelection === 'function') {
          const sessionAgentSelection = getSessionAgentSelection(currentSessionId);
          if (sessionAgentSelection && currentAgentName !== sessionAgentSelection) {
            setAgent(sessionAgentSelection);
          }
        }

      // Check for session-specific model selection first
      if (getSessionModelSelection && typeof getSessionModelSelection === 'function') {
        const sessionModelSelection = getSessionModelSelection(currentSessionId);
        if (sessionModelSelection) {
          const sessionProvider = providers.find(p => p.id === sessionModelSelection.providerId);
          if (sessionProvider) {
            const sessionModelExists = Array.isArray(sessionProvider.models)
              ? sessionProvider.models.find((m: any) => m.id === sessionModelSelection.modelId)
              : null;

            if (sessionModelExists) {
              setProvider(sessionModelSelection.providerId);
              setModel(sessionModelSelection.modelId);
              return;
            }
          }
        }
      }

        // Fall back to last message model if no session-specific selection
        const sessionModel = currentSessionId ? getLastMessageModel(currentSessionId) : null;
        if (sessionModel?.providerID && sessionModel?.modelID) {
          const sessionProvider = providers.find(p => p.id === sessionModel.providerID);
          if (sessionProvider) {
            const sessionModelExists = Array.isArray(sessionProvider.models)
              ? sessionProvider.models.find((m: any) => m.id === sessionModel.modelID)
              : null;

            if (sessionModelExists) {
              setProvider(sessionModel.providerID);
              setModel(sessionModel.modelID);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error in ModelControls session switching useEffect:', error);
    }
  }, [currentSessionId, getLastMessageModel, providers, setProvider, setModel, agents, getSessionModelSelection, getSessionAgentSelection, setAgent, currentAgentName]);
  
  // Handle agent changes - trust config store's persistence, only override for session-specific choices
  React.useEffect(() => {
    try {
      if (currentAgentName !== prevAgentNameRef.current) {
        prevAgentNameRef.current = currentAgentName;

        if (currentAgentName && currentSessionId) {
          // First check the persisted agent-specific model from the store
          const persistedChoice = getAgentModelForSession(currentSessionId, currentAgentName);
          
          if (persistedChoice) {
            // Apply the persisted choice
            const userProvider = providers.find(p => p.id === persistedChoice.providerId);
            if (userProvider) {
              const userModel = Array.isArray(userProvider.models)
                ? userProvider.models.find((m: any) => m.id === persistedChoice.modelId)
                : null;

              if (userModel) {
                setProvider(persistedChoice.providerId);
                setModel(persistedChoice.modelId);
                
                // Update the local ref too
                if (!sessionAgentModelsRef.current.has(currentSessionId)) {
                  sessionAgentModelsRef.current.set(currentSessionId, new Map());
                }
                const sessionMap = sessionAgentModelsRef.current.get(currentSessionId)!;
                sessionMap.set(currentAgentName, {
                  providerID: persistedChoice.providerId,
                  modelID: persistedChoice.modelId
                });
                return;
              }
            }
          }
          
          // Check the in-memory session map (for changes within current browser session)
          const sessionMap = sessionAgentModelsRef.current.get(currentSessionId);
          if (!sessionMap) {
            sessionAgentModelsRef.current.set(currentSessionId, new Map());
          }
          
          const userChoice = sessionMap?.get(currentAgentName);

          if (userChoice) {
            const userProvider = providers.find(p => p.id === userChoice.providerID);
            if (userProvider) {
              const userModel = Array.isArray(userProvider.models)
                ? userProvider.models.find((m: any) => m.id === userChoice.modelID)
                : null;

              if (userModel) {
                setProvider(userChoice.providerID);
                setModel(userChoice.modelID);
                return;
              }
            }
          }
          // If no saved choice - the config store has already set the agent's default
        }
      }
    } catch (error) {
      console.error('Error in ModelControls agent change useEffect:', error);
    }
  }, [currentAgentName, currentSessionId, providers, setProvider, setModel, currentProviderId, currentModelId]);

  const handleProviderChange = (providerId: string) => {
    try {
      setProvider(providerId);

      // Remember this manual provider change for current session + agent
      if (currentSessionId && currentAgentName) {
        if (!sessionAgentModelsRef.current.has(currentSessionId)) {
          sessionAgentModelsRef.current.set(currentSessionId, new Map());
        }
        const sessionMap = sessionAgentModelsRef.current.get(currentSessionId)!;
        sessionMap.set(currentAgentName, {
          providerID: providerId,
          modelID: currentModelId
        });

        // Save to session store for session-specific persistence
        saveSessionModelSelection(currentSessionId, providerId, currentModelId);
      }
    } catch (error) {
      console.error('Error in handleProviderChange:', error);
    }
  };

  const handleModelChange = (modelId: string) => {
    try {
      // First, find which provider this model belongs to
      let targetProviderId = currentProviderId;
      for (const provider of providers) {
        if (Array.isArray(provider.models)) {
          const modelExists = provider.models.find((m: any) => m.id === modelId);
          if (modelExists) {
            targetProviderId = provider.id;
            break;
          }
        }
      }

      // Set both provider and model to ensure they're consistent
      setProvider(targetProviderId);
      setModel(modelId);

      // Remember this manual model choice for current session + agent
      if (currentSessionId && currentAgentName) {
        if (!sessionAgentModelsRef.current.has(currentSessionId)) {
          sessionAgentModelsRef.current.set(currentSessionId, new Map());
        }
        const sessionMap = sessionAgentModelsRef.current.get(currentSessionId)!;
        const choice = {
          providerID: targetProviderId,
          modelID: modelId
        };
        sessionMap.set(currentAgentName, choice);

        // Save to session store for session-specific persistence
        saveSessionModelSelection(currentSessionId, targetProviderId, modelId);
      }
    } catch (error) {
      console.error('Error in handleModelChange:', error);
    }
  };

  const handleAgentChange = (agentName: string) => {
    try {
      setAgent(agentName);
      
      // Save session-specific agent selection
      if (currentSessionId) {
        saveSessionAgentSelection(currentSessionId, agentName);
      }
    } catch (error) {
      console.error('Error in handleAgentChange:', error);
    }
  };

  const handleProviderAndModelChange = (providerId: string, modelId: string) => {
    try {
      // Set both provider and model together to ensure consistency
      setProvider(providerId);
      setModel(modelId);

      // Save for the current agent in the current session
      if (currentSessionId && currentAgentName) {
        // Update the local ref for immediate use
        if (!sessionAgentModelsRef.current.has(currentSessionId)) {
          sessionAgentModelsRef.current.set(currentSessionId, new Map());
        }
        const sessionMap = sessionAgentModelsRef.current.get(currentSessionId)!;
        sessionMap.set(currentAgentName, {
          providerID: providerId,
          modelID: modelId
        });
        
        // Save to persistent store for this specific agent
        saveAgentModelForSession(currentSessionId, currentAgentName, providerId, modelId);
        
        // Also save to session store for backward compatibility
        saveSessionModelSelection(currentSessionId, providerId, modelId);
      }
    } catch (error) {
      console.error('Error in handleProviderAndModelChange:', error);
    }
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

  const getCurrentModelDisplayName = () => {
    if (!currentModelId || models.length === 0) return 'Select Model';
    const currentModel = models.find((m: any) => m.id === currentModelId);
    return getModelDisplayName(currentModel);
  };

  const getAgentDisplayName = () => {
    if (!currentAgentName) {
      const primaryAgents = agents.filter(agent => agent.mode === 'primary');
      const buildAgent = primaryAgents.find(agent => agent.name === 'build');
      const defaultAgent = buildAgent || primaryAgents[0];
      return defaultAgent ? capitalizeAgentName(defaultAgent.name) : 'Select Agent';
    }
    const agent = agents.find(a => a.name === currentAgentName);
    return agent ? capitalizeAgentName(agent.name) : capitalizeAgentName(currentAgentName);
  };

  const getProviderLogoUrl = (providerId: string) => {
    return `https://models.dev/logos/${providerId.toLowerCase()}.svg`;
  };

  const capitalizeAgentName = (name: string) => {
    return name.charAt(0).toUpperCase() + name.slice(1);
  };

  const handleServerFilesSelected = async (files: any[]) => {
    // For each selected server file, add it as a server-side attachment
    for (const file of files) {
      try {
        // Pass the full path and the filename
        await addServerFile(file.path, file.name);
      } catch (error) {
        console.error('Failed to attach server file:', error);
      }
    }
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
        .model-controls img {
          filter: brightness(0.9) contrast(1.1);
        }
        .model-controls img:hover {
          filter: brightness(1) contrast(1.2);
        }
        .dark .model-controls img,
        .dark [data-slot="select-content"] img,
        .dark [data-radix-popper-content-wrapper] img {
          filter: brightness(0.9) contrast(1.1) invert(1);
        }
        .dark .model-controls img:hover,
        .dark [data-slot="select-content"] img:hover,
        .dark [data-radix-popper-content-wrapper] img:hover {
          filter: brightness(1) contrast(1.2) invert(1);
        }
      `}</style>
      <div className="w-full py-2 px-4 model-controls">
        <div className="max-w-3xl mx-auto flex items-center justify-between relative">
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
          {/* Combined Provider + Model Selector */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <div className="flex items-center gap-1 px-2 rounded bg-accent/20 border border-border/20 h-6 min-w-0 max-w-[250px] cursor-pointer hover:bg-accent/30 transition-colors">
                <img 
                  src={getProviderLogoUrl(currentProviderId)} 
                  alt={`${getProviderDisplayName()} logo`}
                  className="h-3 w-3 flex-shrink-0"
                  onError={(e) => {
                    // Fallback to Sparkles icon if logo fails to load
                    const target = e.target as HTMLImageElement;
                    target.style.display = 'none';
                    const sparklesIcon = target.nextElementSibling as HTMLElement;
                    if (sparklesIcon) sparklesIcon.style.display = 'block';
                  }}
                />
                <Sparkles className="h-3 w-3 text-primary/60 hidden" />
                <span 
                  key={`${currentProviderId}-${currentModelId}`}
                  className="text-[11px] font-medium min-w-0 truncate flex-1"
                >
                  {getCurrentModelDisplayName()}
                </span>
                <ChevronDown className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="max-w-[300px]">
              {providers.map((provider) => {
                const providerModels = Array.isArray(provider.models) ? provider.models : [];
                
                if (providerModels.length === 0) {
                  return (
                    <DropdownMenuItem 
                      key={provider.id} 
                      disabled 
                      className="typography-xs text-muted-foreground"
                    >
                      <img 
                        src={getProviderLogoUrl(provider.id)} 
                        alt={`${provider.name} logo`}
                        className="h-3 w-3 flex-shrink-0 mr-2"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                      {provider.name} (No models)
                    </DropdownMenuItem>
                  );
                }
                
                return (
                  <DropdownMenuSub key={provider.id}>
                    <DropdownMenuSubTrigger className="typography-xs">
                      <img 
                        src={getProviderLogoUrl(provider.id)} 
                        alt={`${provider.name} logo`}
                        className="h-3 w-3 flex-shrink-0 mr-2"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                      {provider.name}
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent 
                      className="max-h-[320px] overflow-y-auto min-w-[200px]" 
                      sideOffset={2}
                      collisionPadding={8}
                      avoidCollisions={true}
                    >
                      {providerModels.map((model: any) => (
                        <DropdownMenuItem 
                          key={model.id}
                          className="typography-xs"
                           onSelect={() => {
                             handleProviderAndModelChange(provider.id, model.id);
                           }}
                        >
                          {getModelDisplayName(model)}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

          {/* Server File Picker */}
          <ServerFilePicker
            onFilesSelected={handleServerFilesSelected}
            multiSelect={true}
          >
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 ml-1 hover:bg-accent/30"
              title="Attach files from project"
            >
              <FolderOpen className="h-3 w-3" />
            </Button>
          </ServerFilePicker>

          {/* Agent Selector - Right Side */}
          <div className="flex-shrink-0">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <div className={cn(
                  "flex items-center gap-1 px-2 rounded transition-colors h-6 min-w-0 max-w-[150px] cursor-pointer",
                  currentAgentName 
                    ? cn("agent-badge", getAgentColor(currentAgentName).class)
                    : "bg-accent/20 border-border/20 hover:bg-accent/30"
                )}>
                  <Settings className={cn(
                    "h-3 w-3 flex-shrink-0",
                    currentAgentName ? "" : "text-muted-foreground"
                  )} />
                  <span className={cn(
                    "text-[11px] font-medium min-w-0 truncate flex-1"
                  )}>
                    {getAgentDisplayName()}
                  </span>
                  {currentAgentName ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        // Switch to default agent instead of clearing
                        const primaryAgents = agents.filter(agent => agent.mode === 'primary');
                        const buildAgent = primaryAgents.find(agent => agent.name === 'build');
                        const defaultAgent = buildAgent || primaryAgents[0];
                        if (defaultAgent && defaultAgent.name !== currentAgentName) {
                          handleAgentChange(defaultAgent.name);
                        }
                      }}
                      className="p-0.5 hover:bg-background/60 rounded transition-colors"
                      title="Switch to default agent"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  ) : (
                    <ChevronDown className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                  )}
                </div>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {agents.filter(agent => agent.mode === 'primary').map((agent) => (
                  <DropdownMenuItem 
                    key={agent.name} 
                    className="typography-xs"
                    onSelect={() => handleAgentChange(agent.name)}
                  >
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-1.5">
                        <div className={cn(
                          "h-1 w-1 rounded-full agent-dot",
                          getAgentColor(agent.name).class
                        )} />
                        <span className="font-medium">{capitalizeAgentName(agent.name)}</span>
                      </div>
                      {agent.description && (
                        <span className="typography-xs text-muted-foreground max-w-[200px] ml-2.5 break-words">
                          {agent.description}
                        </span>
                      )}
                    </div>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

    </>
  );
};