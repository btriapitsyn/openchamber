import React from 'react';
import { RiAddLine, RiAttachment2, RiCloseLine, RiFileImageLine, RiFileLine, RiPlayLine, RiSearchLine, RiStarFill, RiTimeLine } from '@remixicon/react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';
import { ProviderLogo } from '@/components/ui/ProviderLogo';
import { checkIsGitRepository, getGitBranches } from '@/lib/gitApi';
import { cn } from '@/lib/utils';
import { useConfigStore } from '@/stores/useConfigStore';
import { useDirectoryStore } from '@/stores/useDirectoryStore';
import { useMultiRunStore } from '@/stores/useMultiRunStore';
import { useSessionStore } from '@/stores/useSessionStore';
import { useUIStore } from '@/stores/useUIStore';
import { useModelLists } from '@/hooks/useModelLists';
import type { CreateMultiRunParams, MultiRunModelSelection } from '@/types/multirun';
import type { ModelMetadata } from '@/types';

/** Max file size in bytes (10MB) */
const MAX_FILE_SIZE = 10 * 1024 * 1024;

/** Attached file for multi-run (simplified from sessionStore's AttachedFile) */
interface MultiRunAttachedFile {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  dataUrl: string;
}

/** UI-only type with instanceId for React keys and duplicate tracking */
type ModelSelectionWithId = MultiRunModelSelection & { instanceId: string };

const generateInstanceId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
};

interface MultiRunLauncherProps {
  /** Prefill prompt textarea (optional) */
  initialPrompt?: string;
  /** Called when multi-run is successfully created */
  onCreated?: () => void;
  /** Called when user cancels */
  onCancel?: () => void;
}

/** Chip height class - shared between chips and add button */
const CHIP_HEIGHT_CLASS = 'h-7';

type WorktreeBaseOption = {
  value: string;
  label: string;
  group: 'special' | 'local' | 'remote';
};

/**
 * Model selection chip with remove button.
 * Shows instance index (e.g., "(2)") when same model is selected multiple times.
 */
