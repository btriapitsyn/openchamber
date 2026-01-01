import React from 'react';
import { RiAddLine, RiCloseLine, RiPlayLine, RiSearchLine } from '@remixicon/react';
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
import type { CreateMultiRunParams, MultiRunModelSelection } from '@/types/multirun';

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
 */
const ModelChip: React.FC<{
  model: MultiRunModelSelection;
  onRemove: () => void;
}> = ({ model, onRemove }) => {
  return (
    <div className={cn('flex items-center gap-1.5 px-2 rounded-md bg-accent/50 border border-border/30', CHIP_HEIGHT_CLASS)}>
      <ProviderLogo providerId={model.providerID} className="h-3.5 w-3.5" />
      <span className="typography-meta font-medium truncate max-w-[140px]">
        {model.displayName || `${model.providerID}/${model.modelID}`}
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

/**
 * Model selector for multi-run (allows selecting multiple unique models).
 */
const ModelMultiSelect: React.FC<{
  selectedModels: MultiRunModelSelection[];
  onAdd: (model: MultiRunModelSelection) => void;
  onRemove: (index: number) => void;
}> = ({ selectedModels, onAdd, onRemove }) => {
  const providers = useConfigStore((state) => state.providers);
  const [isOpen, setIsOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  // Get set of already selected model keys
  const selectedKeys = React.useMemo(() => {
    return new Set(selectedModels.map((m) => `${m.providerID}:${m.modelID}`));
  }, [selectedModels]);

  // Filter models based on search query
  const filteredProviders = React.useMemo(() => {
    if (!searchQuery.trim()) return providers;

    const query = searchQuery.toLowerCase();
    return providers
      .map((provider) => {
        const models = Array.isArray(provider.models) ? provider.models : [];
        const filteredModels = models.filter((model) => {
          const modelName = (model.name || model.id || '').toString().toLowerCase();
          const providerName = provider.name.toLowerCase();
          return modelName.includes(query) || providerName.includes(query);
        });
        return { ...provider, models: filteredModels };
      })
      .filter((provider) => provider.models.length > 0);
  }, [providers, searchQuery]);

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
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

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

          {isOpen && (
            <div className="absolute top-full left-0 mt-1 z-50 border border-border/30 rounded-lg overflow-hidden bg-background shadow-lg w-72">
              {/* Search input */}
              <div className="p-2 border-b border-border/30">
                <div className="relative">
                  <RiSearchLine className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    ref={searchInputRef}
                    type="text"
                    placeholder="Search models..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-8 pl-8 typography-meta"
                  />
                </div>
              </div>

              {/* Models list */}
              <ScrollableOverlay
                outerClassName="max-h-[240px]"
                className="p-2 space-y-1"
              >
                {filteredProviders.length === 0 ? (
                  <div className="py-4 text-center text-muted-foreground typography-meta">
                    No models found
                  </div>
                ) : (
                  filteredProviders.map((provider) => {
                    const models = Array.isArray(provider.models) ? provider.models : [];
                    if (models.length === 0) return null;

                    return (
                      <div key={provider.id} className="space-y-0.5">
                        <div className="flex items-center gap-2 py-1 text-muted-foreground">
                          <ProviderLogo providerId={provider.id} className="h-3 w-3" />
                          <span className="typography-micro font-medium uppercase tracking-wider">
                            {provider.name}
                          </span>
                        </div>
                        {models.map((model) => {
                          const key = `${provider.id}:${model.id}`;
                          const isSelected = selectedKeys.has(key);

                          return (
                            <button
                              key={model.id as string}
                              type="button"
                              disabled={isSelected}
                              onClick={() => {
                                onAdd({
                                  providerID: provider.id,
                                  modelID: model.id as string,
                                  displayName: model.name as string || model.id as string,
                                });
                                // Don't close dropdown - allow selecting multiple
                              }}
                              className={cn(
                                'w-full text-left px-2 py-1 rounded-md typography-meta transition-colors',
                                isSelected
                                  ? 'text-muted-foreground/50 cursor-not-allowed'
                                  : 'hover:bg-accent/50'
                              )}
                            >
                              {model.name || model.id}
                              {isSelected && (
                                <span className="ml-2 text-muted-foreground/50">(selected)</span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    );
                  })
                )}
              </ScrollableOverlay>
            </div>
          )}
        </div>

        {/* Selected models */}
        {selectedModels.map((model, index) => (
          <ModelChip
            key={`${model.providerID}:${model.modelID}`}
            model={model}
            onRemove={() => onRemove(index)}
          />
        ))}
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
  const [selectedModels, setSelectedModels] = React.useState<MultiRunModelSelection[]>([]);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const currentDirectory = useDirectoryStore((state) => state.currentDirectory ?? null);

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


  const handleAddModel = (model: MultiRunModelSelection) => {
    const key = `${model.providerID}:${model.modelID}`;
    if (selectedModels.some((m) => `${m.providerID}:${m.modelID}` === key)) {
      return;
    }
    setSelectedModels((prev) => [...prev, model]);
    clearError();
  };

  const handleRemoveModel = (index: number) => {
    setSelectedModels((prev) => prev.filter((_, i) => i !== index));
    clearError();
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
      const params: CreateMultiRunParams = {
        name: name.trim(),
        prompt: prompt.trim(),
        models: selectedModels,
        worktreeBaseBranch,
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
        className="flex h-12 items-center justify-between border-b app-region-drag"
        style={{ borderColor: 'var(--interactive-border)' }}
      >
        <div className="flex items-center gap-3 pl-4">
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
          <form onSubmit={handleSubmit} className="space-y-6">
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
                className="typography-body"
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
                    className="w-full typography-meta text-foreground"
                  >
                    <SelectValue
                      placeholder={isLoadingWorktreeBaseBranches ? 'Loading branches…' : 'Select a branch'}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>Default</SelectLabel>
                      {availableWorktreeBaseBranches
                        .filter((option) => option.group === 'special')
                        .map((option) => (
                          <SelectItem key={option.value} value={option.value}>
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
                              <SelectItem key={option.value} value={option.value}>
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
                              <SelectItem key={option.value} value={option.value}>
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
