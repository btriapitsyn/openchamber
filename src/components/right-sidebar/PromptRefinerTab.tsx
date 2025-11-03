import React from 'react';
import { toast } from 'sonner';
import { CircleNotch, CopySimple, Plus, X } from '@phosphor-icons/react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { Toggle } from '@/components/ui/toggle';
import { cn } from '@/lib/utils';
import { generatePromptEnhancement } from '@/lib/promptApi';
import { usePromptEnhancerConfig } from '@/stores/usePromptEnhancerConfig';
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

  const [rawPrompt, setRawPrompt] = React.useState('');
  const [singleSelections, setSingleSelections] = React.useState<SingleSelections>(() =>
    buildDefaultSingles(config, singleGroupIds),
  );
  const [multiSelections, setMultiSelections] = React.useState<MultiSelections>(() =>
    buildDefaultMultiSelections(multiGroupIds),
  );
  const [additionalContext, setAdditionalContext] = React.useState('');
  const [includeDiffDigest, setIncludeDiffDigest] = React.useState(false);
  const [diffDigest, setDiffDigest] = React.useState('');
  const [constraintInput, setConstraintInput] = React.useState('');
  const [additionalConstraints, setAdditionalConstraints] = React.useState<string[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [enhancedPrompt, setEnhancedPrompt] = React.useState('');
  const [rationale, setRationale] = React.useState<string[]>([]);

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
    setIncludeDiffDigest(false);
    setDiffDigest('');
    setAdditionalConstraints([]);
    setConstraintInput('');
    setEnhancedPrompt('');
    setRationale([]);
  }, [config, singleGroupIds, multiGroupIds]);

  const handleCopy = React.useCallback(async () => {
    if (!enhancedPrompt.trim()) {
      return;
    }
    try {
      await navigator.clipboard.writeText(enhancedPrompt);
      toast.success('Refined prompt copied');
    } catch (error) {
      toast.error('Unable to copy prompt to clipboard');
    }
  }, [enhancedPrompt]);

  const handleEnhance = React.useCallback(async () => {
    if (!rawPrompt.trim()) {
      toast.error('Provide a base prompt to refine');
      return;
    }

    setIsLoading(true);
    try {
      const payloadConfig = cloneConfigForRequest(config);
      const singlePayload: Record<string, string> = {};
      for (const groupId of singleGroupIds) {
        singlePayload[groupId] = singleSelections[groupId] ?? '';
      }
      const multiPayload: Record<string, string[]> = {};
      for (const groupId of multiGroupIds) {
        multiPayload[groupId] = Array.from(multiSelections[groupId] ?? new Set());
      }
      const response = await generatePromptEnhancement({
        prompt: rawPrompt.trim(),
        selections: {
          single: singlePayload,
          multi: multiPayload,
        },
        configuration: payloadConfig,
        additionalConstraints,
        contextSummary: additionalContext.trim(),
        diffDigest: includeDiffDigest ? diffDigest.trim() : '',
      });
      setEnhancedPrompt(response.prompt);
      setRationale(response.rationale ?? []);
      toast.success('Refined prompt ready');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to enhance prompt';
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }, [
    additionalConstraints,
    additionalContext,
    config,
    diffDigest,
    includeDiffDigest,
    multiGroupIds,
    multiSelections,
    rawPrompt,
    singleGroupIds,
    singleSelections,
  ]);

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
          <div className="space-y-4 px-3 py-4">
            <section className="space-y-2 rounded-2xl border border-border/60 bg-background/80 p-3">
              <header className="space-y-1">
                <h2 className="typography-ui-header font-semibold text-foreground">Base prompt</h2>
                <p className="typography-meta text-muted-foreground">
                  Keep it raw—refiner will inject AGENTS.md and README.md context automatically.
                </p>
              </header>
              <Textarea
                value={rawPrompt}
                onChange={(event) => setRawPrompt(event.target.value)}
                rows={5}
                placeholder="Describe the task you want the coding agent to perform"
                className="resize-none rounded-xl bg-background"
              />
            </section>

            {singleGroupIds.length > 0 && (
              <section className="space-y-3 rounded-2xl border border-border/60 bg-background/70 p-3">
                <div className="grid gap-3 md:grid-cols-2">
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
                <section
                  key={groupId}
                  className="space-y-3 rounded-2xl border border-border/60 bg-background/70 p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <h3 className="typography-ui-label font-semibold text-foreground">{group.label}</h3>
                      {group.helperText && (
                        <p className="typography-meta text-muted-foreground">{group.helperText}</p>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="px-2"
                      onClick={() => handleClearMulti(groupId)}
                    >
                      Clear
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {group.options.map((option) => (
                      <Toggle
                        key={option.id}
                        variant="outline"
                        size="sm"
                        pressed={selectedOptions.has(option.id)}
                        onPressedChange={() => handleToggleMulti(groupId, option.id)}
                        className="px-2.5"
                        aria-label={option.description ?? option.label}
                      >
                        {option.label}
                      </Toggle>
                    ))}
                  </div>
                  <p className="typography-meta text-muted-foreground/80">{summary}</p>
                </section>
              );
            })}

            <section className="space-y-3 rounded-2xl border border-border/60 bg-background/80 p-3">
              <div className="space-y-1">
                <h3 className="typography-ui-label font-semibold text-foreground">Additional context</h3>
                <p className="typography-meta text-muted-foreground">
                  Share nuance, acceptance criteria, or references the agent should factor in.
                </p>
              </div>
              <Textarea
                value={additionalContext}
                onChange={(event) => setAdditionalContext(event.target.value)}
                rows={3}
                placeholder="Example: Feature flags, partner teams, rollout caveats"
                className="rounded-xl bg-background"
              />

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Input
                    value={constraintInput}
                    onChange={(event) => setConstraintInput(event.target.value)}
                    placeholder="Add mandatory constraint (one per entry)"
                    className="h-9 flex-1"
                  />
                  <Button type="button" variant="outline" size="sm" onClick={handleAddConstraint}>
                    <Plus className="size-4" weight="regular" />
                    Add
                  </Button>
                </div>
                {additionalConstraints.length > 0 && (
                  <ul className="space-y-1">
                    {additionalConstraints.map((constraint, index) => (
                      <li
                        key={constraint}
                        className="flex items-start justify-between gap-2 rounded-lg border border-border/40 bg-background px-2 py-1.5"
                      >
                        <span className="flex-1 typography-meta text-foreground">{constraint}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-6"
                          onClick={() => handleRemoveConstraint(index)}
                          aria-label={`Remove constraint ${constraint}`}
                        >
                          <X className="size-4" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h3 className="typography-ui-label font-semibold text-foreground">Diff digest</h3>
                    <p className="typography-meta text-muted-foreground">
                      Attach a short summary of changes if you already have one.
                    </p>
                  </div>
                  <Toggle
                    variant="outline"
                    size="sm"
                    pressed={includeDiffDigest}
                    onPressedChange={setIncludeDiffDigest}
                  >
                    {includeDiffDigest ? 'Included' : 'Include'}
                  </Toggle>
                </div>
                {includeDiffDigest && (
                  <Textarea
                    value={diffDigest}
                    onChange={(event) => setDiffDigest(event.target.value)}
                    rows={3}
                    placeholder="Example: High-level summary of touched files or behavioural changes"
                    className="rounded-xl bg-background"
                  />
                )}
              </div>
            </section>

            {enhancedPrompt && (
              <section className="space-y-2 rounded-2xl border border-primary/40 bg-primary/5 p-3">
                <header className="flex items-center justify-between gap-2">
                  <div>
                    <h3 className="typography-ui-label font-semibold text-foreground">Refined prompt</h3>
                    <p className="typography-meta text-muted-foreground">
                      Copy-ready instructions for the development agent.
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" className="px-2" onClick={handleCopy}>
                    <CopySimple className="size-4" />
                    Copy
                  </Button>
                </header>
                <Textarea value={enhancedPrompt} readOnly rows={10} className="resize-none rounded-xl bg-background/90" />
                {rationale.length > 0 && (
                  <div className="space-y-1 rounded-xl border border-border/60 bg-background/80 p-2">
                    <p className="typography-micro text-muted-foreground uppercase tracking-wide">Rationale</p>
                    <ul className="space-y-1">
                      {rationale.map((entry, index) => (
                        <li key={index} className="typography-meta text-foreground">
                          {entry}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>
            )}
          </div>
        </ScrollArea>
      </div>

      <footer className="flex items-center gap-2 border-t border-border/60 bg-background/80 px-3 py-2">
        <Button type="button" variant="ghost" onClick={handleReset} disabled={isLoading}>
          Reset
        </Button>
        <div className="flex-1" />
        <Button
          type="button"
          variant="outline"
          onClick={handleCopy}
          disabled={!enhancedPrompt.trim() || isLoading}
          className="hidden sm:inline-flex"
        >
          <CopySimple className="size-4" />
          Copy prompt
        </Button>
        <Button type="button" onClick={handleEnhance} disabled={isLoading}>
          {isLoading ? (
            <>
              <CircleNotch className="size-4 animate-spin" />
              Refining…
            </>
          ) : (
            'Enhance prompt'
          )}
        </Button>
      </footer>
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
  return (
    <div className="space-y-2 rounded-xl border border-border/40 bg-background/80 p-2.5">
      <div>
        <h3 className="typography-ui-label font-semibold text-foreground">{group.label}</h3>
        <p className="typography-meta text-muted-foreground min-h-[32px]">
          {selectedDescription || group.helperText || 'Select the best fit.'}
        </p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {group.options.map((option) => (
          <Toggle
            key={option.id}
            variant="outline"
            size="sm"
            pressed={selectedId === option.id}
            onPressedChange={() => onSelect(option.id)}
            className={cn('px-2.5', selectedId === option.id && 'data-[state=on]:bg-primary/15')}
            aria-label={option.description ?? option.label}
          >
            {option.label}
          </Toggle>
        ))}
      </div>
    </div>
  );
};
