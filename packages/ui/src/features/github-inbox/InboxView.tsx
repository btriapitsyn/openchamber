import React, { useEffect, useState } from 'react';
import { useRuntimeAPIs } from '@/hooks/useRuntimeAPIs';
import type { GitHubInboxItem } from '@/lib/api/types';
import { RiCheckLine, RiTimeLine, RiGitPullRequestLine, RiErrorWarningLine, RiGitMergeLine } from '@remixicon/react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useStartWork } from '@/features/issue-work/useStartWork';
import { useUIStore } from '@/stores/useUIStore';

export const InboxView: React.FC = () => {
  const { github } = useRuntimeAPIs();
  const [items, setItems] = useState<GitHubInboxItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('all');
  const [snoozing, setSnoozing] = useState<Set<string>>(new Set());
  const { startWork, loading: startingWork } = useStartWork();
  const setActiveMainTab = useUIStore((s) => s.setActiveMainTab);

  const fetchInbox = React.useCallback(async () => {
    if (!github?.inboxList) return;
    setLoading(true);
    try {
      const res = await github.inboxList();
      if (res.ok && res.data) {
        setItems(res.data.items);
      } else {
        setError(res.error?.message || 'Failed to fetch inbox');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch inbox');
    } finally {
      setLoading(false);
    }
  }, [github]);

  useEffect(() => {
    void fetchInbox();
    const timer = setInterval(fetchInbox, 60000);
    return () => clearInterval(timer);
  }, [fetchInbox]);

  const handleSnooze = async (id: string, days: number) => {
    if (!github?.inboxSnooze) return;
    setSnoozing((prev) => new Set(prev).add(id));
    const until = Date.now() + days * 24 * 60 * 60 * 1000;
    try {
      await github.inboxSnooze(id, until);
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch {
      // ignore
    } finally {
      setSnoozing((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleMarkDone = async (item: GitHubInboxItem) => {
    if (!github?.inboxMarkDone || !item.notificationId) {
      // If it's a PR generated item without a notification ID, just snooze it for a long time
      await handleSnooze(item.id, 365);
      return;
    }
    setSnoozing((prev) => new Set(prev).add(item.id));
    try {
      await github.inboxMarkDone(item.notificationId);
      setItems((prev) => prev.filter((i) => i.id !== item.id));
    } catch {
      // ignore
    } finally {
      setSnoozing((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }
  };

  const handleStartWork = async (item: GitHubInboxItem) => {
    if (item.number) {
      try {
        await startWork(item.number);
        setActiveMainTab('chat');
        await handleMarkDone(item);
      } catch {
        // ignore
      }
    }
  };

  const filteredItems = items.filter((item) => {
    if (filter === 'all') return true;
    if (filter === 'review_requested') return item.reason === 'review_requested';
    if (filter === 'assigned') return item.reason === 'assign';
    if (filter === 'mentioned') return item.reason === 'mention';
    if (filter === 'ci_failing') return item.reason === 'ci_failing';
    if (filter === 'stale') return item.reason === 'stale';
    if (filter === 'ready_to_merge') return item.reason === 'ready_to_merge';
    return true;
  });

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-[hsl(var(--border))] p-2">
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="flex-1 h-7 typography-micro">
            <SelectValue placeholder="Filter..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Notifications</SelectItem>
            <SelectItem value="review_requested">Review Requested</SelectItem>
            <SelectItem value="assigned">Assigned</SelectItem>
            <SelectItem value="mentioned">Mentioned</SelectItem>
            <SelectItem value="ci_failing">CI Failing</SelectItem>
            <SelectItem value="stale">Stale PRs</SelectItem>
            <SelectItem value="ready_to_merge">Ready to Merge</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="ghost" size="sm" onClick={fetchInbox} disabled={loading} className="h-7 px-2 typography-micro">
          {loading ? '...' : 'Refresh'}
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {error && <div className="text-[hsl(var(--status-error))] typography-micro mb-2">{error}</div>}
        {filteredItems.length === 0 && !loading && (
          <div className="text-center text-[hsl(var(--muted-foreground))] typography-micro mt-4">
            Inbox is empty.
          </div>
        )}
        <div className="flex flex-col gap-2 p-1">
          {filteredItems.map((item) => (
            <div key={item.id} className="flex flex-col gap-2 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-2.5">
              <div className="flex items-start gap-2">
                {item.reason === 'stale' && <RiTimeLine className="size-4 shrink-0 text-[hsl(var(--status-warning))]" />}
                {item.reason === 'ci_failing' && <RiErrorWarningLine className="size-4 shrink-0 text-[hsl(var(--status-error))]" />}
                {item.reason === 'ready_to_merge' && <RiGitMergeLine className="size-4 shrink-0 text-[hsl(var(--status-success))]" />}
                {['stale', 'ci_failing', 'ready_to_merge'].indexOf(item.reason) === -1 && <RiGitPullRequestLine className="size-4 shrink-0 text-[hsl(var(--muted-foreground))]" />}
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="typography-micro font-medium text-[hsl(var(--foreground))] truncate">{item.repoFullName}</span>
                    <span className="typography-micro text-[hsl(var(--muted-foreground))] opacity-80 whitespace-nowrap">
                      {new Date(item.updatedAt).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="typography-micro text-[hsl(var(--muted-foreground))] break-words line-clamp-2 mt-0.5">
                    {item.title}
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-1.5 mt-1">
                {item.number && (
                  <Button 
                    variant="secondary" 
                    size="sm" 
                    className="h-6 typography-micro px-2"
                    onClick={() => handleStartWork(item)}
                    disabled={startingWork || snoozing.has(item.id)}
                  >
                    Start Work
                  </Button>
                )}

                <div className="ml-auto flex items-center gap-1">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-6 w-6 p-0 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
                    onClick={() => handleMarkDone(item)}
                    disabled={snoozing.has(item.id)}
                    title="Mark Done"
                  >
                    <RiCheckLine className="size-3.5" />
                  </Button>
                  
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-6 w-6 p-0 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
                    onClick={() => handleSnooze(item.id, 1)}
                    disabled={snoozing.has(item.id)}
                    title="Snooze 1d"
                  >
                    <RiTimeLine className="size-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
