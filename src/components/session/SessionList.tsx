import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Plus,
  ChatCircleText as MessagesSquare,
  DotsThreeVertical as MoreVertical,
  Trash as Trash2,
  PencilSimple as Edit2,
  Check,
  X,
  WarningCircle as AlertTriangle,
  Circle,
  Export as Share2,
  Copy,
  LinkBreak as Link2Off,
  CaretDown as ChevronDown,
  CaretUp as ChevronUp,
} from '@phosphor-icons/react';
import { useSessionStore } from '@/stores/useSessionStore';
import { useDirectoryStore } from '@/stores/useDirectoryStore';
import { useConfigStore } from '@/stores/useConfigStore';
import { useUIStore } from '@/stores/useUIStore';
import { useDeviceInfo } from '@/lib/device';
import { DirectoryTree } from './DirectoryTree';
import { cn } from '@/lib/utils';
import type { Session } from '@opencode-ai/sdk';

export const SessionList: React.FC = () => {
  const [newSessionTitle, setNewSessionTitle] = React.useState('');
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editTitle, setEditTitle] = React.useState('');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = React.useState(false);
  const [isDirectoryPickerOpen, setIsDirectoryPickerOpen] = React.useState(false);

  const {
    currentSessionId,
    createSession,
    deleteSession,
    setCurrentSession,
    updateSessionTitle,
    shareSession,
    unshareSession,
    loadSessions,
    getSessionsByDirectory,
    sessionMemoryState,
    initializeNewWebUISession
  } = useSessionStore();

  const { currentDirectory, setDirectory } = useDirectoryStore();
  const { agents } = useConfigStore();
  const { setSidebarOpen } = useUIStore();
  const { isMobile } = useDeviceInfo();

  // Load sessions on mount and when directory changes
  React.useEffect(() => {
    loadSessions();
  }, [loadSessions, currentDirectory]);

  const handleCreateSession = async () => {
    // Directory is now handled globally via the directory store
    const session = await createSession(newSessionTitle || undefined);
    if (session) {
      // Initialize new WebUI session with agent defaults
      initializeNewWebUISession(session.id, agents);

      setNewSessionTitle('');
      setIsCreateDialogOpen(false);
    }
  };

  const handleDeleteSession = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this session?')) {
      await deleteSession(id);
    }
  };

  const handleEditSession = (session: Session) => {
    setEditingId(session.id);
    setEditTitle(session.title || '');
  };

  const handleSaveEdit = async () => {
    if (editingId && editTitle.trim()) {
      await updateSessionTitle(editingId, editTitle.trim());
      setEditingId(null);
      setEditTitle('');
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditTitle('');
  };

  const handleShareSession = async (session: Session) => {
    const result = await shareSession(session.id);
    if (result && result.share?.url) {
      toast.success('Session shared successfully', {
        description: 'Share URL has been generated and can be copied from the menu.'
      });
    } else {
      toast.error('Failed to share session');
    }
  };

  const handleCopyShareUrl = (url: string) => {
    navigator.clipboard.writeText(url).then(() => {
      toast.success('Share URL copied to clipboard');
    }).catch(() => {
      toast.error('Failed to copy URL to clipboard');
    });
  };

  const handleUnshareSession = async (sessionId: string) => {
    const result = await unshareSession(sessionId);
    if (result) {
      toast.success('Session unshared', {
        description: 'The share link is no longer active.'
      });
    } else {
      toast.error('Failed to unshare session');
    }
  };

  const formatDateFull = (dateString: string | number) => {
    const date = new Date(dateString);
    const formatted = date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
    // Remove comma after day
    return formatted.replace(',', '');
  };

  // Group sessions by date
  const groupSessionsByDate = (sessions: Session[]) => {
    const groups = new Map<string, Session[]>();

    sessions.forEach((session) => {
      const dateKey = formatDateFull(session.time?.created || Date.now());
      if (!groups.has(dateKey)) {
        groups.set(dateKey, []);
      }
      groups.get(dateKey)!.push(session);
    });

    // Sort groups by date (newest first) and convert to array
    return Array.from(groups.entries())
      .sort((a, b) => {
        const dateA = new Date(a[1][0].time?.created || 0);
        const dateB = new Date(b[1][0].time?.created || 0);
        return dateB.getTime() - dateA.getTime();
      });
  };

  // Filter sessions by current directory
  const directorySessions = getSessionsByDirectory(currentDirectory);

  // Group sessions by date
  const groupedSessions = React.useMemo(
    () => groupSessionsByDate(directorySessions),
    [directorySessions]
  );

  const shortDirectory = React.useMemo(() => {
    if (!currentDirectory || currentDirectory === '/') {
      return '/';
    }
    const segments = currentDirectory.split('/').filter(Boolean);
    return segments.length ? segments[segments.length - 1] : currentDirectory;
  }, [currentDirectory]);

  return (
    <div className="flex h-full flex-col bg-sidebar">
      <div className={cn('border-b border-border/40 px-3 dark:border-white/10', isMobile ? 'mt-2 py-3' : 'py-3')}>
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h2 className="typography-ui-label font-semibold text-foreground">Sessions</h2>
            <span className="typography-meta text-muted-foreground">
              {directorySessions.length} total
            </span>
          </div>
          <div className="rounded-md border border-border/40 bg-sidebar/60">
            <button
              type="button"
              onClick={() => setIsDirectoryPickerOpen((prev) => !prev)}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-sidebar-accent/40"
              aria-expanded={isDirectoryPickerOpen}
            >
              <div className="flex flex-col">
                <span className="typography-micro text-muted-foreground">Project directory</span>
                <span className="typography-ui-label font-medium text-foreground truncate" title={currentDirectory || '/'}>
                  {shortDirectory}
                </span>
              </div>
              {isDirectoryPickerOpen ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </button>
            {isDirectoryPickerOpen && (
              <div className="px-2 pb-2">
                <DirectoryTree
                  variant="inline"
                  currentPath={currentDirectory}
                  onSelectPath={(path) => {
                    setDirectory(path);
                    if (isMobile) {
                      setIsDirectoryPickerOpen(false);
                    }
                  }}
                  className="max-h-64"
                />
              </div>
            )}
          </div>
        </div>
      </div>

      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          <div className="space-y-1 px-3 py-2">
            <DialogTrigger asChild>
              <Button
                variant="ghost"
                className="w-full justify-start gap-2 rounded-lg border border-dashed border-primary/40 bg-primary/10 text-primary hover:bg-primary/15"
              >
                <Plus className="h-4 w-4 flex-shrink-0"  weight="bold"/>
                <span className="typography-ui-label font-medium">New Session</span>
              </Button>
            </DialogTrigger>

            {directorySessions.length === 0 ? (
              <div className="py-12 px-4 text-center text-muted-foreground">
                <MessagesSquare className="mx-auto mb-3 h-10 w-10 opacity-50" />
                <p className="typography-ui-label font-medium">No sessions in this directory</p>
                <p className="typography-meta mt-1 opacity-75">Start one to begin working here</p>
              </div>
            ) : (
              <>
                {groupedSessions.map(([dateLabel, sessions], groupIndex) => (
                  <React.Fragment key={dateLabel}>
                    {/* Date Header */}
                    <div className={cn(
                      "typography-micro px-2 pb-1 text-muted-foreground",
                      groupIndex === 0 ? "pt-2" : "pt-3"
                    )}>
                      {dateLabel}
                    </div>

                    {/* Sessions in this date group */}
                    {sessions.map((session) => (
                      <div
                        key={session.id}
                        className={cn(
                          "group rounded-lg transition-all duration-200",
                          currentSessionId === session.id
                            ? "bg-sidebar-accent shadow-sm"
                            : "hover:bg-sidebar-accent/50"
                        )}
                      >
                        {editingId === session.id ? (
                  <div className="flex items-center gap-1 py-1.5 px-2">
                    <Input
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveEdit();
                        if (e.key === 'Escape') handleCancelEdit();
                      }}
                      className="h-6 typography-meta"
                      autoFocus
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 flex-shrink-0"
                      onClick={handleSaveEdit}
                    >
                      <Check className="h-3.5 w-3.5"  weight="bold"/>
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 flex-shrink-0"
                      onClick={handleCancelEdit}
                    >
                      <X className="h-3.5 w-3.5"  weight="bold"/>
                    </Button>
                  </div>
                ) : (
                  <div className="relative">
                    <div className="w-full flex items-center justify-between py-1.5 px-2 pr-1 rounded-lg transition-colors hover:bg-background/5">
                      <button
                        onClick={() => {
                          setCurrentSession(session.id);
                          // Auto-hide sidebar on mobile after session selection
                          if (isMobile) {
                            setSidebarOpen(false);
                          }
                        }}
                        className="flex-1 text-left overflow-hidden"
                        inputMode="none"
                        tabIndex={0}
                      >
                        <div className="flex items-center gap-2">
                          <div className="typography-ui-header font-medium truncate flex-1">
                            {session.title || 'Untitled Session'}
                          </div>

                          {/* Share indicator */}
                          {session.share && (
                            <div className="flex items-center" title="Session is shared">
                              <Share2 className="h-3 w-3 text-blue-500" />
                            </div>
                          )}

                          {/* Streaming and memory state indicators */}
                          {(() => {
                            const memoryState = sessionMemoryState.get(session.id);
                            if (!memoryState) return null;

                            // Show zombie warning
                            if (memoryState.isZombie) {
                              return (
                                <div className="flex items-center gap-1" title="Stream timeout - may be incomplete">
                                  <AlertTriangle className="h-3 w-3 text-warning" />
                                </div>
                              );
                            }

                            // Show streaming indicator for background sessions
                            if (memoryState.isStreaming && session.id !== currentSessionId) {
                              return (
                                <div className="flex items-center gap-1">
                                  <Circle className="h-2 w-2 fill-primary text-primary animate-pulse"  weight="regular"/>
                                  {memoryState.backgroundMessageCount > 0 && (
                                    <span className="typography-micro bg-primary/20 text-primary px-1.5 py-0.5 rounded-full font-medium">
                                      {memoryState.backgroundMessageCount}
                                    </span>
                                  )}
                                </div>
                              );
                            }

                            return null;
                          })()}
                        </div>
                      </button>

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 flex-shrink-0 -mr-1 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100"
                          >
                            <MoreVertical weight="regular" className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-fit min-w-20">
                          <div className="px-2 py-1.5 typography-meta text-muted-foreground border-b border-border mb-1 text-center">
                            {formatDateFull(session.time?.created || Date.now())}
                          </div>
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEditSession(session);
                            }}
                          >
                            <Edit2 className="h-4 w-4 mr-px" />
                            Rename
                          </DropdownMenuItem>

                          {/* Share options */}
                          {!session.share ? (
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                handleShareSession(session);
                              }}
                            >
                              <Share2 className="h-4 w-4 mr-px" />
                              Share
                            </DropdownMenuItem>
                          ) : (
                            <>
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (session.share?.url) {
                                    handleCopyShareUrl(session.share.url);
                                  }
                                }}
                              >
                                <Copy className="h-4 w-4 mr-px" />
                                Copy Share URL
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleUnshareSession(session.id);
                                }}
                              >
                                <Link2Off className="h-4 w-4 mr-px" />
                                Unshare
                              </DropdownMenuItem>
                            </>
                          )}

                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteSession(session.id);
                            }}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="h-4 w-4 mr-px" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                )}
                      </div>
                    ))}
                  </React.Fragment>
                ))}
              </>
            )}
          </div>
        </div>

        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Session</DialogTitle>
            <DialogDescription>
              Enter a title for your new session (optional)
            </DialogDescription>
          </DialogHeader>
          <Input
            value={newSessionTitle}
            onChange={(e) => setNewSessionTitle(e.target.value)}
            placeholder="Session title..."
            className="text-foreground placeholder:text-muted-foreground"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleCreateSession();
              }
            }}
          />
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setIsCreateDialogOpen(false)}
              className="text-foreground hover:bg-muted hover:text-foreground"
            >
              Cancel
            </Button>
            <Button onClick={handleCreateSession}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// Custom comparison function for SessionList memoization
const areSessionListPropsEqual = () => {
  // SessionList doesn't receive direct props - it uses store hooks internally
  // The memoization will prevent re-renders when parent component updates
  // but the actual data hasn't changed due to store state stability
  return true;
};

export const MemoizedSessionList = React.memo(SessionList, areSessionListPropsEqual);
