import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui';
import { useCommandsStore, type CommandConfig, type CommandScope } from '@/stores/useCommandsStore';
import { RiCheckLine, RiInformationLine, RiSaveLine, RiTerminalBoxLine, RiUser3Line, RiFolderLine } from '@remixicon/react';
import { cn } from '@/lib/utils';
import { ModelSelector } from '../agents/ModelSelector';
import { AgentSelector } from './AgentSelector';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';

export const CommandsPage: React.FC = () => {
  const { selectedCommandName, getCommandByName, createCommand, updateCommand, commands, commandDraft, setCommandDraft } = useCommandsStore();

  const selectedCommand = selectedCommandName ? getCommandByName(selectedCommandName) : null;
  const isNewCommand = Boolean(commandDraft && commandDraft.name === selectedCommandName && !selectedCommand);

  const [draftName, setDraftName] = React.useState('');
  const [draftScope, setDraftScope] = React.useState<CommandScope>('user');
  const [description, setDescription] = React.useState('');
  const [agent, setAgent] = React.useState('');
  const [model, setModel] = React.useState('');
  const [template, setTemplate] = React.useState('');
  const [subtask, setSubtask] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const initialStateRef = React.useRef<{
    draftName: string;
    draftScope: CommandScope;
    description: string;
    agent: string;
    model: string;
    template: string;
    subtask: boolean;
  } | null>(null);

  React.useEffect(() => {
    if (isNewCommand && commandDraft) {
      // Prefill from draft (for new or duplicated commands)
      const draftNameValue = commandDraft.name || '';
      const draftScopeValue = commandDraft.scope || 'user';
      const descriptionValue = commandDraft.description || '';
      const agentValue = commandDraft.agent || '';
      const modelValue = commandDraft.model || '';
      const templateValue = commandDraft.template || '';
      const subtaskValue = commandDraft.subtask || false;

      setDraftName(draftNameValue);
      setDraftScope(draftScopeValue);
      setDescription(descriptionValue);
      setAgent(agentValue);
      setModel(modelValue);
      setTemplate(templateValue);
      setSubtask(subtaskValue);

      initialStateRef.current = {
        draftName: draftNameValue,
        draftScope: draftScopeValue,
        description: descriptionValue,
        agent: agentValue,
        model: modelValue,
        template: templateValue,
        subtask: subtaskValue,
      };
    } else if (selectedCommand) {
      const descriptionValue = selectedCommand.description || '';
      const agentValue = selectedCommand.agent || '';
      const modelValue = selectedCommand.model || '';
      const templateValue = selectedCommand.template || '';
      const subtaskValue = selectedCommand.subtask || false;

      setDescription(descriptionValue);
      setAgent(agentValue);
      setModel(modelValue);
      setTemplate(templateValue);
      setSubtask(subtaskValue);

      initialStateRef.current = {
        draftName: '',
        draftScope: 'user',
        description: descriptionValue,
        agent: agentValue,
        model: modelValue,
        template: templateValue,
        subtask: subtaskValue,
      };
    }
  }, [selectedCommand, isNewCommand, selectedCommandName, commands, commandDraft]);

  const isDirty = React.useMemo(() => {
    const initial = initialStateRef.current;
    if (!initial) {
      return false;
    }

    if (isNewCommand) {
      if (draftName !== initial.draftName) return true;
      if (draftScope !== initial.draftScope) return true;
    }

    if (description !== initial.description) return true;
    if (agent !== initial.agent) return true;
    if (model !== initial.model) return true;
    if (template !== initial.template) return true;
    if (subtask !== initial.subtask) return true;

    return false;
  }, [agent, description, draftName, draftScope, isNewCommand, model, subtask, template]);

  const handleSave = async () => {
    const commandName = isNewCommand ? draftName.trim().replace(/\s+/g, '-') : selectedCommandName?.trim();
    
    if (!commandName) {
      toast.error('Command name is required');
      return;
    }

    if (!template.trim()) {
      toast.error('Command template is required');
      return;
    }

    // Check for duplicate name when creating new command
    if (isNewCommand && commands.some((cmd) => cmd.name === commandName)) {
      toast.error('A command with this name already exists');
      return;
    }

    setIsSaving(true);

    try {
      const trimmedAgent = agent.trim();
      const trimmedModel = model.trim();
      const trimmedTemplate = template.trim();
      const config: CommandConfig = {
        name: commandName,
        description: description.trim() || undefined,
        agent: trimmedAgent === '' ? null : trimmedAgent,
        model: trimmedModel === '' ? null : trimmedModel,
        template: trimmedTemplate,
        subtask,
        scope: isNewCommand ? draftScope : undefined,
      };

      let success: boolean;
      if (isNewCommand) {
        success = await createCommand(config);
        if (success) {
          setCommandDraft(null); // Clear draft after successful creation
        }
      } else {
        success = await updateCommand(commandName, config);
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
          <RiTerminalBoxLine className="mx-auto mb-3 h-12 w-12 opacity-50" />
          <p className="typography-body">Select a command from the sidebar</p>
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
            {isNewCommand ? 'New Command' : `/${selectedCommandName}`}
          </h1>
        </div>

        {}
        <div className="space-y-4">
          <div className="space-y-1">
            <h2 className="typography-ui-header font-semibold text-foreground">Basic Information</h2>
            <p className="typography-meta text-muted-foreground/80">
              Configure command identity and metadata
            </p>
          </div>

          {isNewCommand && (
            <div className="space-y-2">
              <label className="typography-ui-label font-medium text-foreground">
                Command Name & Scope
              </label>
              <div className="flex items-center gap-2">
                <div className="flex items-center flex-1">
                  <span className="typography-ui-label text-muted-foreground mr-1">/</span>
                  <Input
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    placeholder="command-name"
                    className="flex-1 text-foreground placeholder:text-muted-foreground"
                  />
                </div>
                <Select value={draftScope} onValueChange={(v) => setDraftScope(v as CommandScope)}>
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
              placeholder="What does this command do?"
              rows={3}
            />
          </div>
        </div>

        {}
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
                  "w-5 h-5 rounded border-2 flex items-center justify-center",
                  subtask
                    ? "bg-primary border-primary"
                    : "bg-background border-border hover:border-primary/50"
                )}>
                  {subtask && <RiCheckLine className="w-3 h-3 text-primary-foreground" />}
                </div>
              </div>
              Force Subagent Invocation
            </label>
            <div className="flex items-center gap-2">
              <p className="typography-meta text-muted-foreground">
                Force command to run in a subagent context
              </p>
              <Tooltip delayDuration={1000}>
                <TooltipTrigger asChild>
                  <RiInformationLine className="h-3.5 w-3.5 text-muted-foreground/60 cursor-help" />
                </TooltipTrigger>
                  <TooltipContent sideOffset={8} className="max-w-xs">
                    When enabled, this command will always execute in a subagent context,<br/>
                    even if triggered from main agent.<br/>
                    Useful for isolating command logic and maintaining clean separation of concerns.
                  </TooltipContent>
              </Tooltip>
            </div>
          </div>
        </div>

        {}
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
            className="font-mono typography-meta"
          />
          <div className="typography-meta text-muted-foreground/80 space-y-1">
            <p className="font-medium">Template Features:</p>
            <ul className="list-disc list-inside space-y-0.5 ml-2">
              <li className="flex items-center gap-2">
                <code className="bg-muted px-1 rounded">$ARGUMENTS</code>
                <span>- User input after command</span>
                <Tooltip delayDuration={1000}>
                  <TooltipTrigger asChild>
                    <RiInformationLine className="h-3 w-3 text-muted-foreground/60 cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent sideOffset={8} className="max-w-xs">
                    Replaced with everything the user types after the command name.<br/>
                    Example: "/deploy staging" makes $ARGUMENTS = "staging"
                  </TooltipContent>
                </Tooltip>
              </li>
              <li className="flex items-center gap-2">
                <code className="bg-muted px-1 rounded">!`command`</code>
                <span>- Inject shell command output</span>
                <Tooltip delayDuration={1000}>
                  <TooltipTrigger asChild>
                    <RiInformationLine className="h-3 w-3 text-muted-foreground/60 cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent sideOffset={8} className="max-w-xs">
                    Executes shell command and replaces this placeholder with its output.<br/>
                    Example: !`git branch --show-current` gets current branch name
                  </TooltipContent>
                </Tooltip>
              </li>
              <li className="flex items-center gap-2">
                <code className="bg-muted px-1 rounded">@filename</code>
                <span>- Include file contents</span>
                <Tooltip delayDuration={1000}>
                  <TooltipTrigger asChild>
                    <RiInformationLine className="h-3 w-3 text-muted-foreground/60 cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent sideOffset={8} className="max-w-xs">
                    Replaces with the full contents of the specified file.<br/>
                    Example: @package.json includes the package.json content in the prompt
                  </TooltipContent>
                </Tooltip>
              </li>
            </ul>
          </div>

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
