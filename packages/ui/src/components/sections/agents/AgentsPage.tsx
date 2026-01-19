import React from 'react';
import { Button } from '@/components/ui/button';
import { ButtonSmall } from '@/components/ui/button-small';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui';
import { useAgentsStore, type AgentConfig, type AgentScope } from '@/stores/useAgentsStore';
import { useConfigStore } from '@/stores/useConfigStore';
import { usePermissionStore } from '@/stores/permissionStore';
import { useDirectoryStore } from '@/stores/useDirectoryStore';
import { opencodeClient } from '@/lib/opencode/client';
import { RiAddLine, RiAiAgentFill, RiAiAgentLine, RiInformationLine, RiRobot2Line, RiRobotLine, RiSaveLine, RiSubtractLine, RiUser3Line, RiFolderLine } from '@remixicon/react';
import { cn } from '@/lib/utils';
import { ModelSelector } from './ModelSelector';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';

type PermissionAction = 'allow' | 'ask' | 'deny';
type DefaultOverride = 'default' | PermissionAction;
type PermissionRule = { permission: string; pattern: string; action: PermissionAction };
type PermissionConfigValue = PermissionAction | Record<string, PermissionAction>;

type ParsedPermissionConfig = {
  entries: Record<string, PermissionConfigValue>;
};

const STANDARD_PERMISSION_KEYS = [
  'read',
  'edit',
  'glob',
  'grep',
  'list',
  'bash',
  'task',
  'skill',
  'lsp',
  'todoread',
  'todowrite',
  'webfetch',
  'websearch',
  'codesearch',
  'external_directory',
  'doom_loop',
] as const;

const isPermissionAction = (value: unknown): value is PermissionAction =>
  value === 'allow' || value === 'ask' || value === 'deny';

const parsePermissionConfigValue = (value: unknown): PermissionConfigValue | undefined => {
  if (isPermissionAction(value)) {
    return value;
  }

  // We only manage wildcard rules in this UI. If a granular object is provided,
  // read its wildcard action and ignore all other patterns.
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const wildcard = (value as Record<string, unknown>)['*'];
    if (isPermissionAction(wildcard)) {
      return wildcard;
    }
  }

  return undefined;
};

const parsePermissionConfig = (value: unknown): ParsedPermissionConfig => {
  if (isPermissionAction(value)) {
    return { entries: { '*': value } };
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { entries: {} };
  }

  const entries: Record<string, PermissionConfigValue> = {};

  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const parsedValue = parsePermissionConfigValue(raw);
    if (parsedValue !== undefined) {
      entries[key] = parsedValue;
    }
  }

  return { entries };
};

const splitDefaultOverrideFromEntries = (entries: Record<string, PermissionConfigValue>): {
  defaultOverride: DefaultOverride;
  overrides: Record<string, PermissionConfigValue>;
} => {
  const overrides: Record<string, PermissionConfigValue> = { ...entries };

  const maybeDefault = overrides['*'];
  if (isPermissionAction(maybeDefault)) {
    delete overrides['*'];
    return { defaultOverride: maybeDefault, overrides };
  }

  return { defaultOverride: 'default', overrides };
};

const getOpenCodeDefaultActionForPermission = (permissionName: string): PermissionAction => {
  if (permissionName === 'doom_loop' || permissionName === 'external_directory') {
    return 'ask';
  }
  return 'allow';
};

const getAgentBaseDefaultActionForPermission = (
  permissionName: string,
  defaultOverride: DefaultOverride,
): PermissionAction => {
  if (defaultOverride === 'default') {
    return getOpenCodeDefaultActionForPermission(permissionName);
  }

  return defaultOverride;
};

const pruneRedundantPermissionOverrides = (
  entries: Record<string, PermissionConfigValue>,
  defaultOverride: DefaultOverride,
): Record<string, PermissionConfigValue> => {
  const pruned: Record<string, PermissionConfigValue> = { ...entries };

  for (const [permissionName, value] of Object.entries(entries)) {
    if (permissionName === '*') {
      continue;
    }

    const baseDefaultAction = getAgentBaseDefaultActionForPermission(permissionName, defaultOverride);
    const opencodeDefault = getOpenCodeDefaultActionForPermission(permissionName);

    // For doom_loop and external_directory (OpenCode default = "ask"),
    // always keep explicit config if it differs from "ask"
    if (isPermissionAction(value) && value !== opencodeDefault) {
      continue;
    }

    if (isPermissionAction(value) && value === baseDefaultAction) {
      delete pruned[permissionName];
      continue;
    }


    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const map = value as Record<string, PermissionAction>;
      const patterns = Object.keys(map);
      const wildcardAction = map['*'];
      // Keep if wildcard differs from OpenCode default
      if (wildcardAction !== undefined && wildcardAction !== opencodeDefault) {
        continue;
      }
      if (patterns.length === 1 && patterns[0] === '*' && wildcardAction === baseDefaultAction) {
        delete pruned[permissionName];
      }
    }
  }

  return pruned;
};