const ModelChip: React.FC<{
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
 * Model selector for multi-run (allows selecting same model multiple times).
 */
const ModelMultiSelect: React.FC<{
  selectedModels: ModelSelectionWithId[];
  onAdd: (model: ModelSelectionWithId) => void;
  onRemove: (index: number) => void;
}> = ({ selectedModels, onAdd, onRemove }) => {
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
            Add model
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
        {selectedModels.map((model, index) => {
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
    </div>
  );
};

/**
 * Launcher form for creating a new Multi-Run group.
 * Replaces the main content area (tabs) with a form.
 */
export const MultiRunLauncher: React.FC<MultiRunLauncherProps> = ({
  initialPrompt,
  onCreated,
  onCancel,
}) => {
  const [name, setName] = React.useState('');
  const [prompt, setPrompt] = React.useState(() => initialPrompt ?? '');
  const [selectedModels, setSelectedModels] = React.useState<ModelSelectionWithId[]>([]);
  const [attachedFiles, setAttachedFiles] = React.useState<MultiRunAttachedFile[]>([]);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const currentDirectory = useDirectoryStore((state) => state.currentDirectory ?? null);
  const isSidebarOpen = useUIStore((state) => state.isSidebarOpen);

  const [isDesktopApp, setIsDesktopApp] = React.useState<boolean>(() => {
    if (typeof window === 'undefined') {
      return false;
    }
    return typeof (window as typeof window & { opencodeDesktop?: unknown }).opencodeDesktop !== 'undefined';
  });

  const isMacPlatform = React.useMemo(() => {
    if (typeof navigator === 'undefined') {
      return false;
    }
    return /Macintosh|Mac OS X/.test(navigator.userAgent || '');
  }, []);

  React.useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const detected = typeof (window as typeof window & { opencodeDesktop?: unknown }).opencodeDesktop !== 'undefined';
    setIsDesktopApp(detected);
  }, []);

  const desktopHeaderPaddingClass = React.useMemo(() => {
    if (isDesktopApp && isMacPlatform) {
      return isSidebarOpen ? 'pl-0' : 'pl-[8.0rem]';
    }
    return 'pl-3';
  }, [isDesktopApp, isMacPlatform, isSidebarOpen]);

  const [worktreeBaseBranch, setWorktreeBaseBranch] = React.useState<string>('HEAD');
  const [availableWorktreeBaseBranches, setAvailableWorktreeBaseBranches] = React.useState<WorktreeBaseOption[]>([
    { value: 'HEAD', label: 'Current (HEAD)', group: 'special' },
  ]);
  const [isLoadingWorktreeBaseBranches, setIsLoadingWorktreeBaseBranches] = React.useState(false);
  const [isGitRepository, setIsGitRepository] = React.useState<boolean | null>(null);

  const createMultiRun = useMultiRunStore((state) => state.createMultiRun);
  const error = useMultiRunStore((state) => state.error);
  const clearError = useMultiRunStore((state) => state.clearError);

  React.useEffect(() => {
    if (typeof initialPrompt === 'string' && initialPrompt.trim().length > 0) {
      setPrompt((prev) => (prev.trim().length > 0 ? prev : initialPrompt));
    }
  }, [initialPrompt]);

  React.useEffect(() => {
    let cancelled = false;

    if (!currentDirectory) {
      setIsGitRepository(null);
      setIsLoadingWorktreeBaseBranches(false);
      setAvailableWorktreeBaseBranches([{ value: 'HEAD', label: 'Current (HEAD)', group: 'special' }]);
      setWorktreeBaseBranch('HEAD');
      return;
    }

    setIsLoadingWorktreeBaseBranches(true);
    setIsGitRepository(null);

    (async () => {
      try {
        const isGit = await checkIsGitRepository(currentDirectory);
        if (cancelled) return;

        setIsGitRepository(isGit);

        if (!isGit) {
          setAvailableWorktreeBaseBranches([{ value: 'HEAD', label: 'Current (HEAD)', group: 'special' }]);
          setWorktreeBaseBranch('HEAD');
          return;
        }

        const branches = await getGitBranches(currentDirectory).catch(() => null);
        if (cancelled) return;

        const worktreeBaseOptions: WorktreeBaseOption[] = [];
        const headLabel = branches?.current ? `Current (HEAD: ${branches.current})` : 'Current (HEAD)';
        worktreeBaseOptions.push({ value: 'HEAD', label: headLabel, group: 'special' });

        if (branches) {
          const localBranches = branches.all
            .filter((branchName) => !branchName.startsWith('remotes/'))
            .sort((a, b) => a.localeCompare(b));
          localBranches.forEach((branchName) => {
            worktreeBaseOptions.push({ value: branchName, label: branchName, group: 'local' });
          });

          const remoteBranches = branches.all
            .filter((branchName) => branchName.startsWith('remotes/'))
            .map((branchName) => branchName.replace(/^remotes\//, ''))
            .sort((a, b) => a.localeCompare(b));
          remoteBranches.forEach((branchName) => {
            worktreeBaseOptions.push({ value: branchName, label: branchName, group: 'remote' });
          });
        }

        setAvailableWorktreeBaseBranches(worktreeBaseOptions);
        setWorktreeBaseBranch((previous) =>
          worktreeBaseOptions.some((option) => option.value === previous) ? previous : 'HEAD'
        );
      } finally {
        if (!cancelled) {
          setIsLoadingWorktreeBaseBranches(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentDirectory]);


  const handleAddModel = (model: ModelSelectionWithId) => {
    setSelectedModels((prev) => [...prev, model]);
    clearError();
  };

  const handleRemoveModel = (index: number) => {
    setSelectedModels((prev) => prev.filter((_, i) => i !== index));
    clearError();
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    let attachedCount = 0;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.size > MAX_FILE_SIZE) {
        toast.error(`File "${file.name}" is too large (max 10MB)`);
        continue;
      }

      try {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        const newFile: MultiRunAttachedFile = {
          id: generateInstanceId(),
          filename: file.name,
          mimeType: file.type || 'application/octet-stream',
          size: file.size,
          dataUrl,
        };

        setAttachedFiles((prev) => [...prev, newFile]);
        attachedCount++;
      } catch (error) {
        console.error('File attach failed', error);
        toast.error(`Failed to attach "${file.name}"`);
      }
    }

    if (attachedCount > 0) {
      toast.success(`Attached ${attachedCount} file${attachedCount > 1 ? 's' : ''}`);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemoveFile = (id: string) => {
    setAttachedFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!prompt.trim()) {
      return;
    }
    if (selectedModels.length < 2) {
      return;
    }


    setIsSubmitting(true);
    clearError();

    try {
      // Strip instanceId before passing to store (UI-only field)
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const modelsForStore: MultiRunModelSelection[] = selectedModels.map(({ instanceId: _instanceId, ...rest }) => rest);
      
      // Convert attached files to the format expected by the store
      const filesForStore = attachedFiles.map((f) => ({
        mime: f.mimeType,
        filename: f.filename,
        url: f.dataUrl,
      }));

      const params: CreateMultiRunParams = {
        name: name.trim(),
        prompt: prompt.trim(),
        models: modelsForStore,
        worktreeBaseBranch,
        files: filesForStore.length > 0 ? filesForStore : undefined,
      };

      const result = await createMultiRun(params);
       if (result) {
         if (result.firstSessionId) {
           useSessionStore.getState().setCurrentSession(result.firstSessionId);
         }

         // Close launcher
         onCreated?.();
       }
    } finally {
      setIsSubmitting(false);
    }
  };

  const isValid = Boolean(
    name.trim() && prompt.trim() && selectedModels.length >= 2 && isGitRepository && !isLoadingWorktreeBaseBranches
  );

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header - same height as app header (h-12 = 48px) */}
      <header
        className={cn(
          'flex h-12 items-center justify-between border-b app-region-drag',
          desktopHeaderPaddingClass
        )}
        style={{ borderColor: 'var(--interactive-border)' }}
      >
        <div
          className={cn(
            'flex items-center gap-3',
            isDesktopApp && isMacPlatform && isSidebarOpen && 'pl-4'
          )}
        >
          <h1 className="typography-ui-label font-medium">New Multi-Run</h1>
        </div>
        {onCancel && (
          <div className="flex items-center pr-3">
            <Tooltip delayDuration={500}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={onCancel}
                  aria-label="Close"
                  className="inline-flex h-9 w-9 items-center justify-center p-2 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary app-region-no-drag"
                >
                  <RiCloseLine className="h-5 w-5" />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Close</p>
              </TooltipContent>
            </Tooltip>
          </div>
        )}
      </header>

      {/* Content with chat-column max-width */}
      <div className="flex-1 overflow-auto">
        <div className="chat-column py-6">
          <form onSubmit={handleSubmit} className="space-y-6" data-keyboard-avoid="true">
            {/* Group name (required) */}
            <div className="space-y-2">
              <label htmlFor="group-name" className="typography-ui-label font-medium text-foreground">
                Group name <span className="text-destructive">*</span>
              </label>
              <Input
                id="group-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. feature-auth, bugfix-login"
                className="typography-body max-w-full sm:max-w-xs"
                required
              />
              <p className="typography-micro text-muted-foreground">
                Used for worktree directory and branch names
              </p>
            </div>

            {/* Worktree creation */}
            <div className="space-y-3">
              <div className="space-y-1">
                <p className="typography-ui-label font-medium text-foreground">Worktrees</p>
                <p className="typography-micro text-muted-foreground">
                  Create one worktree per model by creating a new branch from a base branch.
                </p>
              </div>

              <div className="space-y-2">
                <label
                  className="typography-meta font-medium text-foreground"
                  htmlFor="multirun-worktree-base-branch"
                >
                  Base branch
                </label>
                <Select
                  value={worktreeBaseBranch}
                  onValueChange={setWorktreeBaseBranch}
                  disabled={!isGitRepository || isLoadingWorktreeBaseBranches}
                >
                  <SelectTrigger
                    id="multirun-worktree-base-branch"
                    size="lg"
                    className="max-w-full typography-meta text-foreground"
                  >
                    <SelectValue
                      placeholder={isLoadingWorktreeBaseBranches ? 'Loading branches…' : 'Select a branch'}
                    />
                  </SelectTrigger>
                  <SelectContent fitContent>
                    <SelectGroup>
                      <SelectLabel>Default</SelectLabel>
                      {availableWorktreeBaseBranches
                        .filter((option) => option.group === 'special')
                        .map((option) => (
                          <SelectItem key={option.value} value={option.value} className="w-auto whitespace-nowrap">
                            {option.label}
                          </SelectItem>
                        ))}
                    </SelectGroup>

                    {availableWorktreeBaseBranches.some((option) => option.group === 'local') ? (
                      <>
                        <SelectSeparator />
                        <SelectGroup>
                          <SelectLabel>Local branches</SelectLabel>
                          {availableWorktreeBaseBranches
                            .filter((option) => option.group === 'local')
                            .map((option) => (
                              <SelectItem key={option.value} value={option.value} className="w-auto whitespace-nowrap">
                                {option.label}
                              </SelectItem>
                            ))}
                        </SelectGroup>
                      </>
                    ) : null}

                    {availableWorktreeBaseBranches.some((option) => option.group === 'remote') ? (
                      <>
                        <SelectSeparator />
                        <SelectGroup>
                          <SelectLabel>Remote branches</SelectLabel>
                          {availableWorktreeBaseBranches
                            .filter((option) => option.group === 'remote')
                            .map((option) => (
                              <SelectItem key={option.value} value={option.value} className="w-auto whitespace-nowrap">
                                {option.label}
                              </SelectItem>
                            ))}
                        </SelectGroup>
                      </>
                    ) : null}
                  </SelectContent>
                </Select>
                <p className="typography-micro text-muted-foreground">
                  Creates new branches from{' '}
                  <code className="font-mono text-xs text-muted-foreground">{worktreeBaseBranch || 'HEAD'}</code>.
                </p>
                {isGitRepository === false ? (
                  <p className="typography-micro text-muted-foreground/70">Not in a git repository.</p>
                ) : null}
              </div>
            </div>

            {/* Prompt */}
            <div className="space-y-2">
              <label htmlFor="prompt" className="typography-ui-label font-medium text-foreground">
                Prompt <span className="text-destructive">*</span>
              </label>
              <Textarea
                id="prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Enter the prompt to send to all models..."
                className="typography-body min-h-[120px] max-h-[400px] resize-none overflow-y-auto field-sizing-content"
                required
              />
            </div>

            {/* File attachments */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <label className="typography-ui-label font-medium text-foreground">
                  Attachments
                </label>
                <span className="typography-micro text-muted-foreground">(optional, same files for all runs)</span>
              </div>
              
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={handleFileSelect}
                accept="*/*"
              />
              
              <div className="flex flex-wrap gap-2 items-center">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <RiAttachment2 className="h-3.5 w-3.5 mr-1.5" />
                  Attach files
                </Button>
                
                {attachedFiles.map((file) => (
                  <div
                    key={file.id}
                    className="inline-flex items-center gap-1.5 px-2 py-1 bg-muted/30 border border-border/30 rounded-md typography-meta"
                  >
                    {file.mimeType.startsWith('image/') ? (
                      <RiFileImageLine className="h-3.5 w-3.5 text-muted-foreground" />
                    ) : (
                      <RiFileLine className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                    <span className="truncate max-w-[120px]" title={file.filename}>
                      {file.filename}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      ({file.size < 1024 ? `${file.size}B` : file.size < 1024 * 1024 ? `${(file.size / 1024).toFixed(1)}KB` : `${(file.size / (1024 * 1024)).toFixed(1)}MB`})
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveFile(file.id)}
                      className="text-muted-foreground hover:text-destructive ml-0.5"
                    >
                      <RiCloseLine className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Model selection */}
            <div className="space-y-2">
              <label className="typography-ui-label font-medium text-foreground">
                Models <span className="text-destructive">*</span>
                <span className="ml-1 font-normal text-muted-foreground">(select at least 2)</span>
              </label>
              <ModelMultiSelect
                selectedModels={selectedModels}
                onAdd={handleAddModel}
                onRemove={handleRemoveModel}
              />
            </div>

            {/* Error message */}
            {error && (
              <div className="px-4 py-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive typography-body">
                {error}
              </div>
            )}

            {/* Action buttons */}
            <div className="flex items-center justify-end gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={onCancel}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={!isValid || isSubmitting}
              >
                {isSubmitting ? (
                  'Creating...'
                ) : (
                  <>
                    <RiPlayLine className="h-4 w-4 mr-2" />
                    Start ({selectedModels.length} models)
                  </>
                )}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
