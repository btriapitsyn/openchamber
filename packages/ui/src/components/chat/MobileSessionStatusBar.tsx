import React from 'react';
import { useSessionStore } from '@/stores/useSessionStore';
import { useConfigStore } from '@/stores/useConfigStore';
import { useUIStore } from '@/stores/useUIStore';
import type { Session } from '@opencode-ai/sdk/v2';
import { cn } from '@/lib/utils';
import { getAgentColor } from '@/lib/agentColors';
import { RiLoader4Line } from '@remixicon/react';

interface MobileSessionStatusBarProps {
  onSessionSwitch?: (sessionId: string) => void;
}

interface SessionWithStatus extends Session {
  _statusType?: 'busy' | 'retry' | 'idle';
  _hasRunningChildren?: boolean;
  _runningChildrenCount?: number;
  _childIndicators?: Array<{ session: Session; isRunning: boolean }>;
}

function useSessionGrouping(
  sessions: Session[],
  sessionStatus: Map<string, { type: string }> | undefined,
  sessionAttentionStates: Map<string, { needsAttention: boolean }> | undefined
) {
  const parentChildMap = React.useMemo(() => {
    const map = new Map<string, Session[]>();
    const allIds = new Set(sessions.map((s) => s.id));

    sessions.forEach((session) => {
      const parentID = (session as { parentID?: string }).parentID;
      if (parentID && allIds.has(parentID)) {
        map.set(parentID, [...(map.get(parentID) || []), session]);
      }
    });
    return map;
  }, [sessions]);

  const getStatusType = React.useCallback((sessionId: string): 'busy' | 'retry' | 'idle' => {
    const status = sessionStatus?.get(sessionId);
    if (status?.type === 'busy' || status?.type === 'retry') return status.type;
    return 'idle';
  }, [sessionStatus]);

  const hasRunningChildren = React.useCallback((sessionId: string): boolean => {
    const children = parentChildMap.get(sessionId) || [];
    return children.some((child) => getStatusType(child.id) !== 'idle');
  }, [parentChildMap, getStatusType]);

  const getRunningChildrenCount = React.useCallback((sessionId: string): number => {
    const children = parentChildMap.get(sessionId) || [];
    return children.filter((child) => getStatusType(child.id) !== 'idle').length;
  }, [parentChildMap, getStatusType]);

  const getChildIndicators = React.useCallback((sessionId: string): Array<{ session: Session; isRunning: boolean }> => {
    const children = parentChildMap.get(sessionId) || [];
    return children
      .filter((child) => getStatusType(child.id) !== 'idle')
      .map((child) => ({ session: child, isRunning: true }))
      .slice(0, 3);
  }, [parentChildMap, getStatusType]);

  const processedSessions = React.useMemo(() => {
    const topLevel = sessions.filter((session) => {
      const parentID = (session as { parentID?: string }).parentID;
      return !parentID || !new Set(sessions.map((s) => s.id)).has(parentID);
    });

    const running: SessionWithStatus[] = [];
    const viewed: SessionWithStatus[] = [];

    topLevel.forEach((session) => {
      const statusType = getStatusType(session.id);
      const hasRunning = hasRunningChildren(session.id);
      const attention = sessionAttentionStates?.get(session.id)?.needsAttention ?? false;

      const enriched: SessionWithStatus = {
        ...session,
        _statusType: statusType,
        _hasRunningChildren: hasRunning,
        _runningChildrenCount: getRunningChildrenCount(session.id),
        _childIndicators: getChildIndicators(session.id),
      };

      if (statusType !== 'idle' || hasRunning) {
        running.push(enriched);
      } else if (attention) {
        running.push(enriched);
      } else {
        viewed.push(enriched);
      }
    });

    const sortByUpdated = (a: Session, b: Session) => {
      const aTime = (a as unknown as { time?: { updated?: number } }).time?.updated ?? 0;
      const bTime = (b as unknown as { time?: { updated?: number } }).time?.updated ?? 0;
      return bTime - aTime;
    };

    running.sort(sortByUpdated);
    viewed.sort(sortByUpdated);

    return [...running, ...viewed];
  }, [sessions, getStatusType, hasRunningChildren, getRunningChildrenCount, getChildIndicators, sessionAttentionStates]);

  const totalRunning = processedSessions.reduce((sum, s) => {
    const selfRunning = s._statusType !== 'idle' ? 1 : 0;
    return sum + selfRunning + (s._runningChildrenCount ?? 0);
  }, 0);

  const totalUnread = processedSessions.filter((s) => sessionAttentionStates?.get(s.id)?.needsAttention ?? false).length;

  return { sessions: processedSessions, totalRunning, totalUnread, totalCount: processedSessions.length };
}

