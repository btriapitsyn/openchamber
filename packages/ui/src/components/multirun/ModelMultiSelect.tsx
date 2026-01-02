import React from 'react';
import { RiAddLine, RiCloseLine, RiSearchLine, RiStarFill, RiTimeLine } from '@remixicon/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';
import { ProviderLogo } from '@/components/ui/ProviderLogo';
import { cn } from '@/lib/utils';
import { useConfigStore } from '@/stores/useConfigStore';
import { useModelLists } from '@/hooks/useModelLists';
import type { ModelMetadata } from '@/types';

/** Chip height class - shared between chips and add button */
const CHIP_HEIGHT_CLASS = 'h-7';

/** UI-only type with instanceId for React keys and duplicate tracking */
export interface ModelSelectionWithId {
  providerID: string;
  modelID: string;
  displayName?: string;
  instanceId: string;
}

/** Model selection without instanceId (for external use) */
export interface ModelSelection {
  providerID: string;
  modelID: string;
  displayName?: string;
}

// eslint-disable-next-line react-refresh/only-export-components -- Utility is tightly coupled with ModelMultiSelect
export const generateInstanceId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
};

const COMPACT_NUMBER_FORMATTER = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  compactDisplay: 'short',
  maximumFractionDigits: 1,
  minimumFractionDigits: 0,
});

const formatTokens = (value?: number | null) => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '';
  }
  if (value === 0) {
    return '0';
  }
  const formatted = COMPACT_NUMBER_FORMATTER.format(value);
  return formatted.endsWith('.0') ? formatted.slice(0, -2) : formatted;
};

/**
 * Model selection chip with remove button.
 * Shows instance index (e.g., "(2)") when same model is selected multiple times.
 */
export const ModelChip: React.FC<{
  model: ModelSelectionWithId;
  instanceIndex: number;
  totalSameModel: number;
  onRemove: () => void;
}> = ({ model, instanceIndex, totalSameModel, onRemove }) => {
  const displayName = model.displayName || `${model.providerID}/${model.modelID}`;
  const label = totalSameModel > 1 ? `${displayName} (${instanceIndex})` : displayName;

  return (
    <div className={cn('flex items-center gap-1.5 px-2 rounded-md bg-accent/50 border border-border/30', CHIP_HEIGHT_CLASS)}>
      <ProviderLogo providerId={model.providerID} className="h-3.5 w-3.5" />
      <span className="typography-meta font-medium truncate max-w-[140px]">
        {label}
      </span>
      <button
        type="button"
        onClick={onRemove}
        className="text-muted-foreground hover:text-foreground ml-0.5"
      >
        <RiCloseLine className="h-3.5 w-3.5" />
      </button>
    </div>
  );
};

export interface ModelMultiSelectProps {
  selectedModels: ModelSelectionWithId[];
  onAdd: (model: ModelSelectionWithId) => void;
  onRemove: (index: number) => void;
  /** Minimum models required (shows validation hint) */
  minModels?: number;
  /** Label for the add button */
  addButtonLabel?: string;
  /** Whether to show the selected chips inline */
  showChips?: boolean;
  /** Maximum models allowed */
  maxModels?: number;
}

/**
 * Model selector for multi-run (allows selecting same model multiple times).
 */
