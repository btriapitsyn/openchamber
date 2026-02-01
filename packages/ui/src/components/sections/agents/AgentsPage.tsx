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
type PermissionRule = { permission: string; pattern: string; action: PermissionAction };
type PermissionConfigValue = PermissionAction | Record<string, PermissionAction>;
type PermissionRuleKey = `${string}::${string}`;

const STANDARD_PERMISSION_KEYS = [
  '*',
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
  'question',
  'plan_enter',
  'plan_exit',
] as const;

const isPermissionAction = (value: unknown): value is PermissionAction =>
  value === 'allow' || value === 'ask' || value === 'deny';

const buildRuleKey = (permission: string, pattern: string): PermissionRuleKey =>
  `${permission}::${pattern}`;

const normalizeRuleset = (ruleset: PermissionRule[]): PermissionRule[] => {
  const map = new Map<PermissionRuleKey, PermissionRule>();
  for (const rule of ruleset) {
    if (!rule.permission || rule.permission === 'invalid') {
      continue;
    }
    if (!rule.pattern) {
      continue;
    }
    if (!isPermissionAction(rule.action)) {
      continue;
    }
    map.set(buildRuleKey(rule.permission, rule.pattern), {
      permission: rule.permission,
      pattern: rule.pattern,
      action: rule.action,
    });
  }
  return Array.from(map.values());
};

const buildRuleMap = (ruleset: PermissionRule[]): Map<PermissionRuleKey, PermissionRule> => {
  const map = new Map<PermissionRuleKey, PermissionRule>();
  for (const rule of normalizeRuleset(ruleset)) {
    map.set(buildRuleKey(rule.permission, rule.pattern), rule);
  }
  return map;
};

const sortRules = (ruleset: PermissionRule[]): PermissionRule[] =>
  [...ruleset].sort((a, b) => {
    const permissionCompare = a.permission.localeCompare(b.permission);
    if (permissionCompare !== 0) return permissionCompare;
    return a.pattern.localeCompare(b.pattern);
  });

const areRulesEqual = (a: PermissionRule[], b: PermissionRule[]): boolean => {
  const sortedA = sortRules(normalizeRuleset(a));
  const sortedB = sortRules(normalizeRuleset(b));
  if (sortedA.length !== sortedB.length) {
    return false;
  }
  return sortedA.every((rule, index) => {
    const other = sortedB[index];
    return rule.permission === other.permission
      && rule.pattern === other.pattern
      && rule.action === other.action;
  });
};

const getGlobalWildcardAction = (ruleset: PermissionRule[]): PermissionAction => {
  const globalRule = ruleset.find((rule) => rule.permission === '*' && rule.pattern === '*');
  return globalRule?.action ?? 'allow';
};

const filterRulesAgainstGlobal = (ruleset: PermissionRule[], globalAction: PermissionAction): PermissionRule[] => (
  normalizeRuleset(ruleset)
    .filter((rule) => !(rule.permission === '*' && rule.pattern === '*'))
    // Keep wildcard overrides only when they differ from global.
    .filter((rule) => rule.pattern !== '*' || rule.action !== globalAction)
);

const permissionConfigToRuleset = (value: unknown): PermissionRule[] => {
  if (isPermissionAction(value)) {
    return [{ permission: '*', pattern: '*', action: value }];
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return [];
  }

  const rules: PermissionRule[] = [];
  for (const [permissionName, configValue] of Object.entries(value as Record<string, unknown>)) {
    if (permissionName === '__originalKeys') {
      continue;
    }
    if (isPermissionAction(configValue)) {
      rules.push({ permission: permissionName, pattern: '*', action: configValue });
      continue;
    }
    if (configValue && typeof configValue === 'object' && !Array.isArray(configValue)) {
      for (const [pattern, action] of Object.entries(configValue as Record<string, unknown>)) {
        if (isPermissionAction(action)) {
          rules.push({ permission: permissionName, pattern, action });
        }
      }
    }
  }

  return rules;
};

