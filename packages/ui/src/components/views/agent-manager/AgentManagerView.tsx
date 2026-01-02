import React from 'react';
import { toast } from 'sonner';
import { AgentManagerSidebar } from './AgentManagerSidebar';
import { AgentManagerEmptyState, type CreateAgentGroupParams } from './AgentManagerEmptyState';
import { AgentGroupDetail } from './AgentGroupDetail';
import { cn } from '@/lib/utils';
import { useAgentGroupsStore } from '@/stores/useAgentGroupsStore';

interface AgentManagerViewProps {
  className?: string;
}

export const AgentManagerView: React.FC<AgentManagerViewProps> = ({ className }) => {
  const { 
    selectedGroupName, 
    selectGroup, 
    getSelectedGroup,
    loadGroups,
  } = useAgentGroupsStore();

  const handleGroupSelect = React.useCallback((groupName: string) => {
    selectGroup(groupName);
  }, [selectGroup]);

  const handleNewAgent = React.useCallback(() => {
    // Clear selection to show the empty state / new agent form
    selectGroup(null);
  }, [selectGroup]);

  const handleCreateGroup = React.useCallback(async (params: CreateAgentGroupParams) => {
    // TODO: Implement the actual group creation logic:
    // 1. Create git worktrees for each model
    // 2. Start OpenCode sessions in each worktree
    // 3. Send the initial prompt to each session
    // 4. Update the store with the new group
    
    console.log('Creating agent group:', params);
    toast.success(`Creating agent group "${params.groupName}" with ${params.models.length} model(s)`);
    
    // For now, just reload groups after a delay (simulating creation)
    // In real implementation, this would wait for worktrees to be created
    setTimeout(() => {
      loadGroups();
    }, 1000);
  }, [loadGroups]);

  const selectedGroup = getSelectedGroup();

  return (
    <div className={cn('flex h-full w-full bg-background', className)}>
      {/* Left Sidebar - Agent Groups List */}
      <div className="w-64 flex-shrink-0">
        <AgentManagerSidebar
          selectedGroupName={selectedGroupName}
          onGroupSelect={handleGroupSelect}
          onNewAgent={handleNewAgent}
        />
      </div>
      
      {/* Main Content Area */}
      <div className="flex-1 min-w-0">
        {selectedGroup ? (
          <AgentGroupDetail group={selectedGroup} />
        ) : (
          <AgentManagerEmptyState onCreateGroup={handleCreateGroup} />
        )}
      </div>
    </div>
  );
};
