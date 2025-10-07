import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Toggle } from '@/components/ui/toggle';
import { toast } from 'sonner';
import { useAgentsStore, type AgentConfig } from '@/stores/useAgentsStore';
import { useConfigStore } from '@/stores/useConfigStore';
import { Robot, FloppyDisk, Lightning, Cube } from '@phosphor-icons/react';

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
  'perplexity-tool',
] as const;

const PERMISSION_OPTIONS = ['allow', 'ask', 'deny'] as const;

export const AgentsPage: React.FC = () => {
  const { selectedAgentName, getAgentByName, createAgent, updateAgent, agents } = useAgentsStore();
  const { providers } = useConfigStore();

  const selectedAgent = React.useMemo(() =>
    selectedAgentName ? getAgentByName(selectedAgentName) : null,
    [selectedAgentName, agents, getAgentByName]
  );
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
  const [editPermission, setEditPermission] = React.useState<'allow' | 'ask' | 'deny'>('allow');
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
        if (selectedAgent.permission.edit) {
          setEditPermission(selectedAgent.permission.edit);
        }
        if (selectedAgent.permission.webfetch) {
          setWebfetchPermission(selectedAgent.permission.webfetch);
        }
        if (typeof selectedAgent.permission.bash === 'string') {
          setBashPermission(selectedAgent.permission.bash as any);
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
      const config: AgentConfig = {
        name: name.trim(),
        description: description.trim() || undefined,
        mode,
        model: model || undefined,
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
          <Robot className="mx-auto mb-3 h-12 w-12 opacity-50" />
          <p className="typography-body">Select an agent from the sidebar</p>
          <p className="typography-meta mt-1 opacity-75">or create a new one</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-6 p-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="typography-h1 font-semibold">
              {isNewAgent ? 'New Agent' : name}
            </h1>
            <p className="typography-body text-muted-foreground mt-1">
              {isNewAgent
                ? 'Configure a new agent with custom tools and permissions'
                : 'Configure agent behavior, tools, and permissions'}
            </p>
          </div>
          <Button size="sm"
            onClick={handleSave}
            disabled={isSaving}
            className="gap-2"
          >
            <FloppyDisk className="h-4 w-4" weight="bold" />
            {isSaving ? 'Saving...' : 'Save'}
          </Button>
        </div>

        {/* Basic Information */}
        <div className="space-y-4">
          <h2 className="typography-h2 font-semibold">Basic Information</h2>

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
            <p className="typography-meta text-muted-foreground">
              Unique identifier for this agent
            </p>
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
            <div className="flex gap-2">
              <Button size="sm"
                variant={mode === 'primary' ? 'default' : 'outline'}
                onClick={() => setMode('primary')}
               
                className="flex-1 gap-2"
              >
                <Lightning className="h-4 w-4" weight="fill" />
                Primary
              </Button>
              <Button size="sm"
                variant={mode === 'subagent' ? 'default' : 'outline'}
                onClick={() => setMode('subagent')}
               
                className="flex-1 gap-2"
              >
                <Cube className="h-4 w-4" weight="fill" />
                Subagent
              </Button>
              <Button size="sm"
                variant={mode === 'all' ? 'default' : 'outline'}
                onClick={() => setMode('all')}
               
                className="flex-1"
              >
                All
              </Button>
            </div>
            <p className="typography-meta text-muted-foreground">
              Primary: main agent, Subagent: helper agent, All: both modes
            </p>
          </div>
        </div>

        {/* Model Configuration */}
        <div className="space-y-4">
          <h2 className="typography-h2 font-semibold">Model Configuration</h2>

          <div className="space-y-2">
            <label className="typography-ui-label font-medium text-foreground">
              Model
            </label>
            <Select value={model} onValueChange={setModel}>
              <SelectTrigger size="sm">
                <SelectValue placeholder="Select model..." />
              </SelectTrigger>
              <SelectContent>
                {providers.map((provider) =>
                  Array.isArray(provider.models) &&
                  provider.models.map((m: any) => (
                    <SelectItem
                      key={`${provider.id}/${m.id}`}
                      value={`${provider.id}/${m.id}`}
                    >
                      {provider.name} / {m.name || m.id}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            <p className="typography-meta text-muted-foreground">
              Default model for this agent (optional)
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="typography-ui-label font-medium text-foreground">
                Temperature
              </label>
              <Input
                type="number"
                min="0"
                max="2"
                step="0.1"
                value={temperature ?? ''}
                onChange={(e) =>
                  setTemperature(e.target.value ? parseFloat(e.target.value) : undefined)
                }
                placeholder="0.7"
               
              />
            </div>

            <div className="space-y-2">
              <label className="typography-ui-label font-medium text-foreground">
                Top P
              </label>
              <Input
                type="number"
                min="0"
                max="1"
                step="0.1"
                value={topP ?? ''}
                onChange={(e) =>
                  setTopP(e.target.value ? parseFloat(e.target.value) : undefined)
                }
                placeholder="0.9"
               
              />
            </div>
          </div>
        </div>

        {/* System Prompt */}
        <div className="space-y-4">
          <h2 className="typography-h2 font-semibold">System Prompt</h2>
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Custom system prompt for this agent..."
            rows={8}
           
            className="font-mono typography-meta"
          />
          <p className="typography-meta text-muted-foreground">
            Override the default system prompt for this agent
          </p>
        </div>

        {/* Tools */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="typography-h2 font-semibold">Available Tools</h2>
            <div className="flex gap-2">
              <Button 
                variant="outline"
                size="sm"
                onClick={() => toggleAllTools(true)}
               
              >
                Enable All
              </Button>
              <Button 
                variant="outline"
                size="sm"
                onClick={() => toggleAllTools(false)}
               
              >
                Disable All
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            {AVAILABLE_TOOLS.map((tool) => (
              <div
                key={tool}
                className="flex items-center justify-between rounded-lg border border-border/40 bg-sidebar/30 px-2 py-1.5"
              >
                <span className="typography-ui-label text-foreground">{tool}</span>
                <Toggle
                  pressed={tools[tool] || false}
                  onPressedChange={() => toggleTool(tool)}
                  variant="outline"
                  size="sm"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Permissions */}
        <div className="space-y-4">
          <h2 className="typography-h2 font-semibold">Permissions</h2>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="typography-ui-label font-medium text-foreground">
                Edit Permission
              </label>
              <Select
                value={editPermission}
                onValueChange={(value) => setEditPermission(value as any)}
              >
                <SelectTrigger size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="allow">Allow</SelectItem>
                  <SelectItem value="ask">Ask</SelectItem>
                  <SelectItem value="deny">Deny</SelectItem>
                </SelectContent>
              </Select>
              <p className="typography-meta text-muted-foreground">
                Permission for editing files
              </p>
            </div>

            <div className="space-y-2">
              <label className="typography-ui-label font-medium text-foreground">
                Bash Permission
              </label>
              <Select
                value={bashPermission}
                onValueChange={(value) => setBashPermission(value as any)}
              >
                <SelectTrigger size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="allow">Allow</SelectItem>
                  <SelectItem value="ask">Ask</SelectItem>
                  <SelectItem value="deny">Deny</SelectItem>
                </SelectContent>
              </Select>
              <p className="typography-meta text-muted-foreground">
                Permission for running bash commands
              </p>
            </div>

            <div className="space-y-2">
              <label className="typography-ui-label font-medium text-foreground">
                WebFetch Permission
              </label>
              <Select
                value={webfetchPermission}
                onValueChange={(value) => setWebfetchPermission(value as any)}
              >
                <SelectTrigger size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="allow">Allow</SelectItem>
                  <SelectItem value="ask">Ask</SelectItem>
                  <SelectItem value="deny">Deny</SelectItem>
                </SelectContent>
              </Select>
              <p className="typography-meta text-muted-foreground">
                Permission for fetching web content
              </p>
            </div>
          </div>
        </div>

        {/* Save Button (bottom) */}
        <div className="flex justify-end border-t border-border/40 pt-4">
          <Button size="sm"
            onClick={handleSave}
            disabled={isSaving}
            className="gap-2"
          >
            <FloppyDisk className="h-4 w-4" weight="bold" />
            {isSaving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>
    </div>
  );
};
