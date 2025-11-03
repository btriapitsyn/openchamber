import React from 'react';
import { toast } from 'sonner';
import {
  ArrowClockwise,
  CheckCircle,
  DotsThreeOutlineVertical,
  DownloadSimple,
  FloppyDisk,
  Info,
  Plus,
  Trash,
} from '@phosphor-icons/react';

import { Button } from '@/components/ui/button';
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
import { usePromptEnhancerConfig } from '@/stores/usePromptEnhancerConfig';
import { type PromptEnhancerGroup, type PromptEnhancerGroupId, type PromptEnhancerOption } from '@/types/promptEnhancer';
import { isDesktopRuntime } from '@/lib/desktop';
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

export const PromptEnhancerSettings: React.FC = () => {
  const isDesktop = isDesktopRuntime();
  const {
    config,
    updatedAt,
    isServerSynced,
    isDesktopSynced,
    loadServerPreferences,
    saveServerPreferences,
    loadDesktopPreferences,
    saveDesktopPreferences,
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
      isDesktopSynced: state.isDesktopSynced,
      loadServerPreferences: state.loadServerPreferences,
      saveServerPreferences: state.saveServerPreferences,
      loadDesktopPreferences: state.loadDesktopPreferences,
      saveDesktopPreferences: state.saveDesktopPreferences,
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

  React.useEffect(() => {
    const fallback = orderedGroupIds[0];
    if (!fallback) {
      return;
    }
    if (!orderedGroupIds.includes(activeGroupId)) {
      setActiveGroupId(fallback);
    }
  }, [activeGroupId, orderedGroupIds, setActiveGroupId]);

  if (orderedGroupIds.length === 0) {
    return null;
  }

  const activeGroup = config.groups[activeGroupId];
  if (!activeGroup) {
    return null;
  }

  const [isReloadingServer, setIsReloadingServer] = React.useState(false);
  const [isSavingServer, setIsSavingServer] = React.useState(false);
  const [isLoadingDesktopPrefs, setIsLoadingDesktopPrefs] = React.useState(false);
  const [isSavingDesktopPrefs, setIsSavingDesktopPrefs] = React.useState(false);

  const handleReloadServer = React.useCallback(async () => {
    setIsReloadingServer(true);
    try {
      const loaded = await loadServerPreferences({ force: true });
      if (loaded) {
        toast.success('Prompt enhancer settings refreshed from server');
      } else {
        toast.info('Using default prompt enhancer settings');
      }
    } catch (error) {
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
    } catch (error) {
      toast.error('Failed to save settings');
    } finally {
      setIsSavingServer(false);
    }
  }, [saveServerPreferences]);

  const handleReloadDesktop = React.useCallback(async () => {
    if (!isDesktop) {
      toast.info('Desktop persistence is only available in the Electron app.');
      return;
    }
    setIsLoadingDesktopPrefs(true);
    try {
      const loaded = await loadDesktopPreferences({ force: true });
      if (loaded) {
        toast.success('Prompt enhancer settings loaded from desktop storage');
      } else {
        toast.info('No prompt enhancer settings found in desktop storage');
      }
    } catch (error) {
      toast.error('Failed to load settings from desktop storage');
    } finally {
      setIsLoadingDesktopPrefs(false);
    }
  }, [isDesktop, loadDesktopPreferences]);

  const handleSaveDesktop = React.useCallback(async () => {
    if (!isDesktop) {
      toast.info('Desktop persistence is only available in the Electron app.');
      return;
    }
    setIsSavingDesktopPrefs(true);
    try {
      const success = await saveDesktopPreferences();
      if (success) {
        toast.success('Prompt enhancer settings saved to desktop storage');
      } else {
        toast.error('Failed to persist settings to desktop storage');
      }
    } catch (error) {
      toast.error('Failed to persist settings to desktop storage');
    } finally {
      setIsSavingDesktopPrefs(false);
    }
  }, [isDesktop, saveDesktopPreferences]);

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

  return (
    <div className="space-y-6">
      <SummaryHeader
        updatedAt={updatedAt}
        isServerSynced={isServerSynced}
        isDesktopSynced={isDesktopSynced}
        isReloadingServer={isReloadingServer}
        isSavingServer={isSavingServer}
        isDesktopAvailable={isDesktop}
        isLoadingDesktop={isLoadingDesktopPrefs}
        isSavingDesktop={isSavingDesktopPrefs}
        onReset={handleResetDefaults}
        onReloadServer={handleReloadServer}
        onSaveServer={handleSaveServer}
        onLoadDesktop={handleReloadDesktop}
        onSaveDesktop={handleSaveDesktop}
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
    </div>
  );
};

interface SummaryHeaderProps {
  updatedAt: number;
  isServerSynced: boolean;
  isDesktopSynced: boolean;
  isReloadingServer: boolean;
  isSavingServer: boolean;
  isDesktopAvailable: boolean;
  isLoadingDesktop: boolean;
  isSavingDesktop: boolean;
  onReset: () => void;
  onReloadServer: () => void;
  onSaveServer: () => void;
  onLoadDesktop: () => void;
  onSaveDesktop: () => void;
}

const SummaryHeader: React.FC<SummaryHeaderProps> = ({
  updatedAt,
  isServerSynced,
  isDesktopSynced,
  isReloadingServer,
  isSavingServer,
  isDesktopAvailable,
  isLoadingDesktop,
  isSavingDesktop,
  onReset,
  onReloadServer,
  onSaveServer,
  onLoadDesktop,
  onSaveDesktop,
}) => {
  const statusParts = [
    `Last updated ${formatTimestamp(updatedAt)}`,
    `Server sync: ${isServerSynced ? 'in sync' : 'pending'}`,
  ];
  if (isDesktopAvailable) {
    statusParts.push(`Desktop sync: ${isDesktopSynced ? 'in sync' : 'pending'}`);
  }

  return (
    <div className="rounded-xl border border-border/40 bg-background/75 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-0.5">
          <h2 className="typography-ui-header text-base font-semibold text-foreground">
            Prompt enhancer configuration
          </h2>
          <p className="typography-meta text-muted-foreground/80">{statusParts.join(' · ')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onReset} className="h-7 px-2.5 text-xs">
            <ArrowClockwise className="size-4" weight="regular" />
            Reset
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 px-2.5 text-xs"
            onClick={onReloadServer}
            disabled={isReloadingServer}
          >
            <DownloadSimple className="size-4" weight="regular" />
            Reload
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-7 px-2.5 text-xs"
            onClick={onSaveServer}
            disabled={isSavingServer}
          >
            <FloppyDisk className="size-4" weight="regular" />
            Save
          </Button>
          {isDesktopAvailable && (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-2.5 text-xs"
                onClick={onLoadDesktop}
                disabled={isLoadingDesktop}
              >
                <DownloadSimple className="size-4" weight="regular" />
                Load desktop
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-2.5 text-xs"
                onClick={onSaveDesktop}
                disabled={isSavingDesktop}
              >
                <FloppyDisk className="size-4" weight="regular" />
                Save desktop
              </Button>
            </>
          )}
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
    <div className="space-y-6">
      <section className="space-y-4 rounded-xl border border-border/40 bg-background/75 p-4">
        <header className="flex items-start justify-between gap-2">
          <div>
            <h2 className="typography-ui-header text-base font-semibold text-foreground">{group.label}</h2>
            <p className="typography-meta text-muted-foreground">
              Configure how this group shapes refined prompt instructions.
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

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <div className="flex items-center gap-1">
              <label className="typography-ui-label font-semibold text-foreground">Group label</label>
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
            <Input value={label} onChange={(event) => setLabel(event.target.value)} onBlur={handleMetadataCommit} />
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-1">
              <label className="typography-ui-label font-semibold text-foreground">Summary heading</label>
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
            <Input value={summaryHeading} onChange={(event) => setSummaryHeading(event.target.value)} onBlur={handleMetadataCommit} />
          </div>
          <div className="md:col-span-2 space-y-1">
            <div className="flex items-center gap-1">
              <label className="typography-ui-label font-semibold text-foreground">Helper text</label>
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
            />
          </div>
        </div>

        <div className="space-y-3 rounded-xl border border-border/40 bg-background/70 p-3">
          <div className="flex items-center gap-1">
            <h3 className="typography-ui-label text-sm font-semibold text-foreground">Selection mode</h3>
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
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant={group.multiSelect ? 'outline' : 'default'}
              className="h-7 px-3 text-xs"
              onClick={() => !group.multiSelect && setGroupMultiSelect(group.id, false)}
            >
              Single-choice
            </Button>
            <Button
              type="button"
              size="sm"
              variant={group.multiSelect ? 'default' : 'outline'}
              className="h-7 px-3 text-xs"
              onClick={() => group.multiSelect || setGroupMultiSelect(group.id, true)}
            >
              Multi-choice
            </Button>
          </div>
        </div>
      </section>

      {!group.multiSelect && group.options.length > 0 && (
        <section className="space-y-3 rounded-xl border border-border/40 bg-background/75 p-4">
          <div className="flex items-center gap-1">
            <h3 className="typography-ui-label text-sm font-semibold text-foreground">Default option</h3>
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
          <div className="flex flex-wrap gap-1.5">
            {group.options.map((option) => {
              const isCurrentDefault = option.id === defaultOptionId;
              return (
                <Button
                  key={option.id}
                  type="button"
                  size="sm"
                  variant={isCurrentDefault ? 'default' : 'outline'}
                  className="h-6 rounded-md px-2 text-xs"
                  onClick={() => setDefaultOption(group.id, option.id)}
                >
                  {isCurrentDefault && <CheckCircle className="mr-2 size-4" weight="regular" />}
                  {option.label}
                </Button>
              );
            })}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <div className="flex items-center gap-1">
          <h3 className="typography-ui-label text-sm font-semibold text-foreground">Options</h3>
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

      <section className="space-y-3 rounded-xl border border-dashed border-border/50 bg-background/65 p-4">
        <div className="flex items-center gap-1">
          <h3 className="typography-ui-label text-sm font-semibold text-foreground">Add option</h3>
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
        <div className="grid gap-3 md:grid-cols-2">
          <Input value={newOptionLabel} onChange={(event) => setNewOptionLabel(event.target.value)} placeholder="Option label" />
          <Input
            value={newOptionInstruction}
            onChange={(event) => setNewOptionInstruction(event.target.value)}
            placeholder="Instruction override"
          />
        </div>
        <div className="flex justify-end">
          <Button type="button" variant="outline" size="sm" onClick={handleAddOption} className="h-7 px-3 text-xs">
            <Plus className="mr-1 size-4" weight="regular" />
            Add option
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
      instruction: trimmedInstruction,
    });
  }, [description, group.id, instruction, label, option.id, option.instruction, option.label, option.summaryLabel, summaryLabel, updateOption]);

  const handleRemove = React.useCallback(() => {
    if (group.options.length <= 1) {
      toast.error('Each group must retain at least one option');
      return;
    }
    removeOption(group.id, option.id);
  }, [group.id, group.options.length, option.id, removeOption]);

  const isDefault = !group.multiSelect && option.id === defaultOptionId;

  return (
    <div className="space-y-3 rounded-xl border border-border/40 bg-background/75 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="typography-ui-label text-sm font-semibold text-foreground">{label}</span>
            {isDefault && (
              <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary">Default</span>
            )}
          </div>
          <p className="typography-meta text-muted-foreground">{summaryLabel}</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="icon" className="h-7 w-7">
              <DotsThreeOutlineVertical className="size-5" />
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
              Duplicate option
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={handleRemove} className="text-destructive">
              <Trash className="mr-2 size-4" weight="regular" />
              Remove option
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <label className="typography-ui-label font-semibold text-foreground">Label</label>
          <Input value={label} onChange={(event) => setLabel(event.target.value)} onBlur={commitChanges} />
        </div>
        <div className="space-y-1">
          <label className="typography-ui-label font-semibold text-foreground">Summary label</label>
          <Input value={summaryLabel} onChange={(event) => setSummaryLabel(event.target.value)} onBlur={commitChanges} />
        </div>
      </div>
      <div className="space-y-1">
        <label className="typography-ui-label font-semibold text-foreground">Description</label>
        <Textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          onBlur={commitChanges}
          rows={2}
          placeholder="Explain when to use this option"
        />
      </div>
      <div className="space-y-1">
        <label className="typography-ui-label font-semibold text-foreground">Instruction</label>
        <Textarea
          value={instruction}
          onChange={(event) => setInstruction(event.target.value)}
          onBlur={commitChanges}
          rows={3}
          placeholder="Instruction appended to the refined prompt when this option is selected"
        />
      </div>
    </div>
  );
};
