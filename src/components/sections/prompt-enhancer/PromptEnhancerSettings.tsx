import React from 'react';
import { toast } from 'sonner';
import {
  ArrowClockwise,
  CheckCircle,
  DotsThreeOutlineVertical,
  DownloadSimple,
  Eye,
  FloppyDisk,
  Info,
  Plus,
  Trash,
} from '@phosphor-icons/react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  previewPromptEnhancement,
  type PromptEnhancementPreviewResponse,
  type PromptEnhancementRequest,
} from '@/lib/promptApi';
import { usePromptEnhancerConfig, getDefaultPromptEnhancerConfig } from '@/stores/usePromptEnhancerConfig';
import {
  type PromptEnhancerConfig,
  type PromptEnhancerGroup,
  type PromptEnhancerGroupId,
  type PromptEnhancerOption,
  isCorePromptEnhancerGroupId,
} from '@/types/promptEnhancer';
import { PromptPreviewContent } from './PromptPreviewContent';
import { useShallow } from 'zustand/react/shallow';

const NEW_OPTION_TEMPLATE: Pick<PromptEnhancerOption, 'description' | 'instruction'> = {
  description: 'Describe what this option influences.',
  instruction: 'Explain the guidance this option should add to the refined prompt.',
};

const slugify = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'option';

const formatTimestamp = (timestamp: number): string => {
  const formatter = new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  return formatter.format(timestamp);
};

const isBuiltInOption = (groupId: PromptEnhancerGroupId, optionId: string): boolean => {
  if (!isCorePromptEnhancerGroupId(groupId)) {
    return false;
  }
  const defaultConfig = getDefaultPromptEnhancerConfig();
  const defaultGroup = defaultConfig.groups[groupId];
  if (!defaultGroup) {
    return false;
  }
  return defaultGroup.options.some((opt) => opt.id === optionId);
};

const cloneConfigForRequest = (config: PromptEnhancerConfig): PromptEnhancerConfig => {
  if (typeof structuredClone === 'function') {
    return structuredClone(config);
  }
  return JSON.parse(JSON.stringify(config)) as PromptEnhancerConfig;
};

