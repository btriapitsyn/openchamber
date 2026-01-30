import React from 'react';
import { MobileOverlayPanel } from '@/components/ui/MobileOverlayPanel';
import { ProviderLogo } from '@/components/ui/ProviderLogo';
import { cn } from '@/lib/utils';
import { useConfigStore } from '@/stores/useConfigStore';
import { useSessionStore } from '@/stores/useSessionStore';
import { useContextStore } from '@/stores/contextStore';
import { useUIStore } from '@/stores/useUIStore';
import { useModelLists } from '@/hooks/useModelLists';
import {
    formatEffortLabel,
    getAgentDisplayName,
    getQuickEffortOptions,
    isPrimaryMode,
    parseEffortVariant,
} from './mobileControlsUtils';

const MAX_QUICK_AGENTS = 3;

const COMPACT_NUMBER_FORMATTER = new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
});

const formatTokens = (value?: number | null) => {
    if (typeof value !== 'number' || Number.isNaN(value)) {
        return null;
    }
    if (value === 0) {
        return '0';
    }
    const formatted = COMPACT_NUMBER_FORMATTER.format(value);
    return formatted.endsWith('.0') ? formatted.slice(0, -2) : formatted;
};

interface UnifiedControlsDrawerProps {
    open: boolean;
    onClose: () => void;
    onOpenAgent: () => void;
    onOpenModel: () => void;
    onOpenEffort: () => void;
}

