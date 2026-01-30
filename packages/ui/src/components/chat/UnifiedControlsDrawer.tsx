import React from 'react';
import { MobileOverlayPanel } from '@/components/ui/MobileOverlayPanel';
import { cn } from '@/lib/utils';
import { useConfigStore } from '@/stores/useConfigStore';
import { useSessionStore } from '@/stores/useSessionStore';
import { useContextStore } from '@/stores/contextStore';
import { useUIStore } from '@/stores/useUIStore';
import { useModelLists } from '@/hooks/useModelLists';
import { useIsTextTruncated } from '@/hooks/useIsTextTruncated';
import {
    formatEffortLabel,
    getAgentDisplayName,
    getModelDisplayName,
    getQuickEffortOptions,
    isPrimaryMode,
    parseEffortVariant,
} from './mobileControlsUtils';

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
    const AgentRow: React.FC<{
        name: string;
        isSelected: boolean;
        description?: string | null;
        onSelect: () => void;
    }> = ({ name, isSelected, description, onSelect }) => {
        const descriptionRef = React.useRef<HTMLSpanElement>(null);
        const shouldScroll = useIsTextTruncated(descriptionRef, [description, name]);

        return (
            <button
                type="button"
                onClick={onSelect}
                className={cn(
                    'flex min-h-[44px] w-full items-start justify-between gap-2 rounded-xl border px-2 py-2 text-left',
                    isSelected ? 'border-primary/30 bg-primary/10' : 'border-border/40 hover:bg-muted/50'
                )}
                aria-pressed={isSelected}
            >
                <div className="min-w-0 flex-1">
                    <div className="typography-meta font-medium text-foreground truncate">{name}</div>
                    {description ? (
                        <span ref={descriptionRef} className="block min-w-0 overflow-hidden typography-micro text-muted-foreground">
                            <span className={cn('marquee-text', shouldScroll && 'marquee-text--auto')}>{description}</span>
                        </span>
                    ) : null}
                </div>
            </button>
        );
    };
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
        getCurrentProvider,
        getCurrentModelVariants,
        getVisibleAgents,
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
        const base = fallback.slice(0, 4);
        const orderedRecents = recentAgentNames.slice().reverse();
        for (const recent of orderedRecents) {
            if (!recent || base.includes(recent)) {
                continue;
            }
            base.unshift(recent);
            base.splice(4);
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

    const currentProvider = getCurrentProvider();
    const currentModelLabel = getModelDisplayName(currentProvider, currentModelId);
    const recentModels = recentModelsList.slice(0, 4);
    const hasCurrentInRecents = recentModels.some(
        (entry) => entry.providerID === currentProviderId && entry.modelID === currentModelId
    );
    const currentModelRow = currentProviderId && currentModelId
        ? {
            providerID: currentProviderId,
            modelID: currentModelId,
            providerName: currentProvider?.name || currentProviderId,
            modelName: currentModelLabel,
        }
        : null;

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
                    {agents.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-border/50 px-2 py-2 typography-meta text-muted-foreground">
                            No agents configured
                        </div>
                    ) : (
                        <div className="flex flex-col gap-2">
                            {quickAgentNames.map((agentName) => {
                                const agent = agents.find((entry) => entry.name === agentName);
                                const displayName = getAgentDisplayName(agents, agentName);
                                return (
                                    <AgentRow
                                        key={agentName}
                                        name={displayName}
                                        description={agent?.description}
                                        isSelected={agentName === uiAgentName}
                                        onSelect={() => handleAgentSelect(agentName)}
                                    />
                                );
                            })}
                            {hasAgentOverflow && (
                                <button
                                    type="button"
                                    onClick={onOpenAgent}
                                    className="flex min-h-[44px] w-full items-center justify-center rounded-xl border border-border/40 px-2 py-2 typography-meta font-medium text-muted-foreground hover:bg-muted/50"
                                    aria-label="More agents"
                                >
                                    ...
                                </button>
                            )}
                        </div>
                    )}
                </div>

                <div className="flex flex-col gap-2">
                    <div className="typography-meta font-semibold uppercase tracking-wide text-muted-foreground">
                        Model
                    </div>
                    <div className="flex flex-col gap-2">
                        {!hasCurrentInRecents && currentModelRow && (
                            <button
                                type="button"
                                onClick={() => handleModelSelect(currentModelRow.providerID, currentModelRow.modelID)}
                                className={cn(
                                    'flex min-h-[44px] w-full items-center justify-between gap-2 rounded-xl border px-2 py-2 text-left',
                                    currentProviderId === currentModelRow.providerID && currentModelId === currentModelRow.modelID
                                        ? 'border-primary/30 bg-primary/10'
                                        : 'border-border/40 hover:bg-muted/50'
                                )}
                            >
                                <div className="min-w-0">
                                    <div className="typography-meta font-medium text-foreground truncate">
                                        {currentModelRow.modelName}
                                    </div>
                                    <div className="typography-micro text-muted-foreground">Current model</div>
                                </div>
                                <span className="typography-micro text-muted-foreground">{currentModelRow.providerName}</span>
                            </button>
                        )}

                        {recentModels.map(({ providerID, modelID, provider, model }) => {
                            const isSelected = providerID === currentProviderId && modelID === currentModelId;
                            const modelName = typeof model?.name === 'string' && model.name.trim().length > 0
                                ? model.name
                                : modelID;
                            return (
                                <button
                                    key={`recent-${providerID}-${modelID}`}
                                    type="button"
                                    onClick={() => handleModelSelect(providerID, modelID)}
                                    className={cn(
                                        'flex min-h-[44px] w-full items-center justify-between gap-2 rounded-xl border px-2 py-2 text-left',
                                        isSelected ? 'border-primary/30 bg-primary/10' : 'border-border/40 hover:bg-muted/50'
                                    )}
                                >
                                    <span className="typography-meta font-medium text-foreground truncate min-w-0">
                                        {modelName}
                                    </span>
                                    <span className="typography-micro text-muted-foreground">
                                        {provider?.name || providerID}
                                    </span>
                                </button>
                            );
                        })}

                        {recentModels.length === 0 && !currentModelRow && (
                            <div className="rounded-xl border border-dashed border-border/50 px-2 py-2 typography-meta text-muted-foreground">
                                Not selected
                            </div>
                        )}

                        <button
                            type="button"
                            onClick={onOpenModel}
                            className="flex min-h-[44px] w-full items-center justify-center rounded-xl border border-border/40 px-2 py-2 typography-meta font-medium text-muted-foreground hover:bg-muted/50"
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