export const PromptEnhancerSettings: React.FC = () => {
  const {
    config,
    updatedAt,
    isServerSynced,
    loadServerPreferences,
    saveServerPreferences,
    resetToDefaults,
    activeGroupId,
    setActiveGroupId,
    updateGroupMetadata,
    setGroupMultiSelect,
    setDefaultOption,
    addOption,
    updateOption,
    removeOption,
  } = usePromptEnhancerConfig(
    useShallow((state) => ({
      config: state.config,
      updatedAt: state.updatedAt,
      isServerSynced: state.isServerSynced,
      loadServerPreferences: state.loadServerPreferences,
      saveServerPreferences: state.saveServerPreferences,
      resetToDefaults: state.resetToDefaults,
      activeGroupId: state.activeGroupId,
      setActiveGroupId: state.setActiveGroupId,
      updateGroupMetadata: state.updateGroupMetadata,
      setGroupMultiSelect: state.setGroupMultiSelect,
      setDefaultOption: state.setDefaultOption,
      addOption: state.addOption,
      updateOption: state.updateOption,
      removeOption: state.removeOption,
    })),
  );

  const orderedGroupIds = React.useMemo(
    () => config.groupOrder.filter((id) => Boolean(config.groups[id])),
    [config],
  );

  // All hooks must be called before any early returns
  const [isReloadingServer, setIsReloadingServer] = React.useState(false);
  const [isSavingServer, setIsSavingServer] = React.useState(false);
  const [isPreviewDialogOpen, setIsPreviewDialogOpen] = React.useState(false);
  const [previewBasePrompt, setPreviewBasePrompt] = React.useState('');
  const [previewData, setPreviewData] = React.useState<PromptEnhancementPreviewResponse | null>(null);
  const [isGeneratingPreview, setIsGeneratingPreview] = React.useState(false);

  const buildDefaultSelections = React.useCallback(() => {
    const single: Record<string, string> = {};
    const multi: Record<string, string[]> = {};
    for (const groupId of config.groupOrder) {
      const group = config.groups[groupId];
      if (!group) {
        continue;
      }
      if (group.multiSelect) {
        multi[groupId] = [];
      } else {
        const fallback = group.defaultOptionId ?? group.options[0]?.id ?? '';
        single[groupId] = fallback;
      }
    }
    return { single, multi };
  }, [config]);

  const handlePreviewOpen = React.useCallback(() => {
    setPreviewBasePrompt('');
    setPreviewData(null);
    setIsGeneratingPreview(false);
    setIsPreviewDialogOpen(true);
  }, []);

  const handlePreviewDialogChange = React.useCallback((nextOpen: boolean) => {
    setIsPreviewDialogOpen(nextOpen);
    if (!nextOpen) {
      setPreviewData(null);
      setPreviewBasePrompt('');
      setIsGeneratingPreview(false);
    }
  }, []);

  const handleGeneratePreview = React.useCallback(async () => {
    const normalizedPrompt = previewBasePrompt.trim();
    if (!normalizedPrompt) {
      toast.error('Provide a base prompt to preview');
      return;
    }
    setIsGeneratingPreview(true);
    try {
      const selections = buildDefaultSelections();
      const payload: PromptEnhancementRequest = {
        prompt: normalizedPrompt,
        selections,
        configuration: cloneConfigForRequest(config),
        includeProjectContext: true,
        includeRepositoryDiff: false,
      };
      const data = await previewPromptEnhancement(payload);
      setPreviewData(data);
      toast.success('Prompt preview ready');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to build preview';
      toast.error(message);
    } finally {
      setIsGeneratingPreview(false);
    }
  }, [buildDefaultSelections, config, previewBasePrompt]);

  const handleReloadServer = React.useCallback(async () => {
    setIsReloadingServer(true);
    try {
      const loaded = await loadServerPreferences({ force: true });
      if (loaded) {
        toast.success('Prompt enhancer settings refreshed from server');
      } else {
        toast.info('Using default prompt enhancer settings');
      }
    } catch {
      toast.error('Failed to load settings from server');
    } finally {
      setIsReloadingServer(false);
    }
  }, [loadServerPreferences]);

  const handleSaveServer = React.useCallback(async () => {
    setIsSavingServer(true);
    try {
      const success = await saveServerPreferences();
      if (success) {
        toast.success('Prompt enhancer settings saved');
      } else {
        toast.error('Failed to persist settings');
      }
    } catch {
      toast.error('Failed to save settings');
    } finally {
      setIsSavingServer(false);
    }
  }, [saveServerPreferences]);

  const handleResetDefaults = React.useCallback(() => {
    resetToDefaults();
    toast.success('Prompt enhancer settings reset to defaults');
  }, [resetToDefaults]);

  const handleDuplicateOption = React.useCallback(
    (groupId: PromptEnhancerGroupId, option: PromptEnhancerOption) => {
      const uniqueId = `${option.id}-${Math.random().toString(36).slice(2, 6)}`;
      addOption(groupId, {
        id: uniqueId,
        label: `${option.label} copy`,
        summaryLabel: option.summaryLabel,
        description: option.description,
        instruction: option.instruction,
      });
      toast.success(`Duplicated "${option.label}"`);
    },
    [addOption],
  );

  React.useEffect(() => {
    const fallback = orderedGroupIds[0];
    if (!fallback) {
      return;
    }
    if (!orderedGroupIds.includes(activeGroupId)) {
      setActiveGroupId(fallback);
    }
  }, [activeGroupId, orderedGroupIds, setActiveGroupId]);

  // Early returns after all hooks
  if (orderedGroupIds.length === 0) {
    return null;
  }

  const activeGroup = config.groups[activeGroupId];
  if (!activeGroup) {
    return null;
  }

  return (
    <div className="space-y-6">
      <SummaryHeader
        updatedAt={updatedAt}
        isServerSynced={isServerSynced}
        isReloadingServer={isReloadingServer}
        isSavingServer={isSavingServer}
        isPreviewing={isGeneratingPreview}
        onReset={handleResetDefaults}
        onReloadServer={handleReloadServer}
        onSaveServer={handleSaveServer}
        onPreview={handlePreviewOpen}
      />

      <GroupEditor
        group={activeGroup}
        updateGroupMetadata={updateGroupMetadata}
        setGroupMultiSelect={setGroupMultiSelect}
        setDefaultOption={setDefaultOption}
        addOption={addOption}
        updateOption={updateOption}
        removeOption={removeOption}
        duplicateOption={handleDuplicateOption}
      />

      <Dialog open={isPreviewDialogOpen} onOpenChange={handlePreviewDialogChange}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Prompt preview</DialogTitle>
            <DialogDescription>
              Assemble the full refinement prompt using current configuration defaults.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <section className="space-y-2 rounded-xl border border-border/40 bg-background/75 p-3">
              <header className="space-y-1">
                <h3 className="typography-ui-label font-semibold text-foreground">Sample base prompt</h3>
                <p className="typography-meta text-muted-foreground">
                  Provide a task description to evaluate how instructions are combined.
                </p>
              </header>
              <Textarea
                value={previewBasePrompt}
                onChange={(event) => setPreviewBasePrompt(event.target.value)}
                rows={4}
                placeholder="Example: Implement feature flag support for the account dashboard."
              />
              <div className="flex justify-end">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 px-3 text-xs"
                  onClick={handleGeneratePreview}
                  disabled={isGeneratingPreview || !previewBasePrompt.trim()}
                >
                  {isGeneratingPreview ? 'Generating…' : 'Generate preview'}
                </Button>
              </div>
            </section>
            <PromptPreviewContent
              data={previewData}
              isLoading={isGeneratingPreview && !previewData}
              forceProjectContext
              forceRepositoryDiff={false}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

interface SummaryHeaderProps {
  updatedAt: number;
  isServerSynced: boolean;
  isReloadingServer: boolean;
  isSavingServer: boolean;
  isPreviewing: boolean;
  onReset: () => void;
  onReloadServer: () => void;
  onSaveServer: () => void;
  onPreview: () => void;
}

const SummaryHeader: React.FC<SummaryHeaderProps> = ({
  updatedAt,
  isServerSynced,
  isReloadingServer,
  isSavingServer,
  isPreviewing,
  onReset,
  onReloadServer,
  onSaveServer,
  onPreview,
}) => {
  const statusParts = [
    `Last updated ${formatTimestamp(updatedAt)}`,
    `Server sync: ${isServerSynced ? 'in sync' : 'pending'}`,
  ];

  return (
    <div className="px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-0.5">
          <h2 className="typography-ui-label text-xs font-semibold" style={{ color: 'var(--primary-base)' }}>
            Prompt enhancer configuration
          </h2>
          <p className="typography-micro text-muted-foreground/70">{statusParts.join(' · ')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <Button type="button" variant="ghost" size="sm" onClick={onReset} className="h-6 px-1.5 text-xs">
            <ArrowClockwise className="size-3.5" weight="regular" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-6 px-1.5 text-xs"
            onClick={onReloadServer}
            disabled={isReloadingServer}
          >
            <DownloadSimple className="size-3.5" weight="regular" />
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={onSaveServer}
            disabled={isSavingServer}
          >
            <FloppyDisk className="size-3.5" weight="regular" />
            Save
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-6 px-1.5 text-xs"
            onClick={onPreview}
            disabled={isPreviewing}
          >
            <Eye className="size-3.5" weight="regular" />
          </Button>
        </div>
      </div>
    </div>
  );
};

interface GroupEditorProps {
  group: PromptEnhancerGroup;
  updateGroupMetadata: (
    groupId: PromptEnhancerGroupId,
    data: Pick<PromptEnhancerGroup, 'label' | 'helperText' | 'summaryHeading'>,
  ) => void;
  setGroupMultiSelect: (groupId: PromptEnhancerGroupId, multiSelect: boolean) => void;
  setDefaultOption: (groupId: PromptEnhancerGroupId, optionId: string) => void;
  addOption: (groupId: PromptEnhancerGroupId, option: Omit<PromptEnhancerOption, 'id'> & { id?: string }) => void;
  updateOption: (
    groupId: PromptEnhancerGroupId,
    optionId: string,
    updater: Partial<Omit<PromptEnhancerOption, 'id'>> & { id?: string },
  ) => void;
  removeOption: (groupId: PromptEnhancerGroupId, optionId: string) => void;
  duplicateOption: (groupId: PromptEnhancerGroupId, option: PromptEnhancerOption) => void;
}

const GroupEditor: React.FC<GroupEditorProps> = ({
  group,
  updateGroupMetadata,
  setGroupMultiSelect,
  setDefaultOption,
  addOption,
  updateOption,
  removeOption,
  duplicateOption,
}) => {
  const [label, setLabel] = React.useState(group.label);
  const [helperText, setHelperText] = React.useState(group.helperText ?? '');
  const [summaryHeading, setSummaryHeading] = React.useState(group.summaryHeading);
  const [newOptionLabel, setNewOptionLabel] = React.useState('');
  const [newOptionInstruction, setNewOptionInstruction] = React.useState('');

  React.useEffect(() => {
    setLabel(group.label);
    setHelperText(group.helperText ?? '');
    setSummaryHeading(group.summaryHeading);
  }, [group.helperText, group.label, group.summaryHeading]);

  const handleMetadataCommit = React.useCallback(() => {
    updateGroupMetadata(group.id, {
      label,
      helperText: helperText.trim().length > 0 ? helperText : undefined,
      summaryHeading,
    });
  }, [group.id, helperText, label, summaryHeading, updateGroupMetadata]);

  const handleAddOption = React.useCallback(() => {
    const trimmedLabel = newOptionLabel.trim() || `New option ${group.options.length + 1}`;
    const trimmedInstruction = newOptionInstruction.trim() || NEW_OPTION_TEMPLATE.instruction;
    const uniqueId = `${slugify(trimmedLabel)}-${Math.random().toString(36).slice(2, 8)}`;
    addOption(group.id, {
      id: uniqueId,
      label: trimmedLabel,
      summaryLabel: trimmedLabel,
      description: NEW_OPTION_TEMPLATE.description,
      instruction: trimmedInstruction,
    });
    setNewOptionLabel('');
    setNewOptionInstruction('');
  }, [addOption, group.id, group.options.length, newOptionInstruction, newOptionLabel]);

  const defaultOptionId = !group.multiSelect ? group.defaultOptionId ?? group.options[0]?.id : undefined;

  return (
    <div className="space-y-3 px-3">
      <section className="space-y-2 pt-3">
        <header className="flex items-start justify-between gap-2">
          <div>
            <h3 className="typography-ui-label text-xs font-semibold" style={{ color: 'var(--primary-base)' }}>
              {group.label}
            </h3>
            <p className="typography-micro text-muted-foreground/70">
              Configure how this group shapes refined prompt instructions
            </p>
          </div>
          <div className="flex items-center gap-1">
            <Tooltip delayDuration={200}>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground">
                  <Info className="size-4" weight="duotone" />
                </Button>
              </TooltipTrigger>
              <TooltipContent sideOffset={6} className="max-w-sm">
                Adjust the display label, summary heading, helper copy, and selection mode.
              </TooltipContent>
            </Tooltip>
          </div>
        </header>

        <div className="grid gap-2 md:grid-cols-2">
          <div className="space-y-0.5">
            <div className="flex items-center gap-1">
              <label className="typography-ui-label text-xs font-medium text-foreground">Group label</label>
              <Tooltip delayDuration={200}>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-5 w-5 text-muted-foreground hover:text-foreground">
                    <Info className="size-4" weight="duotone" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent sideOffset={6} className="max-w-xs">
                  Display name shown above this option group in the refiner sidebar.
                </TooltipContent>
              </Tooltip>
            </div>
            <Input value={label} onChange={(event) => setLabel(event.target.value)} onBlur={handleMetadataCommit} className="h-7 rounded text-xs" />
          </div>
          <div className="space-y-0.5">
            <div className="flex items-center gap-1">
              <label className="typography-ui-label text-xs font-medium text-foreground">Summary heading</label>
              <Tooltip delayDuration={200}>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-5 w-5 text-muted-foreground hover:text-foreground">
                    <Info className="size-4" weight="duotone" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent sideOffset={6} className="max-w-xs">
                  Title used inside the refiner’s execution summary section.
                </TooltipContent>
              </Tooltip>
            </div>
            <Input value={summaryHeading} onChange={(event) => setSummaryHeading(event.target.value)} onBlur={handleMetadataCommit} className="h-7 rounded text-xs" />
          </div>
          <div className="md:col-span-2 space-y-0.5">
            <div className="flex items-center gap-1">
              <label className="typography-ui-label text-xs font-medium text-foreground">Helper text</label>
              <Tooltip delayDuration={200}>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-5 w-5 text-muted-foreground hover:text-foreground">
                    <Info className="size-4" weight="duotone" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent sideOffset={6} className="max-w-xs">
                  Optional hint shown next to this group in the refiner selection UI.
                </TooltipContent>
              </Tooltip>
            </div>
            <Textarea
              value={helperText}
              onChange={(event) => setHelperText(event.target.value)}
              onBlur={handleMetadataCommit}
              rows={2}
              placeholder="Optional description shown beside the selector"
              className="resize-none rounded text-xs"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center gap-1">
            <h4 className="typography-ui-label text-xs font-medium text-foreground">Selection mode</h4>
            <Tooltip delayDuration={200}>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-5 w-5 text-muted-foreground hover:text-foreground">
                  <Info className="size-4" weight="duotone" />
                </Button>
              </TooltipTrigger>
              <TooltipContent sideOffset={6} className="max-w-xs">
                Switch between single-choice and multi-choice behaviour for this group.
              </TooltipContent>
            </Tooltip>
          </div>
          <div className="flex gap-1">
            <Button
              type="button"
              size="sm"
              variant={group.multiSelect ? 'outline' : 'default'}
              className="h-6 px-2 text-xs"
              onClick={() => !group.multiSelect && setGroupMultiSelect(group.id, false)}
            >
              Single-choice
            </Button>
            <Button
              type="button"
              size="sm"
              variant={group.multiSelect ? 'default' : 'outline'}
              className="h-6 px-2 text-xs"
              onClick={() => group.multiSelect || setGroupMultiSelect(group.id, true)}
            >
              Multi-choice
            </Button>
          </div>
        </div>
      </section>

      {!group.multiSelect && group.options.length > 0 && (
        <section className="space-y-1.5 pt-2">
          <div className="flex items-center gap-1">
            <h4 className="typography-ui-label text-xs font-medium text-foreground">Default option</h4>
            <Tooltip delayDuration={200}>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-5 w-5 text-muted-foreground hover:text-foreground">
                  <Info className="size-4" weight="duotone" />
                </Button>
              </TooltipTrigger>
              <TooltipContent sideOffset={6} className="max-w-xs">
                Used whenever the refiner doesn’t receive an explicit choice.
              </TooltipContent>
            </Tooltip>
          </div>
          <div className="flex flex-wrap gap-1">
            {group.options.map((option) => {
              const isCurrentDefault = option.id === defaultOptionId;
              return (
                <Button
                  key={option.id}
                  type="button"
                  size="sm"
                  variant={isCurrentDefault ? 'default' : 'outline'}
                  className="h-6 rounded px-2 text-xs"
                  onClick={() => setDefaultOption(group.id, option.id)}
                >
                  {isCurrentDefault && <CheckCircle className="mr-1 size-3" weight="regular" />}
                  {option.label}
                </Button>
              );
            })}
          </div>
        </section>
      )}

      <section className="space-y-2 pt-2">
        <div className="flex items-center gap-1">
          <h4 className="typography-ui-label text-xs font-semibold" style={{ color: 'var(--primary-base)' }}>
            Options
          </h4>
          <Tooltip delayDuration={200}>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-5 w-5 text-muted-foreground hover:text-foreground">
                <Info className="size-4" weight="duotone" />
              </Button>
            </TooltipTrigger>
            <TooltipContent sideOffset={6} className="max-w-xs">
              Each option appends guidance to the refined prompt.
            </TooltipContent>
          </Tooltip>
        </div>
        {group.options.map((option) => (
          <OptionCard
            key={option.id}
            group={group}
            option={option}
            defaultOptionId={defaultOptionId}
            setDefaultOption={setDefaultOption}
            updateOption={updateOption}
            removeOption={removeOption}
            duplicateOption={duplicateOption}
          />
        ))}
      </section>

      <section className="space-y-2 pt-2">
        <div className="flex items-center gap-1">
          <h4 className="typography-ui-label text-xs font-medium text-foreground">Add option</h4>
          <Tooltip delayDuration={200}>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-5 w-5 text-muted-foreground hover:text-foreground">
                <Info className="size-4" weight="duotone" />
              </Button>
            </TooltipTrigger>
            <TooltipContent sideOffset={6} className="max-w-xs">
              Create a preset for the refiner to surface.
            </TooltipContent>
          </Tooltip>
        </div>
        <div className="grid gap-1.5 md:grid-cols-2">
          <Input value={newOptionLabel} onChange={(event) => setNewOptionLabel(event.target.value)} placeholder="Option label" className="h-7 rounded text-xs" />
          <Input
            value={newOptionInstruction}
            onChange={(event) => setNewOptionInstruction(event.target.value)}
            placeholder="Instruction override"
            className="h-7 rounded text-xs"
          />
        </div>
        <div className="flex justify-end">
          <Button type="button" variant="outline" size="sm" onClick={handleAddOption} className="h-6 px-2 text-xs">
            <Plus className="mr-1 size-3" weight="regular" />
            Add
          </Button>
        </div>
      </section>
    </div>
  );
};

interface OptionCardProps {
  group: PromptEnhancerGroup;
  option: PromptEnhancerOption;
  defaultOptionId?: string;
  setDefaultOption: (groupId: PromptEnhancerGroupId, optionId: string) => void;
  updateOption: (
    groupId: PromptEnhancerGroupId,
    optionId: string,
    updater: Partial<Omit<PromptEnhancerOption, 'id'>> & { id?: string },
  ) => void;
  removeOption: (groupId: PromptEnhancerGroupId, optionId: string) => void;
  duplicateOption: (groupId: PromptEnhancerGroupId, option: PromptEnhancerOption) => void;
}

const OptionCard: React.FC<OptionCardProps> = ({
  group,
  option,
  defaultOptionId,
  setDefaultOption,
  updateOption,
  removeOption,
  duplicateOption,
}) => {
  const [label, setLabel] = React.useState(option.label);
  const [summaryLabel, setSummaryLabel] = React.useState(option.summaryLabel);
  const [description, setDescription] = React.useState(option.description ?? '');
  const [instruction, setInstruction] = React.useState(option.instruction);

  React.useEffect(() => {
    setLabel(option.label);
    setSummaryLabel(option.summaryLabel);
    setDescription(option.description ?? '');
    setInstruction(option.instruction);
  }, [option.description, option.instruction, option.label, option.summaryLabel]);

  const isDefault = !group.multiSelect && option.id === defaultOptionId;
  const isBuiltIn = isBuiltInOption(group.id, option.id);

  const commitChanges = React.useCallback(() => {
    const trimmedInstruction = instruction.trim();
    if (!trimmedInstruction) {
      toast.error('Instruction cannot be empty');
      setInstruction(option.instruction);
      return;
    }
    updateOption(group.id, option.id, {
      label: label.trim() || option.label,
      summaryLabel: summaryLabel.trim() || label.trim() || option.summaryLabel,
      description: description.trim().length > 0 ? description : undefined,
      instruction: isBuiltIn ? option.instruction : trimmedInstruction,
    });
  }, [description, group.id, instruction, isBuiltIn, label, option.id, option.instruction, option.label, option.summaryLabel, summaryLabel, updateOption]);

  const handleRemove = React.useCallback(() => {
    if (isBuiltIn) {
      toast.error('Cannot remove built-in options');
      return;
    }
    if (group.options.length <= 1) {
      toast.error('Each group must retain at least one option');
      return;
    }
    removeOption(group.id, option.id);
  }, [group.id, group.options.length, isBuiltIn, option.id, removeOption]);

  return (
    <div className="space-y-2 pt-2.5">
      <div className="flex items-center gap-1.5">
        <span
          className="typography-ui-label text-xs font-semibold"
          style={{ color: 'color-mix(in srgb, var(--primary-base) 70%, var(--foreground))' }}
        >
          {label}
        </span>
        {isBuiltIn && (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">Built-in</span>
        )}
        {isDefault && (
          <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">Default</span>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="icon" className="h-5 w-5 text-muted-foreground/60">
              <DotsThreeOutlineVertical className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {!group.multiSelect && !isDefault && (
              <DropdownMenuItem onSelect={() => setDefaultOption(group.id, option.id)}>
                <CheckCircle className="mr-2 size-4" weight="regular" />
                Set as default
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={() => duplicateOption(group.id, option)}>
              <Plus className="mr-2 size-4" weight="regular" />
              Duplicate
            </DropdownMenuItem>
            {!isBuiltIn && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={handleRemove} className="text-destructive">
                  <Trash className="mr-2 size-4" weight="regular" />
                  Remove
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex items-center gap-1.5">
        <div className="relative w-32">
          <Input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            onBlur={commitChanges}
            className="h-6 rounded pr-6 text-xs"
            placeholder="Label"
          />
          <Tooltip delayDuration={200}>
            <TooltipTrigger asChild>
              <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center justify-center">
                <Info className="size-3 text-muted-foreground/40" weight="duotone" />
              </div>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs text-xs">
              Display name for this option
            </TooltipContent>
          </Tooltip>
        </div>
        <span className="typography-micro text-muted-foreground/50">→</span>
        <div className="relative flex-1">
          <Input
            value={summaryLabel}
            onChange={(event) => setSummaryLabel(event.target.value)}
            onBlur={commitChanges}
            className="h-6 rounded pr-6 text-xs"
            placeholder="Summary"
          />
          <Tooltip delayDuration={200}>
            <TooltipTrigger asChild>
              <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center justify-center">
                <Info className="size-3 text-muted-foreground/40" weight="duotone" />
              </div>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs text-xs">
              Label used in execution summary
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      <div className="relative">
        <Input
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          onBlur={commitChanges}
          placeholder="Description (optional)"
          className="h-6 rounded pr-6 text-xs"
        />
        <Tooltip delayDuration={200}>
          <TooltipTrigger asChild>
            <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center justify-center">
              <Info className="size-3 text-muted-foreground/40" weight="duotone" />
            </div>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs text-xs">
            Optional hint shown when hovering/selecting this option
          </TooltipContent>
        </Tooltip>
      </div>
      <div className="relative">
        <Textarea
          value={instruction}
          onChange={(event) => setInstruction(event.target.value)}
          onBlur={commitChanges}
          rows={2}
          placeholder="Instruction for refined prompt"
          className="resize-none rounded pr-6 text-xs"
          disabled={isBuiltIn}
        />
        <Tooltip delayDuration={200}>
          <TooltipTrigger asChild>
            <div className="absolute right-1.5 top-1.5 flex items-center justify-center">
              <Info className="size-3 text-muted-foreground/40" weight="duotone" />
            </div>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs text-xs">
            {isBuiltIn
              ? 'Built-in instruction is read-only and will be updated with app releases'
              : 'Text appended to refined prompt when this option is selected'}
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
};