function useSessionHelpers(
  agents: Array<{ name: string }>,
  sessionStatus: Map<string, { type: string }> | undefined,
  sessionAttentionStates: Map<string, { needsAttention: boolean }> | undefined
) {
  const getSessionAgentName = React.useCallback((session: Session): string => {
    const agent = (session as { agent?: string }).agent;
    if (agent) return agent;

    const sessionAgentSelection = useSessionStore.getState().getSessionAgentSelection(session.id);
    if (sessionAgentSelection) return sessionAgentSelection;

    return agents[0]?.name ?? 'agent';
  }, [agents]);

  const getSessionTitle = React.useCallback((session: Session): string => {
    const title = session.title;
    if (title && title.trim()) return title;
    return 'New session';
  }, []);

  const isRunning = React.useCallback((sessionId: string): boolean => {
    const status = sessionStatus?.get(sessionId);
    return status?.type === 'busy' || status?.type === 'retry';
  }, [sessionStatus]);

  // Use server-authoritative attention state instead of local activity state
  const needsAttention = React.useCallback((sessionId: string): boolean => {
    return sessionAttentionStates?.get(sessionId)?.needsAttention ?? false;
  }, [sessionAttentionStates]);

  return { getSessionAgentName, getSessionTitle, isRunning, needsAttention };
}

function StatusIndicator({ isRunning, needsAttention }: { isRunning: boolean; needsAttention: boolean }) {
  if (isRunning) {
    return <RiLoader4Line className="h-2.5 w-2.5 animate-spin text-[var(--status-info)]" />;
  }
  if (needsAttention) {
    return <div className="h-1.5 w-1.5 rounded-full bg-[var(--status-error)]" />;
  }
  return <div className="h-1.5 w-1.5 rounded-full border border-[var(--surface-mutedForeground)]" />;
}

function RunningIndicator({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span className="flex items-center gap-0.5 text-xs text-[var(--status-info)]">
      <RiLoader4Line className="h-3 w-3 animate-spin" />
      {count} running
    </span>
  );
}

function UnreadIndicator({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span className="flex items-center gap-0.5 text-xs text-[var(--status-error)]">
      <div className="h-1.5 w-1.5 rounded-full bg-[var(--status-error)]" />
      {count} unread
    </span>
  );
}

function SessionItem({
  session,
  isCurrent,
  getSessionAgentName,
  getSessionTitle,
  onClick,
  onDoubleClick,
  needsAttention
}: {
  session: SessionWithStatus;
  isCurrent: boolean;
  getSessionAgentName: (s: Session) => string;
  getSessionTitle: (s: Session) => string;
  onClick: () => void;
  onDoubleClick?: () => void;
  needsAttention: (sessionId: string) => boolean;
}) {
  const agentName = getSessionAgentName(session);
  const agentColor = getAgentColor(agentName);
  const extraCount = (session._runningChildrenCount || 0) + (session._statusType !== 'idle' ? 1 : 0) - 1 - (session._childIndicators?.length || 0);

  return (
    <button
      type="button"
      onClick={onClick}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onDoubleClick?.();
      }}
      className={cn(
        "flex items-center gap-0.5 px-1.5 py-px text-left transition-colors",
        "hover:bg-[var(--interactive-hover)] active:bg-[var(--interactive-selection)]",
        isCurrent && "bg-[var(--interactive-selection)]/30"
      )}
    >
      <div className="flex-shrink-0 w-3 flex items-center justify-center">
        <StatusIndicator
          isRunning={session._statusType !== 'idle'}
          needsAttention={needsAttention(session.id)}
        />
      </div>

      <div
        className="flex-shrink-0 h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: `var(${agentColor.var})` }}
      />

      <span className={cn(
        "text-[13px] truncate leading-tight",
        isCurrent ? "text-[var(--interactive-selection-foreground)] font-medium" : "text-[var(--surface-foreground)]"
      )}>
        {getSessionTitle(session)}
      </span>

      {(session._childIndicators?.length || 0) > 0 && (
        <div className="flex items-center gap-0.5 text-[var(--surface-mutedForeground)]">
          <span className="text-[10px]">[</span>
          <div className="flex items-center gap-0.5">
            {session._childIndicators!.map(({ session: child }) => {
              const childColor = getAgentColor(getSessionAgentName(child));
              return (
                <div
                  key={child.id}
                  className="flex-shrink-0"
                  title={`Sub-session: ${getSessionTitle(child)}`}
                >
                  <RiLoader4Line
                    className="h-2.5 w-2.5 animate-spin"
                    style={{ color: `var(${childColor.var})` }}
                  />
                </div>
              );
            })}
            {extraCount > 0 && (
              <span className="text-[10px] text-[var(--surface-mutedForeground)]">
                +{extraCount}
              </span>
            )}
          </div>
          <span className="text-[10px]">]</span>
        </div>
      )}
    </button>
  );
}

