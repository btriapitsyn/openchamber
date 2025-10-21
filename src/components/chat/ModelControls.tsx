import React from 'react';
import type { SVGProps } from 'react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuCheckboxItem,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { MagicWand as Sparkles, HeadCircuit as Brain, CaretDown as ChevronDown, CaretRight as ChevronRight, Wrench, FileImage as ImageIcon, FileAudio, FileVideo, TextT as FileText, FilePdf, CheckCircle as ShieldCheck, Question as Shield, XCircle as ShieldOff } from '@phosphor-icons/react';
import type { ModelMetadata } from '@/types';

type IconComponent = React.ComponentType<SVGProps<SVGSVGElement>>;
import { useConfigStore } from '@/stores/useConfigStore';
import { useSessionStore } from '@/stores/useSessionStore';
import { useDeviceInfo } from '@/lib/device';
import { cn } from '@/lib/utils';
import { MobileOverlayPanel } from '@/components/ui/MobileOverlayPanel';
import { getAgentColor } from '@/lib/agentColors';
import { useAssistantStatus } from '@/hooks/useAssistantStatus';
import { WorkingPlaceholder, DotPulseStyles } from './message/parts/WorkingPlaceholder';

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
type ModelApplyResult = 'applied' | 'provider-missing' | 'model-missing';

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

interface ModelControlsProps {
    className?: string;
}

