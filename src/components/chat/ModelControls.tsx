import React from 'react';
import type { SVGProps } from 'react';
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
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { MagicWand as Sparkles, Gear, Brain, CaretDown as ChevronDown, CaretRight as ChevronRight, Folder as FolderOpen, Wrench, FileImage as ImageIcon, FileAudio, FileVideo, TextT as FileText, FilePdf, CheckCircle as ShieldCheck, Question as Shield, XCircle as ShieldOff } from '@phosphor-icons/react';
import type { ModelMetadata } from '@/types';

type IconComponent = React.ComponentType<SVGProps<SVGSVGElement>>;
import { useConfigStore } from '@/stores/useConfigStore';
import { useSessionStore } from '@/stores/useSessionStore';
import { useDeviceInfo } from '@/lib/device';
import { cn } from '@/lib/utils';
import { ServerFilePicker } from './ServerFilePicker';
import { MobileOverlayPanel } from '@/components/ui/MobileOverlayPanel';
import { getAgentColor } from '@/lib/agentColors';

interface ModelControlsProps {
    typingIndicator?: boolean;
}

const isPrimaryMode = (mode?: string) => mode === 'primary' || mode === 'all' || mode === undefined || mode === null;

interface CapabilityDefinition {
    key: 'tool_call' | 'reasoning';
    icon: IconComponent;
    label: string;
    isActive: (metadata?: ModelMetadata) => boolean;
}

const CAPABILITY_DEFINITIONS: CapabilityDefinition[] = [
    {
        key: 'tool_call',
        icon: Wrench,
        label: 'Tool calling',
        isActive: (metadata) => metadata?.tool_call === true,
    },
    {
        key: 'reasoning',
        icon: Brain,
        label: 'Reasoning',
        isActive: (metadata) => metadata?.reasoning === true,
    },
];

interface ModalityIconDefinition {
    icon: IconComponent;
    label: string;
}

type ModalityIcon = {
    key: string;
    icon: IconComponent;
    label: string;
};

type EditPermissionMode = 'allow' | 'ask' | 'deny';

const MODALITY_ICON_MAP: Record<string, ModalityIconDefinition> = {
    text: { icon: FileText, label: 'Text' },
    image: { icon: ImageIcon, label: 'Image' },
    video: { icon: FileVideo, label: 'Video' },
    audio: { icon: FileAudio, label: 'Audio' },
    pdf: { icon: FilePdf, label: 'PDF' },
};

const normalizeModality = (value: string) => value.trim().toLowerCase();

const getModalityIcons = (metadata: ModelMetadata | undefined, direction: 'input' | 'output'): ModalityIcon[] => {
    const modalityList = direction === 'input' ? metadata?.modalities?.input : metadata?.modalities?.output;
    if (!Array.isArray(modalityList) || modalityList.length === 0) {
        return [];
    }

    const uniqueValues = Array.from(new Set(modalityList.map((item) => normalizeModality(item))));

    return uniqueValues
        .map((modality) => {
            const definition = MODALITY_ICON_MAP[modality];
            if (!definition) {
                return null;
            }
            return {
                key: modality,
                icon: definition.icon,
                label: definition.label,
            } satisfies ModalityIcon;
        })
        .filter((entry): entry is ModalityIcon => Boolean(entry));
};

const COMPACT_NUMBER_FORMATTER = new Intl.NumberFormat('en-US', {
    notation: 'compact',
    compactDisplay: 'short',
    maximumFractionDigits: 1,
    minimumFractionDigits: 0,
});

const CURRENCY_FORMATTER = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 4,
    minimumFractionDigits: 2,
});

const formatTokens = (value?: number | null) => {
    if (typeof value !== 'number' || Number.isNaN(value)) {
        return '—';
    }

    if (value === 0) {
        return '0';
    }

    const formatted = COMPACT_NUMBER_FORMATTER.format(value);
    return formatted.endsWith('.0') ? formatted.slice(0, -2) : formatted;
};

const formatCost = (value?: number | null) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return '—';
    }

    return CURRENCY_FORMATTER.format(value);
};

