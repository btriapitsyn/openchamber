import React from 'react';
import {
  RiAddLine,
  RiArrowDownSLine,
  RiMore2Line,
  RiSearchLine,
  RiGitBranchLine,
} from '@remixicon/react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useAgentGroupsStore, type AgentGroup } from '@/stores/useAgentGroupsStore';
import { useDirectoryStore } from '@/stores/useDirectoryStore';

const formatRelativeTime = (timestamp: number): string => {
  const now = Date.now();
  const diff = now - timestamp;
  
  const minutes = Math.floor(diff / (60 * 1000));
  const hours = Math.floor(diff / (60 * 60 * 1000));
  const days = Math.floor(diff / (24 * 60 * 60 * 1000));
  
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  if (hours < 24) return `${hours}h`;
  return `${days}d`;
};

interface AgentGroupItemProps {
  group: AgentGroup;
  isSelected: boolean;
  onSelect: () => void;
}

const AgentGroupItem: React.FC<AgentGroupItemProps> = ({ group, isSelected, onSelect }) => {
  const [menuOpen, setMenuOpen] = React.useState(false);
  
  return (
    <div
      className={cn(
        'group relative flex items-center rounded-md px-1.5 py-1.5 cursor-pointer',
        isSelected ? 'dark:bg-accent/80 bg-primary/12' : 'hover:dark:bg-accent/40 hover:bg-primary/6',
      )}
      onClick={onSelect}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <button
          type="button"
          className="flex min-w-0 flex-1 flex-col gap-0.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        >
          <span className="truncate typography-ui-label font-normal text-foreground">
            {group.name}
          </span>
          <div className="flex items-center gap-2">
            <span className="typography-micro text-muted-foreground/60 flex items-center gap-1">
              <RiGitBranchLine className="h-3 w-3" />
              {group.sessionCount} model{group.sessionCount !== 1 ? 's' : ''}
            </span>
            <span className="typography-micro text-muted-foreground/60">
              {formatRelativeTime(group.lastActive)}
            </span>
          </div>
        </button>
        
        <div className="flex items-center gap-1.5 self-stretch">
          <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn(
                  'inline-flex h-3.5 w-[18px] items-center justify-center rounded-md text-muted-foreground transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
                  'opacity-0 group-hover:opacity-100',
                  menuOpen && 'opacity-100',
                )}
                aria-label="Group menu"
                onClick={(e) => e.stopPropagation()}
              >
                <RiMore2Line className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[140px]">
              <DropdownMenuItem className="text-destructive focus:text-destructive">
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
};

interface AgentManagerSidebarProps {
  className?: string;
  selectedGroupName?: string | null;
  onGroupSelect?: (groupName: string) => void;
  onNewAgent?: () => void;
}

export const AgentManagerSidebar: React.FC<AgentManagerSidebarProps> = ({
  className,
  selectedGroupName,
  onGroupSelect,
  onNewAgent,
}) => {
  const [searchQuery, setSearchQuery] = React.useState('');
  const [showAll, setShowAll] = React.useState(false);
  
  const { groups, isLoading, loadGroups } = useAgentGroupsStore();
  const currentDirectory = useDirectoryStore((state) => state.currentDirectory);
  
  // Load groups when directory changes
  React.useEffect(() => {
    if (currentDirectory) {
      loadGroups();
    }
  }, [currentDirectory, loadGroups]);
  
  const MAX_VISIBLE = 5;
  
  const filteredGroups = React.useMemo(() => {
    if (!searchQuery.trim()) return groups;
    const query = searchQuery.toLowerCase();
    return groups.filter(group => 
      group.name.toLowerCase().includes(query)
    );
  }, [searchQuery, groups]);
  
  const visibleGroups = showAll ? filteredGroups : filteredGroups.slice(0, MAX_VISIBLE);
  const remainingCount = filteredGroups.length - MAX_VISIBLE;
  
  return (
    <div className={cn('flex h-full flex-col bg-background/50 dark:bg-neutral-900/80 text-foreground border-r border-border/30', className)}>
      {/* Search Input */}
      <div className="px-2.5 pt-3 pb-2">
        <div className="relative">
          <RiSearchLine className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search Agent Groups..."
            className="pl-8 h-8 rounded-lg border-border/40 bg-background/50 typography-meta"
          />
        </div>
      </div>
      
      {/* New Agent Button */}
      <div className="px-2.5 pb-2">
        <Button
          variant="outline"
          className="w-full justify-start gap-2 h-8"
          onClick={onNewAgent}
        >
          <RiAddLine className="h-4 w-4" />
          <span className="typography-ui-label">New Agent Group</span>
        </Button>
      </div>
      
      {/* Agent Groups Section Header */}
      <div className="px-2.5 py-1.5 flex items-center gap-1">
        <RiArrowDownSLine className="h-4 w-4 text-muted-foreground" />
        <span className="typography-micro font-medium text-muted-foreground uppercase tracking-wider">
          Agent Groups
        </span>
        {isLoading && (
          <span className="typography-micro text-muted-foreground/50 ml-auto">
            Loading...
          </span>
        )}
      </div>
      
      {/* Group List */}
      <ScrollableOverlay
        outerClassName="flex-1 min-h-0"
        className="space-y-0.5 px-2.5 pb-2"
      >
        {visibleGroups.map((group) => (
          <AgentGroupItem
            key={group.name}
            group={group}
            isSelected={selectedGroupName === group.name}
            onSelect={() => onGroupSelect?.(group.name)}
          />
        ))}
        
        {/* Show More Link */}
        {!showAll && remainingCount > 0 && (
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="mt-1 flex items-center justify-start rounded-md px-1.5 py-0.5 text-left typography-micro text-muted-foreground/70 hover:text-foreground hover:underline"
          >
            ... More ({remainingCount})
          </button>
        )}
        
        {/* Show Less Link */}
        {showAll && filteredGroups.length > MAX_VISIBLE && (
          <button
            type="button"
            onClick={() => setShowAll(false)}
            className="mt-1 flex items-center justify-start rounded-md px-1.5 py-0.5 text-left typography-micro text-muted-foreground/70 hover:text-foreground hover:underline"
          >
            Show less
          </button>
        )}
        
        {/* Empty State */}
        {!isLoading && filteredGroups.length === 0 && (
          <div className="py-4 text-center">
            <p className="typography-meta text-muted-foreground">
              {searchQuery.trim() ? 'No groups found' : 'No agent groups yet'}
            </p>
            {!searchQuery.trim() && (
              <p className="typography-micro text-muted-foreground/60 mt-1">
                Create a new agent group to get started
              </p>
            )}
          </div>
        )}
      </ScrollableOverlay>
    </div>
  );
};
