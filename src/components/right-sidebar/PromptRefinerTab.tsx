import React from 'react';
import { toast } from 'sonner';
import { CircleNotch, CopySimple, Plus, X, Check } from '@phosphor-icons/react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { Toggle } from '@/components/ui/toggle';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  generatePromptEnhancement,
  previewPromptEnhancement,
  type PromptEnhancementPreviewResponse,
  type PromptEnhancementRequest,
} from '@/lib/promptApi';
import { PromptPreviewContent } from '@/components/sections/prompt-enhancer/PromptPreviewContent';
import { usePromptEnhancerConfig } from '@/stores/usePromptEnhancerConfig';
import { useDirectoryStore } from '@/stores/useDirectoryStore';
import type { PromptEnhancerConfig, PromptEnhancerGroup, PromptEnhancerOption } from '@/types/promptEnhancer';

type SingleSelections = Record<string, string>;
type MultiSelections = Record<string, Set<string>>;

const cloneConfigForRequest = (config: PromptEnhancerConfig): PromptEnhancerConfig => {
  if (typeof structuredClone === 'function') {
    return structuredClone(config);
  }
  return JSON.parse(JSON.stringify(config));
};

const buildDefaultSingles = (config: PromptEnhancerConfig, groupIds: string[]): SingleSelections => {
  const next: SingleSelections = {};
  for (const groupId of groupIds) {
    const group = config.groups[groupId];
    if (!group || group.multiSelect || group.options.length === 0) {
      next[groupId] = '';
      continue;
    }
    next[groupId] = group.defaultOptionId ?? group.options[0].id;
  }
  return next;
};

const syncSinglesWithConfig = (
  previous: SingleSelections,
  config: PromptEnhancerConfig,
  groupIds: string[],
): SingleSelections => {
  const defaults = buildDefaultSingles(config, groupIds);
  const next = { ...defaults };
  for (const groupId of groupIds) {
    const group = config.groups[groupId];
    if (!group || group.multiSelect) continue;
    const candidate = previous[groupId];
    if (candidate && group.options.some((option) => option.id === candidate)) {
      next[groupId] = candidate;
    }
  }
  return next;
};

const buildDefaultMultiSelections = (groupIds: string[]): MultiSelections => {
  const map: MultiSelections = {};
  for (const groupId of groupIds) {
    map[groupId] = new Set();
  }
  return map;
};

const syncMultiSelections = (
  previous: MultiSelections,
  config: PromptEnhancerConfig,
  groupIds: string[],
): MultiSelections => {
  const next: MultiSelections = {};
  for (const groupId of groupIds) {
    const group = config.groups[groupId];
    if (!group || !group.multiSelect) {
      continue;
    }
    const validIds = new Set(group.options.map((option) => option.id));
    const previousSet = previous[groupId] ?? new Set();
    const filtered = new Set<string>();
    for (const id of previousSet) {
      if (validIds.has(id)) {
        filtered.add(id);
      }
    }
    next[groupId] = filtered;
  }
  return next;
};

