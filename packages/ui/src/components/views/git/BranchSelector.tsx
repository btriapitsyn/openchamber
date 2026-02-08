import React from 'react';
import {
  RiGitBranchLine,
  RiArrowDownSLine,
  RiAddLine,
  RiCloseLine,
  RiLoader4Line,
} from '@remixicon/react';
import { Button } from '@/components/ui/button';
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

interface BranchInfo {
  ahead?: number;
  behind?: number;
}

interface BranchSelectorProps {
  currentBranch: string | null | undefined;
  localBranches: string[];
  remoteBranches: string[];
  branchInfo: Record<string, BranchInfo> | undefined;
  onCheckout: (branch: string) => void;
  onCreate: (name: string) => Promise<void>;
  disabled?: boolean;
  tooltipDelayMs?: number;
}

const sanitizeBranchNameInput = (value: string): string => {
  return value
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^A-Za-z0-9._/-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/\/{2,}/g, '/')
    .replace(/\/-+/g, '/')
    .replace(/-+\//g, '/')
    .replace(/^[-/]+/, '')
    .replace(/[-/]+$/, '');
};

export const BranchSelector: React.FC<BranchSelectorProps> = ({
  currentBranch,
  localBranches,
  remoteBranches,
  branchInfo,
  onCheckout,
  onCreate,
  disabled = false,
  tooltipDelayMs = 1000,
}) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const [showCreate, setShowCreate] = React.useState(false);
  const [newBranchName, setNewBranchName] = React.useState('');
  const [isCreating, setIsCreating] = React.useState(false);
  const createInputRef = React.useRef<HTMLInputElement>(null);

  const sanitizedNewBranch = React.useMemo(
    () => sanitizeBranchNameInput(newBranchName),
    [newBranchName]
  );

  const filteredLocal = React.useMemo(() => {
    const term = search.toLowerCase();
    if (!term) return localBranches;
    return localBranches.filter((b) => b.toLowerCase().includes(term));
  }, [search, localBranches]);

  const filteredRemote = React.useMemo(() => {
    const term = search.toLowerCase();
    if (!term) return remoteBranches;
    return remoteBranches.filter((b) => b.toLowerCase().includes(term));
  }, [search, remoteBranches]);

  const handleCheckout = (branch: string) => {
    if (branch === currentBranch) {
      setIsOpen(false);
      return;
    }
    onCheckout(branch);
    setIsOpen(false);
    setSearch('');
  };

  const handleShowCreate = () => {
    setShowCreate(true);
    setTimeout(() => createInputRef.current?.focus(), 50);
  };

  const handleCreate = async () => {
    if (!sanitizedNewBranch || isCreating) return;
    setIsCreating(true);
    try {
      await onCreate(sanitizedNewBranch);
      setNewBranchName('');
      setShowCreate(false);
      setIsOpen(false);
    } finally {
      setIsCreating(false);
    }
  };

  const handleCancelCreate = () => {
    setNewBranchName('');
    setShowCreate(false);
  };

  React.useEffect(() => {
    if (!isOpen) {
      setSearch('');
      setShowCreate(false);
      setNewBranchName('');
    }
  }, [isOpen]);

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <Tooltip delayDuration={tooltipDelayMs}>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 min-w-0 max-w-full justify-start gap-1.5 px-2 py-1"
              disabled={disabled}
            >
              <RiGitBranchLine className="size-4 text-primary" />
              <span className="min-w-0 truncate font-medium text-left">
                {currentBranch || 'Detached HEAD'}
              </span>
              <RiArrowDownSLine className="size-4 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent sideOffset={8}>
          Current branch
        </TooltipContent>
      </Tooltip>

      <DropdownMenuContent align="start" className="w-72 p-0 max-h-[60vh] flex flex-col">
        <Command className="h-full min-h-0">
          <CommandInput
            placeholder="Search branches..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList
            scrollbarClassName="overlay-scrollbar--flush overlay-scrollbar--dense overlay-scrollbar--zero"
            disableHorizontal
          >
            <CommandEmpty>No branches found.</CommandEmpty>

            <CommandGroup>
              {!showCreate ? (
                <CommandItem onSelect={handleShowCreate}>
                  <RiAddLine className="size-4" />
                  <span>Create new branch...</span>
                </CommandItem>
              ) : (
                <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg">
                  <input
                    ref={createInputRef}
                    placeholder="New branch name"
                    value={newBranchName}
                    onChange={(e) => setNewBranchName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleCreate();
                      } else if (e.key === 'Escape') {
                        e.preventDefault();
                        handleCancelCreate();
                      }
                    }}
                    className="flex-1 min-w-0 bg-transparent typography-meta outline-none placeholder:text-muted-foreground"
                  />
                  <button
                    type="button"
                    onClick={handleCreate}
                    disabled={!sanitizedNewBranch || isCreating}
                    className="shrink-0 text-muted-foreground hover:text-foreground disabled:opacity-50"
                  >
                    {isCreating ? (
                      <RiLoader4Line className="size-4 animate-spin" />
                    ) : (
                      <RiAddLine className="size-4" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelCreate}
                    disabled={isCreating}
                    className="shrink-0 text-muted-foreground hover:text-foreground disabled:opacity-50"
                  >
                    <RiCloseLine className="size-4" />
                  </button>
                </div>
              )}
            </CommandGroup>

            <CommandSeparator />

            <CommandGroup heading="Local branches">
              {filteredLocal.map((branch) => (
                <CommandItem
                  key={`local-${branch}`}
                  onSelect={() => handleCheckout(branch)}
                >
                  <span className="flex flex-1 flex-col">
                    <span className="typography-ui-label text-foreground">
                      {branch}
                    </span>
                    {(branchInfo?.[branch]?.ahead || branchInfo?.[branch]?.behind) && (
                      <span className="typography-micro text-muted-foreground">
                        {branchInfo[branch].ahead || 0} ahead ·{' '}
                        {branchInfo[branch].behind || 0} behind
                      </span>
                    )}
                  </span>
                  {currentBranch === branch && (
                    <span className="typography-micro text-primary">Current</span>
                  )}
                </CommandItem>
              ))}
              {filteredLocal.length === 0 && (
                <CommandItem disabled className="justify-center">
                  <span className="typography-meta text-muted-foreground">
                    No local branches
                  </span>
                </CommandItem>
              )}
            </CommandGroup>

            <CommandSeparator />

            <CommandGroup heading="Remote branches">
              {filteredRemote.map((branch) => (
                <CommandItem
                  key={`remote-${branch}`}
                  onSelect={() => handleCheckout(branch)}
                >
                  <span className="typography-ui-label text-foreground">{branch}</span>
                </CommandItem>
              ))}
              {filteredRemote.length === 0 && (
                <CommandItem disabled className="justify-center">
                  <span className="typography-meta text-muted-foreground">
                    No remote branches
                  </span>
                </CommandItem>
              )}
            </CommandGroup>

          </CommandList>
        </Command>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
