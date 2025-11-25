import React from 'react';
import { Button } from '@/components/ui/button';
import { ButtonSmall } from '@/components/ui/button-small';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { useAgentsStore, type AgentConfig } from '@/stores/useAgentsStore';
import { useConfigStore } from '@/stores/useConfigStore';
import { RiAddLine, RiBox3Line, RiCheckLine, RiFlashlightLine, RiInformationLine, RiRobot2Line, RiSaveLine, RiSubtractLine } from '@remixicon/react';
import { cn } from '@/lib/utils';
import { ModelSelector } from './ModelSelector';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';

// List of available tools based on OpenCode API
const AVAILABLE_TOOLS = [
  'bash',
  'read',
  'write',
  'edit',
  'patch',
  'glob',
  'grep',
  'webfetch',
  'todowrite',
  'todoread',
  'list',
  'task',
  'perplexity',
] as const;


export const AgentsPage: React.FC = () => {
  const { selectedAgentName, getAgentByName, createAgent, updateAgent, agents } = useAgentsStore();
  useConfigStore();

  const selectedAgent = selectedAgentName ? getAgentByName(selectedAgentName) : null;
  const isNewAgent = selectedAgentName && !selectedAgent;

  // Form state
  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [mode, setMode] = React.useState<'primary' | 'subagent' | 'all'>('subagent');
  const [model, setModel] = React.useState('');
  const [temperature, setTemperature] = React.useState<number | undefined>(undefined);
  const [topP, setTopP] = React.useState<number | undefined>(undefined);
  const [prompt, setPrompt] = React.useState('');
  const [tools, setTools] = React.useState<Record<string, boolean>>({});
  const [editPermission, setEditPermission] = React.useState<'allow' | 'ask' | 'deny' | 'full'>('allow');
  const [webfetchPermission, setWebfetchPermission] = React.useState<'allow' | 'ask' | 'deny'>('allow');
  const [bashPermission, setBashPermission] = React.useState<'allow' | 'ask' | 'deny'>('ask');
  const [isSaving, setIsSaving] = React.useState(false);

  // Initialize form when agent changes
  React.useEffect(() => {
    if (isNewAgent) {
      // Reset form for new agent
      setName(selectedAgentName || '');
      setDescription('');
      setMode('subagent');
      setModel('');
      setTemperature(undefined);
      setTopP(undefined);
      setPrompt('');
      setTools({});
      setEditPermission('allow');
      setWebfetchPermission('allow');
      setBashPermission('ask');
    } else if (selectedAgent) {
      // Load existing agent data
      setName(selectedAgent.name);
      setDescription(selectedAgent.description || '');
      setMode(selectedAgent.mode || 'subagent');

      // Model in format "provider/model"
      if (selectedAgent.model?.providerID && selectedAgent.model?.modelID) {
        setModel(`${selectedAgent.model.providerID}/${selectedAgent.model.modelID}`);
      } else {
        setModel('');
      }

      setTemperature(selectedAgent.temperature);
      setTopP(selectedAgent.topP);
      setPrompt(selectedAgent.prompt || '');
      setTools(selectedAgent.tools || {});

      // Parse permissions
        if (selectedAgent.permission) {
          const editMode = selectedAgent.permission.edit;
          if (editMode === 'allow' || editMode === 'ask' || editMode === 'deny' || editMode === 'full') {
            setEditPermission(editMode);
          }
          if (selectedAgent.permission.webfetch) {
            setWebfetchPermission(selectedAgent.permission.webfetch);
          }
          if (typeof selectedAgent.permission.bash === 'string') {
            setBashPermission(selectedAgent.permission.bash as 'allow' | 'ask' | 'deny');
          }
        }

    }
  }, [selectedAgent, isNewAgent, selectedAgentName, agents]);

  const handleSave = async () => {

    if (!name.trim()) {
      toast.error('Agent name is required');
      return;
    }

    setIsSaving(true);

    try {
      const trimmedModel = model.trim();
      const config: AgentConfig = {
        name: name.trim(),
        description: description.trim() || undefined,
        mode,
        model: trimmedModel === '' ? null : trimmedModel,
        temperature,
        top_p: topP,
        prompt: prompt.trim() || undefined,
        tools: Object.keys(tools).length > 0 ? tools : undefined,
        permission: {
          edit: editPermission,
          webfetch: webfetchPermission,
          bash: bashPermission,
        },
      };


      let success: boolean;
      if (isNewAgent) {
        success = await createAgent(config);
      } else {
        success = await updateAgent(name, config);
      }


      if (success) {
        toast.success(isNewAgent ? 'Agent created successfully' : 'Agent updated successfully');
      } else {
        toast.error(isNewAgent ? 'Failed to create agent' : 'Failed to update agent');
      }
    } catch (error) {
      console.error('Error saving agent:', error);
      toast.error('An error occurred while saving');
    } finally {
      setIsSaving(false);
    }
  };

  const toggleTool = (tool: string) => {
    setTools((prev) => ({
      ...prev,
      [tool]: !prev[tool],
    }));
  };

  const toggleAllTools = (enabled: boolean) => {
    const allTools: Record<string, boolean> = {};
    AVAILABLE_TOOLS.forEach((tool) => {
      allTools[tool] = enabled;
    });
    setTools(allTools);
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
    <ScrollableOverlay outerClassName="h-full" className="mx-auto max-w-3xl space-y-6 p-6">
        {/* Header */}
        <div className="space-y-1">
          <h1 className="typography-ui-header font-semibold text-lg">
            {isNewAgent ? 'New Agent' : name}
          </h1>
        </div>

        {/* Basic Information */}
        <div className="space-y-4">
          <div className="space-y-1">
            <h2 className="typography-ui-header font-semibold text-foreground">Basic Information</h2>
            <p className="typography-meta text-muted-foreground/80">
              Configure agent identity and behavior mode
            </p>
          </div>

          <div className="space-y-2">
            <label className="typography-ui-label font-medium text-foreground">
              Agent Name
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-agent"
              disabled={!isNewAgent}
            />
          </div>

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
                className="gap-2"
              >
                <RiFlashlightLine className="h-3 w-3" />
                Primary
              </ButtonSmall>
              <ButtonSmall
                variant={mode === 'subagent' ? 'default' : 'outline'}
                onClick={() => setMode('subagent')}
                className="gap-2"
              >
                <RiBox3Line className="h-3 w-3" />
                Subagent
              </ButtonSmall>
              <ButtonSmall
                variant={mode === 'all' ? 'default' : 'outline'}
                onClick={() => setMode('all')}
              >
                All
              </ButtonSmall>
            </div>
            <p className="typography-meta text-muted-foreground">
              Primary: main agent, Subagent: helper agent, All: both modes
            </p>
          </div>
        </div>

        {/* Model Configuration */}
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
            <p className="typography-meta text-muted-foreground">
              Default model for this agent (optional)
            </p>
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
                    Controls randomness in responses.<br/>
                    Higher values make output more creative and unpredictable,<br/>
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
                    Controls diversity via nucleus sampling.<br/>
                    Lower values focus on most likely tokens,<br/>
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

        {/* System Prompt */}
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

        {/* Tools */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h2 className="typography-h2 font-semibold text-foreground">Available Tools</h2>
              <p className="typography-meta text-muted-foreground/80">
                Select tools this agent can access
              </p>
            </div>
          <div className="flex gap-1 w-fit">
            <Button
              variant="outline"
              size="sm"
              onClick={() => toggleAllTools(true)}
              className="h-6 px-2 text-xs"
            >
              Enable All
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => toggleAllTools(false)}
              className="h-6 px-2 text-xs"
            >
              Disable All
            </Button>
          </div>
          </div>

          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            {AVAILABLE_TOOLS.map((tool) => (
              <label
                key={tool}
                className="flex items-center justify-between rounded-xl border border-border/40 bg-sidebar/30 px-3 py-2 cursor-pointer hover:bg-sidebar/50"
              >
                <span className="typography-ui-label text-foreground">{tool}</span>
                <div className="relative">
                  <input
                    type="checkbox"
                    checked={tools[tool] || false}
                    onChange={() => toggleTool(tool)}
                    className="sr-only"
                  />
                  <div className={cn(
                    "w-5 h-5 rounded border-2 flex items-center justify-center",
                    tools[tool]
                      ? "bg-primary border-primary"
                      : "bg-background border-border hover:border-primary/50"
                  )}>
                    {tools[tool] && <RiCheckLine className="w-3 h-3 text-primary-foreground" />}
                  </div>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Permissions */}
        <div className="space-y-4">
          <div className="space-y-1">
            <h2 className="typography-h2 font-semibold text-foreground">Permissions</h2>
            <p className="typography-meta text-muted-foreground/80">
              Configure permission levels for different operations
            </p>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="typography-ui-label font-medium text-foreground">
                Edit Permission
              </label>
              <div className="flex gap-1 w-fit">
                <Button
                  size="sm"
                  variant={editPermission === 'full' ? 'default' : 'outline'}
                  onClick={() => setEditPermission('full')}
                  className="h-6 px-2 text-xs"
                >
                  Full
                </Button>
                <Button
                  size="sm"
                  variant={editPermission === 'allow' ? 'default' : 'outline'}
                  onClick={() => setEditPermission('allow')}
                  className="h-6 px-2 text-xs"
                >
                  Allow
                </Button>
                <Button
                  size="sm"
                  variant={editPermission === 'ask' ? 'default' : 'outline'}
                  onClick={() => setEditPermission('ask')}
                  className="h-6 px-2 text-xs"
                >
                  Ask
                </Button>
                <Button
                  size="sm"
                  variant={editPermission === 'deny' ? 'default' : 'outline'}
                  onClick={() => setEditPermission('deny')}
                  className="h-6 px-2 text-xs"
                >
                  Deny
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <p className="typography-meta text-muted-foreground">
                  Controls file editing permissions.
                </p>
                <Tooltip delayDuration={1000}>
                  <TooltipTrigger asChild>
                    <RiInformationLine className="h-3.5 w-3.5 text-muted-foreground/60 cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent sideOffset={8} className="max-w-xs">
                    <div className="space-y-1">
                      <p><strong>Full:</strong> Auto-approves all tool requests</p>
                      <p><strong>Allow:</strong> Allows file editing with standard checks</p>
                      <p><strong>Ask:</strong> Prompts for confirmation before editing</p>
                      <p><strong>Deny:</strong> Blocks all file editing operations</p>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>

            <div className="space-y-2">
              <label className="typography-ui-label font-medium text-foreground">
                Bash Permission
              </label>
              <div className="flex gap-1 w-fit">
                <Button
                  size="sm"
                  variant={bashPermission === 'allow' ? 'default' : 'outline'}
                  onClick={() => setBashPermission('allow')}
                  className="h-6 px-2 text-xs"
                >
                  Allow
                </Button>
                <Button
                  size="sm"
                  variant={bashPermission === 'ask' ? 'default' : 'outline'}
                  onClick={() => setBashPermission('ask')}
                  className="h-6 px-2 text-xs"
                >
                  Ask
                </Button>
                <Button
                  size="sm"
                  variant={bashPermission === 'deny' ? 'default' : 'outline'}
                  onClick={() => setBashPermission('deny')}
                  className="h-6 px-2 text-xs"
                >
                  Deny
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <p className="typography-meta text-muted-foreground">
                  Permission for running bash commands
                </p>
                <Tooltip delayDuration={1000}>
                  <TooltipTrigger asChild>
                    <RiInformationLine className="h-3.5 w-3.5 text-muted-foreground/60 cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent sideOffset={8} className="max-w-xs">
                    <div className="space-y-1">
                      <p><strong>Allow:</strong> Run bash commands without confirmation</p>
                      <p><strong>Ask:</strong> Prompt for confirmation before execution</p>
                      <p><strong>Deny:</strong> Block all bash command execution</p>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>

            <div className="space-y-2">
              <label className="typography-ui-label font-medium text-foreground">
                WebFetch Permission
              </label>
              <div className="flex gap-1 w-fit">
                <Button
                  size="sm"
                  variant={webfetchPermission === 'allow' ? 'default' : 'outline'}
                  onClick={() => setWebfetchPermission('allow')}
                  className="h-6 px-2 text-xs"
                >
                  Allow
                </Button>
                <Button
                  size="sm"
                  variant={webfetchPermission === 'ask' ? 'default' : 'outline'}
                  onClick={() => setWebfetchPermission('ask')}
                  className="h-6 px-2 text-xs"
                >
                  Ask
                </Button>
                <Button
                  size="sm"
                  variant={webfetchPermission === 'deny' ? 'default' : 'outline'}
                  onClick={() => setWebfetchPermission('deny')}
                  className="h-6 px-2 text-xs"
                >
                  Deny
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <p className="typography-meta text-muted-foreground">
                  Permission for fetching web content
                </p>
                <Tooltip delayDuration={1000}>
                  <TooltipTrigger asChild>
                    <RiInformationLine className="h-3.5 w-3.5 text-muted-foreground/60 cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent sideOffset={8} className="max-w-xs">
                    <div className="space-y-1">
                      <p><strong>Allow:</strong> Fetch web content without confirmation</p>
                      <p><strong>Ask:</strong> Prompt for confirmation before fetching</p>
                      <p><strong>Deny:</strong> Block all web content access</p>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
          </div>

        {/* Save Button (bottom) */}
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
    </ScrollableOverlay>
  );
};