const asPermissionRuleset = (value: unknown): PermissionRule[] | null => {
  if (!Array.isArray(value)) {
    return null;
  }

  const rules: PermissionRule[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const candidate = entry as Partial<PermissionRule>;
    if (typeof candidate.permission !== 'string' || typeof candidate.pattern !== 'string' || typeof candidate.action !== 'string') {
      continue;
    }
    if (candidate.action !== 'allow' && candidate.action !== 'ask' && candidate.action !== 'deny') {
      continue;
    }
    rules.push({ permission: candidate.permission, pattern: candidate.pattern, action: candidate.action });
  }

  return rules;
};

const rulesetToPermissionConfig = (ruleset: unknown): ParsedPermissionConfig => {
  const rules = asPermissionRuleset(ruleset);
  if (!rules || rules.length === 0) {
    return { entries: {} };
  }

  const wildcardByPermission: Record<string, PermissionAction> = {};

  for (const rule of rules) {
    if (!rule.permission || rule.permission === 'invalid') {
      continue;
    }

    // This UI only manages wildcard ("*") rules.
    if (rule.pattern !== '*') {
      continue;
    }

    wildcardByPermission[rule.permission] = rule.action;
  }

  // Get the global default from the ruleset (if any)
  const globalDefault = wildcardByPermission['*'];

  const entries: Record<string, PermissionConfigValue> = {};
  for (const [permissionName, action] of Object.entries(wildcardByPermission)) {
    if (permissionName === '*') {
      entries[permissionName] = action;
      continue;
    }

    // Determine what this permission would be without explicit config
    const opencodeDefault = getOpenCodeDefaultActionForPermission(permissionName);

    if (globalDefault) {
      // If there's a global default, skip permissions that match it
      // (they're redundant - the global default covers them)
      if (action === globalDefault) {
        continue;
      }
    } else {
      // No global default - skip permissions that match OpenCode's built-in default
      // (they're not explicitly configured, just inherited)
      if (action === opencodeDefault) {
        continue;
      }
    }

    entries[permissionName] = action;
  }

  return { entries };
};

