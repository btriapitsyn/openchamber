import React from 'react';
import { toast } from 'sonner';
import { AgentManagerSidebar } from './AgentManagerSidebar';
import { AgentManagerEmptyState } from './AgentManagerEmptyState';
import { AgentGroupDetail } from './AgentGroupDetail';
import { cn } from '@/lib/utils';
import { useAgentGroupsStore } from '@/stores/useAgentGroupsStore';
import { useMultiRunStore } from '@/stores/useMultiRunStore';
import type { CreateMultiRunParams } from '@/types/multirun';

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

  const { createMultiRun, isLoading: isCreatingMultiRun } = useMultiRunStore();

  const handleGroupSelect = React.useCallback((groupName: string) => {
    selectGroup(groupName);
  }, [selectGroup]);

  const handleNewAgent = React.useCallback(() => {
    // Clear selection to show the empty state / new agent form
    selectGroup(null);
  }, [selectGroup]);

  const handleCreateGroup = React.useCallback(async (params: CreateMultiRunParams) => {
    toast.info(`Creating agent group "${params.name}" with ${params.models.length} model(s)...`);

    const result = await createMultiRun(params);

    if (result) {
      toast.success(`Agent group "${params.name}" created with ${result.sessionIds.length} session(s)`);
      // Reload groups to pick up the new worktrees and sessions
      await loadGroups();
      // Select the newly created group
      selectGroup(params.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').substring(0, 50));
    } else {
      const error = useMultiRunStore.getState().error;
      toast.error(error || 'Failed to create agent group');
    }
  }, [createMultiRun, loadGroups, selectGroup]);

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
          <AgentManagerEmptyState 
            onCreateGroup={handleCreateGroup}
            isCreating={isCreatingMultiRun}
          />
        )}
      </div>
    </div>
  );
};