function SessionStatusHeader({
  currentSessionTitle,
  runningCount,
  unreadCount,
  onToggle
}: {
  currentSessionTitle: string;
  runningCount: number;
  unreadCount: number;
  onToggle: () => void;
}) {
  const hasActivity = runningCount > 0 || unreadCount > 0;

  return (
    <button
      type="button"
      onClick={onToggle}
      className="w-full flex items-center justify-between px-2 py-0 text-left transition-colors hover:bg-[var(--interactive-hover)]"
    >
      <div className="flex items-center gap-1 flex-1 min-w-0 mr-2">
        <span className="text-xs text-[var(--surface-foreground)] truncate flex-1 leading-tight">
          {currentSessionTitle}
        </span>
        {hasActivity && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <RunningIndicator count={runningCount} />
            <UnreadIndicator count={unreadCount} />
          </div>
        )}
      </div>
    </button>
  );
}

function CollapsedView({
  runningCount,
  unreadCount,
  currentSessionTitle,
  onToggle,
  onNewSession
}: {
  runningCount: number;
  unreadCount: number;
  currentSessionTitle: string;
  onToggle: () => void;
  onNewSession: () => void;
}) {
  return (
    <div className="w-full flex items-center justify-between px-2 border-b border-[var(--interactive-border)] bg-[var(--surface-muted)] order-first text-left">
      <div className="flex-1 min-w-0 mr-2">
        <SessionStatusHeader
          currentSessionTitle={currentSessionTitle}
          runningCount={runningCount}
          unreadCount={unreadCount}
          onToggle={onToggle}
        />
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onNewSession();
        }}
        className="flex items-center gap-0.5 px-1.5 py-1 text-[11px] leading-tight !min-h-0 rounded border border-border/50 text-[var(--surface-foreground)] hover:bg-[var(--interactive-hover)] flex-shrink-0 self-center"
      >
        New
      </button>
    </div>
  );
}

function ExpandedView({
  sessions,
  currentSessionId,
  runningCount,
  unreadCount,
  currentSessionTitle,
  isExpanded,
  onToggleCollapse,
  onToggleExpand,
  onNewSession,
  onSessionClick,
  onSessionDoubleClick,
  getSessionAgentName,
  getSessionTitle,
  needsAttention
}: {
  sessions: SessionWithStatus[];
  currentSessionId: string;
  runningCount: number;
  unreadCount: number;
  currentSessionTitle: string;
  isExpanded: boolean;
  onToggleCollapse: () => void;
  onToggleExpand: () => void;
  onNewSession: () => void;
  onSessionClick: (id: string) => void;
  onSessionDoubleClick?: () => void;
  getSessionAgentName: (s: Session) => string;
  getSessionTitle: (s: Session) => string;
  needsAttention: (sessionId: string) => boolean;
}) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [collapsedHeight, setCollapsedHeight] = React.useState<number | null>(null);
  const [hasMeasured, setHasMeasured] = React.useState(false);

  React.useEffect(() => {
    if (containerRef.current && !hasMeasured && !isExpanded) {
      setCollapsedHeight(containerRef.current.offsetHeight);
      setHasMeasured(true);
    }
  }, [hasMeasured, isExpanded]);

  const previewHeight = collapsedHeight ?? undefined;
  const displaySessions = hasMeasured || isExpanded ? sessions : sessions.slice(0, 3);

  return (
    <div className="w-full border-b border-[var(--interactive-border)] bg-[var(--surface-muted)] order-first">
      <div className="flex items-center justify-between px-2 py-0">
        <div className="flex-1 min-w-0 mr-2">
          <SessionStatusHeader
            currentSessionTitle={currentSessionTitle}
            runningCount={runningCount}
            unreadCount={unreadCount}
            onToggle={onToggleCollapse}
          />
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onNewSession();
            }}
            className="flex items-center gap-0.5 px-1.5 py-1 text-[11px] leading-tight !min-h-0 rounded border border-border/50 text-[var(--surface-foreground)] hover:bg-[var(--interactive-hover)] self-start"
          >
            New
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand();
            }}
            className="text-[11px] leading-tight px-1.5 py-1 !min-h-0 rounded border border-border/50 text-[var(--surface-mutedForeground)] hover:text-[var(--surface-foreground)] hover:bg-[var(--interactive-hover)] self-start"
          >
            {isExpanded ? 'Less' : 'More'}
          </button>
        </div>
      </div>

      <div
        ref={containerRef}
        className="flex flex-col overflow-y-auto"
        style={{ maxHeight: isExpanded ? '60vh' : previewHeight }}
      >
        {displaySessions.map((session) => (
          <SessionItem
            key={session.id}
            session={session}
            isCurrent={session.id === currentSessionId}
            getSessionAgentName={getSessionAgentName}
            getSessionTitle={getSessionTitle}
            onClick={() => onSessionClick(session.id)}
            onDoubleClick={onSessionDoubleClick}
            needsAttention={needsAttention}
          />
        ))}
      </div>
    </div>
  );
}

