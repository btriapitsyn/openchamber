import React from 'react';
import { toast } from 'sonner';
import { AgentManagerSidebar } from './AgentManagerSidebar';
import { AgentManagerEmptyState } from './AgentManagerEmptyState';
import { AgentGroupDetail } from './AgentGroupDetail';
import { cn } from '@/lib/utils';
import { useAgentGroupsStore } from '@/stores/useAgentGroupsStore';
import { useMultiRunStore } from '@/stores/useMultiRunStore';
import { useSessionStore } from '@/stores/useSessionStore';
import { useConfigStore } from '@/stores/useConfigStore';
import { useDirectoryStore } from '@/stores/useDirectoryStore';
import { streamDebugEnabled } from '@/stores/utils/streamDebug';
import type { CreateMultiRunParams } from '@/types/multirun';

interface AgentManagerViewProps {
  className?: string;
}

export const AgentManagerView: React.FC<AgentManagerViewProps> = ({ className }) => {
  const isVSCodeRuntime = Boolean(
    (typeof window !== 'undefined'
      ? (window as unknown as { __OPENCHAMBER_RUNTIME_APIS__?: { runtime?: { isVSCode?: boolean } } })
          .__OPENCHAMBER_RUNTIME_APIS__?.runtime?.isVSCode
      : false)
  );
  const [connectionStatus, setConnectionStatus] = React.useState<'connecting' | 'connected' | 'error' | 'disconnected'>(
    () =>
      (typeof window !== 'undefined'
        ? (window as unknown as { __OPENCHAMBER_CONNECTION__?: { status?: string } }).__OPENCHAMBER_CONNECTION__?.status as
            'connecting' | 'connected' | 'error' | 'disconnected' | undefined
        : 'connecting') || 'connecting'
  );
  const configInitialized = useConfigStore((state) => state.isInitialized);
  const initializeApp = useConfigStore((state) => state.initializeApp);
  const loadSessions = useSessionStore((state) => state.loadSessions);
  const setDirectory = useDirectoryStore((state) => state.setDirectory);
  const bootstrapAttemptAt = React.useRef<number>(0);

  const { 
    selectedGroupName, 
    selectGroup, 
    getSelectedGroup,
    loadGroups,
  } = useAgentGroupsStore();

  const { createMultiRun, isLoading: isCreatingMultiRun } = useMultiRunStore();

  React.useEffect(() => {
    if (!isVSCodeRuntime) {
      return;
    }

    const current =
      (typeof window !== 'undefined'
        ? (window as unknown as { __OPENCHAMBER_CONNECTION__?: { status?: string } }).__OPENCHAMBER_CONNECTION__?.status
        : undefined) as 'connecting' | 'connected' | 'error' | 'disconnected' | undefined;
    if (current === 'connected' || current === 'connecting' || current === 'error' || current === 'disconnected') {
      setConnectionStatus(current);
    }

    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ status?: string; error?: string }>).detail;
      const status = detail?.status;
      if (status === 'connected' || status === 'connecting' || status === 'error' || status === 'disconnected') {
        setConnectionStatus(status);
      }
    };
    window.addEventListener('openchamber:connection-status', handler as EventListener);
    return () => window.removeEventListener('openchamber:connection-status', handler as EventListener);
  }, [isVSCodeRuntime]);

  React.useEffect(() => {
    if (!isVSCodeRuntime || connectionStatus !== 'connected') {
      return;
    }

    const now = Date.now();
    if (now - bootstrapAttemptAt.current < 750) {
      return;
    }
    bootstrapAttemptAt.current = now;

    const workspaceFolder = (typeof window !== 'undefined'
      ? (window as unknown as { __VSCODE_CONFIG__?: { workspaceFolder?: unknown } }).__VSCODE_CONFIG__?.workspaceFolder
      : null);

    if (typeof workspaceFolder === 'string' && workspaceFolder.trim().length > 0) {
      try {
        setDirectory(workspaceFolder, { showOverlay: false });
      } catch {
        // ignored
      }
    }

    const runBootstrap = async () => {
      try {
        if (!configInitialized) {
          await initializeApp();
        }

        const configState = useConfigStore.getState();
        if (
          !configState.isInitialized ||
          !configState.isConnected ||
          configState.providers.length === 0 ||
          configState.agents.length === 0
        ) {
          return;
        }

        await loadSessions();

        if (streamDebugEnabled()) {
          console.log('[OpenChamber][VSCode][agentManager] bootstrap complete', {
            providers: configState.providers.length,
            agents: configState.agents.length,
            sessions: useSessionStore.getState().sessions.length,
          });
        }
      } catch {
        // ignored
      }
    };

    void runBootstrap();
  }, [connectionStatus, configInitialized, initializeApp, isVSCodeRuntime, loadSessions, setDirectory]);

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
      const groupSlug = result.groupSlug;

      const waitForGroup = async (attempts = 6) => {
        for (let attempt = 0; attempt < attempts; attempt += 1) {
          await loadGroups();
          const groupsState = useAgentGroupsStore.getState();
          if (groupsState.groups.some((group) => group.name === groupSlug)) {
            return true;
          }
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
        return false;
      };

      // Refresh sessions + groups and wait briefly for OpenCode to surface the new worktree sessions.
      try {
        await useSessionStore.getState().loadSessions();
      } catch {
        // ignore
      }

      await waitForGroup();
      selectGroup(groupSlug);
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