export const ModelMultiSelect: React.FC<ModelMultiSelectProps> = ({
  selectedModels,
  onAdd,
  onRemove,
  minModels,
  addButtonLabel = 'Add model',
  showChips = true,
  maxModels,
}) => {
  const { providers, modelsMetadata } = useConfigStore();
  const { favoriteModelsList, recentModelsList } = useModelLists();
  const [isOpen, setIsOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const dropdownRef = React.useRef<HTMLDivElement>(null);
  const itemRefs = React.useRef<(HTMLButtonElement | null)[]>([]);

  // Count occurrences of each model for display purposes
  const modelCounts = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of selectedModels) {
      const key = `${m.providerID}:${m.modelID}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return counts;
  }, [selectedModels]);

  // Get instance index for a specific model selection
  const getInstanceIndex = React.useCallback((model: ModelSelectionWithId): number => {
    const sameModels = selectedModels.filter(
      m => m.providerID === model.providerID && m.modelID === model.modelID
    );
    return sameModels.findIndex(m => m.instanceId === model.instanceId) + 1;
  }, [selectedModels]);

  const getModelMetadata = (provId: string, modId: string): ModelMetadata | undefined => {
    const key = `${provId}/${modId}`;
    return modelsMetadata.get(key);
  };

  const getModelDisplayName = (model: Record<string, unknown>) => {
    const name = model?.name || model?.id || '';
    const nameStr = String(name);
    if (nameStr.length > 40) {
      return nameStr.substring(0, 37) + '...';
    }
    return nameStr;
  };

  // Filter helper
  const filterByQuery = React.useCallback((modelName: string, providerName: string) => {
    if (!searchQuery.trim()) return true;
    const lowerQuery = searchQuery.toLowerCase();
    return (
      modelName.toLowerCase().includes(lowerQuery) ||
      providerName.toLowerCase().includes(lowerQuery)
    );
  }, [searchQuery]);

  // Filter favorites
  const filteredFavorites = React.useMemo(() => {
    return favoriteModelsList.filter(({ model, providerID }) => {
      const provider = providers.find(p => p.id === providerID);
      const providerName = provider?.name || providerID;
      const modelName = getModelDisplayName(model);
      return filterByQuery(modelName, providerName);
    });
  }, [favoriteModelsList, providers, filterByQuery]);

  // Filter recents
  const filteredRecents = React.useMemo(() => {
    return recentModelsList.filter(({ model, providerID }) => {
      const provider = providers.find(p => p.id === providerID);
      const providerName = provider?.name || providerID;
      const modelName = getModelDisplayName(model);
      return filterByQuery(modelName, providerName);
    });
  }, [recentModelsList, providers, filterByQuery]);

  // Filter providers
  const filteredProviders = React.useMemo(() => {
    return providers
      .map((provider) => {
        const models = Array.isArray(provider.models) ? provider.models : [];
        const filteredModels = models.filter((model) => {
          const modelName = getModelDisplayName(model);
          return filterByQuery(modelName, provider.name || provider.id || '');
        });
        return { ...provider, models: filteredModels };
      })
      .filter((provider) => provider.models.length > 0);
  }, [providers, filterByQuery]);

  const hasResults = filteredFavorites.length > 0 || filteredRecents.length > 0 || filteredProviders.length > 0;

  // Focus search input when opened
  React.useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

  // Close dropdown when clicking outside
  React.useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchQuery('');
        setSelectedIndex(0);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Reset selection when search query changes
  React.useEffect(() => {
    setSelectedIndex(0);
  }, [searchQuery]);

  // Render a model row
  const renderModelRow = (
    model: Record<string, unknown>,
    providerID: string,
    modelID: string,
    keyPrefix: string,
    flatIndex: number,
    isHighlighted: boolean
  ) => {
    const key = `${providerID}:${modelID}`;
    const selectionCount = modelCounts.get(key) || 0;
    const metadata = getModelMetadata(providerID, modelID);
    const contextTokens = formatTokens(metadata?.limit?.context);

    return (
      <button
        key={`${keyPrefix}-${key}`}
        ref={(el) => { itemRefs.current[flatIndex] = el; }}
        type="button"
        onClick={() => {
          onAdd({
            providerID,
            modelID,
            displayName: (model.name as string) || modelID,
            instanceId: generateInstanceId(),
          });
          // Don't close dropdown - allow selecting multiple
        }}
        onMouseEnter={() => setSelectedIndex(flatIndex)}
        className={cn(
          'w-full text-left px-2 py-1.5 rounded-md typography-meta transition-colors flex items-center gap-2',
          isHighlighted ? 'bg-accent' : 'hover:bg-accent/50'
        )}
      >
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <span className="font-medium truncate">
            {getModelDisplayName(model)}
          </span>
          {contextTokens && (
            <span className="typography-micro text-muted-foreground flex-shrink-0">
              {contextTokens}
            </span>
          )}
        </div>
        {selectionCount > 0 && (
          <span className="typography-micro text-muted-foreground flex-shrink-0">
            ×{selectionCount}
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5 items-center">
        {/* Add model button (dropdown trigger) */}
        <div className="relative" ref={dropdownRef}>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={CHIP_HEIGHT_CLASS}
            onClick={() => setIsOpen(!isOpen)}
          >
            <RiAddLine className="h-3.5 w-3.5 mr-1" />
            {addButtonLabel}
          </Button>

          {isOpen && (() => {
            // Build flat list for keyboard navigation
            type FlatModelItem = { model: Record<string, unknown>; providerID: string; modelID: string; section: string };
            const flatModelList: FlatModelItem[] = [];
            
            filteredFavorites.forEach(({ model, providerID, modelID }) => {
              flatModelList.push({ model, providerID, modelID, section: 'fav' });
            });
            filteredRecents.forEach(({ model, providerID, modelID }) => {
              flatModelList.push({ model, providerID, modelID, section: 'recent' });
            });
            filteredProviders.forEach((provider) => {
              provider.models.forEach((model) => {
                flatModelList.push({ model, providerID: provider.id, modelID: model.id as string, section: 'provider' });
              });
            });

            const totalItems = flatModelList.length;

            // Handle keyboard navigation
            const handleKeyDown = (e: React.KeyboardEvent) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                e.stopPropagation();
                const nextIndex = (selectedIndex + 1) % Math.max(1, totalItems);
                setSelectedIndex(nextIndex);
                setTimeout(() => {
                  itemRefs.current[nextIndex]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }, 0);
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                e.stopPropagation();
                const prevIndex = (selectedIndex - 1 + Math.max(1, totalItems)) % Math.max(1, totalItems);
                setSelectedIndex(prevIndex);
                setTimeout(() => {
                  itemRefs.current[prevIndex]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }, 0);
              } else if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                const selectedItem = flatModelList[selectedIndex];
                if (selectedItem) {
                  onAdd({
                    providerID: selectedItem.providerID,
                    modelID: selectedItem.modelID,
                    displayName: (selectedItem.model.name as string) || selectedItem.modelID,
                    instanceId: generateInstanceId(),
                  });
                }
              } else if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                setIsOpen(false);
                setSearchQuery('');
                setSelectedIndex(0);
              }
            };

            let currentFlatIndex = 0;

            return (
              <div className="absolute bottom-full left-0 mb-1 z-50 border border-border/30 rounded-xl overflow-hidden bg-background shadow-lg w-[min(380px,calc(100vw-2rem))] flex flex-col">
                {/* Search input */}
                <div className="p-2 border-b border-border/40">
                  <div className="relative">
                    <RiSearchLine className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      ref={searchInputRef}
                      type="text"
                      placeholder="Search models"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={handleKeyDown}
                      className="h-8 pl-8 typography-meta"
                    />
                  </div>
                </div>

                {/* Models list */}
                <ScrollableOverlay outerClassName="max-h-[400px] flex-1">
                  <div className="p-1">
                    {!hasResults && (
                      <div className="px-2 py-4 text-center typography-meta text-muted-foreground">
                        No models found
                      </div>
                    )}

                    {/* Favorites Section */}
                    {filteredFavorites.length > 0 && (
                      <>
                        <div className="typography-ui-header font-semibold text-foreground flex items-center gap-2 px-2 py-1.5">
                          <RiStarFill className="h-4 w-4 text-primary" />
                          Favorites
                        </div>
                        {filteredFavorites.map(({ model, providerID, modelID }) => {
                          const idx = currentFlatIndex++;
                          return renderModelRow(model, providerID, modelID, 'fav', idx, selectedIndex === idx);
                        })}
                      </>
                    )}

                    {/* Recents Section */}
                    {filteredRecents.length > 0 && (
                      <>
                        {filteredFavorites.length > 0 && <div className="h-px bg-border/40 my-1" />}
                        <div className="typography-ui-header font-semibold text-foreground flex items-center gap-2 px-2 py-1.5">
                          <RiTimeLine className="h-4 w-4" />
                          Recent
                        </div>
                        {filteredRecents.map(({ model, providerID, modelID }) => {
                          const idx = currentFlatIndex++;
                          return renderModelRow(model, providerID, modelID, 'recent', idx, selectedIndex === idx);
                        })}
                      </>
                    )}

                    {/* Separator before providers */}
                    {(filteredFavorites.length > 0 || filteredRecents.length > 0) && filteredProviders.length > 0 && (
                      <div className="h-px bg-border/40 my-1" />
                    )}

                    {/* All Providers - Flat List */}
                    {filteredProviders.map((provider, index) => (
                      <React.Fragment key={provider.id}>
                        {index > 0 && <div className="h-px bg-border/40 my-1" />}
                        <div className="typography-ui-header font-semibold text-foreground flex items-center gap-2 px-2 py-1.5">
                          <ProviderLogo
                            providerId={provider.id}
                            className="h-4 w-4 flex-shrink-0"
                          />
                          {provider.name}
                        </div>
                        {provider.models.map((model) => {
                          const idx = currentFlatIndex++;
                          return renderModelRow(model, provider.id, model.id as string, 'provider', idx, selectedIndex === idx);
                        })}
                      </React.Fragment>
                    ))}
                  </div>
                </ScrollableOverlay>

                {/* Keyboard hints footer */}
                <div className="px-3 pt-1 pb-1.5 border-t border-border/40 typography-micro text-muted-foreground">
                  ↑↓ navigate • Enter select • Esc close
                </div>
              </div>
            );
          })()}
        </div>

        {/* Selected models */}
        {showChips && selectedModels.map((model, index) => {
          const key = `${model.providerID}:${model.modelID}`;
          const totalSameModel = modelCounts.get(key) || 1;
          const instanceIndex = getInstanceIndex(model);
          return (
            <ModelChip
              key={model.instanceId}
              model={model}
              instanceIndex={instanceIndex}
              totalSameModel={totalSameModel}
              onRemove={() => onRemove(index)}
            />
          );
        })}
      </div>
      
      {/* Validation hint */}
      {minModels !== undefined && selectedModels.length < minModels && (
        <p className="typography-micro text-muted-foreground">
          Select at least {minModels} model{minModels > 1 ? 's' : ''} {maxModels !== undefined ? `and at most ${maxModels} models` : ''}.
        </p>
      )}
    </div>
  );
};