export const AgentsPage: React.FC = () => {
  const { selectedAgentName, getAgentByName, createAgent, updateAgent, agents, agentDraft, setAgentDraft } = useAgentsStore();
  useConfigStore();

  const selectedAgent = selectedAgentName ? getAgentByName(selectedAgentName) : null;
  const isNewAgent = Boolean(agentDraft && agentDraft.name === selectedAgentName && !selectedAgent);

  const [draftName, setDraftName] = React.useState('');
  const [draftScope, setDraftScope] = React.useState<AgentScope>('user');
  const [description, setDescription] = React.useState('');
  const [mode, setMode] = React.useState<'primary' | 'subagent' | 'all'>('subagent');
  const [model, setModel] = React.useState('');
  const [temperature, setTemperature] = React.useState<number | undefined>(undefined);
  const [topP, setTopP] = React.useState<number | undefined>(undefined);
  const [prompt, setPrompt] = React.useState('');
  const [defaultOverride, setDefaultOverride] = React.useState<DefaultOverride>('default');
  const [permissionEntries, setPermissionEntries] = React.useState<Record<string, PermissionConfigValue>>({});
  const [pendingOverrideName, setPendingOverrideName] = React.useState('');
  const [isSaving, setIsSaving] = React.useState(false);

  const currentDirectory = useDirectoryStore((state) => state.currentDirectory ?? null);
  const [toolIds, setToolIds] = React.useState<string[]>([]);

  const permissionsBySession = usePermissionStore((state) => state.permissions);

  React.useEffect(() => {
    let cancelled = false;

    const fetchToolIds = async () => {
      const ids = await opencodeClient.listToolIds({ directory: currentDirectory });
      if (cancelled) {
        return;
      }

      // OpenCode permissions are keyed by tool name, but some tools are grouped
      // under a single permission key. E.g. `edit` covers `write`, `patch`, and `multiedit`.
      const editCoveredToolIds = new Set(['write', 'patch', 'multiedit']);

      const normalized = ids
        .map((id) => (typeof id === 'string' ? id.trim() : ''))
        .filter(Boolean)
        .filter((id) => id !== '*')
        .filter((id) => id !== 'invalid')
        .filter((id) => !editCoveredToolIds.has(id));

      setToolIds(Array.from(new Set(normalized)).sort((a, b) => a.localeCompare(b)));
    };

    void fetchToolIds();

    return () => {
      cancelled = true;
    };
  }, [currentDirectory]);

  const knownPermissionNames = React.useMemo(() => {
    const names = new Set<string>();

    for (const agent of agents) {
      const rules = asPermissionRuleset((agent as { permission?: unknown }).permission);
      if (!rules) {
        continue;
      }
      for (const rule of rules) {
        if (rule.permission && rule.permission !== '*' && rule.permission !== 'invalid') {
          names.add(rule.permission);
        }
      }
    }

    for (const permissions of permissionsBySession.values()) {
      for (const request of permissions) {
        const permissionName = request.permission?.trim();
        if (permissionName && permissionName !== 'invalid') {
          names.add(permissionName);
        }
      }
    }

    for (const toolId of toolIds) {
      names.add(toolId);
    }

    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [agents, permissionsBySession, toolIds]);

  const getOverrideWildcardAction = React.useCallback((permissionName: string): PermissionAction | undefined => {
    const configured = permissionEntries[permissionName];
    if (isPermissionAction(configured)) {
      return configured;
    }
    if (configured && typeof configured === 'object' && !Array.isArray(configured)) {
      const wildcard = (configured as Record<string, unknown>)['*'];
      if (isPermissionAction(wildcard)) {
        return wildcard;
      }
    }
    return undefined;
  }, [permissionEntries]);

  const getCustomPatternCount = React.useCallback((permissionName: string): number => {
    const configured = permissionEntries[permissionName];
    if (!configured || typeof configured !== 'object' || Array.isArray(configured)) {
      return 0;
    }
    const patterns = Object.keys(configured).filter((pattern) => pattern !== '*');
    return patterns.length;
  }, [permissionEntries]);

  const setOverrideAction = React.useCallback((permissionName: string, action: PermissionAction) => {
    if (permissionName === '*') {
      return;
    }

    setPermissionEntries((prev) => {
      const next: Record<string, PermissionConfigValue> = { ...prev };
      const current = next[permissionName];

      const uiDefaultAction = getAgentBaseDefaultActionForPermission(permissionName, defaultOverride);
      const opencodeDefault = getOpenCodeDefaultActionForPermission(permissionName);

      // Only remove if action matches BOTH the UI default AND OpenCode's built-in default
      // If they differ, we need to keep the explicit override to ensure correct behavior
      const canRemove = action === uiDefaultAction && action === opencodeDefault;

      if (current && typeof current === 'object' && !Array.isArray(current)) {
        const map: Record<string, PermissionAction> = { ...(current as Record<string, PermissionAction>) };
        map['*'] = action;

        const nonWildcardPatterns = Object.keys(map).filter((pattern) => pattern !== '*');
        if (canRemove && nonWildcardPatterns.length === 0) {
          delete next[permissionName];
          return next;
        }

        next[permissionName] = map;
        return next;
      }

      if (canRemove) {
        delete next[permissionName];
        return next;
      }

      next[permissionName] = action;
      return next;
    });
  }, [defaultOverride]);

  const removeOverride = React.useCallback((permissionName: string) => {
    setPermissionEntries((prev) => {
      if (!(permissionName in prev)) {
        return prev;
      }
      const next = { ...prev };
      delete next[permissionName];
      return next;
    });
  }, []);

  const overrides = React.useMemo(() => {
    const entries = Object.entries(permissionEntries).filter(([name]) => name !== '*');
    entries.sort(([a], [b]) => a.localeCompare(b));
    return entries;
  }, [permissionEntries]);

  const availableOverrideNames = React.useMemo(() => {
    const names = new Set<string>();

    for (const key of STANDARD_PERMISSION_KEYS) {
      names.add(key);
    }

    for (const key of knownPermissionNames) {
      names.add(key);
    }

    for (const key of Object.keys(permissionEntries)) {
      names.delete(key);
    }

    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [knownPermissionNames, permissionEntries]);

  const applyPendingOverride = React.useCallback((action: PermissionAction) => {
    const name = pendingOverrideName.trim();
    if (!name) {
      return;
    }

    const baseDefaultAction = getAgentBaseDefaultActionForPermission(name, defaultOverride);

    if (action === baseDefaultAction) {
      const basis = defaultOverride === 'default'
        ? 'OpenCode defaults'
        : `Default Permissions ("${defaultOverride}")`;

      toast.message(`"${name}" already matches ${basis} (${baseDefaultAction}).`);
      setPendingOverrideName('');
      return;
    }

    setOverrideAction(name, action);
    setPendingOverrideName('');
  }, [pendingOverrideName, setOverrideAction, defaultOverride]);

  const formatPermissionLabel = React.useCallback((permissionName: string): string => {
    if (permissionName === 'webfetch') return 'WebFetch';
    if (permissionName === 'websearch') return 'WebSearch';
    if (permissionName === 'codesearch') return 'CodeSearch';
    if (permissionName === 'doom_loop') return 'Doom Loop';
    if (permissionName === 'external_directory') return 'External Directory';
    if (permissionName === 'todowrite') return 'TodoWrite';
    if (permissionName === 'todoread') return 'TodoRead';

    return permissionName
      .split(/[_-]+/g)
      .filter(Boolean)
      .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
      .join(' ');
  }, []);

  React.useEffect(() => {
    setPendingOverrideName('');

    const applyPermissionState = (entries: Record<string, PermissionConfigValue>) => {
      const split = splitDefaultOverrideFromEntries(entries);
      setDefaultOverride(split.defaultOverride);
      setPermissionEntries(pruneRedundantPermissionOverrides(split.overrides, split.defaultOverride));
    };

    if (isNewAgent && agentDraft) {
      setDraftName(agentDraft.name || '');
      setDraftScope(agentDraft.scope || 'user');
      setDescription(agentDraft.description || '');
      setMode(agentDraft.mode || 'subagent');
      setModel(agentDraft.model || '');
      setTemperature(agentDraft.temperature);
      setTopP(agentDraft.top_p);
      setPrompt(agentDraft.prompt || '');

      const parsed = parsePermissionConfig(agentDraft.permission);
      applyPermissionState(parsed.entries);
      return;
    }

    if (selectedAgent && selectedAgentName === selectedAgent.name) {
      setDescription(selectedAgent.description || '');
      setMode(selectedAgent.mode || 'subagent');

      if (selectedAgent.model?.providerID && selectedAgent.model?.modelID) {
        setModel(`${selectedAgent.model.providerID}/${selectedAgent.model.modelID}`);
      } else {
        setModel('');
      }

      setTemperature(selectedAgent.temperature);
      setTopP(selectedAgent.topP);
      setPrompt(selectedAgent.prompt || '');

      const parsed = rulesetToPermissionConfig(selectedAgent.permission);
      applyPermissionState(parsed.entries);
    }
  }, [agentDraft, isNewAgent, selectedAgent, selectedAgentName]);

  // Note: We no longer prune overrides when defaultOverride changes.
  // This preserves user's explicit overrides until they save.
  // Pruning only happens in handleSave to avoid losing overrides during editing.

  const handleSave = async () => {
    const agentName = isNewAgent ? draftName.trim().replace(/\s+/g, '-') : selectedAgentName?.trim();

    if (!agentName) {
      toast.error('Agent name is required');
      return;
    }

    // Check for duplicate name when creating new agent
    if (isNewAgent && agents.some((a) => a.name === agentName)) {
      toast.error('An agent with this name already exists');
      return;
    }

    setIsSaving(true);

    try {
      const trimmedModel = model.trim();
      const config: AgentConfig = {
        name: agentName,
        description: description.trim() || undefined,
        mode,
        model: trimmedModel === '' ? null : trimmedModel,
        temperature,
        top_p: topP,
        prompt: prompt.trim() || undefined,
        permission: (() => {
          const overrides = pruneRedundantPermissionOverrides(permissionEntries, defaultOverride);
          const combined: Record<string, PermissionConfigValue> = defaultOverride === 'default'
            ? overrides
            : { '*': defaultOverride, ...overrides };

          // Always explicitly include doom_loop and external_directory
          // These have special OpenCode defaults ("ask") that differ from the general default ("allow")
          const specialPermissions = ['doom_loop', 'external_directory'] as const;
          for (const perm of specialPermissions) {
            if (!(perm in combined)) {
              // Use explicit override if set, otherwise derive from effective default
              const explicit = permissionEntries[perm];
              if (isPermissionAction(explicit)) {
                combined[perm] = explicit;
              } else {
                combined[perm] = getAgentBaseDefaultActionForPermission(perm, defaultOverride);
              }
            }
          }

          const keys = Object.keys(combined);

          if (keys.length === 0) {
            return isNewAgent ? undefined : null;
          }

          // Don't simplify to single action - always use object form when we have special permissions
          return combined as unknown as AgentConfig['permission'];
        })(),
        scope: isNewAgent ? draftScope : undefined,
      };

      let success: boolean;
      if (isNewAgent) {
        success = await createAgent(config);
        if (success) {
          setAgentDraft(null); // Clear draft after successful creation
        }
      } else {
        success = await updateAgent(agentName, config);
      }

      if (success) {
        toast.success(isNewAgent ? 'Agent created successfully' : 'Agent updated successfully');
      } else {
        toast.error(isNewAgent ? 'Failed to create agent' : 'Failed to update agent');
      }
    } catch (error) {
      console.error('Error saving agent:', error);
      const message = error instanceof Error && error.message ? error.message : 'An error occurred while saving';
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };


  if (!selectedAgentName) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center text-muted-foreground">
          <RiRobot2Line className="mx-auto mb-3 h-12 w-12 opacity-50" />
          <p className="typography-body">Select an agent from the sidebar</p>
          <p className="typography-meta mt-1 opacity-75">or create a new one</p>
        </div>
      </div>
    );
  }

  return (
    <ScrollableOverlay keyboardAvoid outerClassName="h-full" className="w-full">
      <div className="mx-auto max-w-3xl space-y-6 p-6">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="typography-ui-header font-semibold text-lg">
          {isNewAgent ? 'New Agent' : selectedAgentName}
        </h1>
      </div>

      {}
      <div className="space-y-4">
        <div className="space-y-1">
          <h2 className="typography-ui-header font-semibold text-foreground">Basic Information</h2>
          <p className="typography-meta text-muted-foreground/80">
            Configure agent identity and behavior mode
          </p>
        </div>

        {isNewAgent && (
          <div className="space-y-2">
            <label className="typography-ui-label font-medium text-foreground">
              Agent Name & Scope
            </label>
            <div className="flex items-center gap-2">
              <div className="flex items-center flex-1">
                <span className="typography-ui-label text-muted-foreground mr-1">@</span>
                <Input
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  placeholder="agent-name"
                  className="flex-1 text-foreground placeholder:text-muted-foreground"
                />
              </div>
              <Select value={draftScope} onValueChange={(v) => setDraftScope(v as AgentScope)}>
                <SelectTrigger className="!h-9 w-auto gap-1.5">
                  {draftScope === 'user' ? (
                    <RiUser3Line className="h-4 w-4" />
                  ) : (
                    <RiFolderLine className="h-4 w-4" />
                  )}
                  <span className="capitalize">{draftScope}</span>
                </SelectTrigger>
                <SelectContent align="end">
                  <SelectItem value="user" className="pr-2 [&>span:first-child]:hidden">
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-2">
                        <RiUser3Line className="h-4 w-4" />
                        <span>User</span>
                      </div>
                      <span className="typography-micro text-muted-foreground ml-6">Available in all projects</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="project" className="pr-2 [&>span:first-child]:hidden">
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-2">
                        <RiFolderLine className="h-4 w-4" />
                        <span>Project</span>
                      </div>
                      <span className="typography-micro text-muted-foreground ml-6">Only in current project</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <label className="typography-ui-label font-medium text-foreground">
            Description
          </label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What does this agent do?"
            rows={3}
          />
        </div>

        <div className="space-y-2">
          <label className="typography-ui-label font-medium text-foreground">
            Mode
          </label>
          <div className="flex gap-1 w-fit">
            <ButtonSmall
              variant={mode === 'primary' ? 'default' : 'outline'}
              onClick={() => setMode('primary')}
              className={cn('gap-2', mode === 'primary' ? undefined : 'text-foreground')}
            >
              <RiAiAgentLine className="h-3 w-3" />
              Primary
            </ButtonSmall>
            <ButtonSmall
              variant={mode === 'subagent' ? 'default' : 'outline'}
              onClick={() => setMode('subagent')}
              className={cn('gap-2', mode === 'subagent' ? undefined : 'text-foreground')}
            >
              <RiRobotLine className="h-3 w-3" />
              Subagent
            </ButtonSmall>
            <ButtonSmall
              variant={mode === 'all' ? 'default' : 'outline'}
              onClick={() => setMode('all')}
              className={cn('gap-2', mode === 'all' ? undefined : 'text-foreground')}
            >
              <RiAiAgentFill className="h-3 w-3" />
              All
            </ButtonSmall>
          </div>
          <p className="typography-meta text-muted-foreground">
            Primary: main agent, Subagent: helper agent, All: both modes
          </p>
        </div>
      </div>

      {}
      <div className="space-y-4">
        <div className="space-y-1">
          <h2 className="typography-h2 font-semibold text-foreground">Model Configuration</h2>
          <p className="typography-meta text-muted-foreground/80">
            Configure model and generation parameters
          </p>
        </div>

        <div className="space-y-2">
          <label className="typography-ui-label font-medium text-foreground">
            Model
          </label>
          <ModelSelector
            providerId={model ? model.split('/')[0] : ''}
            modelId={model ? model.split('/')[1] : ''}
            onChange={(providerId: string, modelId: string) => {
              if (providerId && modelId) {
                setModel(`${providerId}/${modelId}`);
              } else {
                setModel('');
              }
            }}
          />
        </div>

        <div className="flex gap-4">
          <div className="space-y-2">
            <label className="typography-ui-label font-medium text-foreground flex items-center gap-2">
              Temperature
              <Tooltip delayDuration={1000}>
                <TooltipTrigger asChild>
                  <RiInformationLine className="h-3.5 w-3.5 text-muted-foreground/60 cursor-help" />
                </TooltipTrigger>
                <TooltipContent sideOffset={8} className="max-w-xs">
                  Controls randomness in responses.<br />
                  Higher values make output more creative and unpredictable,<br />
                  lower values make it more focused and deterministic.
                </TooltipContent>
              </Tooltip>
            </label>
            <div className="relative w-32">
              <button
                type="button"
                onClick={() => {
                  const current = temperature !== undefined ? temperature : 0.7;
                  const newValue = Math.max(0, current - 0.1);
                  setTemperature(parseFloat(newValue.toFixed(1)));
                }}
                className="absolute left-2 top-1/2 -translate-y-1/2 flex items-center justify-center h-6 w-6 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
              >
                <RiSubtractLine className="h-3.5 w-3.5" />
              </button>
              <Input
                type="text"
                inputMode="decimal"
                value={temperature !== undefined ? temperature : ''}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value === '') {
                    setTemperature(undefined);
                    return;
                  }
                  const parsed = parseFloat(value);
                  if (!isNaN(parsed) && parsed >= 0 && parsed <= 2) {
                    setTemperature(parsed);
                  }
                }}
                onBlur={(e) => {
                  const value = e.target.value;
                  if (value !== '') {
                    const parsed = parseFloat(value);
                    if (!isNaN(parsed)) {
                      const clamped = Math.max(0, Math.min(2, parsed));
                      setTemperature(parseFloat(clamped.toFixed(1)));
                    }
                  }
                }}
                placeholder="—"
                className="text-center px-10 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <button
                type="button"
                onClick={() => {
                  const current = temperature !== undefined ? temperature : 0.7;
                  const newValue = Math.min(2, current + 0.1);
                  setTemperature(parseFloat(newValue.toFixed(1)));
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center justify-center h-6 w-6 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
              >
                <RiAddLine className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="typography-ui-label font-medium text-foreground flex items-center gap-2">
              Top P
              <Tooltip delayDuration={1000}>
                <TooltipTrigger asChild>
                  <RiInformationLine className="h-3.5 w-3.5 text-muted-foreground/60 cursor-help" />
                </TooltipTrigger>
                <TooltipContent sideOffset={8} className="max-w-xs">
                  Controls diversity via nucleus sampling.<br />
                  Lower values focus on most likely tokens,<br />
                  higher values consider more possibilities.
                </TooltipContent>
              </Tooltip>
            </label>
            <div className="relative w-32">
              <button
                type="button"
                onClick={() => {
                  const current = topP !== undefined ? topP : 0.9;
                  const newValue = Math.max(0, current - 0.1);
                  setTopP(parseFloat(newValue.toFixed(1)));
                }}
                className="absolute left-2 top-1/2 -translate-y-1/2 flex items-center justify-center h-6 w-6 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
              >
                <RiSubtractLine className="h-3.5 w-3.5" />
              </button>
              <Input
                type="text"
                inputMode="decimal"
                value={topP !== undefined ? topP : ''}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value === '') {
                    setTopP(undefined);
                    return;
                  }
                  const parsed = parseFloat(value);
                  if (!isNaN(parsed) && parsed >= 0 && parsed <= 1) {
                    setTopP(parsed);
                  }
                }}
                onBlur={(e) => {
                  const value = e.target.value;
                  if (value !== '') {
                    const parsed = parseFloat(value);
                    if (!isNaN(parsed)) {
                      const clamped = Math.max(0, Math.min(1, parsed));
                      setTopP(parseFloat(clamped.toFixed(1)));
                    }
                  }
                }}
                placeholder="—"
                className="text-center px-10 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <button
                type="button"
                onClick={() => {
                  const current = topP !== undefined ? topP : 0.9;
                  const newValue = Math.min(1, current + 0.1);
                  setTopP(parseFloat(newValue.toFixed(1)));
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center justify-center h-6 w-6 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
              >
                <RiAddLine className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {}
      <div className="space-y-4">
        <div className="space-y-1">
          <h2 className="typography-h2 font-semibold text-foreground">System Prompt</h2>
          <p className="typography-meta text-muted-foreground/80">
            Override the default system prompt for this agent
          </p>
        </div>
        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Custom system prompt for this agent..."
          rows={8}
          className="font-mono typography-meta"
        />
      </div>

      {}
      <div className="space-y-4">
        <div className="space-y-1">
          <h2 className="typography-h2 font-semibold text-foreground">Tool Access</h2>
          <p className="typography-meta text-muted-foreground/80">
            OpenCode v1.1.1+ configures tool access via the permissions below.
          </p>
        </div>
      </div>

      {}
      <div className="space-y-4">
        <div className="space-y-1">
          <h2 className="typography-h2 font-semibold text-foreground">Permissions</h2>
          <p className="typography-meta text-muted-foreground/80">
            This editor only updates wildcard ("*") rules; existing pattern rules are preserved.
          </p>
        </div>

        <div className="space-y-6">
          <div className="space-y-2">
            <h3 className="typography-ui-header font-semibold text-foreground">Default Permissions</h3>
            <p className="typography-meta text-muted-foreground/80">
              Set the default behavior for all permissions for this agent.
            </p>

            <div className="flex gap-1 w-fit">
              <Button
                size="sm"
                variant={defaultOverride === 'default' ? 'default' : 'outline'}
                onClick={() => setDefaultOverride('default')}
                className="h-6 px-2 text-xs"
              >
                Default
              </Button>
              <Button
                size="sm"
                variant={defaultOverride === 'allow' ? 'default' : 'outline'}
                onClick={() => setDefaultOverride('allow')}
                className="h-6 px-2 text-xs"
              >
                Allow
              </Button>
              <Button
                size="sm"
                variant={defaultOverride === 'ask' ? 'default' : 'outline'}
                onClick={() => setDefaultOverride('ask')}
                className="h-6 px-2 text-xs"
              >
                Ask
              </Button>
              <Button
                size="sm"
                variant={defaultOverride === 'deny' ? 'default' : 'outline'}
                onClick={() => setDefaultOverride('deny')}
                className="h-6 px-2 text-xs"
              >
                Deny
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <p className="typography-meta text-muted-foreground">
                {defaultOverride === 'default'
                  ? 'Uses OpenCode defaults unless overridden below.'
                  : 'Applies to any permission without an explicit override below.'}
              </p>
              <Tooltip delayDuration={1000}>
                <TooltipTrigger asChild>
                  <RiInformationLine className="h-3.5 w-3.5 text-muted-foreground/60 cursor-help" />
                </TooltipTrigger>
                <TooltipContent sideOffset={8} className="max-w-xs">
                  <div className="space-y-1">
                    <p><strong>Default:</strong> Follow OpenCode default behavior</p>
                    <p><strong>Allow:</strong> Run without confirmation</p>
                    <p><strong>Ask:</strong> Prompt for confirmation</p>
                    <p><strong>Deny:</strong> Block the operation</p>
                  </div>
                </TooltipContent>
              </Tooltip>
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="typography-ui-header font-semibold text-foreground">Overrides</h3>
            <p className="typography-meta text-muted-foreground/80">
              Add overrides for permissions that should behave differently for this agent.
            </p>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Select value={pendingOverrideName} onValueChange={setPendingOverrideName}>
                  <SelectTrigger className="h-8 w-full sm:w-72">
                    {pendingOverrideName ? (
                      <span className="truncate">{formatPermissionLabel(pendingOverrideName)}</span>
                    ) : (
                      <span className="text-muted-foreground">Add override…</span>
                    )}
                  </SelectTrigger>
                  <SelectContent>
                    {availableOverrideNames.map((name) => (
                      <SelectItem key={name} value={name} className="pr-2 [&>span:first-child]:hidden">
                        <div className="flex items-center justify-between gap-4">
                          <span>{formatPermissionLabel(name)}</span>
                          <span className="typography-micro text-muted-foreground font-mono">{name}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <div className="flex gap-1 w-fit">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!pendingOverrideName}
                    onClick={() => applyPendingOverride('allow')}
                    className="h-8 px-3 text-xs"
                  >
                    Allow
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!pendingOverrideName}
                    onClick={() => applyPendingOverride('ask')}
                    className="h-8 px-3 text-xs"
                  >
                    Ask
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!pendingOverrideName}
                    onClick={() => applyPendingOverride('deny')}
                    className="h-8 px-3 text-xs"
                  >
                    Deny
                  </Button>
                </div>
              </div>


            </div>

            {overrides.length === 0 ? (
              <p className="typography-meta text-muted-foreground">
                {defaultOverride === 'default'
                  ? 'No overrides configured. Everything follows OpenCode defaults.'
                  : `No overrides configured. All permissions default to "${defaultOverride}" for this agent.`}
              </p>
            ) : (
              <div className="space-y-4">
                {overrides.map(([permissionName]) => {
                  const wildcardAction = getOverrideWildcardAction(permissionName);
                  const customPatternCount = getCustomPatternCount(permissionName);
                  const label = formatPermissionLabel(permissionName);

                  return (
                    <div key={permissionName} className="space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <label className="typography-ui-label font-medium text-foreground flex items-center gap-2">
                          <span>{label}</span>
                          <span className="typography-micro text-muted-foreground font-mono">
                            {permissionName}
                          </span>
                          <Tooltip delayDuration={1000}>
                            <TooltipTrigger asChild>
                              <RiInformationLine className="h-3.5 w-3.5 text-muted-foreground/60 cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent sideOffset={8} className="max-w-xs">
                              <div className="space-y-1">
                                <p><strong>Allow:</strong> Run without confirmation</p>
                                <p><strong>Ask:</strong> Prompt for confirmation</p>
                                <p><strong>Deny:</strong> Block this operation</p>
                                <p><strong>Remove:</strong> Return to default behavior</p>
                                <p><strong>Note:</strong> Buttons set the "*" rule only</p>
                                {customPatternCount > 0 ? (
                                  <p><strong>Patterns:</strong> {customPatternCount} pattern rules preserved</p>
                                ) : null}
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        </label>

                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => removeOverride(permissionName)}
                          className="h-6 px-2 text-xs gap-1"
                        >
                          <RiSubtractLine className="h-3 w-3" />
                          Remove
                        </Button>
                      </div>

                      <div className="flex gap-1 w-fit">
                        <Button
                          size="sm"
                          variant={wildcardAction === 'allow' ? 'default' : 'outline'}
                          onClick={() => setOverrideAction(permissionName, 'allow')}
                          className="h-6 px-2 text-xs"
                        >
                          Allow
                        </Button>
                        <Button
                          size="sm"
                          variant={wildcardAction === 'ask' ? 'default' : 'outline'}
                          onClick={() => setOverrideAction(permissionName, 'ask')}
                          className="h-6 px-2 text-xs"
                        >
                          Ask
                        </Button>
                        <Button
                          size="sm"
                          variant={wildcardAction === 'deny' ? 'default' : 'outline'}
                          onClick={() => setOverrideAction(permissionName, 'deny')}
                          className="h-6 px-2 text-xs"
                        >
                          Deny
                        </Button>
                      </div>

                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {}
        <div className="flex justify-end border-t border-border/40 pt-4">
          <Button
            size="sm"
            variant="default"
            onClick={handleSave}
            disabled={isSaving}
            className="gap-2 h-6 px-2 text-xs w-fit"
          >
            <RiSaveLine className="h-3 w-3" />
            {isSaving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>
      </div>
    </ScrollableOverlay>
  );
};
