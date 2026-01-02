import React from 'react';
import {
  RiGitBranchLine,
  RiMore2Line,
  RiSettings3Line,
} from '@remixicon/react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ProviderLogo } from '@/components/ui/ProviderLogo';
import { useAgentGroupsStore, type AgentGroup, type AgentGroupSession } from '@/stores/useAgentGroupsStore';
import { useDirectoryStore } from '@/stores/useDirectoryStore';

interface SessionTabProps {
  session: AgentGroupSession;
  isSelected: boolean;
  onSelect: () => void;
}

const SessionTab: React.FC<SessionTabProps> = ({ session, isSelected, onSelect }) => {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex-shrink-0 min-w-0 flex flex-col gap-0.5 px-3 py-2 rounded-lg border transition-colors text-left',
        isSelected 
          ? 'bg-primary/10 dark:bg-primary/15 border-primary/30' 
          : 'bg-background/50 border-border/30 hover:bg-background/80 hover:border-border/50'
      )}
    >
      <div className="flex items-center gap-2">
        <ProviderLogo providerId={session.providerId} className="h-4 w-4 flex-shrink-0" />
        <span className="typography-ui-label text-foreground truncate max-w-[120px]">
          {session.modelId}
        </span>
      </div>
      {session.branch && (
        <div className="flex items-center gap-1 typography-micro text-muted-foreground/60">
          <RiGitBranchLine className="h-3 w-3" />
          <span className="truncate max-w-[100px]">{session.worktreeMetadata?.label || session.branch}</span>
        </div>
      )}
    </button>
  );
};

interface AgentGroupDetailProps {
  group: AgentGroup;
  className?: string;
}

export const AgentGroupDetail: React.FC<AgentGroupDetailProps> = ({
  group,
  className,
}) => {
  const { selectedSessionId, selectSession } = useAgentGroupsStore();
  const setDirectory = useDirectoryStore((state) => state.setDirectory);
  
  // Find the currently selected session
  const selectedSession = React.useMemo(() => {
    if (!selectedSessionId) return group.sessions[0] ?? null;
    return group.sessions.find((s) => s.id === selectedSessionId) ?? group.sessions[0] ?? null;
  }, [group.sessions, selectedSessionId]);
  
  // When selecting a session, switch to that worktree directory
  const handleSessionSelect = React.useCallback((session: AgentGroupSession) => {
    selectSession(session.id);
    
    // Switch directory to the worktree path
    if (session.path) {
      setDirectory(session.path);
    }
    
    // TODO: Also need to switch to the OpenCode session associated with this worktree
    // This would require mapping worktree paths to session IDs
  }, [selectSession, setDirectory]);
  
  // Auto-select first session when group changes
  React.useEffect(() => {
    if (group.sessions.length > 0 && !selectedSessionId) {
      handleSessionSelect(group.sessions[0]);
    }
  }, [group.name, group.sessions, selectedSessionId, handleSessionSelect]);

  return (
    <div className={cn('flex h-full flex-col bg-background', className)}>
      {/* Header */}
      <div className="flex-shrink-0 border-b border-border/30 px-4 py-3">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="typography-heading-lg text-foreground truncate">{group.name}</h1>
            <div className="flex items-center gap-2 mt-1 typography-meta text-muted-foreground">
              <span>{group.sessionCount} model{group.sessionCount !== 1 ? 's' : ''}</span>
              <span>·</span>
              <span className="flex items-center gap-1">
                <RiGitBranchLine className="h-3.5 w-3.5" />
                {selectedSession?.worktreeMetadata?.label || selectedSession?.branch || 'No branch'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <RiSettings3Line className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <RiMore2Line className="h-4 w-4" />
            </Button>
          </div>
        </div>
        
        {/* Session Tabs */}
        {group.sessions.length > 1 && (
          <div className="flex gap-2 mt-4 overflow-x-auto pb-1">
            {group.sessions.map((session) => (
              <SessionTab
                key={session.id}
                session={session}
                isSelected={selectedSession?.id === session.id}
                onSelect={() => handleSessionSelect(session)}
              />
            ))}
          </div>
        )}
      </div>
      
      {/* Chat Content */}
      <div className="flex-1 min-h-0">
        {selectedSession ? (
          <div className="h-full flex flex-col">
            {/* Info banner about the worktree */}
            <div className="px-4 py-2 bg-muted/30 border-b border-border/30">
              <div className="flex items-center gap-2 typography-meta text-muted-foreground">
                <ProviderLogo providerId={selectedSession.providerId} className="h-4 w-4" />
                <span className="font-medium text-foreground">
                  {selectedSession.displayLabel}
                </span>
                <span>·</span>
                <span className="font-mono text-xs truncate">
                  {selectedSession.path}
                </span>
              </div>
            </div>
            
            {/* Placeholder for actual chat - in a real implementation, 
                this would load the session associated with this worktree */}
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center p-8">
                <p className="typography-body text-muted-foreground mb-2">
                  Chat session for <span className="font-medium text-foreground">{selectedSession.displayLabel}</span>
                </p>
                <p className="typography-meta text-muted-foreground/60">
                  Worktree: {selectedSession.path}
                </p>
                <p className="typography-meta text-muted-foreground/60 mt-1">
                  Branch: {selectedSession.branch || 'Unknown'}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center">
            <p className="typography-body text-muted-foreground">
              No sessions in this group
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