export const ModelControls: React.FC<ModelControlsProps> = ({ className }) => {
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

    const { forming, working } = useAssistantStatus();
    const showFormingIndicator = forming.isActive;
    const showWorkingIndicator = working.hasWorkingContext && !showFormingIndicator && !working.hasTextPart;

    const formingIndicator = (
        <div className="flex items-center text-muted-foreground">
            <span className="typography-meta flex items-center">
                Working
                {forming.characterCount > 0 && (
                    <span className="ml-1 text-muted-foreground/80">
                        {forming.characterCount.toLocaleString()}
                    </span>
                )}
                <span className="inline-flex ml-0.5">
                    <span className="animate-dot-pulse" style={{ animationDelay: '0ms' }}>.</span>
                    <span className="animate-dot-pulse" style={{ animationDelay: '200ms' }}>.</span>
                    <span className="animate-dot-pulse" style={{ animationDelay: '400ms' }}>.</span>
                </span>
            </span>
            <DotPulseStyles />
        </div>
    );

    const {
        currentSessionId,
        messages,
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

    const buttonHeight = isMobile ? 'h-9' : 'h-8';
    const editToggleIconClass = isMobile ? 'h-5 w-5' : 'h-4 w-4';
    const controlIconSize = isMobile ? 'h-5 w-5' : 'h-4 w-4';
    const controlTextSize = isMobile ? 'typography-micro' : 'typography-meta';
    const inlineGapClass = isMobile ? 'gap-x-2' : 'gap-x-3';
    const autoApproveMenuLabel = isAutoApproveEnabled ? 'Auto-approve edits' : 'Ask before edits';

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

    const prevAgentNameRef = React.useRef<string | undefined>(undefined);

    // Track message count for current session to detect when messages load
    const currentSessionMessageCount = currentSessionId ? (messages.get(currentSessionId)?.length ?? -1) : -1;

    const sessionInitializationRef = React.useRef<{
        sessionId: string;
        resolved: boolean;
        inFlight: boolean;
    } | null>(null);

    const tryApplyModelSelection = React.useCallback(
        (providerId: string, modelId: string, agentName?: string): ModelApplyResult => {
            if (!providerId || !modelId) {
                return 'model-missing';
            }

            const provider = providers.find(p => p.id === providerId);
            if (!provider) {
                return 'provider-missing';
            }

            const providerModels = Array.isArray(provider.models) ? provider.models : [];
            const modelExists = providerModels.find((m: any) => m.id === modelId);
            if (!modelExists) {
                return 'model-missing';
            }

            setProvider(providerId);
            setModel(modelId);

            if (currentSessionId && agentName) {
                saveAgentModelForSession(currentSessionId, agentName, providerId, modelId);
            }

            return 'applied';
        },
        [providers, setProvider, setModel, currentSessionId, saveAgentModelForSession],
    );

    // Handle session switching with proper per-session model/agent isolation
    React.useEffect(() => {
        if (!currentSessionId) {
            sessionInitializationRef.current = null;
            return;
        }

        if (!sessionInitializationRef.current || sessionInitializationRef.current.sessionId !== currentSessionId) {
            sessionInitializationRef.current = { sessionId: currentSessionId, resolved: false, inFlight: false };
        }

        const state = sessionInitializationRef.current;
        if (!state || state.resolved || state.inFlight) {
            return;
        }

        let isCancelled = false;

        const finalize = () => {
            if (isCancelled) {
                return;
            }
            const refState = sessionInitializationRef.current;
            if (refState && refState.sessionId === currentSessionId) {
                refState.resolved = true;
                refState.inFlight = false;
            }
        };

        const applySavedSelections = (): 'resolved' | 'waiting' | 'continue' => {
            const savedAgentName = getSessionAgentSelection(currentSessionId);
            if (savedAgentName) {
                if (currentAgentName !== savedAgentName) {
                    setAgent(savedAgentName);
                }

                const savedModel = getAgentModelForSession(currentSessionId, savedAgentName);
                if (savedModel) {
                    const result = tryApplyModelSelection(savedModel.providerId, savedModel.modelId, savedAgentName);
                    if (result === 'applied') {
                        return 'resolved';
                    }
                    if (result === 'provider-missing') {
                        return 'waiting';
                    }
                } else {
                    return 'resolved';
                }
            }

            for (const agent of agents) {
                const selection = getAgentModelForSession(currentSessionId, agent.name);
                if (!selection) {
                    continue;
                }

                if (currentAgentName !== agent.name) {
                    setAgent(agent.name);
                }

                saveSessionAgentSelection(currentSessionId, agent.name);
                const result = tryApplyModelSelection(selection.providerId, selection.modelId, agent.name);
                if (result === 'applied') {
                    return 'resolved';
                }
                if (result === 'provider-missing') {
                    return 'waiting';
                }
            }

            return 'continue';
        };

        const applyFallbackAgent = () => {
            if (agents.length === 0) {
                return;
            }

            const primaryAgents = agents.filter(agent => isPrimaryMode(agent.mode));
            const fallbackAgent = agents.find(agent => agent.name === 'build') || primaryAgents[0] || agents[0];
            if (!fallbackAgent) {
                return;
            }

            saveSessionAgentSelection(currentSessionId, fallbackAgent.name);

            if (currentAgentName !== fallbackAgent.name) {
                setAgent(fallbackAgent.name);
            }

            if (fallbackAgent.model?.providerID && fallbackAgent.model?.modelID) {
                tryApplyModelSelection(fallbackAgent.model.providerID, fallbackAgent.model.modelID, fallbackAgent.name);
            }
        };

        const resolveSessionPreferences = async () => {
            try {
                const savedOutcome = applySavedSelections();
                if (savedOutcome === 'resolved') {
                    finalize();
                    return;
                }
                if (savedOutcome === 'waiting') {
                    return;
                }

                if (currentSessionMessageCount === -1) {
                    return;
                }

                if (currentSessionMessageCount > 0) {
                    state.inFlight = true;
                    try {
                        const discoveredChoices = await analyzeAndSaveExternalSessionChoices(currentSessionId, agents);
                        if (isCancelled) {
                            return;
                        }

                        if (discoveredChoices.size > 0) {
                            let latestAgent: string | null = null;
                            let latestTimestamp = -Infinity;

                            for (const [agentName, choice] of discoveredChoices) {
                                if (choice.timestamp > latestTimestamp) {
                                    latestTimestamp = choice.timestamp;
                                    latestAgent = agentName;
                                }
                            }

                            if (latestAgent) {
                                saveSessionAgentSelection(currentSessionId, latestAgent);
                                if (currentAgentName !== latestAgent) {
                                    setAgent(latestAgent);
                                }

                                const latestChoice = discoveredChoices.get(latestAgent);
                                if (latestChoice) {
                                    const applyResult = tryApplyModelSelection(
                                        latestChoice.providerId,
                                        latestChoice.modelId,
                                        latestAgent,
                                    );

                                    if (applyResult === 'applied') {
                                        finalize();
                                        return;
                                    }

                                    if (applyResult === 'provider-missing') {
                                        return;
                                    }
                                } else {
                                    finalize();
                                    return;
                                }
                            }
                        }
                    } catch (error) {
                        if (!isCancelled) {
                            console.error('[ModelControls] Error resolving session from messages:', error);
                        }
                    } finally {
                        const refState = sessionInitializationRef.current;
                        if (!isCancelled && refState && refState.sessionId === currentSessionId) {
                            refState.inFlight = false;
                        }
                    }
                }

                applyFallbackAgent();
                finalize();
            } catch (error) {
                if (!isCancelled) {
                    console.error('[ModelControls] Error in session switch:', error);
                }
            }
        };

        resolveSessionPreferences();

        return () => {
            isCancelled = true;
        };
    }, [
        currentSessionId,
        currentSessionMessageCount,
        agents,
        currentAgentName,
        getSessionAgentSelection,
        getAgentModelForSession,
        setAgent,
        tryApplyModelSelection,
        analyzeAndSaveExternalSessionChoices,
        saveSessionAgentSelection,
    ]);

    // Handle agent changes
    React.useEffect(() => {
        const handleAgentSwitch = async () => {
            try {
                if (currentAgentName !== prevAgentNameRef.current) {
                    prevAgentNameRef.current = currentAgentName;

                    if (currentAgentName && currentSessionId) {
                        await new Promise(resolve => setTimeout(resolve, 50));

                        const persistedChoice = getAgentModelForSession(currentSessionId, currentAgentName);

                        if (persistedChoice) {
                            const result = tryApplyModelSelection(
                                persistedChoice.providerId,
                                persistedChoice.modelId,
                                currentAgentName,
                            );
                            if (result === 'applied' || result === 'provider-missing') {
                                return;
                            }
                        }

                        const agent = agents.find(a => a.name === currentAgentName);
                        if (agent?.model?.providerID && agent?.model?.modelID) {
                            const result = tryApplyModelSelection(
                                agent.model.providerID,
                                agent.model.modelID,
                                currentAgentName,
                            );
                            if (result === 'provider-missing') {
                                return;
                            }
                        }
                    }
                }
            } catch (error) {
                console.error('[ModelControls] Agent change error:', error);
            }
        };

        handleAgentSwitch();
    }, [currentAgentName, currentSessionId, getAgentModelForSession, tryApplyModelSelection, agents]);

    const handleAgentChange = (agentName: string) => {
        try {
            setAgent(agentName);

            if (currentSessionId) {
                saveSessionAgentSelection(currentSessionId, agentName);
            }
            if (isMobile) {
                closeMobilePanel();
            }
        } catch (error) {
            console.error('[ModelControls] Handle agent change error:', error);
        }
    };

    const handleProviderAndModelChange = (providerId: string, modelId: string) => {
        try {
            const result = tryApplyModelSelection(providerId, modelId, currentAgentName || undefined);
            if (result !== 'applied') {
                if (result === 'provider-missing') {
                    console.error('[ModelControls] Provider not available for selection:', providerId);
                } else if (result === 'model-missing') {
                    console.error('[ModelControls] Model not available for selection:', { providerId, modelId });
                }
                return;
            }
            if (isMobile) {
                closeMobilePanel();
            }
        } catch (error) {
            console.error('[ModelControls] Handle model change error:', error);
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
                    <button
                        type="button"
                        disabled={editToggleDisabled}
                        onClick={() => {
                            if (!editToggleDisabled) {
                                handleToggleEditPermission();
                            }
                        }}
                        className={cn(
                            'flex w-full items-center justify-between rounded-md border px-2 py-1.5 text-left',
                            'transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-primary',
                            editToggleDisabled ? 'cursor-not-allowed opacity-60' : 'hover:bg-accent/40'
                        )}
                    >
                        <span className="typography-meta font-medium text-foreground">{autoApproveMenuLabel}</span>
                        <span
                            className={cn(
                                'ml-2 flex items-center justify-center rounded-full border border-border/60 p-1 transition-colors',
                                isAutoApproveEnabled ? 'border-primary/50 text-primary' : 'text-muted-foreground'
                            )}
                        >
                            {editToggleIcon}
                        </span>
                    </button>
                </div>
            </MobileOverlayPanel>
        );
    };

    const renderModelTooltipContent = () => (
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
    );

    const renderModelSelector = () => {
        if (isMobile && (showFormingIndicator || showWorkingIndicator)) {
            return (
                <div
                    className={cn(
                        'flex items-center gap-1 rounded border border-border/20 bg-accent/20 px-1.5 min-w-0',
                        buttonHeight
                    )}
                >
                    {showFormingIndicator && formingIndicator}
                    {showWorkingIndicator && (
                        <WorkingPlaceholder
                            isWorking={working.isWorking}
                            hasWorkingContext={working.hasWorkingContext}
                            hasTextPart={working.hasTextPart}
                        />
                    )}
                </div>
            );
        }

        return (
            <Tooltip delayDuration={1000}>
                {!isMobile ? (
                    <DropdownMenu>
                        <TooltipTrigger asChild>
                            <DropdownMenuTrigger asChild>
                                <div
                                    className={cn(
                                        'flex items-center gap-1.5 cursor-pointer hover:opacity-70 transition-opacity w-fit',
                                        buttonHeight
                                    )}
                                >
                                    {currentProviderId ? (
                                        <>
                                            <img
                                                src={getProviderLogoUrl(currentProviderId)}
                                                alt={`${getProviderDisplayName()} logo`}
                                                className={cn(controlIconSize, 'flex-shrink-0 dark:invert')}
                                                onError={(e) => {
                                                    const target = e.target as HTMLImageElement;
                                                    target.style.display = 'none';
                                                    const sparklesIcon = target.nextElementSibling as HTMLElement;
                                                    if (sparklesIcon) sparklesIcon.style.display = 'block';
                                                }}
                                            />
                                            <Sparkles className={cn(controlIconSize, 'text-primary/60 hidden')} />
                                        </>
                                    ) : (
                                        <Sparkles className={cn(controlIconSize, 'text-muted-foreground')} />
                                    )}
                                    <span
                                        key={`${currentProviderId}-${currentModelId}`}
                                        className={cn(controlTextSize, 'font-medium whitespace-nowrap text-foreground', 'max-w-[32vw]', 'md:max-w-[20vw]', 'truncate')}
                                    >
                                        {getCurrentModelDisplayName()}
                                    </span>
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
                                                onError={(event) => {
                                                    (event.target as HTMLImageElement).style.display = 'none';
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
                                                onError={(event) => {
                                                    (event.target as HTMLImageElement).style.display = 'none';
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
                                                const modalityIcons = [
                                                    ...getModalityIcons(metadata, 'input'),
                                                    ...getModalityIcons(metadata, 'output'),
                                                ];
                                                const uniqueModalityIcons = Array.from(
                                                    new Map(modalityIcons.map((icon) => [icon.key, icon])).values()
                                                ).map((icon) => ({ ...icon, id: `mod-${icon.key}` }));
                                                const indicatorIcons = [...capabilityIcons, ...uniqueModalityIcons];
                                                const contextTokens = formatTokens(metadata?.limit?.context);
                                                const outputTokens = formatTokens(metadata?.limit?.output);

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
                                                                <span className="font-medium">
                                                                    {getModelDisplayName(model)}
                                                                </span>
                                                                <span className="typography-meta text-muted-foreground">
                                                                    {contextTokens} ctx • {outputTokens} out
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
                                'flex items-center gap-1.5 transition-opacity min-w-0 focus:outline-none',
                                'cursor-pointer hover:opacity-70 max-w-full justify-end',
                                buttonHeight
                            )}
                        >
                            {currentProviderId ? (
                                <img
                                    src={getProviderLogoUrl(currentProviderId)}
                                    alt={`${getProviderDisplayName()} logo`}
                                    className={cn(controlIconSize, 'flex-shrink-0 dark:invert')}
                                    onError={(e) => {
                                        (e.target as HTMLImageElement).style.display = 'none';
                                    }}
                                />
                            ) : (
                                <Sparkles className={cn(controlIconSize, 'text-muted-foreground')} />
                            )}
                            <span className="typography-micro font-medium truncate min-w-0 max-w-[36vw] text-right">
                                {getCurrentModelDisplayName()}
                            </span>
                        </button>
                    </TooltipTrigger>
                )}
                {renderModelTooltipContent()}
            </Tooltip>
        );
    };


    const renderAgentSelector = () => {
        if (!isMobile) {
            return (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <div className={cn(
                            'flex items-center gap-1.5 transition-opacity cursor-pointer hover:opacity-70',
                            buttonHeight
                        )}>
                            <Brain
                                className={cn(
                                    controlIconSize,
                                    'flex-shrink-0',
                                    currentAgentName ? '' : 'text-muted-foreground'
                                )}
                                style={currentAgentName ? { color: `var(${getAgentColor(currentAgentName).var})` } : undefined}
                            />
                            <span
                                className={cn(
                                    controlTextSize,
                                    'font-medium min-w-0 truncate'
                                )}
                                style={currentAgentName ? { color: `var(${getAgentColor(currentAgentName).var})` } : undefined}
                            >
                                {getAgentDisplayName()}
                            </span>
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
                        <DropdownMenuSeparator />
                        <DropdownMenuCheckboxItem
                            checked={isAutoApproveEnabled}
                            disabled={editToggleDisabled}
                            onCheckedChange={() => handleToggleEditPermission()}
                            title={editToggleLabel}
                        >
                            <span className="font-medium">{autoApproveMenuLabel}</span>
                        </DropdownMenuCheckboxItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            );
        }

        return (
            <button
                type="button"
                onClick={() => setActiveMobilePanel('agent')}
                className={cn(
                    'flex items-center gap-1.5 transition-opacity min-w-0 focus:outline-none',
                    buttonHeight,
                    'cursor-pointer hover:opacity-70',
                    isMobile && 'ml-1'
                )}
            >
                <Brain
                    className={cn(
                        controlIconSize,
                        'flex-shrink-0',
                        currentAgentName ? '' : 'text-muted-foreground'
                    )}
                    style={currentAgentName ? { color: `var(${getAgentColor(currentAgentName).var})` } : undefined}
                />
                <span
                    className={cn(controlTextSize, 'font-medium truncate', 'max-w-[36vw]', 'md:max-w-[20vw]')}
                    style={currentAgentName ? { color: `var(${getAgentColor(currentAgentName).var})` } : undefined}
                >
                    {getAgentDisplayName()}
                </span>
            </button>
        );
    };


    const inlineClassName = cn('flex items-center min-w-0', inlineGapClass, className);

    return (
        <>
            <div className={inlineClassName}>
                <div className={cn('flex items-center min-w-0', isMobile ? 'flex-1 min-w-0' : undefined)}>
                    {renderModelSelector()}
                </div>
                {!isMobile && (showFormingIndicator || showWorkingIndicator) && (
                    <div className="flex items-center gap-2">
                        {showFormingIndicator && formingIndicator}
                        {showWorkingIndicator && (
                            <WorkingPlaceholder
                                isWorking={working.isWorking}
                                hasWorkingContext={working.hasWorkingContext}
                                hasTextPart={working.hasTextPart}
                            />
                        )}
                    </div>
                )}
                <div className={cn('flex items-center min-w-0', inlineGapClass)}>
                    {renderAgentSelector()}
                </div>
            </div>

            {renderMobileModelPanel()}
            {renderMobileAgentPanel()}
        </>
    );

};
