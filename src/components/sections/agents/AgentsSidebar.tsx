import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Plus,
  Robot,
  DotsThreeVertical as MoreVertical,
  Trash as Trash2,
  PencilSimple as Edit2,
  Check,
  X,
  Copy,
  Lightning,
  Cube,
} from '@phosphor-icons/react';
import { useAgentsStore } from '@/stores/useAgentsStore';
import { useUIStore } from '@/stores/useUIStore';
import { useDeviceInfo } from '@/lib/device';
import { cn } from '@/lib/utils';
import type { Agent } from '@opencode-ai/sdk';

export const AgentsSidebar: React.FC = () => {
  const [newAgentName, setNewAgentName] = React.useState('');
  const [editingName, setEditingName] = React.useState<string | null>(null);
  const [editName, setEditName] = React.useState('');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = React.useState(false);

  const {
    selectedAgentName,
    agents,
    setSelectedAgent,
    deleteAgent,
    loadAgents,
  } = useAgentsStore();

  const { setSidebarOpen } = useUIStore();
  const { isMobile } = useDeviceInfo();

  // Load agents on mount
  React.useEffect(() => {
    loadAgents();
  }, [loadAgents]);

  const handleCreateAgent = () => {
    if (!newAgentName.trim()) {
      toast.error('Agent name is required');
      return;
    }

    // Check for duplicate names
    if (agents.some((agent) => agent.name === newAgentName)) {
      toast.error('An agent with this name already exists');
      return;
    }

    // Select the new agent and open the page for configuration
    setSelectedAgent(newAgentName);
    setNewAgentName('');
    setIsCreateDialogOpen(false);

    // Auto-hide sidebar on mobile
    if (isMobile) {
      setSidebarOpen(false);
    }
  };

  const handleDeleteAgent = async (agent: Agent) => {
    if (agent.builtIn) {
      toast.error('Built-in agents cannot be deleted');
      return;
    }

    if (window.confirm(`Are you sure you want to delete agent "${agent.name}"?`)) {
      const success = await deleteAgent(agent.name);
      if (success) {
        toast.success(`Agent "${agent.name}" deleted successfully`);
      } else {
        toast.error('Failed to delete agent');
      }
    }
  };

  const handleDuplicateAgent = (agent: Agent) => {
    const baseName = agent.name;
    let copyNumber = 1;
    let newName = `${baseName} Copy`;

    // Find a unique name
    while (agents.some((a) => a.name === newName)) {
      copyNumber++;
      newName = `${baseName} Copy ${copyNumber}`;
    }

    setSelectedAgent(newName);
    setIsCreateDialogOpen(false);

    // Auto-hide sidebar on mobile
    if (isMobile) {
      setSidebarOpen(false);
    }
  };

  const getAgentModeIcon = (mode?: string) => {
    switch (mode) {
      case 'primary':
        return <Lightning className="h-3 w-3 text-primary" weight="fill" />;
      case 'subagent':
        return <Cube className="h-3 w-3 text-blue-500" weight="fill" />;
      default:
        return null;
    }
  };

  // Separate built-in and custom agents
  const builtInAgents = agents.filter((agent) => agent.builtIn);
  const customAgents = agents.filter((agent) => !agent.builtIn);

  return (
    <div className="flex h-full flex-col bg-sidebar">
      <div className={cn('border-b border-border/40 px-3 dark:border-white/10', isMobile ? 'mt-2 py-3' : 'py-3')}>
        <div className="flex items-center justify-between">
          <h2 className="typography-ui-label font-semibold text-foreground">Agents</h2>
          <span className="typography-meta text-muted-foreground">
            {agents.length} total
          </span>
        </div>
      </div>

      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          <div className="space-y-1 px-3 py-2">
            <DialogTrigger asChild>
              <Button
                variant="ghost"
                className="w-full justify-start gap-2 rounded-lg border border-dashed border-primary/40 bg-primary/10 text-primary hover:bg-primary/15"
              >
                <Plus className="h-4 w-4 flex-shrink-0" weight="bold" />
                <span className="typography-ui-label font-medium">New Agent</span>
              </Button>
            </DialogTrigger>

            {agents.length === 0 ? (
              <div className="py-12 px-4 text-center text-muted-foreground">
                <Robot className="mx-auto mb-3 h-10 w-10 opacity-50" />
                <p className="typography-ui-label font-medium">No agents configured</p>
                <p className="typography-meta mt-1 opacity-75">Create one to get started</p>
              </div>
            ) : (
              <>
                {customAgents.length > 0 && (
                  <>
                    <div className="typography-micro px-2 pt-2 pb-1 text-muted-foreground">
                      Custom Agents
                    </div>
                    {customAgents.map((agent) => (
                      <AgentListItem
                        key={agent.name}
                        agent={agent}
                        isSelected={selectedAgentName === agent.name}
                        onSelect={() => {
                          setSelectedAgent(agent.name);
                          if (isMobile) {
                            setSidebarOpen(false);
                          }
                        }}
                        onDelete={() => handleDeleteAgent(agent)}
                        onDuplicate={() => handleDuplicateAgent(agent)}
                        getAgentModeIcon={getAgentModeIcon}
                      />
                    ))}
                  </>
                )}

                {builtInAgents.length > 0 && (
                  <>
                    <div className="typography-micro px-2 pt-3 pb-1 text-muted-foreground">
                      Built-in Agents
                    </div>
                    {builtInAgents.map((agent) => (
                      <AgentListItem
                        key={agent.name}
                        agent={agent}
                        isSelected={selectedAgentName === agent.name}
                        onSelect={() => {
                          setSelectedAgent(agent.name);
                          if (isMobile) {
                            setSidebarOpen(false);
                          }
                        }}
                        onDuplicate={() => handleDuplicateAgent(agent)}
                        getAgentModeIcon={getAgentModeIcon}
                      />
                    ))}
                  </>
                )}
              </>
            )}
          </div>
        </div>

        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Agent</DialogTitle>
            <DialogDescription>
              Enter a unique name for your new agent
            </DialogDescription>
          </DialogHeader>
          <Input
            value={newAgentName}
            onChange={(e) => setNewAgentName(e.target.value)}
            placeholder="Agent name..."
            className="text-foreground placeholder:text-muted-foreground"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleCreateAgent();
              }
            }}
          />
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setIsCreateDialogOpen(false)}
              className="text-foreground hover:bg-muted hover:text-foreground"
            >
              Cancel
            </Button>
            <Button onClick={handleCreateAgent}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

