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
import { useConfigStore } from '@/stores/useConfigStore';
import { useUIStore } from '@/stores/useUIStore';
import { useDeviceInfo } from '@/lib/device';
import { MagicWand as Sparkles, CaretDown as ChevronDown, CaretRight as ChevronRight } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { MobileOverlayPanel } from '@/components/ui/MobileOverlayPanel';
import { ProviderLogo } from '@/components/ui/ProviderLogo';

// Type for provider models
type ProviderModel = Record<string, unknown> & { id?: string; name?: string };

interface ModelSelectorProps {
    providerId: string;
    modelId: string;
    onChange: (providerId: string, modelId: string) => void;
    className?: string;
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({ 
    providerId, 
    modelId, 
    onChange, 
    className 
}) => {
    const { providers, modelsMetadata } = useConfigStore();
    const isMobile = useUIStore(state => state.isMobile);
    const { isMobile: deviceIsMobile } = useDeviceInfo();
    const isActuallyMobile = isMobile || deviceIsMobile;
    
    // Mobile panel state
    const [isMobilePanelOpen, setIsMobilePanelOpen] = React.useState(false);
    const [expandedMobileProviders, setExpandedMobileProviders] = React.useState<Set<string>>(new Set());

    const closeMobilePanel = () => setIsMobilePanelOpen(false);
    const toggleMobileProviderExpansion = (providerId: string) => {
        setExpandedMobileProviders(prev => {
            const newSet = new Set(prev);
            if (newSet.has(providerId)) {
                newSet.delete(providerId);
            } else {
                newSet.add(providerId);
            }
            return newSet;
        });
    };

    const getModelDisplayName = (model: Record<string, unknown>) => {
        const name = model?.name || model?.id || '';
        const nameStr = String(name);
        if (nameStr.length > 40) {
            return nameStr.substring(0, 37) + '...';
        }
        return nameStr;
    };

    const getModelMetadata = (providerId: string, modelId: string) => {
        const key = `${providerId}/${modelId}`;
        return modelsMetadata.get(key);
    };

    const handleProviderAndModelChange = (newProviderId: string, newModelId: string) => {
        onChange(newProviderId, newModelId);
    };

    // Mobile panel
    const renderMobileModelPanel = () => {
        if (!isActuallyMobile) return null;

        return (
            <MobileOverlayPanel
                open={isMobilePanelOpen}
                onClose={closeMobilePanel}
                title="Select Model"
            >
                <div className="space-y-1">
                    {providers.map((provider) => {
                        const providerModels = Array.isArray(provider.models) ? provider.models : [];
                        if (providerModels.length === 0) return null;

                        const isActiveProvider = provider.id === providerId;
                        const isExpanded = expandedMobileProviders.has(provider.id);

                        return (
                            <div key={provider.id} className="rounded-xl border border-border/40 bg-background/95">
                                <button
                                    type="button"
                                    className="flex w-full items-center justify-between gap-1.5 px-2 py-1.5 text-left"
                                    onClick={() => toggleMobileProviderExpansion(provider.id)}
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
                                        <ChevronDown className="h-3 w-3 text-muted-foreground" />
                                    ) : (
                                        <ChevronRight className="h-3 w-3 text-muted-foreground" />
                                    )}
                                </button>

                                {isExpanded && (
                                    <div className="border-t border-border/20">
                                        {providerModels.map((modelItem: ProviderModel) => {
                                            const isSelectedModel = provider.id === providerId && modelItem.id === modelId;
                                            const metadata = getModelMetadata(provider.id as string, modelItem.id as string);

                                            return (
                                                <button
                                                    key={modelItem.id as string}
                                                    type="button"
                                                    className={cn(
                                                        'flex w-full items-center justify-between px-2 py-1.5 text-left',
                                                        'typography-meta',
                                                        isSelectedModel ? 'bg-primary/10 text-primary' : 'text-foreground'
                                                    )}
                                                    onClick={() => {
                                                        handleProviderAndModelChange(provider.id as string, modelItem.id as string);
                                                        closeMobilePanel();
                                                    }}
                                                >
                                                    <div className="flex flex-col">
                                                        <span className="font-medium">{getModelDisplayName(modelItem)}</span>
                                                        {typeof (metadata as unknown as Record<string, unknown>)?.description === 'string' && (
                                                            <span className="typography-micro text-muted-foreground">
                                                                {(metadata as unknown as Record<string, unknown>).description as React.ReactNode}
                                                            </span>
                                                        )}
                                                    </div>
                                                    {isSelectedModel && (
                                                        <div className="h-2 w-2 rounded-full bg-primary" />
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                    
                    <button
                        type="button"
                        className="flex w-full items-center justify-between rounded-lg border border-border/40 bg-background/95 px-2 py-1.5 text-left"
                        onClick={() => {
                            handleProviderAndModelChange('', '');
                            closeMobilePanel();
                        }}
                    >
                        <span className="typography-meta text-muted-foreground">No model (optional)</span>
                    </button>
                </div>
            </MobileOverlayPanel>
        );
    };

    return (
        <>
            {isActuallyMobile ? (
                <button
                    type="button"
                    onClick={() => setIsMobilePanelOpen(true)}
                    className={cn(
                        'flex w-full items-center justify-between gap-2 rounded-lg border border-border/40 bg-background/95 px-2 py-1.5 text-left',
                        className
                    )}
                >
                    <div className="flex items-center gap-2">
                        {providerId ? (
                            <ProviderLogo
                                providerId={providerId}
                                className="h-3.5 w-3.5"
                            />
                        ) : (
                            <Sparkles className="h-3 w-3 text-muted-foreground" />
                        )}
                        <span className="typography-meta font-medium text-foreground">
                            {providerId && modelId ? `${providerId}/${modelId}` : 'Select model...'}
                        </span>
                    </div>
                    <ChevronDown className="h-3 w-3 text-muted-foreground" />
                </button>
            ) : (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <div className={cn(
                            'flex items-center gap-2 px-2 rounded-lg bg-accent/20 border border-border/20 cursor-pointer hover:bg-accent/30 transition-colors h-6 w-fit',
                            className
                        )}>
                            {providerId ? (
                                <>
                                    <ProviderLogo
                                        providerId={providerId}
                                        className="h-3 w-3 flex-shrink-0"
                                    />
                                    <Sparkles className="h-3 w-3 text-primary/60 hidden" />
                                </>
                            ) : (
                                <Sparkles className="h-3 w-3 text-muted-foreground" />
                            )}
                            <span className="typography-micro font-medium whitespace-nowrap">
                                {providerId && modelId ? `${providerId}/${modelId}` : 'Not selected'}
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
                                        className="max-h-[320px] overflow-y-auto min-w-[200px]"
                                        sideOffset={2}
                                        collisionPadding={8}
                                        avoidCollisions={true}
                                    >
                                        {providerModels.map((modelItem: ProviderModel) => {
                                            const metadata = getModelMetadata(provider.id as string, modelItem.id as string);

                                            return (
                                                <DropdownMenuItem
                                                    key={modelItem.id as string}
                                                    className="typography-meta"
                                                    onSelect={() => {
                                                        handleProviderAndModelChange(provider.id as string, modelItem.id as string);
                                                    }}
                                                >
                                                    <div className="flex flex-col">
                                                        <span className="font-medium">{getModelDisplayName(modelItem)}</span>
                                                        {typeof (metadata as unknown as Record<string, unknown>)?.description === 'string' && (
                                                            <span className="typography-meta text-muted-foreground">
                                                                {(metadata as unknown as Record<string, unknown>).description as React.ReactNode}
                                                            </span>
                                                        )}
                                                    </div>
                                                </DropdownMenuItem>
                                            );
                                        })}
                                    </DropdownMenuSubContent>
                                </DropdownMenuSub>
                            );
                        })}
                        <DropdownMenuItem 
                            className="typography-meta"
                            onSelect={() => handleProviderAndModelChange('', '')}
                        >
                            <span className="text-muted-foreground">No model (optional)</span>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            )}
            {renderMobileModelPanel()}
        </>
    );
};
