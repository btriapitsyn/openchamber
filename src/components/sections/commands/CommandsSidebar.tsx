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
  TerminalWindow,
  DotsThreeVertical as MoreVertical,
  Trash as Trash2,
  Copy,
} from '@phosphor-icons/react';
import { useCommandsStore, type Command } from '@/stores/useCommandsStore';
import { useUIStore } from '@/stores/useUIStore';
import { useDeviceInfo } from '@/lib/device';
import { cn } from '@/lib/utils';

export const CommandsSidebar: React.FC = () => {
  const [newCommandName, setNewCommandName] = React.useState('');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = React.useState(false);

  const {
    selectedCommandName,
    commands,
    setSelectedCommand,
    deleteCommand,
    loadCommands,
  } = useCommandsStore();

  const { setSidebarOpen } = useUIStore();
  const { isMobile } = useDeviceInfo();

  // Load commands on mount
  React.useEffect(() => {
    loadCommands();
  }, [loadCommands]);

  const handleCreateCommand = () => {
    if (!newCommandName.trim()) {
      toast.error('Command name is required');
      return;
    }

    // Sanitize command name: replace spaces with dashes
    const sanitizedName = newCommandName.trim().replace(/\s+/g, '-');

    // Check for duplicate names
    if (commands.some((cmd) => cmd.name === sanitizedName)) {
      toast.error('A command with this name already exists');
      return;
    }

    // Select the new command and open the page for configuration
    setSelectedCommand(sanitizedName);
    setNewCommandName('');
    setIsCreateDialogOpen(false);

    // Auto-hide sidebar on mobile
    if (isMobile) {
      setSidebarOpen(false);
    }
  };

  const handleDeleteCommand = async (command: Command) => {
    if (window.confirm(`Are you sure you want to delete command "${command.name}"?`)) {
      const success = await deleteCommand(command.name);
      if (success) {
        toast.success(`Command "${command.name}" deleted successfully`);
      } else {
        toast.error('Failed to delete command');
      }
    }
  };

  const handleDuplicateCommand = (command: Command) => {
    const baseName = command.name;
    let copyNumber = 1;
    let newName = `${baseName}-copy`;

    // Find a unique name
    while (commands.some((c) => c.name === newName)) {
      copyNumber++;
      newName = `${baseName}-copy-${copyNumber}`;
    }

    setSelectedCommand(newName);
    setIsCreateDialogOpen(false);

    // Auto-hide sidebar on mobile
    if (isMobile) {
      setSidebarOpen(false);
    }
  };

  return (
    <div className="flex h-full flex-col bg-sidebar">
      <div className={cn('border-b border-border/40 px-3 dark:border-white/10', isMobile ? 'mt-2 py-3' : 'py-3')}>
        <div className="flex items-center justify-between">
          <h2 className="typography-ui-label font-semibold text-foreground">Commands</h2>
          <span className="typography-meta text-muted-foreground">
            {commands.length} total
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
                <span className="typography-ui-label font-medium">New Command</span>
              </Button>
            </DialogTrigger>

            {commands.length === 0 ? (
              <div className="py-12 px-4 text-center text-muted-foreground">
                <TerminalWindow className="mx-auto mb-3 h-10 w-10 opacity-50" />
                <p className="typography-ui-label font-medium">No commands configured</p>
                <p className="typography-meta mt-1 opacity-75">Create one to get started</p>
              </div>
            ) : (
              <>
                {[...commands].sort((a, b) => a.name.localeCompare(b.name)).map((command) => (
                  <CommandListItem
                    key={command.name}
                    command={command}
                    isSelected={selectedCommandName === command.name}
                    onSelect={() => {
                      setSelectedCommand(command.name);
                      if (isMobile) {
                        setSidebarOpen(false);
                      }
                    }}
                    onDelete={() => handleDeleteCommand(command)}
                    onDuplicate={() => handleDuplicateCommand(command)}
                  />
                ))}
              </>
            )}
          </div>
        </div>

        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Command</DialogTitle>
            <DialogDescription>
              Enter a unique name for your new slash command
            </DialogDescription>
          </DialogHeader>
          <Input
            value={newCommandName}
            onChange={(e) => setNewCommandName(e.target.value)}
            placeholder="Command name..."
            className="text-foreground placeholder:text-muted-foreground"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleCreateCommand();
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
            <Button onClick={handleCreateCommand}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

interface CommandListItemProps {
  command: Command;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
}

const CommandListItem: React.FC<CommandListItemProps> = ({
  command,
  isSelected,
  onSelect,
  onDelete,
  onDuplicate,
}) => {
  return (
    <div className="group transition-all duration-200">
      <div className="relative">
        <div className="w-full flex items-center justify-between py-1.5 px-2 pr-1">
          <button
            onClick={onSelect}
            className="flex-1 text-left overflow-hidden"
            inputMode="none"
            tabIndex={0}
          >
            <div className="flex items-center gap-2">
              <div className={cn(
                "typography-ui-label font-medium truncate flex-1 transition-colors",
                isSelected
                  ? "text-primary"
                  : "text-foreground hover:text-primary/80"
              )}>
                /{command.name}
              </div>
            </div>

            {/* Description preview */}
            {command.description && (
              <div className="typography-meta text-muted-foreground truncate mt-0.5">
                {command.description}
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
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
};