interface AgentListItemProps {
  agent: Agent;
  isSelected: boolean;
  onSelect: () => void;
  onDelete?: () => void;
  onDuplicate: () => void;
  getAgentModeIcon: (mode?: string) => React.ReactNode;
}

const AgentListItem: React.FC<AgentListItemProps> = ({
  agent,
  isSelected,
  onSelect,
  onDelete,
  onDuplicate,
  getAgentModeIcon,
}) => {
  return (
    <div
      className={cn(
        "group rounded-lg transition-all duration-200",
        isSelected
          ? "bg-sidebar-accent shadow-sm"
          : "hover:bg-sidebar-accent/50"
      )}
    >
      <div className="relative">
        <div className="w-full flex items-center justify-between py-1.5 px-2 pr-1 rounded-lg transition-colors hover:bg-background/5">
          <button
            onClick={onSelect}
            className="flex-1 text-left overflow-hidden"
            inputMode="none"
            tabIndex={0}
          >
            <div className="flex items-center gap-2">
              <div className="typography-ui-header font-medium truncate flex-1">
                {agent.name}
              </div>

              {/* Mode indicator */}
              {getAgentModeIcon(agent.mode)}
            </div>

            {/* Description preview */}
            {agent.description && (
              <div className="typography-meta text-muted-foreground truncate mt-0.5">
                {agent.description}
              </div>
            )}
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6 flex-shrink-0 -mr-1 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100"
              >
                <MoreVertical weight="regular" className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-fit min-w-20">
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onDuplicate();
                }}
              >
                <Copy className="h-4 w-4 mr-px" />
                Duplicate
              </DropdownMenuItem>

              {!agent.builtIn && onDelete && (
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete();
                  }}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="h-4 w-4 mr-px" />
                  Delete
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
};
