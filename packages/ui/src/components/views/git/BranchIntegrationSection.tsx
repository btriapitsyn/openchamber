import React from 'react';
import {
  RiGitMergeLine,
  RiGitBranchLine,
  RiLoader4Line,
  RiArrowDownSLine,
} from '@remixicon/react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

type OperationType = 'merge' | 'rebase';

interface BranchIntegrationSectionProps {
  currentBranch: string | null | undefined;
  localBranches: string[];
  remoteBranches: string[];
  onMerge: (branch: string) => void;
  onRebase: (branch: string) => void;
  disabled?: boolean;
  isOperating?: boolean;
}

export const BranchIntegrationSection: React.FC<BranchIntegrationSectionProps> = ({
  currentBranch,
  localBranches,
  remoteBranches,
  onMerge,
  onRebase,
  disabled = false,
  isOperating = false,
}) => {
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [operation, setOperation] = React.useState<OperationType>('merge');
  const [selectedBranch, setSelectedBranch] = React.useState<string | null>(null);
  const [branchDropdownOpen, setBranchDropdownOpen] = React.useState(false);
  const [branchSearch, setBranchSearch] = React.useState('');
  const searchInputRef = React.useRef<HTMLInputElement>(null);

  const isDisabled = disabled || isOperating;

  // Filter branches based on search
  const filteredLocal = React.useMemo(() => {
    const term = branchSearch.toLowerCase();
    const filtered = localBranches.filter((b) => b !== currentBranch);
    if (!term) return filtered;
    return filtered.filter((b) => b.toLowerCase().includes(term));
  }, [branchSearch, localBranches, currentBranch]);

  const filteredRemote = React.useMemo(() => {
    const term = branchSearch.toLowerCase();
    if (!term) return remoteBranches;
    return remoteBranches.filter((b) => b.toLowerCase().includes(term));
  }, [branchSearch, remoteBranches]);

  const handleOpenDialog = () => {
    setDialogOpen(true);
    setSelectedBranch(null);
    setOperation('merge');
    setBranchSearch('');
  };

  const handleSelectBranch = (branch: string) => {
    setSelectedBranch(branch);
    setBranchDropdownOpen(false);
    setBranchSearch('');
  };

  const handleConfirm = () => {
    if (!selectedBranch) return;
    
    if (operation === 'merge') {
      onMerge(selectedBranch);
    } else {
      onRebase(selectedBranch);
    }
    setDialogOpen(false);
  };

  const handleCancel = () => {
    setSelectedBranch(null);
    setOperation('merge');
    setBranchSearch('');
    setDialogOpen(false);
  };

  React.useEffect(() => {
    if (!branchDropdownOpen) {
      setBranchSearch('');
    } else {
      // Focus the search input when dropdown opens
      const timer = setTimeout(() => {
        searchInputRef.current?.focus();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [branchDropdownOpen]);

  return (
    <>
      <Tooltip delayDuration={1000}>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2 gap-1.5"
            onClick={handleOpenDialog}
            disabled={isDisabled}
          >
            {isOperating ? (
              <RiLoader4Line className="size-4 animate-spin" />
            ) : (
              <RiGitMergeLine className="size-4" />
            )}
            <span className="hidden sm:inline">Integrate</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent sideOffset={8}>
          Merge or rebase another branch
        </TooltipContent>
      </Tooltip>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Integrate Branch</DialogTitle>
            <DialogDescription>
              Choose how to integrate changes from another branch into{' '}
              <span className="font-mono text-foreground">{currentBranch || 'current branch'}</span>
            </DialogDescription>
          </DialogHeader>

          {/* Operation Selection */}
          <div className="space-y-3">
            <p className="typography-meta text-muted-foreground">Operation</p>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setOperation('merge')}
                className={cn(
                  'flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors',
                  operation === 'merge'
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-border/80 hover:bg-muted/50'
                )}
              >
                <div className="flex items-center gap-2">
                  <RiGitMergeLine className={cn(
                    'size-4',
                    operation === 'merge' ? 'text-primary' : 'text-muted-foreground'
                  )} />
                  <span className={cn(
                    'typography-ui-label',
                    operation === 'merge' ? 'text-foreground' : 'text-muted-foreground'
                  )}>
                    Merge
                  </span>
                </div>
                <p className="typography-micro text-muted-foreground">
                  Combines branches with a merge commit. Preserves history.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setOperation('rebase')}
                className={cn(
                  'flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors',
                  operation === 'rebase'
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-border/80 hover:bg-muted/50'
                )}
              >
                <div className="flex items-center gap-2">
                  <RiGitBranchLine className={cn(
                    'size-4',
                    operation === 'rebase' ? 'text-primary' : 'text-muted-foreground'
                  )} />
                  <span className={cn(
                    'typography-ui-label',
                    operation === 'rebase' ? 'text-foreground' : 'text-muted-foreground'
                  )}>
                    Rebase
                  </span>
                </div>
                <p className="typography-micro text-muted-foreground">
                  Replays commits on top. Creates linear history.
                </p>
              </button>
            </div>
          </div>

          {/* Branch Selection */}
          <div className="space-y-3">
            <p className="typography-meta text-muted-foreground">
              {operation === 'merge' ? 'Branch to merge' : 'Branch to rebase onto'}
            </p>
            <DropdownMenu open={branchDropdownOpen} onOpenChange={setBranchDropdownOpen}>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full justify-between h-10"
                >
                  <span className={cn(
                    'truncate',
                    !selectedBranch && 'text-muted-foreground'
                  )}>
                    {selectedBranch || 'Select a branch...'}
                  </span>
                  <RiArrowDownSLine className="size-4 opacity-60 shrink-0" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-[--radix-dropdown-menu-trigger-width] p-0 max-h-[300px]">
                <Command>
                  <CommandInput
                    ref={searchInputRef}
                    placeholder="Search branches..."
                    value={branchSearch}
                    onValueChange={setBranchSearch}
                  />
                  <CommandList>
                    <CommandEmpty>No branches found.</CommandEmpty>

                    {filteredLocal.length > 0 && (
                      <CommandGroup heading="Local branches">
                        {filteredLocal.map((branch) => (
                          <CommandItem
                            key={`local-${branch}`}
                            onSelect={() => handleSelectBranch(branch)}
                          >
                            <span className="typography-ui-label text-foreground truncate">
                              {branch}
                            </span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    )}

                    {filteredLocal.length > 0 && filteredRemote.length > 0 && (
                      <CommandSeparator />
                    )}

                    {filteredRemote.length > 0 && (
                      <CommandGroup heading="Remote branches">
                        {filteredRemote.map((branch) => (
                          <CommandItem
                            key={`remote-${branch}`}
                            onSelect={() => handleSelectBranch(branch)}
                          >
                            <span className="typography-ui-label text-foreground truncate">
                              {branch}
                            </span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    )}
                  </CommandList>
                </Command>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Summary */}
          {selectedBranch && (
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="typography-meta text-muted-foreground">
                {operation === 'merge' ? (
                  <>
                    This will merge{' '}
                    <span className="font-mono text-foreground">{selectedBranch}</span>
                    {' '}into{' '}
                    <span className="font-mono text-foreground">{currentBranch}</span>
                  </>
                ) : (
                  <>
                    This will rebase{' '}
                    <span className="font-mono text-foreground">{currentBranch}</span>
                    {' '}onto{' '}
                    <span className="font-mono text-foreground">{selectedBranch}</span>
                  </>
                )}
              </p>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCancel}
            >
              Cancel
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={handleConfirm}
              disabled={!selectedBranch}
              className="gap-1.5"
            >
              {operation === 'merge' ? (
                <>
                  <RiGitMergeLine className="size-4" />
                  Merge
                </>
              ) : (
                <>
                  <RiGitBranchLine className="size-4" />
                  Rebase
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
