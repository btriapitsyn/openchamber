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

    const {
        currentSessionId,
        addServerFile,
        saveSessionAgentSelection,
        getSessionAgentSelection,
        saveAgentModelForSession,
        getAgentModelForSession,
        analyzeAndSaveExternalSessionChoices
    } = useSessionStore();

    const currentProvider = getCurrentProvider();
    const models = Array.isArray(currentProvider?.models) ? currentProvider.models : [];

    // Track previous values to detect changes
    const prevSessionIdRef = React.useRef<string | null>(null);
    const prevAgentNameRef = React.useRef<string | undefined>(undefined);

    // Auto-switch to session's last used model when session changes (one-time)
    React.useEffect(() => {
        const handleSessionSwitch = async () => {
            try {
                if (currentSessionId && currentSessionId !== prevSessionIdRef.current) {
                    prevSessionIdRef.current = currentSessionId;

                    // Get session-specific agent selection
                    if (getSessionAgentSelection && typeof getSessionAgentSelection === 'function') {
                        const sessionAgentSelection = getSessionAgentSelection(currentSessionId);
                        if (sessionAgentSelection && currentAgentName !== sessionAgentSelection) {
                            setAgent(sessionAgentSelection);
                        }
                    }

                    // Check if we already have agent selections for this session
                    const hasAnyAgentSelections = agents.some(agent =>
                        getAgentModelForSession(currentSessionId, agent.name) !== null
                    );

                    if (!hasAnyAgentSelections) {
                        // Try to analyze external session choices (TUI, API, etc.) with immediate UI update
                        try {
                            await analyzeAndSaveExternalSessionChoices(currentSessionId, agents);

                            // Check if current agent has a discovered model after analysis
                            const currentAgentModel = currentAgentName ? getAgentModelForSession(currentSessionId, currentAgentName) : null;
                            if (currentAgentModel) {
                                const agentProvider = providers.find(p => p.id === currentAgentModel.providerId);
                                if (agentProvider) {
                                    const agentModelExists = Array.isArray(agentProvider.models)
                                        ? agentProvider.models.find((m: any) => m.id === currentAgentModel.modelId)
                                        : null;

                                    if (agentModelExists) {
                                        setProvider(currentAgentModel.providerId);
                                        setModel(currentAgentModel.modelId);
                                        return;
                                    }
                                }
                            }
                        } catch (error) {
                            console.error('Error during session analysis:', error);
                        }

                        // Analysis complete - any discovered models are now in persistent storage
                        // Agent switching will automatically pick up the discovered models
                    } else {
                        // We have agent selections - apply the current agent's model immediately
                        const currentAgentModel = currentAgentName ? getAgentModelForSession(currentSessionId, currentAgentName) : null;
                        if (currentAgentModel) {
                            const agentProvider = providers.find(p => p.id === currentAgentModel.providerId);
                            if (agentProvider) {
                                const agentModelExists = Array.isArray(agentProvider.models)
                                    ? agentProvider.models.find((m: any) => m.id === currentAgentModel.modelId)
                                    : null;

                                if (agentModelExists) {
                                    setProvider(currentAgentModel.providerId);
                                    setModel(currentAgentModel.modelId);
                                }
                            }
                        }
                    }
                }
            } catch (error) {
                console.error('Error in ModelControls session switching useEffect:', error);
            }
        };

        handleSessionSwitch();
    }, [currentSessionId, providers, setProvider, setModel, agents, getSessionAgentSelection, setAgent, currentAgentName, analyzeAndSaveExternalSessionChoices, getAgentModelForSession]);

    // Handle agent changes - prioritize session-specific choices with proper fallback hierarchy
    React.useEffect(() => {
        const handleAgentSwitch = async () => {
            try {
                if (currentAgentName !== prevAgentNameRef.current) {
                    prevAgentNameRef.current = currentAgentName;

                    if (currentAgentName && currentSessionId) {
                        // Use a small delay to ensure config store setAgent completes first
                        await new Promise(resolve => setTimeout(resolve, 50));

                        // Check for persisted agent-specific model choice
                        const persistedChoice = getAgentModelForSession(currentSessionId, currentAgentName);

                        if (persistedChoice) {
                            // Apply the persisted choice immediately - this overrides config store defaults
                            const userProvider = providers.find(p => p.id === persistedChoice.providerId);
                            if (userProvider) {
                                const userModel = Array.isArray(userProvider.models)
                                    ? userProvider.models.find((m: any) => m.id === persistedChoice.modelId)
                                    : null;

                                if (userModel) {
                                    // Force update to override config store defaults
                                    setProvider(persistedChoice.providerId);
                                    setModel(persistedChoice.modelId);
                                    return;
                                }
                            }
                        }

                        // No persistent choice found - config store defaults will be used
                    }
                }
            } catch (error) {
                console.error('Error in ModelControls agent change useEffect:', error);
            }
        };

        handleAgentSwitch();
    }, [currentAgentName, currentSessionId, providers, setProvider, setModel, getAgentModelForSession]);



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
                // Save to persistent store for this specific agent
                saveAgentModelForSession(currentSessionId, currentAgentName, providerId, modelId);
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