const getCapabilityIcons = (metadata?: ModelMetadata) => {
    return CAPABILITY_DEFINITIONS.filter((definition) => definition.isActive(metadata)).map((definition) => ({
        key: definition.key,
        icon: definition.icon,
        label: definition.label,
    }));
};

const formatKnowledge = (knowledge?: string) => {
    if (!knowledge) {
        return '—';
    }

    const match = knowledge.match(/^(\d{4})-(\d{2})$/);
    if (match) {
        const year = Number.parseInt(match[1], 10);
        const monthIndex = Number.parseInt(match[2], 10) - 1;
        const knowledgeDate = new Date(Date.UTC(year, monthIndex, 1));
        if (!Number.isNaN(knowledgeDate.getTime())) {
            return new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' }).format(knowledgeDate);
        }
    }

    return knowledge;
};

const formatDate = (value?: string) => {
    if (!value) {
        return '—';
    }

    const parsedDate = new Date(value);
    if (Number.isNaN(parsedDate.getTime())) {
        return value;
    }

    return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    }).format(parsedDate);
};

export const ModelControls: React.FC<ModelControlsProps> = ({ typingIndicator = false }) => {
    const {
        providers,
        agents,
        currentProviderId,
        currentModelId,
        currentAgentName,
        setProvider,
        setModel,
        setAgent,
        getCurrentProvider,
        getModelMetadata,
        getCurrentAgent,
    } = useConfigStore();

    const {
        currentSessionId,
        addServerFile,
        saveSessionAgentSelection,
        getSessionAgentSelection,
        saveAgentModelForSession,
        getAgentModelForSession,
        analyzeAndSaveExternalSessionChoices,
        getSessionAgentEditMode,
        toggleSessionAgentEditMode,
    } = useSessionStore();

    const { isMobile } = useDeviceInfo();
    const [activeMobilePanel, setActiveMobilePanel] = React.useState<'model' | 'agent' | null>(null);
    const closeMobilePanel = React.useCallback(() => setActiveMobilePanel(null), []);
    const [expandedMobileProviders, setExpandedMobileProviders] = React.useState<Set<string>>(() => {
        const initial = new Set<string>();
        if (currentProviderId) {
            initial.add(currentProviderId);
        }
        return initial;
    });

    React.useEffect(() => {
        if (activeMobilePanel === 'model') {
            setExpandedMobileProviders(() => {
                const initial = new Set<string>();
                if (currentProviderId) {
                    initial.add(currentProviderId);
                }
                return initial;
            });
        }
    }, [activeMobilePanel, currentProviderId]);

    const currentAgent = getCurrentAgent?.();
    const agentPermissionRaw = (currentAgent as any)?.permission?.edit;
    let agentDefaultEditMode: EditPermissionMode = 'ask';
    if (agentPermissionRaw === 'allow' || agentPermissionRaw === 'ask' || agentPermissionRaw === 'deny') {
        agentDefaultEditMode = agentPermissionRaw;
    }

    const editToolConfigured = currentAgent ? (((currentAgent as any)?.tools?.edit) !== false) : false;
    if (!currentAgent || !editToolConfigured) {
        agentDefaultEditMode = 'deny';
    }

    const isDefaultAllow = agentDefaultEditMode === 'allow';
    const isDefaultDeny = agentDefaultEditMode === 'deny';

    const effectiveEditMode: EditPermissionMode = !isDefaultAllow && currentSessionId && currentAgentName
        ? getSessionAgentEditMode(currentSessionId, currentAgentName, agentDefaultEditMode)
        : agentDefaultEditMode;

    const isAutoApproveEnabled = effectiveEditMode === 'allow';
    const isToggleInteractive = !isDefaultAllow && !isDefaultDeny;
    const editToggleDisabled = !isToggleInteractive || !currentSessionId || !currentAgentName;

    const editToggleLabel = (() => {
        if (isDefaultDeny) {
            return 'This agent cannot edit files';
        }
        if (isDefaultAllow) {
            return 'Agent is configured with full edit access';
        }
        return isAutoApproveEnabled ? 'Auto-approve edits' : 'Ask before edits';
    })();

    const buttonHeight = isMobile ? 'h-8' : 'h-6';
    const squareButtonSize = isMobile ? 'h-8 w-8' : 'h-6 w-6';
    const editToggleIconClass = isMobile ? 'h-4 w-4' : 'h-3 w-3';

    const editToggleIcon = (() => {
        if (isDefaultDeny) {
            return <ShieldOff className={editToggleIconClass} />;
        }
        if (isDefaultAllow) {
            return <ShieldCheck className={editToggleIconClass} />;
        }
        return isAutoApproveEnabled
            ? <ShieldCheck className={editToggleIconClass} />
            : <Shield weight="regular" className={editToggleIconClass} />;
    })();

    const handleToggleEditPermission = React.useCallback(() => {
        if (editToggleDisabled || !currentSessionId || !currentAgentName) {
            return;
        }
        toggleSessionAgentEditMode(currentSessionId, currentAgentName, agentDefaultEditMode);
    }, [editToggleDisabled, currentSessionId, currentAgentName, toggleSessionAgentEditMode, agentDefaultEditMode]);

    // Dynamic sizing for controls


    const currentProvider = getCurrentProvider();
    const models = Array.isArray(currentProvider?.models) ? currentProvider.models : [];

    const currentMetadata =
        currentProviderId && currentModelId ? getModelMetadata(currentProviderId, currentModelId) : undefined;
    const currentCapabilityIcons = getCapabilityIcons(currentMetadata);
    const inputModalityIcons = getModalityIcons(currentMetadata, 'input');
    const outputModalityIcons = getModalityIcons(currentMetadata, 'output');

    const costRows = [
        { label: 'Input', value: formatCost(currentMetadata?.cost?.input) },
        { label: 'Output', value: formatCost(currentMetadata?.cost?.output) },
        { label: 'Cache read', value: formatCost(currentMetadata?.cost?.cache_read) },
        { label: 'Cache write', value: formatCost(currentMetadata?.cost?.cache_write) },
    ];

    const limitRows = [
        { label: 'Context', value: formatTokens(currentMetadata?.limit?.context) },
        { label: 'Output', value: formatTokens(currentMetadata?.limit?.output) },
    ];

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
                            // Error during session analysis
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
                // Error in ModelControls session switching useEffect
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
                // Error in ModelControls agent change useEffect
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
            if (isMobile) {
                closeMobilePanel();
            }
        } catch (error) {
            // Error in handleAgentChange
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
            if (isMobile) {
                closeMobilePanel();
            }
        } catch (error) {
            // Error in handleProviderAndModelChange
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
        if (!currentProviderId || !currentModelId) return 'Not selected';
        if (models.length === 0) return 'Not selected';
        const currentModel = models.find((m: any) => m.id === currentModelId);
        return getModelDisplayName(currentModel);
    };

    const getAgentDisplayName = () => {
        if (!currentAgentName) {
            const primaryAgents = agents.filter(agent => isPrimaryMode(agent.mode));
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
                // Failed to attach server file
            }
        }
    };

    const renderIconBadge = (IconComp: IconComponent, label: string, key: string) => (
        <span
            key={key}
            className="flex h-5 w-5 items-center justify-center rounded-sm bg-muted/60 text-muted-foreground"
            title={label}
            aria-label={label}
            role="img"
        >
            <IconComp className="h-3.5 w-3.5" />
        </span>
    );

    const toggleMobileProviderExpansion = React.useCallback((providerId: string) => {
        setExpandedMobileProviders((prev) => {
            const next = new Set(prev);
            if (next.has(providerId)) {
                next.delete(providerId);
            } else {
                next.add(providerId);
            }
            return next;
        });
    }, []);

    const renderMobileModelPanel = () => {
        if (!isMobile) return null;

        return (
            <MobileOverlayPanel
                open={activeMobilePanel === 'model'}
                onClose={closeMobilePanel}
                title="Select model"
            >
                <div className="space-y-2">
                    {providers.map((provider) => {
                        const providerModels = Array.isArray(provider.models) ? provider.models : [];
                        if (providerModels.length === 0) {
                            return null;
                        }

                        const isActiveProvider = provider.id === currentProviderId;
                        const isExpanded = expandedMobileProviders.has(provider.id);

                        return (
                            <div key={provider.id} className="rounded-md border border-border/40 bg-background/95">
                                <button
                                    type="button"
                                    onClick={() => toggleMobileProviderExpansion(provider.id)}
                                    className="flex w-full items-center justify-between gap-1.5 px-2 py-1.5 text-left"
                                    aria-expanded={isExpanded}
                                >
                                    <div className="flex items-center gap-2">
                                        <img
                                            src={getProviderLogoUrl(provider.id)}
                                            alt={`${provider.name} logo`}
                                            className="h-3.5 w-3.5 dark:invert"
                                            onError={(event) => {
                                                (event.target as HTMLImageElement).style.display = 'none';
                                            }}
                                        />
                                        <span className="typography-meta font-medium text-foreground">
                                            {provider.name}
                                        </span>
                                        {isActiveProvider && (
                                            <span className="typography-micro text-primary/80">Current</span>
                                        )}
                                    </div>
                                    {isExpanded ? (
                                        <ChevronDown className="h-3 w-3 text-muted-foreground" />
                                    ) : (
                                        <ChevronRight className="h-3 w-3 text-muted-foreground" />
                                    )}
                                </button>

                                {isExpanded && (
                                    <div className="flex flex-col border-t border-border/30">
                                        {providerModels.map((model: any) => {
                                            const isSelected = isActiveProvider && model.id === currentModelId;
                                            const metadata = getModelMetadata(provider.id, model.id);
                                            const capabilityIcons = getCapabilityIcons(metadata).slice(0, 3);
                                            const inputIcons = getModalityIcons(metadata, 'input');

                                            return (
                                                <button
                                                    key={model.id}
                                                    type="button"
                                                    onClick={() => handleProviderAndModelChange(provider.id, model.id)}
                                                    className={cn(
                                                        'flex w-full items-start gap-2 border-b border-border/30 px-2 py-1.5 text-left last:border-b-0',
                                                        'transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-primary',
                                                        isSelected
                                                            ? 'bg-primary/15 text-primary'
                                                            : 'hover:bg-accent/40'
                                                    )}
                                                >
                                                    <div className="flex min-w-0 flex-col">
                                                        <span className="typography-meta font-medium text-foreground">
                                                            {getModelDisplayName(model)}
                                                        </span>
                                                        <div className="flex flex-wrap items-center gap-1 pt-0.5">
                                                            {capabilityIcons.map(({ key, icon: IconComponent, label }) => (
                                                                <span
                                                                    key={`cap-${provider.id}-${model.id}-${key}`}
                                                                    className="flex h-4 w-4 items-center justify-center text-muted-foreground"
                                                                    title={label}
                                                                    aria-label={label}
                                                                >
                                                                    <IconComponent className="h-3 w-3" />
                                                                </span>
                                                            ))}
                                                            {inputIcons.map(({ key, icon: IconComponent, label }) => (
                                                                <span
                                                                    key={`input-${provider.id}-${model.id}-${key}`}
                                                                    className="flex h-4 w-4 items-center justify-center text-muted-foreground"
                                                                    title={`${label} input`}
                                                                    aria-label={`${label} input`}
                                                                >
                                                                    <IconComponent className="h-3 w-3" />
                                                                </span>
                                                            ))}
                                                        </div>
                                                        <div className="typography-micro text-muted-foreground/80">
                                                            <span>Ctx {formatTokens(metadata?.limit?.context)}</span>
                                                            <span className="mx-1">•</span>
                                                            <span>Output {formatTokens(metadata?.limit?.output)}</span>
                                                        </div>
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </MobileOverlayPanel>
        );
    };

    const renderMobileAgentPanel = () => {
        if (!isMobile) return null;

        const primaryAgents = agents.filter(agent => isPrimaryMode(agent.mode));

        return (
            <MobileOverlayPanel
                open={activeMobilePanel === 'agent'}
                onClose={closeMobilePanel}
                title="Select agent"
            >
                <div className="flex flex-col gap-1.5">
                    {primaryAgents.map((agent) => {
                        const isSelected = agent.name === currentAgentName;
                        const agentColor = getAgentColor(agent.name);
                        return (
                            <button
                                key={agent.name}
                                type="button"
                                className={cn(
                                    'flex w-full flex-col gap-1 rounded-md border px-2 py-1.5 text-left',
                                    'transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-primary agent-list-item',
                                    agentColor.class,
                                    isSelected ? 'active' : 'border-border/40'
                                )}
                                onClick={() => handleAgentChange(agent.name)}
                            >
                                <div className="flex items-center gap-1.5">
                                    <div className={cn('h-2 w-2 rounded-full', agentColor.class)} />
                                    <span
                                        className="typography-meta font-medium text-foreground"
                                        style={isSelected ? { color: `var(${agentColor.var})` } : undefined}
                                    >
                                        {capitalizeAgentName(agent.name)}
                                    </span>
                                </div>
                                {agent.description && (
                                    <span className="typography-micro text-muted-foreground">
                                        {agent.description}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>
            </MobileOverlayPanel>
        );
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
                <div className={cn(
                    'max-w-3xl mx-auto flex items-center relative',
                    isMobile ? 'justify-between' : 'justify-between'
                )}>
                    <div className={cn('flex items-center gap-1.5 min-w-0', isMobile ? 'w-fit' : 'flex-1')}>
                        {/* Combined Provider + Model Selector */}
                        <div className="flex items-center gap-2 min-w-0">
                            <Tooltip delayDuration={1000}>
                                {!isMobile ? (
                                    <DropdownMenu>
                                        <TooltipTrigger asChild>
                                            <DropdownMenuTrigger asChild>
                                                <div className={cn('flex items-center gap-1 px-2 rounded bg-accent/20 border border-border/20 min-w-0 max-w-[250px] cursor-pointer hover:bg-accent/30 transition-colors', buttonHeight)}>
                                                    {currentProviderId ? (
                                                        <>
                                                            <img
                                                                src={getProviderLogoUrl(currentProviderId)}
                                                                alt={`${getProviderDisplayName()} logo`}
                                                                className="h-3 w-3 flex-shrink-0 dark:invert"
                                                                onError={(e) => {
                                                                    const target = e.target as HTMLImageElement;
                                                                    target.style.display = 'none';
                                                                    const sparklesIcon = target.nextElementSibling as HTMLElement;
                                                                    if (sparklesIcon) sparklesIcon.style.display = 'block';
                                                                }}
                                                            />
                                                            <Sparkles className="h-3 w-3 text-primary/60 hidden" />
                                                        </>
                                                    ) : (
                                                        <Sparkles className="h-3 w-3 text-muted-foreground" />
                                                    )}
                                                    <span
                                                        key={`${currentProviderId}-${currentModelId}`}
                                                        className="typography-micro font-medium min-w-0 truncate flex-1"
                                                    >
                                                        {getCurrentModelDisplayName()}
                                                    </span>
                                                    <ChevronDown className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                                                </div>
                                            </DropdownMenuTrigger>
                                        </TooltipTrigger>
                                        <DropdownMenuContent className="max-w-[300px]">
                                        {providers.map((provider) => {
                                            const providerModels = Array.isArray(provider.models) ? provider.models : [];

                                            if (providerModels.length === 0) {
                                                return (
                                                    <DropdownMenuItem
                                                        key={provider.id}
                                                        disabled
                                                        className="typography-meta text-muted-foreground"
                                                    >
                                                        <img
                                                            src={getProviderLogoUrl(provider.id)}
                                                            alt={`${provider.name} logo`}
                                                            className="h-3 w-3 flex-shrink-0 mr-2 dark:invert"
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
                                                    <DropdownMenuSubTrigger className="typography-meta">
                                                        <img
                                                            src={getProviderLogoUrl(provider.id)}
                                                            alt={`${provider.name} logo`}
                                                            className="h-3 w-3 flex-shrink-0 mr-2 dark:invert"
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
                                                        {providerModels.map((model: any) => {
                                                            const metadata = getModelMetadata(provider.id, model.id);
                                                            const capabilityIcons = getCapabilityIcons(metadata).map((icon) => ({
                                                                ...icon,
                                                                id: `cap-${icon.key}`,
                                                            }));
                                                            const modalityIcons = [...getModalityIcons(metadata, 'input'), ...getModalityIcons(metadata, 'output')];
                                                            const uniqueModalityIcons = Array.from(
                                                                new Map(modalityIcons.map((icon) => [icon.key, icon])).values()
                                                            ).map((icon) => ({ ...icon, id: `mod-${icon.key}` }));
                                                            const indicatorIcons = [...capabilityIcons, ...uniqueModalityIcons];

                                                            return (
                                                                <DropdownMenuItem
                                                                    key={model.id}
                                                                    className="typography-meta"
                                                                    onSelect={() => {
                                                                        handleProviderAndModelChange(provider.id, model.id);
                                                                    }}
                                                                >
                                                                    <div className="flex items-center gap-2">
                                                                        <div className="flex flex-col">
                                                                            <span className="font-medium">{getModelDisplayName(model)}</span>
                                                                            <span className="typography-meta text-muted-foreground">
                                                                                {formatTokens(metadata?.limit?.context)} ctx • {formatTokens(metadata?.limit?.output)} out
                                                                            </span>
                                                                        </div>
                                                                        <div className="ml-auto flex items-center gap-1">
                                                                            {indicatorIcons.map(({ id, icon: Icon, label }) => (
                                                                                <span
                                                                                    key={id}
                                                                                    className="flex h-4 w-4 items-center justify-center text-muted-foreground"
                                                                                    aria-label={label}
                                                                                    role="img"
                                                                                    title={label}
                                                                                >
                                                                                    <Icon className="h-3 w-3" />
                                                                                </span>
                                                                            ))}
                                                                        </div>
                                                                    </div>
                                                                </DropdownMenuItem>
                                                            );
                                                        })}
                                                    </DropdownMenuSubContent>
                                                </DropdownMenuSub>
                                            );
                                        })}
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                ) : (
                                    <TooltipTrigger asChild>
                                        <button
                                            type="button"
                                            onClick={() => setActiveMobilePanel('model')}
                                            className={cn(
                                                'flex items-center gap-1 rounded border border-border/20 bg-accent/20 px-1.5 transition-colors',
                                                'min-w-0 max-w-[250px] cursor-pointer hover:bg-accent/30',
                                                buttonHeight
                                            )}
                                        >
                                            {currentProviderId ? (
                                                <img
                                                    src={getProviderLogoUrl(currentProviderId)}
                                                    alt={`${getProviderDisplayName()} logo`}
                                                    className="h-3 w-3 flex-shrink-0"
                                                    onError={(e) => {
                                                        (e.target as HTMLImageElement).style.display = 'none';
                                                    }}
                                                />
                                            ) : (
                                                <Sparkles className="h-3 w-3 text-muted-foreground" />
                                            )}
                                            <span className="typography-micro font-medium min-w-0 truncate flex-1">
                                                {getCurrentModelDisplayName()}
                                            </span>
                                            <ChevronDown className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                                        </button>
                                    </TooltipTrigger>
                                )}
                                <TooltipContent align="start" sideOffset={8} className="max-w-[320px]">
                                {currentMetadata ? (
                                    <div className="flex min-w-[240px] flex-col gap-3">
                                        <div className="flex flex-col gap-0.5">
                                            <span className="typography-micro font-semibold text-foreground">
                                                {currentMetadata.name || getCurrentModelDisplayName()}
                                            </span>
                                            <span className="typography-meta text-muted-foreground">{getProviderDisplayName()}</span>
                                        </div>
                                        <div className="flex flex-col gap-1.5">
                                            <span className="typography-meta font-semibold uppercase tracking-wide text-muted-foreground/90">Capabilities</span>
                                            <div className="flex flex-wrap items-center gap-1.5">
                                                {currentCapabilityIcons.length > 0 ? (
                                                    currentCapabilityIcons.map(({ key, icon, label }) =>
                                                        renderIconBadge(icon, label, `cap-${key}`)
                                                    )
                                                ) : (
                                                    <span className="typography-meta text-muted-foreground">—</span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex flex-col gap-1.5">
                                            <span className="typography-meta font-semibold uppercase tracking-wide text-muted-foreground/90">Modalities</span>
                                            <div className="flex flex-col gap-1">
                                                <div className="flex items-center justify-between gap-3">
                                                    <span className="typography-meta font-medium text-muted-foreground/80">Input</span>
                                                    <div className="flex items-center gap-1.5">
                                                        {inputModalityIcons.length > 0
                                                            ? inputModalityIcons.map(({ key, icon, label }) =>
                                                                  renderIconBadge(icon, `${label} input`, `input-${key}`)
                                                              )
                                                            : <span className="typography-meta text-muted-foreground">—</span>}
                                                    </div>
                                                </div>
                                                <div className="flex items-center justify-between gap-3">
                                                    <span className="typography-meta font-medium text-muted-foreground/80">Output</span>
                                                    <div className="flex items-center gap-1.5">
                                                        {outputModalityIcons.length > 0
                                                            ? outputModalityIcons.map(({ key, icon, label }) =>
                                                                  renderIconBadge(icon, `${label} output`, `output-${key}`)
                                                              )
                                                            : <span className="typography-meta text-muted-foreground">—</span>}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex flex-col gap-1.5">
                                            <span className="typography-meta font-semibold uppercase tracking-wide text-muted-foreground/90">Cost ($/1M tokens)</span>
                                            {costRows.map((row) => (
                                                <div key={row.label} className="flex items-center justify-between gap-3">
                                                    <span className="typography-meta font-medium text-muted-foreground/80">{row.label}</span>
                                                    <span className="typography-meta font-medium text-foreground">{row.value}</span>
                                                </div>
                                            ))}
                                        </div>
                                        <div className="flex flex-col gap-1.5">
                                            <span className="typography-meta font-semibold uppercase tracking-wide text-muted-foreground/90">Limits</span>
                                            {limitRows.map((row) => (
                                                <div key={row.label} className="flex items-center justify-between gap-3">
                                                    <span className="typography-meta font-medium text-muted-foreground/80">{row.label}</span>
                                                    <span className="typography-meta font-medium text-foreground">{row.value}</span>
                                                </div>
                                            ))}
                                        </div>
                                        <div className="flex flex-col gap-1.5">
                                            <span className="typography-meta font-semibold uppercase tracking-wide text-muted-foreground/90">Metadata</span>
                                            <div className="flex items-center justify-between gap-3">
                                                <span className="typography-meta font-medium text-muted-foreground/80">Knowledge</span>
                                                <span className="typography-meta font-medium text-foreground">{formatKnowledge(currentMetadata.knowledge)}</span>
                                            </div>
                                            <div className="flex items-center justify-between gap-3">
                                                <span className="typography-meta font-medium text-muted-foreground/80">Release</span>
                                                <span className="typography-meta font-medium text-foreground">{formatDate(currentMetadata.release_date)}</span>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="min-w-[200px] typography-meta text-muted-foreground">Model metadata unavailable.</div>
                                )}
                               </TooltipContent>
                            </Tooltip>
                        </div>

                    </div>

                    {/* Right Side Controls */}
                    <div className={cn('flex items-center', isMobile ? 'w-fit gap-1' : 'gap-1')}>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <span className="inline-flex">
                                    <Button
                                        type="button"
                                        size="icon"
                                        variant="ghost"
                                        onClick={handleToggleEditPermission}
                                        disabled={editToggleDisabled}
                                        aria-label={editToggleLabel}
                                        aria-pressed={isToggleInteractive ? isAutoApproveEnabled : undefined}
                                        className={cn(
                                            'px-0 transition-colors has-[>svg]:px-0',
                                            squareButtonSize,
                                            'rounded-md min-w-0 shrink-0',
                                            editToggleDisabled



                                                 ? (isDefaultAllow

                                                    ? 'text-primary/70 cursor-not-allowed opacity-80'
                                                    : 'text-muted-foreground/70 cursor-not-allowed opacity-70')
                                                : isAutoApproveEnabled
                                                    ? 'text-primary hover:bg-primary/10'
                                                    : 'text-muted-foreground hover:bg-muted/40'
                                        )}
                                    >
                                        {editToggleIcon}
                                    </Button>
                                </span>
                            </TooltipTrigger>
                            <TooltipContent>
                                <p>{editToggleLabel}</p>
                            </TooltipContent>
                        </Tooltip>
                        {/* Server File Picker */}
                        <ServerFilePicker
                            onFilesSelected={handleServerFilesSelected}
                            multiSelect={true}
                        >
                            <Button
                                size="icon"
                                variant="ghost"
                                className={cn('hover:bg-accent/30', squareButtonSize)}
                                title="Attach files from project"
                            >
                                <FolderOpen className={editToggleIconClass} />
                            </Button>
                        </ServerFilePicker>

                        {/* Agent Selector */}
                        <div className={cn(isMobile ? 'inline-flex' : 'flex-shrink-0')}>
                            {!isMobile ? (
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <div className={cn(
                                            'flex items-center gap-1 rounded transition-colors cursor-pointer',
                                            isMobile ? 'px-1.5' : 'px-2 min-w-0',
                                            buttonHeight,
                                            currentAgentName
                                                ? cn('agent-badge', getAgentColor(currentAgentName).class)
                                                : 'bg-accent/20 border-border/20 hover:bg-accent/30'
                                        )}>
                                            <Brain className={cn(
                                                'h-3 w-3 flex-shrink-0',
                                                currentAgentName ? '' : 'text-muted-foreground'
                                            )} />
                                            <span className={cn(
                                                'typography-micro font-medium',
                                                isMobile ? 'flex-1' : 'min-w-0 truncate flex-1'
                                            )}>
                                                {getAgentDisplayName()}
                                            </span>
                                            <ChevronDown className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                                        </div>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        {agents.filter(agent => isPrimaryMode(agent.mode)).map((agent) => (
                                            <DropdownMenuItem
                                                key={agent.name}
                                                className="typography-meta"
                                                onSelect={() => handleAgentChange(agent.name)}
                                            >
                                                <div className="flex flex-col gap-0.5">
                                                    <div className="flex items-center gap-1.5">
                                                        <div className={cn(
                                                            'h-1 w-1 rounded-full agent-dot',
                                                            getAgentColor(agent.name).class
                                                        )} />
                                                        <span className="font-medium">{capitalizeAgentName(agent.name)}</span>
                                                    </div>
                                                    {agent.description && (
                                                        <span className="typography-meta text-muted-foreground max-w-[200px] ml-2.5 break-words">
                                                            {agent.description}
                                                        </span>
                                                    )}
                                                </div>
                                            </DropdownMenuItem>
                                        ))}
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => setActiveMobilePanel('agent')}
                                    className={cn(
                                        'flex items-center gap-1 rounded px-1.5 transition-colors min-w-0 focus:outline-none focus-visible:ring-1 focus-visible:ring-primary',
                                        buttonHeight,
                                        'cursor-pointer',
                                        currentAgentName
                                            ? cn('agent-badge', getAgentColor(currentAgentName).class)
                                            : 'border border-border/20 bg-accent/20 hover:bg-accent/30'
                                    )}
                                >
                                    <Brain className={cn(
                                        'h-3 w-3 flex-shrink-0',
                                        currentAgentName ? '' : 'text-muted-foreground'
                                    )} />
                                    <span className="typography-micro font-medium flex-1">{getAgentDisplayName()}</span>
                                    <ChevronDown className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {renderMobileModelPanel()}
            {renderMobileAgentPanel()}

        </>
    );
};
