import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { useCommandsStore, type CommandConfig } from '@/stores/useCommandsStore';
import { useConfigStore } from '@/stores/useConfigStore';
import { TerminalWindow, FloppyDisk, Check } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { ModelSelector } from '../agents/ModelSelector';
import { AgentSelector } from './AgentSelector';

export const CommandsPage: React.FC = () => {
  const { selectedCommandName, getCommandByName, createCommand, updateCommand, commands } = useCommandsStore();
  const { providers } = useConfigStore();

  const selectedCommand = React.useMemo(() =>
    selectedCommandName ? getCommandByName(selectedCommandName) : null,
    [selectedCommandName, commands, getCommandByName]
  );
  const isNewCommand = selectedCommandName && !selectedCommand;

  // Form state
  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [agent, setAgent] = React.useState('');
  const [model, setModel] = React.useState('');
  const [template, setTemplate] = React.useState('');
  const [subtask, setSubtask] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);

  // Initialize form when command changes
  React.useEffect(() => {
    if (isNewCommand) {
      // Reset form for new command
      setName(selectedCommandName || '');
      setDescription('');
      setAgent('');
      setModel('');
      setTemplate('');
      setSubtask(false);
    } else if (selectedCommand) {
      // Load existing command data
      setName(selectedCommand.name);
      setDescription(selectedCommand.description || '');
      setAgent(selectedCommand.agent || '');
      setModel(selectedCommand.model || '');
      setTemplate(selectedCommand.template || '');
      setSubtask(selectedCommand.subtask || false);
    }
  }, [selectedCommand, isNewCommand, selectedCommandName, commands]);

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Command name is required');
      return;
    }

    if (!template.trim()) {
      toast.error('Command template is required');
      return;
    }

    setIsSaving(true);

    try {
      const config: CommandConfig = {
        name: name.trim(),
        description: description.trim() || undefined,
        agent: agent.trim() || undefined,
        model: model.trim() || undefined,
        template: template.trim(),
        subtask,
      };

      let success: boolean;
      if (isNewCommand) {
        success = await createCommand(config);
      } else {
        success = await updateCommand(name, config);
      }

      if (success) {
        toast.success(isNewCommand ? 'Command created successfully' : 'Command updated successfully');
      } else {
        toast.error(isNewCommand ? 'Failed to create command' : 'Failed to update command');
      }
    } catch (error) {
      console.error('Error saving command:', error);
      toast.error('An error occurred while saving');
    } finally {
      setIsSaving(false);
    }
  };

  if (!selectedCommandName) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center text-muted-foreground">
          <TerminalWindow className="mx-auto mb-3 h-12 w-12 opacity-50" />
          <p className="typography-body">Select a command from the sidebar</p>
          <p className="typography-meta mt-1 opacity-75">or create a new one</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-6 p-6">
        {/* Header */}
        <div className="space-y-1">
          <h1 className="typography-h1 font-semibold">
            {isNewCommand ? 'New Command' : name}
          </h1>
          <p className="typography-body text-muted-foreground mt-1">
            {isNewCommand
              ? 'Configure a new slash command with custom template'
              : 'Configure command template and behavior'}
          </p>
        </div>

        {/* Basic Information */}
        <div className="space-y-4">
          <div className="space-y-1">
            <h2 className="typography-h2 font-semibold text-foreground">Basic Information</h2>
            <p className="typography-meta text-muted-foreground/80">
              Configure command identity and metadata
            </p>
          </div>

          <div className="space-y-2">
            <label className="typography-ui-label font-medium text-foreground">
              Command Name
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-command"
              disabled={!isNewCommand}
            />
            <p className="typography-meta text-muted-foreground">
              Used with slash (/) prefix in chat
            </p>
          </div>

          <div className="space-y-2">
            <label className="typography-ui-label font-medium text-foreground">
              Description
            </label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this command do?"
              rows={3}
              className="min-h-[80px]"
            />
          </div>
        </div>

        {/* Model Configuration */}
        <div className="space-y-4">
          <div className="space-y-1">
            <h2 className="typography-h2 font-semibold text-foreground">Model & Agent Configuration</h2>
            <p className="typography-meta text-muted-foreground/80">
              Configure model and agent for command execution
            </p>
          </div>

          <div className="space-y-2">
            <label className="typography-ui-label font-medium text-foreground">
              Agent
            </label>
            <AgentSelector
              agentName={agent}
              onChange={(agentName: string) => setAgent(agentName)}
            />
            <p className="typography-meta text-muted-foreground">
              Agent to execute this command (optional)
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
              Default model for this command (optional)
            </p>
          </div>

          <div className="space-y-2">
            <label className="typography-ui-label font-medium text-foreground flex items-center gap-2 cursor-pointer">
              <div className="relative">
                <input
                  type="checkbox"
                  checked={subtask}
                  onChange={(e) => setSubtask(e.target.checked)}
                  className="sr-only"
                />
                <div className={cn(
                  "w-5 h-5 rounded border-2 flex items-center justify-center transition-colors",
                  subtask
                    ? "bg-primary border-primary"
                    : "bg-background border-border hover:border-primary/50"
                )}>
                  {subtask && <Check className="w-3 h-3 text-primary-foreground" weight="bold" />}
                </div>
              </div>
              Force Subagent Invocation
            </label>
            <p className="typography-meta text-muted-foreground">
              Force command to run in a subagent context
            </p>
          </div>
        </div>

        {/* Command Template */}
        <div className="space-y-4">
          <div className="space-y-1">
            <h2 className="typography-h2 font-semibold text-foreground">Command Template</h2>
            <p className="typography-meta text-muted-foreground/80">
              Define the prompt template for this command. Use $ARGUMENTS for user input.
            </p>
          </div>
          <Textarea
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
            placeholder={`Your command template here...

Use $ARGUMENTS to reference user input.
Use !\`shell command\` to inject shell output.
Use @filename to include file contents.`}
            rows={12}
            className="font-mono typography-meta min-h-[240px]"
          />
          <div className="typography-meta text-muted-foreground/80 space-y-1">
            <p className="font-medium">Template Features:</p>
            <ul className="list-disc list-inside space-y-0.5 ml-2">
              <li><code className="bg-muted px-1 rounded">$ARGUMENTS</code> - User input after command</li>
              <li><code className="bg-muted px-1 rounded">!`command`</code> - Inject shell command output</li>
              <li><code className="bg-muted px-1 rounded">@filename</code> - Include file contents</li>
            </ul>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end border-t border-border/40 pt-4">
          <Button
            size="sm"
            variant="default"
            onClick={handleSave}
            disabled={isSaving}
            className="gap-2 h-6 px-3 text-xs w-fit"
          >
            <FloppyDisk className="h-3 w-3" weight="bold" />
            {isSaving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>
    </div>
  );
};