export const MobileSessionStatusBar: React.FC<MobileSessionStatusBarProps> = ({
  onSessionSwitch,
}) => {
  const sessions = useSessionStore((state) => state.sessions);
  const currentSessionId = useSessionStore((state) => state.currentSessionId);
  const sessionStatus = useSessionStore((state) => state.sessionStatus);
  const sessionAttentionStates = useSessionStore((state) => state.sessionAttentionStates);
  const setCurrentSession = useSessionStore((state) => state.setCurrentSession);
  const createSession = useSessionStore((state) => state.createSession);
  const agents = useConfigStore((state) => state.agents);
  const { isMobile, isMobileSessionStatusBarCollapsed, setIsMobileSessionStatusBarCollapsed } = useUIStore();
  const setActiveMainTab = useUIStore((state) => state.setActiveMainTab);
  const [isExpanded, setIsExpanded] = React.useState(false);

  const { sessions: sortedSessions, totalRunning, totalUnread, totalCount } = useSessionGrouping(sessions, sessionStatus, sessionAttentionStates);
  const { getSessionAgentName, getSessionTitle, needsAttention } = useSessionHelpers(agents, sessionStatus, sessionAttentionStates);

  const currentSession = sessions.find((s) => s.id === currentSessionId);
  const currentSessionTitle = currentSession ? getSessionTitle(currentSession) : 'New session';

  if (!isMobile || totalCount === 0) {
    return null;
  }

  const handleSessionClick = (sessionId: string) => {
    setCurrentSession(sessionId);
    onSessionSwitch?.(sessionId);
    setIsExpanded(false);
  };

  const handleSessionDoubleClick = () => {
    // On double-tap, switch to the Chat tab
    setActiveMainTab('chat');
  };

  const handleCreateSession = async () => {
    const newSession = await createSession();
    if (newSession) {
      setCurrentSession(newSession.id);
      onSessionSwitch?.(newSession.id);
    }
  };

  if (isMobileSessionStatusBarCollapsed) {
    return (
      <CollapsedView
        runningCount={totalRunning}
        unreadCount={totalUnread}
        currentSessionTitle={currentSessionTitle}
        onToggle={() => setIsMobileSessionStatusBarCollapsed(false)}
        onNewSession={handleCreateSession}
      />
    );
  }

  return (
    <ExpandedView
      sessions={sortedSessions}
      currentSessionId={currentSessionId ?? ''}
      runningCount={totalRunning}
      unreadCount={totalUnread}
      currentSessionTitle={currentSessionTitle}
      isExpanded={isExpanded}
      onToggleCollapse={() => {
        setIsMobileSessionStatusBarCollapsed(true);
        setIsExpanded(false);
      }}
      onToggleExpand={() => setIsExpanded(!isExpanded)}
      onNewSession={handleCreateSession}
      onSessionClick={handleSessionClick}
      onSessionDoubleClick={handleSessionDoubleClick}
      getSessionAgentName={getSessionAgentName}
      getSessionTitle={getSessionTitle}
      needsAttention={needsAttention}
    />
  );
};