const buildPermissionConfigWithGlobal = (
  globalAction: PermissionAction,
  ruleset: PermissionRule[],
): AgentConfig['permission'] => {
  const normalized = normalizeRuleset(ruleset);
  const grouped: Record<string, Record<string, PermissionAction>> = {};

  for (const rule of normalized) {
    (grouped[rule.permission] ||= {})[rule.pattern] = rule.action;
  }

  const result: Record<string, PermissionConfigValue> = {
    '*': globalAction,
  };

  for (const [permissionName, patterns] of Object.entries(grouped)) {
    if (permissionName === '*') {
      continue;
    }

    if (Object.keys(patterns).length === 1 && patterns['*']) {
      result[permissionName] = patterns['*'];
      continue;
    }

    result[permissionName] = patterns;
  }

  return result as AgentConfig['permission'];
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
  const [globalPermission, setGlobalPermission] = React.useState<PermissionAction>('allow');
  const [permissionBaseline, setPermissionBaseline] = React.useState<PermissionRule[]>([]);
  const [permissionRules, setPermissionRules] = React.useState<PermissionRule[]>([]);
  const [pendingRuleName, setPendingRuleName] = React.useState('');
  const [pendingRulePattern, setPendingRulePattern] = React.useState('*');
  const [showPermissionEditor, setShowPermissionEditor] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const initialStateRef = React.useRef<{
    draftName: string;
    draftScope: AgentScope;
    description: string;
    mode: 'primary' | 'subagent' | 'all';
    model: string;
    temperature: number | undefined;
    topP: number | undefined;
    prompt: string;
    globalPermission: PermissionAction;
    permissionRules: PermissionRule[];
  } | null>(null);

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
      const rules = normalizeRuleset(Array.isArray(agent.permission) ? agent.permission as PermissionRule[] : []);
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

  const baselineRuleMap = React.useMemo(() => buildRuleMap(permissionBaseline), [permissionBaseline]);
  const currentRuleMap = React.useMemo(() => buildRuleMap(permissionRules), [permissionRules]);

  const getWildcardOverride = React.useCallback((permissionName: string): PermissionAction | undefined => (
    currentRuleMap.get(buildRuleKey(permissionName, '*'))?.action
  ), [currentRuleMap]);


  const getPatternRules = React.useCallback((permissionName: string): PermissionRule[] => (
    permissionRules
      .filter((rule) => rule.permission === permissionName && rule.pattern !== '*')
      .sort((a, b) => a.pattern.localeCompare(b.pattern))
  ), [permissionRules]);

  const summaryPermissionNames = React.useMemo(() => {
    const names = new Set<string>();
    for (const key of STANDARD_PERMISSION_KEYS) {
      names.add(key);
    }
    for (const key of knownPermissionNames) {
      names.add(key);
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [knownPermissionNames]);


  const getPermissionSummary = React.useCallback((permissionName: string) => {
    const defaultAction = permissionName === '*'
      ? globalPermission
      : (getWildcardOverride(permissionName) ?? globalPermission);
    const patternRules = getPatternRules(permissionName);
    const hasDefaultHint = false;
    const patternCounts = patternRules.reduce<Record<PermissionAction, number>>((acc, rule) => {
      acc[rule.action] = (acc[rule.action] ?? 0) + 1;
      return acc;
    }, { allow: 0, ask: 0, deny: 0 });
    const patternSummary = (['allow', 'ask', 'deny'] as const)
      .filter((action) => patternCounts[action] > 0)
      .map((action) => `${patternCounts[action]} ${action}`)
      .join(', ');
    return {
      defaultAction,
      patternRulesCount: patternRules.length,
      patternSummary,
      hasDefaultHint,
    };
  }, [getPatternRules, getWildcardOverride, globalPermission]);

  const availablePermissionNames = React.useMemo(() => {
    const names = new Set<string>();

    for (const key of STANDARD_PERMISSION_KEYS) {
      names.add(key);
    }

    for (const key of knownPermissionNames) {
      names.add(key);
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [knownPermissionNames]);

  const upsertRule = React.useCallback((permissionName: string, pattern: string, action: PermissionAction) => {
    setPermissionRules((prev) => {
      const map = buildRuleMap(prev);
      map.set(buildRuleKey(permissionName, pattern), { permission: permissionName, pattern, action });
      return Array.from(map.values());
    });
  }, []);

  const removeRule = React.useCallback((permissionName: string, pattern: string) => {
    setPermissionRules((prev) => {
      const map = buildRuleMap(prev);
      map.delete(buildRuleKey(permissionName, pattern));
      return Array.from(map.values());
    });
  }, []);

  const revertRule = React.useCallback((permissionName: string, pattern: string) => {
    const baseline = baselineRuleMap.get(buildRuleKey(permissionName, pattern));
    if (baseline) {
      upsertRule(permissionName, pattern, baseline.action);
      return;
    }
    removeRule(permissionName, pattern);
  }, [baselineRuleMap, removeRule, upsertRule]);

  const setRuleAction = React.useCallback((permissionName: string, pattern: string, action: PermissionAction) => {
    upsertRule(permissionName, pattern, action);
  }, [upsertRule]);

  const setGlobalPermissionAndPrune = React.useCallback((next: PermissionAction) => {
    setGlobalPermission(next);
    setPermissionRules((prev) => prev.filter((rule) => !(rule.pattern === '*' && rule.action === next)));
  }, []);

  const applyPendingRule = React.useCallback((action: PermissionAction) => {
    const name = pendingRuleName.trim();
    if (!name) {
      toast.error('Permission name is required');
      return;
    }

    const pattern = pendingRulePattern.trim() || '*';
    if (name === '*' && pattern === '*') {
      setGlobalPermissionAndPrune(action);
      setPendingRuleName('');
      setPendingRulePattern('*');
      return;
    }
    if (pattern === '*' && name !== '*' && action === globalPermission) {
      removeRule(name, '*');
    } else {
      upsertRule(name, pattern, action);
    }
    setPendingRuleName('');
    setPendingRulePattern('*');
  }, [globalPermission, pendingRuleName, pendingRulePattern, removeRule, setGlobalPermissionAndPrune, upsertRule]);

  const formatPermissionLabel = React.useCallback((permissionName: string): string => {
    if (permissionName === '*') return 'Default';
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
    setPendingRuleName('');
    setPendingRulePattern('*');

    const applyPermissionState = (rules: PermissionRule[]) => {
      const normalized = normalizeRuleset(rules);
      const nextGlobal = getGlobalWildcardAction(normalized);
      const filtered = filterRulesAgainstGlobal(normalized, nextGlobal);
      setGlobalPermission(nextGlobal);
      setPermissionBaseline(filtered);
      setPermissionRules(filtered);
      return { global: nextGlobal, rules: filtered };
    };

    if (isNewAgent && agentDraft) {
      const draftNameValue = agentDraft.name || '';
      const draftScopeValue = agentDraft.scope || 'user';
      const descriptionValue = agentDraft.description || '';
      const modeValue = agentDraft.mode || 'subagent';
      const modelValue = agentDraft.model || '';
      const temperatureValue = agentDraft.temperature;
      const topPValue = agentDraft.top_p;
      const promptValue = agentDraft.prompt || '';

      setDraftName(draftNameValue);
      setDraftScope(draftScopeValue);
      setDescription(descriptionValue);
      setMode(modeValue);
      setModel(modelValue);
      setTemperature(temperatureValue);
      setTopP(topPValue);
      setPrompt(promptValue);

      const parsedRules = permissionConfigToRuleset(agentDraft.permission);
      const permissionState = applyPermissionState(parsedRules);

      initialStateRef.current = {
        draftName: draftNameValue,
        draftScope: draftScopeValue,
        description: descriptionValue,
        mode: modeValue,
        model: modelValue,
        temperature: temperatureValue,
        topP: topPValue,
        prompt: promptValue,
        globalPermission: permissionState.global,
        permissionRules: permissionState.rules,
      };
      return;
    }

    if (selectedAgent && selectedAgentName === selectedAgent.name) {
      const descriptionValue = selectedAgent.description || '';
      const modeValue = selectedAgent.mode || 'subagent';
      const modelValue = selectedAgent.model?.providerID && selectedAgent.model?.modelID
        ? `${selectedAgent.model.providerID}/${selectedAgent.model.modelID}`
        : '';
      const temperatureValue = selectedAgent.temperature;
      const topPValue = selectedAgent.topP;
      const promptValue = selectedAgent.prompt || '';

      setDescription(descriptionValue);
      setMode(modeValue);

      setModel(modelValue);
      setTemperature(temperatureValue);
      setTopP(topPValue);
      setPrompt(promptValue);

      const permissionState = applyPermissionState(
        Array.isArray(selectedAgent.permission) ? selectedAgent.permission as PermissionRule[] : [],
      );

      initialStateRef.current = {
        draftName: '',
        draftScope: 'user',
        description: descriptionValue,
        mode: modeValue,
        model: modelValue,
        temperature: temperatureValue,
        topP: topPValue,
        prompt: promptValue,
        globalPermission: permissionState.global,
        permissionRules: permissionState.rules,
      };
    }
  }, [agentDraft, isNewAgent, selectedAgent, selectedAgentName]);

  const isDirty = React.useMemo(() => {
    const initial = initialStateRef.current;
    if (!initial) {
      return false;
    }

    if (isNewAgent) {
      if (draftName !== initial.draftName) return true;
      if (draftScope !== initial.draftScope) return true;
    }

    if (description !== initial.description) return true;
    if (mode !== initial.mode) return true;
    if (model !== initial.model) return true;
    if (temperature !== initial.temperature) return true;
    if (topP !== initial.topP) return true;
    if (prompt !== initial.prompt) return true;
    if (globalPermission !== initial.globalPermission) return true;
    if (!areRulesEqual(permissionRules, initial.permissionRules)) return true;

    return false;
  }, [description, draftName, draftScope, globalPermission, isNewAgent, mode, model, permissionRules, prompt, temperature, topP]);

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
      const permissionConfig = buildPermissionConfigWithGlobal(globalPermission, permissionRules);
      const config: AgentConfig = {
        name: agentName,
        description: description.trim() || undefined,
        mode,
        model: trimmedModel === '' ? null : trimmedModel,
        temperature,
        top_p: topP,
        prompt: prompt.trim() || undefined,
        permission: permissionConfig,
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
                className="absolute left-2 top-1/2 -translate-y-1/2 flex items-center justify-center h-6 w-6 rounded hover:bg-interactive-hover text-muted-foreground hover:text-foreground"
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
                className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center justify-center h-6 w-6 rounded hover:bg-interactive-hover text-muted-foreground hover:text-foreground"
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
                className="absolute left-2 top-1/2 -translate-y-1/2 flex items-center justify-center h-6 w-6 rounded hover:bg-interactive-hover text-muted-foreground hover:text-foreground"
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
                className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center justify-center h-6 w-6 rounded hover:bg-interactive-hover text-muted-foreground hover:text-foreground"
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
          <div className="flex items-center justify-between gap-2">
            <h2 className="typography-h2 font-semibold text-foreground">Permissions</h2>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowPermissionEditor((prev) => !prev)}
              className="h-8"
            >
              {showPermissionEditor ? 'Hide' : 'Edit'}
            </Button>
          </div>
          <p className="typography-meta text-muted-foreground/80">
            {showPermissionEditor
              ? 'Set a global default; tools only saved when different from global.'
              : 'Summary shows default actions; edit to manage granular rules.'}
          </p>
        </div>

        {!showPermissionEditor ? (
          <div className="rounded-lg border border-border/40 divide-y divide-border/40">
            {summaryPermissionNames.map((permissionName) => {
              const { defaultAction, patternRulesCount, patternSummary, hasDefaultHint } = getPermissionSummary(permissionName);
              const label = formatPermissionLabel(permissionName);
              const summary = hasDefaultHint
                ? `${defaultAction} (env blocked)`
                : defaultAction;
              return (
                <div key={permissionName} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="typography-ui-label font-medium text-foreground">{label}</span>
                    <span className="typography-micro text-muted-foreground font-mono">{permissionName}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    {patternRulesCount > 0 ? (
                      <span className="typography-micro text-muted-foreground">Global: {summary}</span>
                    ) : (
                      <span className="typography-micro text-muted-foreground">{summary}</span>
                    )}
                    {patternRulesCount > 0 ? (
                      <span className="typography-micro text-muted-foreground">Patterns: {patternSummary}</span>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="space-y-6">
            <div className="space-y-2">
              <h3 className="typography-ui-header font-semibold text-foreground">All Rules</h3>
              <p className="typography-meta text-muted-foreground/80">
                Each rule is shown as permission + pattern. Editing updates the action only.
              </p>
            </div>

            <div className="rounded-lg border border-border/40">
              <div className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="typography-ui-label font-medium text-foreground">Global</span>
                  <span className="typography-micro text-muted-foreground font-mono">*</span>
                </div>
                <Select
                  value={globalPermission}
                  onValueChange={(value) => setGlobalPermissionAndPrune(value as PermissionAction)}
                >
                  <SelectTrigger className="h-6 w-24 text-xs">
                    <span className="capitalize">{globalPermission}</span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="allow" className="pr-2 [&>span:first-child]:hidden">Allow</SelectItem>
                    <SelectItem value="ask" className="pr-2 [&>span:first-child]:hidden">Ask</SelectItem>
                    <SelectItem value="deny" className="pr-2 [&>span:first-child]:hidden">Deny</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-6">
              {summaryPermissionNames.filter((name) => name !== '*').map((permissionName) => {
                const label = formatPermissionLabel(permissionName);
                const { defaultAction, patternRulesCount, patternSummary } = getPermissionSummary(permissionName);
                const wildcardOverride = getWildcardOverride(permissionName);
                const wildcardValue: string = wildcardOverride ?? 'global';
                const patternRules = getPatternRules(permissionName);

                const wildcardOptions = (['allow', 'ask', 'deny'] as const).filter((action) => action !== globalPermission);

                return (
                  <div key={permissionName} className="rounded-lg border border-border/40">
                    <div className="flex items-center justify-between gap-3 px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="typography-ui-label font-medium text-foreground">{label}</span>
                        <span className="typography-micro text-muted-foreground font-mono">{permissionName}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        {patternRulesCount > 0 ? (
                          <span className="typography-micro text-muted-foreground">Global: {defaultAction}</span>
                        ) : (
                          <span className="typography-micro text-muted-foreground">{defaultAction}</span>
                        )}
                        {patternRulesCount > 0 ? (
                          <span className="typography-micro text-muted-foreground">Patterns: {patternSummary}</span>
                        ) : null}
                      </div>
                    </div>

                    <div className="space-y-2 border-t border-border/40 px-3 py-2">
                      <div className="flex flex-wrap items-center justify-between gap-2 p-2">
                        <div className="flex items-center gap-2">
                          <span className="typography-micro text-muted-foreground">Pattern</span>
                          <span className="typography-micro font-mono text-foreground">*</span>
                          {wildcardOverride ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => revertRule(permissionName, '*')}
                              className="h-5 px-2 text-[11px] gap-1"
                            >
                              <RiSubtractLine className="h-3 w-3" />
                              Revert
                            </Button>
                          ) : null}
                        </div>

                        <Select
                          value={wildcardValue}
                          onValueChange={(value) => {
                            if (value === 'global') {
                              removeRule(permissionName, '*');
                              return;
                            }
                            upsertRule(permissionName, '*', value as PermissionAction);
                          }}
                        >
                          <SelectTrigger className="h-6 w-24 text-xs">
                            <span className="capitalize">{wildcardValue === 'global' ? 'Global' : wildcardValue}</span>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="global" className="pr-2 [&>span:first-child]:hidden">Global</SelectItem>
                            {wildcardOptions.map((action) => (
                              <SelectItem key={action} value={action} className="pr-2 [&>span:first-child]:hidden">
                                {action.charAt(0).toUpperCase() + action.slice(1)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {patternRules.map((rule) => {
                        const ruleKey = buildRuleKey(rule.permission, rule.pattern);
                        const baselineRule = baselineRuleMap.get(ruleKey);
                        const isAdded = !baselineRule;
                        const isModified = Boolean(baselineRule && baselineRule.action !== rule.action);

                        return (
                          <div key={ruleKey} className="flex flex-wrap items-center justify-between gap-2 p-2">
                            <div className="flex items-center gap-2">
                              <span className="typography-micro text-muted-foreground">Pattern</span>
                              <span className="typography-micro font-mono text-foreground">{rule.pattern}</span>
                              {isAdded ? (
                                <span className="typography-micro text-emerald-500">New</span>
                              ) : null}
                              {isModified ? (
                                <span className="typography-micro text-amber-500">Modified</span>
                              ) : null}
                              {isAdded ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => removeRule(rule.permission, rule.pattern)}
                                  className="h-5 px-2 text-[11px] gap-1"
                                >
                                  <RiSubtractLine className="h-3 w-3" />
                                  Remove
                                </Button>
                              ) : isModified ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => revertRule(rule.permission, rule.pattern)}
                                  className="h-5 px-2 text-[11px] gap-1"
                                >
                                  <RiSubtractLine className="h-3 w-3" />
                                  Revert
                                </Button>
                              ) : null}
                            </div>

                            <Select
                              value={rule.action}
                              onValueChange={(value) => setRuleAction(rule.permission, rule.pattern, value as PermissionAction)}
                            >
                              <SelectTrigger className="h-6 w-24 text-xs">
                                <span className="capitalize">{rule.action}</span>
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="allow" className="pr-2 [&>span:first-child]:hidden">Allow</SelectItem>
                                <SelectItem value="ask" className="pr-2 [&>span:first-child]:hidden">Ask</SelectItem>
                                <SelectItem value="deny" className="pr-2 [&>span:first-child]:hidden">Deny</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="space-y-2">
              <h3 className="typography-ui-header font-semibold text-foreground">Add Rule</h3>
              <p className="typography-meta text-muted-foreground/80">
                Choose a permission key, set a pattern, and pick an action.
              </p>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Select value={pendingRuleName} onValueChange={setPendingRuleName}>
                  <SelectTrigger className="h-8 min-h-8 w-full sm:w-64">
                    {pendingRuleName ? (
                      <span className="truncate">{formatPermissionLabel(pendingRuleName)}</span>
                    ) : (
                      <span className="text-muted-foreground">Permission…</span>
                    )}
                  </SelectTrigger>
                  <SelectContent>
                    {availablePermissionNames.map((name) => (
                      <SelectItem key={name} value={name} className="pr-2 [&>span:first-child]:hidden">
                        <div className="flex items-center justify-between gap-4">
                          <span>{formatPermissionLabel(name)}</span>
                          <span className="typography-micro text-muted-foreground font-mono">{name}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Input
                  value={pendingRulePattern}
                  onChange={(e) => setPendingRulePattern(e.target.value)}
                  placeholder="Pattern (e.g. *)"
                  className="h-8 sm:w-64 font-mono"
                />

                <div className="flex gap-1 w-fit">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => applyPendingRule('allow')}
                    className="h-8 px-3 text-xs"
                  >
                    Allow
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => applyPendingRule('ask')}
                    className="h-8 px-3 text-xs"
                  >
                    Ask
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => applyPendingRule('deny')}
                    className="h-8 px-3 text-xs"
                  >
                    Deny
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {}
        <div className="flex justify-end border-t border-border/40 pt-4">
          <Button
            size="sm"
            variant="default"
            onClick={handleSave}
            disabled={isSaving || !isDirty}
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