export const UnifiedControlsDrawer: React.FC<UnifiedControlsDrawerProps> = ({
    open,
    onClose,
    onOpenAgent,
    onOpenModel,
    onOpenEffort,
}) => {
    const {
        providers,
        currentProviderId,
        currentModelId,
        currentVariant,
        currentAgentName,
        setAgent,
        setProvider,
        setModel,
        setCurrentVariant,
        getCurrentModelVariants,
        getVisibleAgents,
        getModelMetadata,
    } = useConfigStore();
    const { addRecentModel, addRecentAgent, addRecentEffort, recentAgents, recentEfforts } = useUIStore();
    const { recentModelsList } = useModelLists();
    const {
        currentSessionId,
        saveSessionAgentSelection,
        saveAgentModelForSession,
        saveAgentModelVariantForSession,
    } = useSessionStore();
    const sessionAgentName = useContextStore((state) =>
        currentSessionId ? state.getSessionAgentSelection(currentSessionId) : null
    );

    const agents = getVisibleAgents();
    const uiAgentName = currentSessionId ? (sessionAgentName || currentAgentName) : currentAgentName;
    const primaryAgents = agents.filter((agent) => isPrimaryMode(agent.mode));
    const recentAgentNames = React.useMemo(() => {
        if (recentAgents.length === 0) {
            return [];
        }
        const visibleAgents = new Set(agents.map((agent) => agent.name));
        return recentAgents.filter((name) => visibleAgents.has(name));
    }, [recentAgents, agents]);

    const quickAgentNames = React.useMemo(() => {
        const fallback = primaryAgents.length > 0 ? primaryAgents.map((agent) => agent.name) : agents.map((agent) => agent.name);
        const base = fallback.slice(0, MAX_QUICK_AGENTS);
        const orderedRecents = recentAgentNames.slice().reverse();
        for (const recent of orderedRecents) {
            if (!recent || base.includes(recent)) {
                continue;
            }
            base.unshift(recent);
            base.splice(MAX_QUICK_AGENTS);
        }
        if (uiAgentName && !base.includes(uiAgentName)) {
            if (base.length > 0) {
                base[0] = uiAgentName;
            } else {
                base.push(uiAgentName);
            }
        }
        return base;
    }, [agents, primaryAgents, recentAgentNames, uiAgentName]);

    const hasAgentOverflow = agents.some((agent) => !quickAgentNames.includes(agent.name));

    const recentModelsBase = recentModelsList.slice(0, 4);
    const hasCurrentInRecents = recentModelsBase.some(
        (entry) => entry.providerID === currentProviderId && entry.modelID === currentModelId
    );
    // If current model not in recents, prepend it so it's always visible
    const recentModels = React.useMemo(() => {
        if (hasCurrentInRecents || !currentProviderId || !currentModelId) {
            return recentModelsBase;
        }
        const currentProvider = providers.find((p) => p.id === currentProviderId);
        const currentModel = currentProvider?.models?.find((m) => m.id === currentModelId);
        if (!currentModel) {
            return recentModelsBase;
        }
        return [
            { providerID: currentProviderId, modelID: currentModelId, provider: currentProvider, model: currentModel },
            ...recentModelsBase.slice(0, 3),
        ];
    }, [recentModelsBase, hasCurrentInRecents, currentProviderId, currentModelId, providers]);

    const variants = getCurrentModelVariants();
    const hasEffort = variants.length > 0;
    const effortKey = currentProviderId && currentModelId ? `${currentProviderId}/${currentModelId}` : null;
    const recentEffortsForModel = effortKey ? (recentEfforts[effortKey] ?? []) : [];
    const recentEffortOptions = recentEffortsForModel
        .map((variant) => parseEffortVariant(variant))
        .filter((variant) => !variant || variants.includes(variant));
    const fallbackEfforts = getQuickEffortOptions(variants);
    const baseEfforts = fallbackEfforts.length > 0 ? fallbackEfforts : recentEffortOptions;
    const quickEfforts = React.useMemo(() => {
        const base = baseEfforts.slice(0, 4);
        const orderedRecents = recentEffortOptions.slice().reverse();
        for (const recent of orderedRecents) {
            if (base.some((entry) => entry === recent)) {
                continue;
            }
            base.unshift(recent);
            base.splice(4);
        }
        if (!base.some((entry) => entry === currentVariant)) {
            if (base.length > 0) {
                base[0] = currentVariant;
            } else {
                base.push(currentVariant);
            }
        }
        if (!base.some((entry) => entry === undefined)) {
            base.push(undefined);
            base.splice(4);
        }
        return base;
    }, [baseEfforts, currentVariant, recentEffortOptions]);
    const effortHasMore = variants.length + 1 > quickEfforts.length;

    const handleAgentSelect = (agentName: string) => {
        setAgent(agentName);
        addRecentAgent(agentName);
        if (currentSessionId) {
            saveSessionAgentSelection(currentSessionId, agentName);
        }
    };

    const handleModelSelect = (providerId: string, modelId: string) => {
        const provider = providers.find((entry) => entry.id === providerId);
        if (!provider) {
            return;
        }
        const providerModels = Array.isArray(provider.models) ? provider.models : [];
        const modelExists = providerModels.some((model) => model.id === modelId);
        if (!modelExists) {
            return;
        }

        const isRecentAlready = recentModelsList.some(
            (entry) => entry.providerID === providerId && entry.modelID === modelId
        );

        setProvider(providerId);
        setModel(modelId);
        if (!isRecentAlready) {
            addRecentModel(providerId, modelId);
        }

        if (currentSessionId && uiAgentName) {
            saveAgentModelForSession(currentSessionId, uiAgentName, providerId, modelId);
        }
    };

    const handleEffortSelect = (variant: string | undefined) => {
        setCurrentVariant(variant);
        if (currentProviderId && currentModelId) {
            addRecentEffort(currentProviderId, currentModelId, variant);
        }
        if (currentSessionId && uiAgentName && currentProviderId && currentModelId) {
            saveAgentModelVariantForSession(currentSessionId, uiAgentName, currentProviderId, currentModelId, variant);
        }
    };

    return (
        <MobileOverlayPanel open={open} onClose={onClose} title="Controls">
            <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-2">
                    <div className="typography-meta font-semibold uppercase tracking-wide text-muted-foreground">
                        Agent
                    </div>
                    <div className="rounded-xl border border-border/40 overflow-hidden">
                        {agents.length === 0 ? (
                            <div className="px-3 py-2 typography-meta text-muted-foreground">
                                No agents configured
                            </div>
                        ) : (
                            quickAgentNames.map((agentName) => {
                                const displayName = getAgentDisplayName(agents, agentName);
                                const isSelected = agentName === uiAgentName;
                                return (
                                    <button
                                        key={agentName}
                                        type="button"
                                        onClick={() => handleAgentSelect(agentName)}
                                        className={cn(
                                            'flex min-h-[44px] w-full items-center border-b border-border/30 px-3 py-2 text-left last:border-b-0',
                                            isSelected ? 'bg-primary/10' : ''
                                        )}
                                        aria-pressed={isSelected}
                                    >
                                        <span className="typography-meta font-medium text-foreground truncate">
                                            {displayName}
                                        </span>
                                    </button>
                                );
                            })
                        )}
                        {hasAgentOverflow && (
                            <button
                                type="button"
                                onClick={onOpenAgent}
                                className="flex min-h-[44px] w-full items-center justify-center border-t border-border/30 px-3 py-2 typography-meta font-medium text-muted-foreground"
                                aria-label="More agents"
                            >
                                ...
                            </button>
                        )}
                    </div>
                </div>

                <div className="flex flex-col gap-2">
                    <div className="typography-meta font-semibold uppercase tracking-wide text-muted-foreground">
                        Model
                    </div>
                    <div className="rounded-xl border border-border/40 overflow-hidden">
                        {recentModels.length === 0 && !hasCurrentInRecents && (
                            <div className="px-3 py-2 typography-meta text-muted-foreground">
                                No recent models
                            </div>
                        )}
                        {recentModels.map(({ providerID, modelID, model }) => {
                            const isSelected = providerID === currentProviderId && modelID === currentModelId;
                            const modelName = typeof model?.name === 'string' && model.name.trim().length > 0
                                ? model.name
                                : modelID;
                            const metadata = getModelMetadata(providerID, modelID);
                            const ctxTokens = formatTokens(metadata?.limit?.context);
                            const outTokens = formatTokens(metadata?.limit?.output);
                            return (
                                <button
                                    key={`recent-${providerID}-${modelID}`}
                                    type="button"
                                    onClick={() => handleModelSelect(providerID, modelID)}
                                    className={cn(
                                        'flex min-h-[44px] w-full items-center gap-2 border-b border-border/30 px-3 py-2 text-left last:border-b-0',
                                        isSelected ? 'bg-primary/10' : ''
                                    )}
                                >
                                    <ProviderLogo providerId={providerID} className="h-4 w-4 flex-shrink-0" />
                                    <span className="typography-meta font-medium text-foreground truncate min-w-0 flex-1">
                                        {modelName}
                                    </span>
                                    {(ctxTokens || outTokens) && (
                                        <span className="typography-micro text-muted-foreground whitespace-nowrap flex-shrink-0">
                                            {ctxTokens && `${ctxTokens} ctx`}
                                            {ctxTokens && outTokens && ' • '}
                                            {outTokens && `${outTokens} out`}
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                        <button
                            type="button"
                            onClick={onOpenModel}
                            className="flex min-h-[44px] w-full items-center justify-center border-t border-border/30 px-3 py-2 typography-meta font-medium text-muted-foreground"
                            aria-label="More models"
                        >
                            ...
                        </button>
                    </div>
                </div>

                {hasEffort && (
                    <div className="flex flex-col gap-2">
                        <div className="typography-meta font-semibold uppercase tracking-wide text-muted-foreground">
                            Effort
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {quickEfforts.map((variant) => {
                                const isSelected = variant === currentVariant || (!variant && !currentVariant);
                                return (
                                    <button
                                        key={variant ?? 'default'}
                                        type="button"
                                        onClick={() => handleEffortSelect(variant)}
                                        className={cn(
                                            'inline-flex items-center rounded-full border px-2.5 py-1 typography-meta font-medium',
                                            isSelected
                                                ? 'border-primary/30 bg-primary/10 text-foreground'
                                                : 'border-border/40 text-muted-foreground hover:bg-muted/50'
                                        )}
                                        aria-pressed={isSelected}
                                    >
                                        {formatEffortLabel(variant)}
                                    </button>
                                );
                            })}
                            {effortHasMore && (
                                <button
                                    type="button"
                                    onClick={onOpenEffort}
                                    className="inline-flex items-center rounded-full border border-border/40 px-2.5 py-1 typography-meta font-medium text-muted-foreground hover:bg-muted/50"
                                    aria-label="More effort options"
                                >
                                    ...
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </MobileOverlayPanel>
    );
};

export default UnifiedControlsDrawer;
