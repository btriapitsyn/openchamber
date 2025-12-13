import React from 'react';
import type { ComponentType } from 'react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Input } from '@/components/ui/input';
import { RiAiAgentLine, RiArrowDownSLine, RiArrowRightSLine, RiBrainAi3Line, RiCheckboxCircleLine, RiCloseCircleLine, RiFileImageLine, RiFileMusicLine, RiFilePdfLine, RiFileVideoLine, RiPencilAiLine, RiQuestionLine, RiSearchLine, RiText, RiToolsLine } from '@remixicon/react';
import type { ModelMetadata } from '@/types';
import type { EditPermissionMode } from '@/stores/types/sessionTypes';
import { getEditModeColors } from '@/lib/permissions/editModeColors';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type IconComponent = ComponentType<any>;

type ProviderModel = Record<string, unknown> & { id?: string; name?: string };

import { useConfigStore } from '@/stores/useConfigStore';
import { useSessionStore } from '@/stores/useSessionStore';
import { useContextStore } from '@/stores/contextStore';
import { useDeviceInfo } from '@/lib/device';
import { useIsVSCodeRuntime } from '@/hooks/useRuntimeAPIs';
import { cn } from '@/lib/utils';
import { MobileOverlayPanel } from '@/components/ui/MobileOverlayPanel';
import { getAgentColor } from '@/lib/agentColors';
import { ProviderLogo } from '@/components/ui/ProviderLogo';
import { calculateEditPermissionUIState, type BashPermissionSetting } from '@/lib/permissions/editPermissionDefaults';
import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';

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
        icon: RiToolsLine,
        label: 'Tool calling',
        isActive: (metadata) => metadata?.tool_call === true,
    },
    {
        key: 'reasoning',
        icon: RiBrainAi3Line,
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

type ModelApplyResult = 'applied' | 'provider-missing' | 'model-missing';

const MODALITY_ICON_MAP: Record<string, ModalityIconDefinition> = {
    text: { icon: RiText, label: 'Text' },
    image: { icon: RiFileImageLine, label: 'Image' },
    video: { icon: RiFileVideoLine, label: 'Video' },
    audio: { icon: RiFileMusicLine, label: 'Audio' },
    pdf: { icon: RiFilePdfLine, label: 'PDF' },
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

    const {
        currentSessionId,
        messages,
        saveSessionAgentSelection,
        getSessionAgentSelection,
        saveAgentModelForSession,
        getAgentModelForSession,
        analyzeAndSaveExternalSessionChoices,
        getSessionAgentEditMode,
        setSessionAgentEditMode,
    } = useSessionStore();

    const contextHydrated = useContextStore((state) => state.hasHydrated);

    const { isMobile } = useDeviceInfo();
    const isVSCodeRuntime = useIsVSCodeRuntime();
    const isCompact = isMobile || isVSCodeRuntime;
    const [activeMobilePanel, setActiveMobilePanel] = React.useState<'model' | 'agent' | null>(null);
    const [mobileTooltipOpen, setMobileTooltipOpen] = React.useState<'model' | 'agent' | null>(null);
    const [mobileModelQuery, setMobileModelQuery] = React.useState('');
    const closeMobilePanel = React.useCallback(() => setActiveMobilePanel(null), []);
    const closeMobileTooltip = React.useCallback(() => setMobileTooltipOpen(null), []);
    const longPressTimerRef = React.useRef<NodeJS.Timeout | undefined>(undefined);
    const [expandedMobileProviders, setExpandedMobileProviders] = React.useState<Set<string>>(() => {
        const initial = new Set<string>();
        if (currentProviderId) {
            initial.add(currentProviderId);
        }
        return initial;
    });
    const [mobileEditOptionsOpen, setMobileEditOptionsOpen] = React.useState(false);
    const [agentMenuOpen, setAgentMenuOpen] = React.useState(false);
    const [desktopEditOptionsOpen, setDesktopEditOptionsOpen] = React.useState(false);
    const desktopEditOptionsId = React.useId();

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

    React.useEffect(() => {
        if (activeMobilePanel !== 'agent') {
            setMobileEditOptionsOpen(false);
        }
        if (activeMobilePanel !== 'model') {
            setMobileModelQuery('');
        }
    }, [activeMobilePanel]);

    React.useEffect(() => {
        if (!agentMenuOpen) {
            setDesktopEditOptionsOpen(false);
        }
    }, [agentMenuOpen]);

    const currentAgent = getCurrentAgent?.();
    const agentPermissionRaw = currentAgent?.permission?.edit;
    let agentDefaultEditMode: EditPermissionMode = 'ask';
    if (agentPermissionRaw === 'allow' || agentPermissionRaw === 'ask' || agentPermissionRaw === 'deny' || agentPermissionRaw === 'full') {
        agentDefaultEditMode = agentPermissionRaw;
    }

    const editToolConfigured = currentAgent ? (currentAgent.tools?.['edit'] !== false) : false;
    if (!currentAgent || !editToolConfigured) {
        agentDefaultEditMode = 'deny';
    }

    const agentWebfetchPermission = currentAgent?.permission?.webfetch;
    const agentBashPermission = currentAgent?.permission?.bash as BashPermissionSetting | undefined;

    const permissionUiState = React.useMemo(() => calculateEditPermissionUIState({
        agentDefaultEditMode,
        webfetchPermission: agentWebfetchPermission,
        bashPermission: agentBashPermission,
    }), [agentDefaultEditMode, agentWebfetchPermission, agentBashPermission]);

    const { cascadeDefaultMode, modeAvailability, autoApproveAvailable } = permissionUiState;

    const selectionContextReady = Boolean(currentSessionId && currentAgentName);
    const sessionMode = selectionContextReady && currentSessionId && currentAgentName
        ? getSessionAgentEditMode(currentSessionId, currentAgentName, cascadeDefaultMode)
        : cascadeDefaultMode;

    const editModeShortLabels: Record<EditPermissionMode, string> = {
        ask: 'Ask before edits',
        allow: 'Approve edit tools',
        full: 'Approve every tool',
        deny: 'Editing disabled',
    };

    const isModeDisabled = React.useCallback((mode: EditPermissionMode) => {
        return !modeAvailability[mode];
    }, [modeAvailability]);

    const effectiveEditMode = React.useMemo(() => {
        if (!selectionContextReady) {
            return cascadeDefaultMode;
        }
        if (isModeDisabled(sessionMode) && sessionMode !== cascadeDefaultMode) {
            return cascadeDefaultMode;
        }
        return sessionMode;
    }, [cascadeDefaultMode, isModeDisabled, selectionContextReady, sessionMode]);

    const editPermissionOptions: Array<{ mode: EditPermissionMode; label: string; disabled: boolean }> = [
        { mode: 'ask', label: editModeShortLabels.ask, disabled: isModeDisabled('ask') },
        { mode: 'allow', label: editModeShortLabels.allow, disabled: isModeDisabled('allow') },
        { mode: 'full', label: editModeShortLabels.full, disabled: isModeDisabled('full') },
    ];

    const activeEditModeColors = React.useMemo(() => getEditModeColors(effectiveEditMode), [effectiveEditMode]);

    const editToggleDisabled = !selectionContextReady || !autoApproveAvailable;

    React.useEffect(() => {
        if (editToggleDisabled) {
            setMobileEditOptionsOpen(false);
            setDesktopEditOptionsOpen(false);
        }
    }, [editToggleDisabled]);

    const buttonHeight = isCompact ? 'h-9' : 'h-8';
    const editToggleIconClass = isCompact ? 'h-5 w-5' : 'h-4 w-4';
    const controlIconSize = isCompact ? 'h-5 w-5' : 'h-4 w-4';
    const controlTextSize = isCompact ? 'typography-micro' : 'typography-meta';
    const inlineGapClass = isCompact ? 'gap-x-2' : 'gap-x-3';
    const editPermissionMenuLabel = editModeShortLabels[effectiveEditMode];

    const renderEditModeIcon = React.useCallback((mode: EditPermissionMode, iconClass = editToggleIconClass) => {
        const combinedClassName = cn(iconClass, 'flex-shrink-0');
        const modeColors = getEditModeColors(mode);
        const iconColor = modeColors ? modeColors.text : 'var(--foreground)';
        const iconStyle = { color: iconColor };

        if (mode === 'full') {
            return <RiPencilAiLine className={combinedClassName} style={iconStyle} />;
        }
        if (mode === 'allow') {
            return <RiCheckboxCircleLine className={combinedClassName} style={iconStyle} />;
        }
        if (mode === 'deny') {
            return <RiCloseCircleLine className={combinedClassName} style={iconStyle} />;
        }
        return <RiQuestionLine className={combinedClassName} style={iconStyle} />;
    }, [editToggleIconClass]);

    const handleEditPermissionSelect = React.useCallback((mode: EditPermissionMode) => {
        if (editToggleDisabled || !currentSessionId || !currentAgentName || isModeDisabled(mode)) {
            return;
        }
        setSessionAgentEditMode(currentSessionId, currentAgentName, mode, cascadeDefaultMode);
        setAgentMenuOpen(false);
        setMobileEditOptionsOpen(false);
        setDesktopEditOptionsOpen(false);
    }, [cascadeDefaultMode, editToggleDisabled, currentSessionId, currentAgentName, setSessionAgentEditMode, setAgentMenuOpen, setDesktopEditOptionsOpen, isModeDisabled]);

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
            const modelExists = providerModels.find((m: ProviderModel) => m.id === modelId);
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

    React.useEffect(() => {
        if (!currentSessionId) {
            sessionInitializationRef.current = null;
            return;
        }

        if (!contextHydrated || providers.length === 0 || agents.length === 0) {
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
        contextHydrated,
        providers,
    ]);

    React.useEffect(() => {
        if (!contextHydrated || !currentSessionId || providers.length === 0 || agents.length === 0) {
            return;
        }

        const savedAgentName = getSessionAgentSelection(currentSessionId);
        const preferredAgent = savedAgentName || currentAgentName;
        if (!preferredAgent) {
            return;
        }

        const preferredSelection = getAgentModelForSession(currentSessionId, preferredAgent);
        if (!preferredSelection) {
            return;
        }

        const provider = providers.find(p => p.id === preferredSelection.providerId);
        if (!provider) {
            return;
        }

        const modelExists = Array.isArray(provider.models)
            ? provider.models.some((m: ProviderModel) => m.id === preferredSelection.modelId)
            : false;
        if (!modelExists) {
            return;
        }

        const providerMatches = currentProviderId === preferredSelection.providerId;
        const modelMatches = currentModelId === preferredSelection.modelId;
        if (providerMatches && modelMatches) {
            return;
        }

        if (preferredAgent !== currentAgentName) {
            setAgent(preferredAgent);
        }

        tryApplyModelSelection(preferredSelection.providerId, preferredSelection.modelId, preferredAgent);
    }, [
        contextHydrated,
        currentSessionId,
        currentAgentName,
        currentProviderId,
        currentModelId,
        providers,
        agents,
        getSessionAgentSelection,
        getAgentModelForSession,
        tryApplyModelSelection,
        setAgent,
    ]);

    React.useEffect(() => {
        if (!contextHydrated) {
            return;
        }

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
    }, [currentAgentName, currentSessionId, getAgentModelForSession, tryApplyModelSelection, agents, contextHydrated]);

    const handleAgentChange = (agentName: string) => {
        try {
            setAgent(agentName);
            setAgentMenuOpen(false);

            if (currentSessionId) {
                saveSessionAgentSelection(currentSessionId, agentName);
            }
            if (isCompact) {
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
            if (isCompact) {
                closeMobilePanel();
            }
        } catch (error) {
            console.error('[ModelControls] Handle model change error:', error);
        }
    };

    const getModelDisplayName = (model: ProviderModel | undefined) => {
        const name = (typeof model?.name === 'string' ? model.name : (typeof model?.id === 'string' ? model.id : ''));
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
        const currentModel = models.find((m: ProviderModel) => m.id === currentModelId);
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

    const capitalizeAgentName = (name: string) => {
        return name.charAt(0).toUpperCase() + name.slice(1);
    };

    const renderIconBadge = (IconComp: IconComponent, label: string, key: string) => (
        <span
            key={key}
            className="flex h-5 w-5 items-center justify-center rounded-xl bg-muted/60 text-muted-foreground"
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

    const handleLongPressStart = React.useCallback((type: 'model' | 'agent') => {
        if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
        }
        longPressTimerRef.current = setTimeout(() => {
            setMobileTooltipOpen(type);
        }, 500);
    }, []);

    const handleLongPressEnd = React.useCallback(() => {
        if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
        }
    }, []);

    React.useEffect(() => {
        return () => {
            if (longPressTimerRef.current) {
                clearTimeout(longPressTimerRef.current);
            }
        };
    }, []);

    const renderMobileModelTooltip = () => {
        if (!isCompact || mobileTooltipOpen !== 'model') return null;

        return (
            <MobileOverlayPanel
                open={true}
                onClose={closeMobileTooltip}
                title={currentMetadata?.name || getCurrentModelDisplayName()}
            >
                <div className="flex flex-col gap-1.5">
                    {}
                    <div className="rounded-xl border border-border/40 bg-sidebar/30 px-2 py-1.5">
                        <div className="typography-micro text-muted-foreground mb-0.5">Provider</div>
                        <div className="typography-meta text-foreground font-medium">{getProviderDisplayName()}</div>
                    </div>

                    {}
                    {currentCapabilityIcons.length > 0 && (
                        <div className="rounded-xl border border-border/40 bg-sidebar/30 px-2 py-1.5">
                            <div className="typography-micro text-muted-foreground mb-1">Capabilities</div>
                            <div className="flex flex-wrap gap-1.5">
                                {currentCapabilityIcons.map(({ key, icon, label }) => (
                                    <div key={key} className="flex items-center gap-1.5">
                                        {renderIconBadge(icon, label, `cap-${key}`)}
                                        <span className="typography-meta text-foreground">{label}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {}
                    {(inputModalityIcons.length > 0 || outputModalityIcons.length > 0) && (
                        <div className="rounded-xl border border-border/40 bg-sidebar/30 px-2 py-1.5">
                            <div className="typography-micro text-muted-foreground mb-1">Modalities</div>
                            <div className="flex flex-col gap-1">
                                {inputModalityIcons.length > 0 && (
                                    <div className="flex items-center gap-2">
                                        <span className="typography-meta text-muted-foreground/80 w-12">Input</span>
                                        <div className="flex gap-1">
                                            {inputModalityIcons.map(({ key, icon, label }) => renderIconBadge(icon, `${label} input`, `input-${key}`))}
                                        </div>
                                    </div>
                                )}
                                {outputModalityIcons.length > 0 && (
                                    <div className="flex items-center gap-2">
                                        <span className="typography-meta text-muted-foreground/80 w-12">Output</span>
                                        <div className="flex gap-1">
                                            {outputModalityIcons.map(({ key, icon, label }) => renderIconBadge(icon, `${label} output`, `output-${key}`))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {}
                    <div className="rounded-xl border border-border/40 bg-sidebar/30 px-2 py-1.5">
                        <div className="typography-micro text-muted-foreground mb-1">Limits</div>
                        <div className="flex flex-col gap-0.5">
                            <div className="flex items-center justify-between">
                                <span className="typography-meta text-muted-foreground/80">Context</span>
                                <span className="typography-meta font-medium text-foreground">{formatTokens(currentMetadata?.limit?.context)}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="typography-meta text-muted-foreground/80">Output</span>
                                <span className="typography-meta font-medium text-foreground">{formatTokens(currentMetadata?.limit?.output)}</span>
                            </div>
                        </div>
                    </div>

                    {}
                    <div className="rounded-xl border border-border/40 bg-sidebar/30 px-2 py-1.5">
                        <div className="typography-micro text-muted-foreground mb-1">Metadata</div>
                        <div className="flex flex-col gap-0.5">
                            <div className="flex items-center justify-between">
                                <span className="typography-meta text-muted-foreground/80">Knowledge</span>
                                <span className="typography-meta font-medium text-foreground">{formatKnowledge(currentMetadata?.knowledge)}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="typography-meta text-muted-foreground/80">Release</span>
                                <span className="typography-meta font-medium text-foreground">{formatDate(currentMetadata?.release_date)}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </MobileOverlayPanel>
        );
    };

    const renderMobileAgentTooltip = () => {
        if (!isCompact || mobileTooltipOpen !== 'agent' || !currentAgent) return null;

        const enabledTools = Object.entries(currentAgent.tools || {})
            .filter(([, enabled]) => enabled)
            .map(([tool]) => tool)
            .sort();

        const hasCustomPrompt = Boolean(currentAgent.prompt && currentAgent.prompt.trim().length > 0);
        const hasModelConfig = currentAgent.model?.providerID && currentAgent.model?.modelID;
        const hasTemperatureOrTopP = currentAgent.temperature !== undefined || currentAgent.topP !== undefined;

        const getPermissionIcon = (permission?: string) => {
            const mode: EditPermissionMode =
                permission === 'full' || permission === 'allow' || permission === 'deny' ? permission : 'ask';
            return renderEditModeIcon(mode, 'h-3.5 w-3.5');
        };

        const getPermissionLabel = (permission?: string) => {
            if (permission === 'full') return 'Full';
            if (permission === 'allow') return 'Allow';
            if (permission === 'deny') return 'Deny';
            return 'Ask';
        };

        return (
            <MobileOverlayPanel
                open={true}
                onClose={closeMobileTooltip}
                title={capitalizeAgentName(currentAgent.name)}
            >
                <div className="flex flex-col gap-1.5">
                    {}
                    {currentAgent.description && (
                        <div className="rounded-xl border border-border/40 bg-sidebar/30 px-2 py-1.5">
                            <div className="typography-meta text-foreground">{currentAgent.description}</div>
                        </div>
                    )}

                    {}
                    <div className="rounded-xl border border-border/40 bg-sidebar/30 px-2 py-1.5">
                        <div className="typography-micro text-muted-foreground mb-0.5">Mode</div>
                        <div className="typography-meta text-foreground font-medium">
                            {currentAgent.mode === 'primary' ? 'Primary' : currentAgent.mode === 'subagent' ? 'Subagent' : currentAgent.mode === 'all' ? 'All' : '—'}
                        </div>
                    </div>

                    {}
                    {(hasModelConfig || hasTemperatureOrTopP) && (
                        <div className="rounded-xl border border-border/40 bg-sidebar/30 px-2 py-1.5">
                            <div className="typography-micro text-muted-foreground mb-1">Model</div>
                            {hasModelConfig && (
                                <div className="typography-meta text-foreground font-medium mb-1">
                                    {currentAgent.model!.providerID} / {currentAgent.model!.modelID}
                                </div>
                            )}
                            {hasTemperatureOrTopP && (
                                <div className="flex flex-col gap-0.5">
                                    {currentAgent.temperature !== undefined && (
                                        <div className="flex items-center justify-between">
                                            <span className="typography-meta text-muted-foreground/80">Temperature</span>
                                            <span className="typography-meta font-medium text-foreground">{currentAgent.temperature}</span>
                                        </div>
                                    )}
                                    {currentAgent.topP !== undefined && (
                                        <div className="flex items-center justify-between">
                                            <span className="typography-meta text-muted-foreground/80">Top P</span>
                                            <span className="typography-meta font-medium text-foreground">{currentAgent.topP}</span>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {}
                    <div className="rounded-xl border border-border/40 bg-sidebar/30 px-2 py-1.5">
                        <div className="typography-micro text-muted-foreground mb-1">Tools</div>
                        {enabledTools.length > 0 ? (
                            <div className="flex flex-wrap gap-1 leading-tight">
                                {enabledTools.map((tool) => (
                                    <span
                                        key={tool}
                                        className="inline-flex items-center rounded-lg bg-muted/60 px-1.5 py-0.5 typography-meta text-foreground"
                                    >
                                        {tool}
                                    </span>
                                ))}
                            </div>
                        ) : (
                            <div className="typography-meta text-muted-foreground">All enabled</div>
                        )}
                    </div>

                    {}
                    <div className="rounded-xl border border-border/40 bg-sidebar/30 px-2 py-1.5">
                        <div className="typography-micro text-muted-foreground mb-1">Permissions</div>
                        <div className="flex flex-col gap-1">
                            <div className="flex items-center justify-between">
                                <span className="typography-meta text-muted-foreground/80">Edit</span>
                                <div className="flex items-center gap-1.5">
                                    {getPermissionIcon(currentAgent.permission?.edit)}
                                    <span className="typography-meta font-medium text-foreground">
                                        {getPermissionLabel(currentAgent.permission?.edit)}
                                    </span>
                                </div>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="typography-meta text-muted-foreground/80">Bash</span>
                                <div className="flex items-center gap-1.5">
                                    {getPermissionIcon(typeof currentAgent.permission?.bash === 'string' ? currentAgent.permission.bash : undefined)}
                                    <span className="typography-meta font-medium text-foreground">
                                        {getPermissionLabel(typeof currentAgent.permission?.bash === 'string' ? currentAgent.permission.bash : undefined)}
                                    </span>
                                </div>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="typography-meta text-muted-foreground/80">WebFetch</span>
                                <div className="flex items-center gap-1.5">
                                    {getPermissionIcon(currentAgent.permission?.webfetch)}
                                    <span className="typography-meta font-medium text-foreground">
                                        {getPermissionLabel(currentAgent.permission?.webfetch)}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {}
                    {hasCustomPrompt && (
                        <div className="rounded-xl border border-border/40 bg-sidebar/30 px-2 py-1.5">
                            <div className="flex items-center justify-between">
                                <span className="typography-meta text-muted-foreground/80">Custom Prompt</span>
                                <RiCheckboxCircleLine className="h-4 w-4 text-foreground" />
                            </div>
                        </div>
                    )}
                </div>
            </MobileOverlayPanel>
        );
    };

    const renderMobileModelPanel = () => {
        if (!isCompact) return null;

        const normalizedQuery = mobileModelQuery.trim().toLowerCase();
        const filteredProviders = providers
            .map((provider) => {
                const providerModels = Array.isArray(provider.models) ? provider.models : [];
                const matchesProvider = normalizedQuery.length === 0
                    ? true
                    : provider.name.toLowerCase().includes(normalizedQuery) || provider.id.toLowerCase().includes(normalizedQuery);
                const matchingModels = normalizedQuery.length === 0
                    ? providerModels
                    : providerModels.filter((model: ProviderModel) => {
                        const name = getModelDisplayName(model).toLowerCase();
                        const id = typeof model.id === 'string' ? model.id.toLowerCase() : '';
                        return name.includes(normalizedQuery) || id.includes(normalizedQuery);
                    });
                return { provider, providerModels: matchingModels, matchesProvider };
            })
            .filter(({ matchesProvider, providerModels }) => matchesProvider || providerModels.length > 0);

        return (
            <MobileOverlayPanel
                open={activeMobilePanel === 'model'}
                onClose={closeMobilePanel}
                title="Select model"
            >
                <div className="flex flex-col gap-2">
                    <div className="px-2">
                        <div className="relative">
                            <RiSearchLine className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                            <Input
                                value={mobileModelQuery}
                                onChange={(event) => setMobileModelQuery(event.target.value)}
                                placeholder="Search providers or models"
                                className="pl-7 h-8 typography-meta"
                            />
                            {mobileModelQuery && (
                                <button
                                    type="button"
                                    onClick={() => setMobileModelQuery('')}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                    aria-label="Clear search"
                                >
                                    <RiCloseCircleLine className="h-4 w-4" />
                                </button>
                            )}
                        </div>
                    </div>

                    {filteredProviders.length === 0 && (
                        <div className="px-3 py-8 text-center typography-meta text-muted-foreground">
                            No providers or models match your search.
                        </div>
                    )}

                    {filteredProviders.map(({ provider, providerModels }) => {
                        if (providerModels.length === 0 && !normalizedQuery.length) {
                            return null;
                        }

                        const isActiveProvider = provider.id === currentProviderId;
                        const isExpanded = expandedMobileProviders.has(provider.id) || normalizedQuery.length > 0;

                        return (
                            <div key={provider.id} className="rounded-xl border border-border/40 bg-background/95">
                                <button
                                    type="button"
                                    onClick={() => toggleMobileProviderExpansion(provider.id)}
                                    className="flex w-full items-center justify-between gap-1.5 px-2 py-1.5 text-left"
                                    aria-expanded={isExpanded}
                                >
                                    <div className="flex items-center gap-2">
                                        <ProviderLogo
                                            providerId={provider.id}
                                            className="h-3.5 w-3.5"
                                        />
                                        <span className="typography-meta font-medium text-foreground">
                                            {provider.name}
                                        </span>
                                        {isActiveProvider && (
                                            <span className="typography-micro text-primary/80">Current</span>
                                        )}
                                    </div>
                                    {isExpanded ? (
                                        <RiArrowDownSLine className="h-3 w-3 text-muted-foreground" />
                                    ) : (
                                        <RiArrowRightSLine className="h-3 w-3 text-muted-foreground" />
                                    )}
                                </button>

                                {isExpanded && providerModels.length > 0 && (
                                    <div className="flex flex-col border-t border-border/30">
                                        {providerModels.map((model: ProviderModel) => {
                                            const isSelected = isActiveProvider && model.id === currentModelId;
                                            const metadata = getModelMetadata(provider.id, model.id!);
                                            const capabilityIcons = getCapabilityIcons(metadata).slice(0, 3);
                                            const inputIcons = getModalityIcons(metadata, 'input');

                                            return (
                                                <button
                                                    key={model.id}
                                                    type="button"
                                                    onClick={() => handleProviderAndModelChange(provider.id as string, model.id as string)}
                                                    className={cn(
                                                        'flex w-full items-start gap-2 border-b border-border/30 px-2 py-1.5 text-left last:border-b-0',
                                                        'focus:outline-none focus-visible:ring-1 focus-visible:ring-primary',
                                                        isSelected
                                                            ? 'bg-primary/15 text-primary'
                                                            : 'hover:bg-accent/40'
                                                    )}
                                                >
                                                    <div className="flex min-w-0 flex-col">
                                                        <span className="typography-meta font-medium text-foreground">
                                                            {getModelDisplayName(model)}
                                                        </span>
                                                    </div>
                                                    <div className="ml-auto flex flex-col items-end gap-1 text-right">
                                                        {(metadata?.limit?.context || metadata?.limit?.output) && (
                                                            <div className="flex items-center gap-1 typography-micro text-muted-foreground">
                                                                {metadata?.limit?.context ? <span>{formatTokens(metadata?.limit?.context)} ctx</span> : null}
                                                                {metadata?.limit?.context && metadata?.limit?.output ? <span>•</span> : null}
                                                                {metadata?.limit?.output ? <span>{formatTokens(metadata?.limit?.output)} out</span> : null}
                                                            </div>
                                                        )}
                                                        {(capabilityIcons.length > 0 || inputIcons.length > 0) && (
                                                            <div className="flex items-center justify-end gap-1">
                                                                {[...capabilityIcons, ...inputIcons].map(({ key, icon: IconComponent, label }) => (
                                                                    <span
                                                                        key={`meta-${provider.id}-${model.id}-${key}`}
                                                                        className="flex h-4 w-4 items-center justify-center text-muted-foreground"
                                                                        title={label}
                                                                        aria-label={label}
                                                                    >
                                                                        <IconComponent className="h-3 w-3" />
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        )}
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
        if (!isCompact) return null;

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
                                    'flex w-full flex-col gap-1 rounded-xl border px-2 py-1.5 text-left',
                                    'focus:outline-none focus-visible:ring-1 focus-visible:ring-primary agent-list-item',
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
                    <div className="rounded-xl border border-border/40 bg-sidebar/30">
                        <button
                            type="button"
                            disabled={editToggleDisabled}
                            onClick={() => {
                                if (!editToggleDisabled) {
                                    setMobileEditOptionsOpen((previous) => !previous);
                                }
                            }}
                            className={cn(
                                'flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left bg-transparent',
                                'focus:outline-none focus-visible:ring-1 focus-visible:ring-primary rounded-t-xl',
                                editToggleDisabled ? 'cursor-not-allowed opacity-60' : undefined
                            )}
                        >
                            <div className="flex flex-col text-left">
                                <span
                                    className="typography-meta font-medium text-foreground"
                                    style={{
                                        color: activeEditModeColors ? activeEditModeColors.text : 'var(--foreground)',
                                        mixBlendMode: 'normal',
                                    }}
                                >
                                    {editPermissionMenuLabel}
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span
                                    className={cn(
                                        'flex items-center justify-center p-1',
                                        !activeEditModeColors && 'text-muted-foreground'
                                    )}
                                    style={
                                        activeEditModeColors
                                            ? {
                                                  color: activeEditModeColors.text,
                                              }
                                            : undefined
                                    }
                                >
                                    {renderEditModeIcon(effectiveEditMode, editToggleIconClass)}
                                </span>
                                <RiArrowDownSLine
                                    className={cn(
                                        'h-4 w-4 text-muted-foreground transition-transform',
                                        mobileEditOptionsOpen ? 'rotate-180' : ''
                                    )}
                                />
                            </div>
                        </button>
                        {mobileEditOptionsOpen && !editToggleDisabled && (
                            <div className="border-t border-border/40 bg-transparent px-2 py-1.5">
                                <div className="flex flex-col gap-1.5">
                                    {editPermissionOptions.map((option) => {
                                        const isSelected = option.mode === effectiveEditMode;
                                        const optionColors = getEditModeColors(option.mode);
                                        return (
                                            <button
                                                key={option.mode}
                                                type="button"
                                                disabled={option.disabled}
                                                onClick={() => handleEditPermissionSelect(option.mode)}
                                                className={cn(
                                                    'flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left',
                                                    option.disabled ? 'cursor-not-allowed opacity-50' : 'focus:bg-transparent hover:bg-transparent',
                                                    isSelected ? 'bg-primary/10' : undefined
                                                )}
                                                style={isSelected && optionColors ? { backgroundColor: optionColors.background ?? undefined } : undefined}
                                            >
                                                {renderEditModeIcon(option.mode, editToggleIconClass)}
                                                <div className="flex flex-col">
                                                    <span
                                                        className="typography-meta font-medium"
                                                        style={{
                                                            color: optionColors
                                                                ? optionColors.text
                                                                : 'var(--foreground)',
                                                        }}
                                                    >
                                                        {option.label}
                                                    </span>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
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

    const renderModelSelector = () => (
        <Tooltip delayDuration={1000}>
                {!isCompact ? (
                    <DropdownMenu open={agentMenuOpen} onOpenChange={setAgentMenuOpen}>
                        <TooltipTrigger asChild>
                            <DropdownMenuTrigger asChild>
                                <div
                                    className={cn(
                                        'model-controls__model-trigger flex items-center gap-1.5 cursor-pointer hover:opacity-70 min-w-0 flex-1',
                                        buttonHeight
                                    )}
                                >
                                    {currentProviderId ? (
                                        <>
                                            <ProviderLogo
                                                providerId={currentProviderId}
                                                className={cn(controlIconSize, 'flex-shrink-0')}
                                            />
                                            <RiPencilAiLine className={cn(controlIconSize, 'text-primary/60 hidden')} />
                                        </>
                                    ) : (
                                        <RiPencilAiLine className={cn(controlIconSize, 'text-muted-foreground')} />
                                    )}
                                    <span
                                        key={`${currentProviderId}-${currentModelId}`}
                                        className={cn(
                                            'model-controls__model-label',
                                            controlTextSize,
                                            'font-medium whitespace-nowrap text-foreground truncate min-w-0 flex-1'
                                        )}
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
                                            <ProviderLogo
                                                providerId={provider.id}
                                                className="h-3 w-3 flex-shrink-0 mr-2"
                                            />
                                            {provider.name} (No models)
                                        </DropdownMenuItem>
                                    );
                                }

                                return (
                                    <DropdownMenuSub key={provider.id}>
                                        <DropdownMenuSubTrigger className="typography-meta">
                                            <ProviderLogo
                                                providerId={provider.id}
                                                className="h-3 w-3 flex-shrink-0 mr-2"
                                            />
                                            {provider.name}
                                        </DropdownMenuSubTrigger>
                                        <DropdownMenuSubContent
                                            className="max-h-[320px] min-w-[200px]"
                                            sideOffset={2}
                                            collisionPadding={8}
                                            avoidCollisions={true}
                                        >
                                            <ScrollableOverlay
                                                outerClassName="max-h-[320px] min-w-[200px]"
                                            >
                                                {providerModels.map((model: ProviderModel) => {
                                                const metadata = getModelMetadata(provider.id, model.id!);
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
                                                            handleProviderAndModelChange(provider.id as string, model.id as string);
                                                        }}
                                                    >
                                                        <div className="flex items-center gap-2">
                                                            <div className="flex flex-col">
                                                                <span className="font-medium">
                                                                    {getModelDisplayName(model)}
                                                                </span>
                                                                 {metadata?.limit?.context || metadata?.limit?.output ? (
                                                                     <span className="typography-meta text-muted-foreground">
                                                                         {metadata?.limit?.context ? `${contextTokens} ctx` : ''}
                                                                         {metadata?.limit?.context && metadata?.limit?.output ? ' • ' : ''}
                                                                         {metadata?.limit?.output ? `${outputTokens} out` : ''}
                                                                     </span>
                                                                 ) : null}
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
                                            </ScrollableOverlay>
                                        </DropdownMenuSubContent>
                                    </DropdownMenuSub>
                                );
                            })}
                        </DropdownMenuContent>
                    </DropdownMenu>
                ) : (
                    <button
                        type="button"
                        onClick={() => setActiveMobilePanel('model')}
                        onTouchStart={() => handleLongPressStart('model')}
                        onTouchEnd={handleLongPressEnd}
                        onTouchCancel={handleLongPressEnd}
                        className={cn(
                            'model-controls__model-trigger flex items-center gap-1.5 min-w-0 focus:outline-none flex-1',
                            'cursor-pointer hover:opacity-70',
                            buttonHeight
                        )}
                    >
                        {currentProviderId ? (
                            <ProviderLogo
                                providerId={currentProviderId}
                                className={cn(controlIconSize, 'flex-shrink-0')}
                            />
                        ) : (
                            <RiPencilAiLine className={cn(controlIconSize, 'text-muted-foreground')} />
                        )}
                        <span className="model-controls__model-label typography-micro font-medium truncate min-w-0 flex-1">
                            {getCurrentModelDisplayName()}
                        </span>
                    </button>
                )}
                {renderModelTooltipContent()}
            </Tooltip>
        );

    const renderAgentTooltipContent = () => {
        if (!currentAgent) {
            return (
                <TooltipContent align="start" sideOffset={8} className="max-w-[320px]">
                    <div className="min-w-[200px] typography-meta text-muted-foreground">No agent selected.</div>
                </TooltipContent>
            );
        }

        const enabledTools = Object.entries(currentAgent.tools || {})
            .filter(([, enabled]) => enabled)
            .map(([tool]) => tool)
            .sort();

        const hasCustomPrompt = Boolean(currentAgent.prompt && currentAgent.prompt.trim().length > 0);
        const hasModelConfig = currentAgent.model?.providerID && currentAgent.model?.modelID;
        const hasTemperatureOrTopP = currentAgent.temperature !== undefined || currentAgent.topP !== undefined;

        const getPermissionIcon = (permission?: string) => {
            const mode: EditPermissionMode =
                permission === 'full' || permission === 'allow' || permission === 'deny' ? permission : 'ask';
            return renderEditModeIcon(mode, 'h-3.5 w-3.5');
        };

        const getPermissionLabel = (permission?: string) => {
            if (permission === 'full') return 'Full';
            if (permission === 'allow') return 'Allow';
            if (permission === 'deny') return 'Deny';
            return 'Ask';
        };

        return (
            <TooltipContent align="start" sideOffset={8} className="max-w-[280px]">
                <div className="flex min-w-[200px] flex-col gap-2.5">
                    <div className="flex flex-col gap-0.5">
                        <span className="typography-micro font-semibold text-foreground">
                            {capitalizeAgentName(currentAgent.name)}
                        </span>
                        {currentAgent.description && (
                            <span className="typography-meta text-muted-foreground">{currentAgent.description}</span>
                        )}
                    </div>

                    <div className="flex flex-col gap-1">
                        <span className="typography-meta font-semibold uppercase tracking-wide text-muted-foreground/90">Mode</span>
                        <span className="typography-meta text-foreground">
                            {currentAgent.mode === 'primary' ? 'Primary' : currentAgent.mode === 'subagent' ? 'Subagent' : currentAgent.mode === 'all' ? 'All' : '—'}
                        </span>
                    </div>

                    {(hasModelConfig || hasTemperatureOrTopP) && (
                        <div className="flex flex-col gap-1">
                            <span className="typography-meta font-semibold uppercase tracking-wide text-muted-foreground/90">Model</span>
                            {hasModelConfig ? (
                                <span className="typography-meta text-foreground">
                                    {currentAgent.model!.providerID} / {currentAgent.model!.modelID}
                                </span>
                            ) : (
                                <span className="typography-meta text-muted-foreground">—</span>
                            )}
                            {hasTemperatureOrTopP && (
                                <div className="flex flex-col gap-0.5 mt-0.5">
                                    {currentAgent.temperature !== undefined && (
                                        <div className="flex items-center justify-between gap-3">
                                            <span className="typography-meta text-muted-foreground/80">Temperature</span>
                                            <span className="typography-meta font-medium text-foreground">{currentAgent.temperature}</span>
                                        </div>
                                    )}
                                    {currentAgent.topP !== undefined && (
                                        <div className="flex items-center justify-between gap-3">
                                            <span className="typography-meta text-muted-foreground/80">Top P</span>
                                            <span className="typography-meta font-medium text-foreground">{currentAgent.topP}</span>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    <div className="flex flex-col gap-1">
                        <span className="typography-meta font-semibold uppercase tracking-wide text-muted-foreground/90">Tools</span>
                        {enabledTools.length > 0 ? (
                            <div className="flex flex-wrap gap-1 leading-tight">
                                {enabledTools.map((tool) => (
                                    <span
                                        key={tool}
                                        className="inline-flex items-center rounded-lg bg-muted/60 px-1.5 py-0.5 typography-meta text-foreground"
                                    >
                                        {tool}
                                    </span>
                                ))}
                            </div>
                        ) : (
                            <span className="typography-meta text-muted-foreground">All enabled</span>
                        )}
                    </div>

                    <div className="flex flex-col gap-1">
                        <span className="typography-meta font-semibold uppercase tracking-wide text-muted-foreground/90">Permissions</span>
                        <div className="flex items-center gap-3">
                            <span className="typography-meta text-muted-foreground/80 w-16">Edit</span>
                            <div className="flex items-center gap-1.5">
                                {getPermissionIcon(currentAgent.permission?.edit)}
                                <span className="typography-meta font-medium text-foreground w-12">
                                    {getPermissionLabel(currentAgent.permission?.edit)}
                                </span>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <span className="typography-meta text-muted-foreground/80 w-16">Bash</span>
                            <div className="flex items-center gap-1.5">
                                {getPermissionIcon(typeof currentAgent.permission?.bash === 'string' ? currentAgent.permission.bash : undefined)}
                                <span className="typography-meta font-medium text-foreground w-12">
                                    {getPermissionLabel(typeof currentAgent.permission?.bash === 'string' ? currentAgent.permission.bash : undefined)}
                                </span>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <span className="typography-meta text-muted-foreground/80 w-16">WebFetch</span>
                            <div className="flex items-center gap-1.5">
                                {getPermissionIcon(currentAgent.permission?.webfetch)}
                                <span className="typography-meta font-medium text-foreground w-12">
                                    {getPermissionLabel(currentAgent.permission?.webfetch)}
                                </span>
                            </div>
                        </div>
                    </div>

                    {hasCustomPrompt && (
                        <div className="flex items-center justify-between gap-3">
                            <span className="typography-meta text-muted-foreground/80">Custom Prompt</span>
                            <RiCheckboxCircleLine className="h-4 w-4 text-foreground" />
                        </div>
                    )}
                </div>
            </TooltipContent>
        );
    };

    const renderAgentSelector = () => {
        if (!isCompact) {
            return (
                <div className="flex items-center gap-2 min-w-0">
                    <Tooltip delayDuration={1000}>
                        <DropdownMenu>
                            <TooltipTrigger asChild>
                                <DropdownMenuTrigger asChild>
                                    <div className={cn(
                                        'flex items-center gap-1.5 transition-opacity cursor-pointer hover:opacity-70',
                                        buttonHeight
                                    )}>
                                        <RiAiAgentLine
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
                            </TooltipTrigger>
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
                                <div className="flex flex-col gap-1 px-1 py-0.5">
                                    <button
                                        type="button"
                                        disabled={editToggleDisabled}
                                        onClick={() => {
                                            if (editToggleDisabled) {
                                                return;
                                            }
                                            setDesktopEditOptionsOpen((previous) => !previous);
                                        }}
                                        className={cn(
                                            'flex w-full items-center justify-between gap-2 rounded-xl px-2 py-2 text-left',
                                            'focus:outline-none focus-visible:ring-0',
                                            editToggleDisabled ? 'cursor-not-allowed opacity-60' : undefined
                                        )}
                                        aria-expanded={desktopEditOptionsOpen}
                                        aria-controls={desktopEditOptionsId}
                                    >
                                        <div className="flex flex-col text-left">
                                            <span
                                                className="typography-meta font-medium text-foreground"
                                                style={{
                                                    color: activeEditModeColors
                                                        ? activeEditModeColors.text
                                                        : 'var(--foreground)',
                                                }}
                                            >
                                                {editPermissionMenuLabel}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span
                                                className={cn(
                                                    'flex items-center justify-center p-1',
                                                    !activeEditModeColors && 'text-muted-foreground'
                                                )}
                                                style={
                                                    activeEditModeColors
                                                        ? {
                                                              color: activeEditModeColors.text,
                                                          }
                                                        : undefined
                                                }
                                            >
                                                {renderEditModeIcon(effectiveEditMode)}
                                            </span>
                                            <RiArrowDownSLine
                                                className={cn(
                                                    'h-3.5 w-3.5 transition-transform text-muted-foreground',
                                                    desktopEditOptionsOpen ? 'rotate-180' : ''
                                                )}
                                            />
                                        </div>
                                    </button>
                                    {desktopEditOptionsOpen && !editToggleDisabled && (
                                        <div
                                            id={desktopEditOptionsId}
                                            className="flex flex-col gap-1 rounded-xl border border-border/40 px-2 py-2 bg-transparent"
                                            role="group"
                                            aria-label="Edit permission options"
                                        >
                                            {editPermissionOptions.map((option) => {
                                                const isSelected = option.mode === effectiveEditMode;
                                                const optionColors = getEditModeColors(option.mode);
                                                return (
                                                    <button
                                                        key={option.mode}
                                                        type="button"
                                                        disabled={option.disabled}
                                                        onClick={() => handleEditPermissionSelect(option.mode)}
                                                        className={cn(
                                                            'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left',
                                                            option.disabled ? 'cursor-not-allowed opacity-50' : 'focus:outline-none focus-visible:ring-0',
                                                            isSelected ? 'bg-primary/10' : undefined
                                                        )}
                                                        style={isSelected && optionColors ? { backgroundColor: optionColors.background ?? undefined } : undefined}
                                                    >
                                                        {renderEditModeIcon(option.mode, editToggleIconClass)}
                                                        <span
                                                            className="typography-meta font-medium"
                                                            style={{
                                                                color: optionColors ? optionColors.text : 'var(--foreground)',
                                                            }}
                                                        >
                                                            {option.label}
                                                        </span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </DropdownMenuContent>
                        </DropdownMenu>
                        {renderAgentTooltipContent()}
                    </Tooltip>
                </div>
            );
        }

        return (
            <button
                type="button"
                onClick={() => setActiveMobilePanel('agent')}
                onTouchStart={() => handleLongPressStart('agent')}
                onTouchEnd={handleLongPressEnd}
                onTouchCancel={handleLongPressEnd}
                className={cn(
                    'model-controls__agent-trigger flex items-center gap-1.5 transition-opacity min-w-0 focus:outline-none',
                    buttonHeight,
                    'cursor-pointer hover:opacity-70',
                    isCompact && 'ml-1'
                )}
            >
                <RiAiAgentLine
                    className={cn(
                        controlIconSize,
                        'flex-shrink-0',
                        currentAgentName ? '' : 'text-muted-foreground'
                    )}
                    style={currentAgentName ? { color: `var(${getAgentColor(currentAgentName).var})` } : undefined}
                />
                <span
                    className={cn('model-controls__agent-label', controlTextSize, 'font-medium truncate min-w-0')}
                    style={currentAgentName ? { color: `var(${getAgentColor(currentAgentName).var})` } : undefined}
                >
                    {getAgentDisplayName()}
                </span>
            </button>
        );
    };

    const inlineClassName = cn('@container/model-controls flex items-center min-w-0', inlineGapClass, className);

    return (
        <>
            <div className={inlineClassName}>
                <div className={cn('flex items-center min-w-0', !isCompact ? 'flex-1 min-w-0' : undefined)}>
                    {renderModelSelector()}
                </div>
                <div className={cn('flex items-center min-w-0', inlineGapClass)}>
                    {renderAgentSelector()}
                </div>
            </div>

            {renderMobileModelPanel()}
            {renderMobileAgentPanel()}
            {renderMobileModelTooltip()}
            {renderMobileAgentTooltip()}
        </>
    );

};