export const PromptRefinerTab: React.FC = () => {
  const config = usePromptEnhancerConfig((state) => state.config);

  const availableGroupIds = React.useMemo(
    () => config.groupOrder.filter((groupId) => Boolean(config.groups[groupId])),
    [config],
  );
  const singleGroupIds = React.useMemo(
    () => availableGroupIds.filter((groupId) => !config.groups[groupId]?.multiSelect),
    [availableGroupIds, config.groups],
  );
  const multiGroupIds = React.useMemo(
    () => availableGroupIds.filter((groupId) => config.groups[groupId]?.multiSelect),
    [availableGroupIds, config.groups],
  );
  const currentDirectory = useDirectoryStore((state) => state.currentDirectory);

  const [rawPrompt, setRawPrompt] = React.useState('');
  const [singleSelections, setSingleSelections] = React.useState<SingleSelections>(() =>
    buildDefaultSingles(config, singleGroupIds),
  );
  const [multiSelections, setMultiSelections] = React.useState<MultiSelections>(() =>
    buildDefaultMultiSelections(multiGroupIds),
  );
  const [additionalContext, setAdditionalContext] = React.useState('');
  const [includeRepositoryDiff, setIncludeRepositoryDiff] = React.useState(false);
  const [constraintInput, setConstraintInput] = React.useState('');
  const [additionalConstraints, setAdditionalConstraints] = React.useState<string[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [enhancedPrompt, setEnhancedPrompt] = React.useState('');
  const [rationale, setRationale] = React.useState<string[]>([]);
  const [isPreviewOpen, setIsPreviewOpen] = React.useState(false);
  const [isPreviewLoading, setIsPreviewLoading] = React.useState(false);
  const [previewData, setPreviewData] = React.useState<PromptEnhancementPreviewResponse | null>(null);
  const [includeProjectContext, setIncludeProjectContext] = React.useState(true);
  const [isCopied, setIsCopied] = React.useState(false);
  const timeoutRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    setSingleSelections((previous) => syncSinglesWithConfig(previous, config, singleGroupIds));
    setMultiSelections((previous) => {
      const synced = syncMultiSelections(previous, config, multiGroupIds);
      const defaults = buildDefaultMultiSelections(multiGroupIds);
      return { ...defaults, ...synced };
    });
  }, [config, singleGroupIds, multiGroupIds]);

  const handleSingleSelect = React.useCallback((groupId: string, optionId: string) => {
    setSingleSelections((previous) => {
      if (previous[groupId] === optionId) {
        return previous;
      }
      return { ...previous, [groupId]: optionId };
    });
  }, []);

  const handleToggleMulti = React.useCallback((groupId: string, optionId: string) => {
    setMultiSelections((previous) => {
      const current = previous[groupId] ?? new Set<string>();
      const next = new Set(current);
      if (next.has(optionId)) {
        next.delete(optionId);
      } else {
        next.add(optionId);
      }
      return {
        ...previous,
        [groupId]: next,
      };
    });
  }, []);

  const handleClearMulti = React.useCallback((groupId: string) => {
    setMultiSelections((previous) => ({
      ...previous,
      [groupId]: new Set(),
    }));
  }, []);

  const constraintLimitReached = additionalConstraints.length >= 12;

  const handleAddConstraint = React.useCallback(() => {
    const normalized = constraintInput.trim();
    if (!normalized) {
      toast.warning('Add a non-empty constraint');
      return;
    }
    if (constraintLimitReached) {
      toast.warning('Limit 12 custom constraints');
      return;
    }
    const duplicate = additionalConstraints.some((entry) => entry.toLowerCase() === normalized.toLowerCase());
    if (duplicate) {
      toast.info('Constraint already added');
      return;
    }
    setAdditionalConstraints((previous) => [...previous, normalized]);
    setConstraintInput('');
  }, [additionalConstraints, constraintInput, constraintLimitReached]);

  const handleRemoveConstraint = React.useCallback((index: number) => {
    setAdditionalConstraints((previous) => previous.filter((_, idx) => idx !== index));
  }, []);

  const handleReset = React.useCallback(() => {
    setRawPrompt('');
    setSingleSelections(buildDefaultSingles(config, singleGroupIds));
    setMultiSelections(buildDefaultMultiSelections(multiGroupIds));
    setAdditionalContext('');
    setIncludeRepositoryDiff(false);
    setAdditionalConstraints([]);
    setConstraintInput('');
    setEnhancedPrompt('');
    setRationale([]);
    setIncludeProjectContext(true);
  }, [config, singleGroupIds, multiGroupIds]);

  const handleCopy = React.useCallback(async () => {
    if (!enhancedPrompt.trim()) {
      return;
    }
    try {
      await navigator.clipboard.writeText(enhancedPrompt);
      setIsCopied(true);

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = window.setTimeout(() => {
        setIsCopied(false);
        timeoutRef.current = null;
      }, 2000);
    } catch {
      toast.error('Unable to copy prompt to clipboard');
    }
  }, [enhancedPrompt]);

  React.useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const buildRequestPayload = React.useCallback((): PromptEnhancementRequest => {
    const payloadConfig = cloneConfigForRequest(config);
    const singlePayload: Record<string, string> = {};
    for (const groupId of singleGroupIds) {
      singlePayload[groupId] = singleSelections[groupId] ?? '';
    }
    const multiPayload: Record<string, string[]> = {};
    for (const groupId of multiGroupIds) {
      multiPayload[groupId] = Array.from(multiSelections[groupId] ?? new Set());
    }

    return {
      prompt: rawPrompt.trim(),
      selections: {
        single: singlePayload,
        multi: multiPayload,
      },
      configuration: payloadConfig,
      additionalConstraints,
      contextSummary: additionalContext.trim(),
      includeProjectContext,
      includeRepositoryDiff,
      workspaceDirectory: currentDirectory,
    };
  }, [
    additionalConstraints,
    additionalContext,
    config,
    multiGroupIds,
    multiSelections,
    rawPrompt,
    singleGroupIds,
    singleSelections,
    includeProjectContext,
    includeRepositoryDiff,
    currentDirectory,
  ]);

  const handleEnhance = React.useCallback(async () => {
    if (!rawPrompt.trim()) {
      toast.error('Provide a base prompt to refine');
      return;
    }

    setIsLoading(true);
    try {
      const payload = buildRequestPayload();
      const response = await generatePromptEnhancement(payload);
      setEnhancedPrompt(response.prompt);
      setRationale(response.rationale ?? []);
      toast.success('Refined prompt ready');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to enhance prompt';
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }, [buildRequestPayload, rawPrompt]);

  const handlePreview = React.useCallback(async () => {
    if (!rawPrompt.trim()) {
      toast.error('Provide a base prompt to preview');
      return;
    }
    setIsPreviewLoading(true);
    try {
      const payload = buildRequestPayload();
      const data = await previewPromptEnhancement(payload);
      setPreviewData(data);
      setIsPreviewOpen(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to generate preview';
      toast.error(message);
    } finally {
      setIsPreviewLoading(false);
    }
  }, [buildRequestPayload, rawPrompt]);

  const handlePreviewOpenChange = React.useCallback((nextOpen: boolean) => {
    setIsPreviewOpen(nextOpen);
    if (!nextOpen) {
      setPreviewData(null);
      setIsPreviewLoading(false);
    }
  }, []);

  const selectedOptionDetails = React.useMemo(() => {
    const map: Record<string, PromptEnhancerOption | undefined> = {};
    for (const groupId of singleGroupIds) {
      const group = config.groups[groupId];
      const option =
        group?.options.find((entry) => entry.id === singleSelections[groupId]) ?? group?.options[0];
      map[groupId] = option;
    }
    return map;
  }, [config.groups, singleGroupIds, singleSelections]);

  const multiSelectionSummaries = React.useMemo(() => {
    const summaries: Record<string, string> = {};
    for (const groupId of multiGroupIds) {
      const group = config.groups[groupId];
      if (!group) continue;
      const selectedIds = multiSelections[groupId] ?? new Set();
      const options = group.options.filter((option) => selectedIds.has(option.id));
      summaries[groupId] = options.length
        ? options
            .map((option) => option.summaryLabel ?? option.label)
            .filter(Boolean)
            .join(' · ')
        : 'No selections yet—agent will infer.';
    }
    return summaries;
  }, [config.groups, multiGroupIds, multiSelections]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-hidden">
        <ScrollArea className="h-full">
          <div className="space-y-3 px-3 py-3">
            <section className="space-y-1.5">
              <h2 className="typography-ui-label text-xs font-semibold" style={{ color: 'var(--primary-base)' }}>
                Base prompt
              </h2>
              <Textarea
                value={rawPrompt}
                onChange={(event) => setRawPrompt(event.target.value)}
                rows={4}
                placeholder="Describe the task you want the coding agent to perform"
                className="resize-none rounded-lg border-border/50 bg-background/50 text-sm"
              />
              <p className="typography-micro text-muted-foreground/70">
                Keep it raw—toggle context below when needed
              </p>
            </section>

            {singleGroupIds.length > 0 && (
              <section className="space-y-2 border-t border-border/30 pt-3">
                <div className="grid gap-2 md:grid-cols-2">
                  {singleGroupIds.map((groupId) => {
                    const group = config.groups[groupId];
                    const selectedId = singleSelections[groupId];
                    const selectedOption = selectedOptionDetails[groupId];
                    if (!group || group.multiSelect) {
                      return null;
                    }
                    return (
                      <OptionGroup
                        key={groupId}
                        group={group}
                        selectedId={selectedId}
                        onSelect={(optionId) => handleSingleSelect(groupId, optionId)}
                        selectedDescription={selectedOption?.description}
                      />
                    );
                  })}
                </div>
              </section>
            )}

            {multiGroupIds.map((groupId) => {
              const group = config.groups[groupId];
              if (!group || !group.multiSelect) {
                return null;
              }
              const selectedOptions = multiSelections[groupId] ?? new Set<string>();
              const summary = multiSelectionSummaries[groupId];
              return (
                <section key={groupId} className="space-y-2 border-t border-border/30 pt-3">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="typography-ui-label text-xs font-semibold" style={{ color: 'var(--primary-base)' }}>
                      {group.label}
                    </h3>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 px-1.5 text-xs"
                      onClick={() => handleClearMulti(groupId)}
                    >
                      Clear
                    </Button>
                  </div>
                  {group.helperText && (
                    <p className="typography-micro text-muted-foreground/70">{group.helperText}</p>
                  )}
                  <div className="flex flex-wrap gap-1">
                    {group.options.map((option) => {
                      const isSelected = selectedOptions.has(option.id);
                      return (
                        <Toggle
                          key={option.id}
                          variant="outline"
                          size="sm"
                          pressed={isSelected}
                          onPressedChange={() => handleToggleMulti(groupId, option.id)}
                          className="h-6 px-2 text-xs"
                          style={
                            isSelected
                              ? {
                                  borderColor: 'var(--primary-base)',
                                  backgroundColor: 'color-mix(in srgb, var(--primary-base) 15%, transparent)',
                                  color: 'var(--primary-base)',
                                }
                              : undefined
                          }
                          aria-label={option.description ?? option.label}
                        >
                          {option.label}
                        </Toggle>
                      );
                    })}
                  </div>
                  <p className="typography-micro text-muted-foreground/60">{summary}</p>
                </section>
              );
            })}

            <section className="space-y-2 border-t border-border/30 pt-3">
              <h3 className="typography-ui-label text-xs font-semibold" style={{ color: 'var(--primary-base)' }}>
                Automatic context
              </h3>
              <div className="space-y-1.5">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 accent-primary"
                    checked={includeProjectContext}
                    onChange={(event) => setIncludeProjectContext(event.target.checked)}
                  />
                  <span className="typography-ui-label text-xs text-foreground">
                    Project context (AGENTS.md &amp; README.md)
                  </span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 accent-primary"
                    checked={includeRepositoryDiff}
                    onChange={(event) => setIncludeRepositoryDiff(event.target.checked)}
                  />
                  <span className="typography-ui-label text-xs text-foreground">
                    Repository diff (staged &amp; unstaged)
                  </span>
                </label>
              </div>
            </section>

            <section className="space-y-2 border-t border-border/30 pt-3">
              <h3 className="typography-ui-label text-xs font-semibold" style={{ color: 'var(--primary-base)' }}>
                Additional context
              </h3>
              <Textarea
                value={additionalContext}
                onChange={(event) => setAdditionalContext(event.target.value)}
                rows={2}
                placeholder="Feature flags, partner teams, rollout caveats..."
                className="resize-none rounded-lg border-border/50 bg-background/50 text-sm"
              />

              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <Input
                    value={constraintInput}
                    onChange={(event) => setConstraintInput(event.target.value)}
                    placeholder="Mandatory constraint"
                    className="h-7 flex-1 text-xs"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddConstraint}
                    className="h-7 px-2"
                  >
                    <Plus className="size-3.5" weight="regular" />
                  </Button>
                </div>
                {additionalConstraints.length > 0 && (
                  <ul className="space-y-0.5">
                    {additionalConstraints.map((constraint, index) => (
                      <li
                        key={constraint}
                        className="flex items-center justify-between gap-2 rounded border border-border/30 bg-background/30 px-2 py-1"
                      >
                        <span className="flex-1 typography-micro text-foreground">{constraint}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-5"
                          onClick={() => handleRemoveConstraint(index)}
                          aria-label={`Remove constraint ${constraint}`}
                        >
                          <X className="size-3" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>

            {enhancedPrompt && (
              <section className="space-y-2 border-t border-primary/30 pt-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="typography-ui-label text-xs font-semibold text-primary">
                    Refined prompt
                  </h3>
                  <Button variant="ghost" size="sm" className="h-6 px-1.5 text-xs" onClick={handleCopy}>
                    {isCopied ? (
                      <>
                        <Check className="size-3.5" style={{ color: 'var(--status-success)' }} weight="bold" />
                        Copied
                      </>
                    ) : (
                      <>
                        <CopySimple className="size-3.5" />
                        Copy
                      </>
                    )}
                  </Button>
                </div>
                <div className="space-y-1.5 rounded-lg bg-primary/5 p-1.5">
                  <Textarea
                    value={enhancedPrompt}
                    readOnly
                    rows={8}
                    className="resize-none rounded border-0 bg-background/80 text-sm shadow-none"
                  />
                  {rationale.length > 0 && (
                    <div className="space-y-0.5 pt-1">
                      <p className="typography-micro text-muted-foreground/70 font-medium">
                        Rationale
                      </p>
                      <ul className="space-y-0.5">
                        {rationale.map((entry, index) => (
                          <li key={index} className="typography-micro text-foreground/70">
                            • {entry}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </section>
            )}
          </div>
        </ScrollArea>
      </div>

      <footer className="flex items-center gap-1.5 border-t border-border/40 bg-background/60 px-3 py-1.5">
        <Button type="button" variant="ghost" size="sm" onClick={handleReset} disabled={isLoading} className="h-7 px-2 text-xs">
          Reset
        </Button>
        <div className="flex-1" />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleCopy}
          disabled={!enhancedPrompt.trim() || isLoading}
          className="hidden sm:inline-flex h-7 px-2 text-xs"
        >
          {isCopied ? (
            <>
              <Check className="size-3.5" style={{ color: 'var(--status-success)' }} weight="bold" />
              Copied
            </>
          ) : (
            <>
              <CopySimple className="size-3.5" />
              Copy
            </>
          )}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handlePreview}
          disabled={isLoading || isPreviewLoading || !rawPrompt.trim()}
          className="h-7 px-2 text-xs"
        >
          {isPreviewLoading ? 'Loading…' : 'Preview'}
        </Button>
        <Button type="button" size="sm" onClick={handleEnhance} disabled={isLoading} className="h-7 px-2.5 text-xs">
          {isLoading ? (
            <>
              <CircleNotch className="size-3.5 animate-spin" />
              Refining…
            </>
          ) : (
            'Enhance'
          )}
        </Button>
      </footer>
      <Dialog open={isPreviewOpen} onOpenChange={handlePreviewOpenChange}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle>Prompt preview</DialogTitle>
            <DialogDescription>
              Review the exact payload sent to the prompt refinement model.
            </DialogDescription>
          </DialogHeader>
          <PromptPreviewContent
            data={previewData}
            isLoading={isPreviewLoading}
            forceProjectContext={includeProjectContext}
            forceRepositoryDiff={includeRepositoryDiff}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
};

interface OptionGroupProps {
  group: PromptEnhancerGroup;
  selectedId: string;
  onSelect: (optionId: string) => void;
  selectedDescription?: string;
}

const OptionGroup: React.FC<OptionGroupProps> = ({ group, selectedId, onSelect, selectedDescription }) => {
  const selectedOption = group.options.find((opt) => opt.id === selectedId);
  const displayLabel = selectedOption?.label ?? group.options[0]?.label ?? 'Select...';

  return (
    <div className="space-y-1.5">
      <h3 className="typography-ui-label text-xs font-semibold" style={{ color: 'var(--primary-base)' }}>
        {group.label}
      </h3>
      <Select value={selectedId} onValueChange={onSelect}>
        <SelectTrigger className="w-fit h-6 rounded-lg text-xs">
          <SelectValue placeholder={displayLabel} />
        </SelectTrigger>
        <SelectContent>
          {group.options.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {selectedDescription && (
        <p className="typography-micro text-muted-foreground/70 leading-tight">
          {selectedDescription}
        </p>
      )}
    </div>
  );
};
