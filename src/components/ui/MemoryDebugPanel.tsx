import React from 'react';
import { useSessionStore, MEMORY_LIMITS } from '@/stores/useSessionStore';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Xmark as X, Trash as Trash2, Activity, Database } from 'iconoir-react';

interface MemoryDebugPanelProps {
  onClose?: () => void;
}

export const MemoryDebugPanel: React.FC<MemoryDebugPanelProps> = ({ onClose }) => {
  const { 
    sessions, 
    messages, 
    sessionMemoryState, 
    currentSessionId,
    trimToViewportWindow,
    evictLeastRecentlyUsed
  } = useSessionStore();

  // Calculate total messages in memory
  const totalMessages = React.useMemo(() => {
    let total = 0;
    messages.forEach((sessionMessages) => {
      total += sessionMessages.length;
    });
    return total;
  }, [messages]);

  // Get session stats
  const sessionStats = React.useMemo(() => {
    return sessions.map(session => {
      const messageCount = messages.get(session.id)?.length || 0;
      const memoryState = sessionMemoryState.get(session.id);
      return {
        id: session.id,
        title: session.title || 'Untitled',
        messageCount,
        isStreaming: memoryState?.isStreaming || false,
        isZombie: memoryState?.isZombie || false,
        backgroundCount: memoryState?.backgroundMessageCount || 0,
        lastAccessed: memoryState?.lastAccessedAt || 0,
        isCurrent: session.id === currentSessionId
      };
    }).sort((a, b) => b.lastAccessed - a.lastAccessed);
  }, [sessions, messages, sessionMemoryState, currentSessionId]);

  const cachedSessionCount = messages.size;

  return (
    <Card className="fixed bottom-4 right-4 w-96 p-4 shadow-lg z-50 bg-background/95 backdrop-blur bottom-safe-area">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4" />
          <h3 className="font-semibold typography-ui-label">Memory Debug Panel</h3>
        </div>
        {onClose && (
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      <div className="space-y-3">
        {/* Summary Stats */}
        <div className="grid grid-cols-2 gap-2 typography-meta">
          <div className="bg-muted/50 rounded p-2">
            <div className="text-muted-foreground">Total Messages</div>
            <div className="typography-markdown font-semibold">{totalMessages}</div>
          </div>
          <div className="bg-muted/50 rounded p-2">
            <div className="text-muted-foreground">Cached Sessions</div>
            <div className="typography-markdown font-semibold">{cachedSessionCount} / {MEMORY_LIMITS.MAX_SESSIONS}</div>
          </div>
        </div>

        {/* Memory Limits */}
        <div className="typography-meta space-y-1 border-t pt-2">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Viewport Window:</span>
            <span>{MEMORY_LIMITS.VIEWPORT_MESSAGES} messages</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Background Stream Limit:</span>
            <span>{MEMORY_LIMITS.BACKGROUND_STREAMING_BUFFER} messages</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Zombie Timeout:</span>
            <span>{MEMORY_LIMITS.ZOMBIE_TIMEOUT / 1000 / 60} minutes</span>
          </div>
        </div>

        {/* Session Details */}
        <div className="border-t pt-2">
          <div className="typography-meta font-semibold mb-1">Sessions in Memory:</div>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {sessionStats.map(stat => (
              <div 
                key={stat.id} 
                className={`typography-meta p-1.5 rounded flex items-center justify-between ${
                  stat.isCurrent ? 'bg-primary/10' : 'bg-muted/30'
                }`}
              >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <span className="truncate">{stat.title}</span>
                  {stat.isStreaming && (
                    <Activity className="h-3 w-3 text-primary animate-pulse" />
                  )}
                  {stat.isZombie && (
                    <span className="text-warning">⚠️</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`font-mono ${
                    stat.messageCount > MEMORY_LIMITS.VIEWPORT_MESSAGES ? 'text-warning' : ''
                  }`}>
                    {stat.messageCount} msgs
                  </span>
                  {stat.backgroundCount > 0 && (
                    <span className="text-primary">+{stat.backgroundCount}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-2 border-t">
          <Button
            size="sm"
            variant="outline"
            className="typography-meta"
            onClick={() => {
              if (currentSessionId) {
                trimToViewportWindow(currentSessionId, 10);
              }
            }}
          >
            <Trash2 className="h-3 w-3 mr-1" />
            Force Trim (10)
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="typography-meta"
            onClick={() => {
              evictLeastRecentlyUsed();
              
            }}
          >
            Evict LRU
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="typography-meta"
            onClick={() => {
              // Log memory state for debugging
            }}
          >
            Log State
          </Button>
        </div>
      </div>
    </Card>
  );
};