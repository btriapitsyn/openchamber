import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  MessagesSquare, 
  MoreVertical, 
  Trash2, 
  Edit2,
  Check,
  X,
  AlertTriangle,
  Circle
} from 'lucide-react';
import { useSessionStore, MEMORY_LIMITS } from '@/stores/useSessionStore';
import { useDirectoryStore } from '@/stores/useDirectoryStore';
import { DirectoryNav } from './DirectoryNav';
import { cn } from '@/lib/utils';
import type { Session } from '@opencode-ai/sdk';

export const SessionList: React.FC = () => {
  const [newSessionTitle, setNewSessionTitle] = React.useState('');
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editTitle, setEditTitle] = React.useState('');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = React.useState(false);
  
  const {
    sessions,
    currentSessionId,
    createSession,
    deleteSession,
    setCurrentSession,
    updateSessionTitle,
    loadSessions,
    getSessionsByDirectory,
    sessionMemoryState
  } = useSessionStore();

  const { currentDirectory } = useDirectoryStore();

  // Load sessions on mount and when directory changes
  React.useEffect(() => {
    loadSessions();
  }, [loadSessions, currentDirectory]);

  const handleCreateSession = async () => {
    // Directory is now handled globally via the directory store
    const session = await createSession(newSessionTitle || undefined);
    if (session) {
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

  const formatDate = (dateString: string | number) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    
    if (diffHours < 1) {
      const diffMinutes = Math.floor(diffMs / (1000 * 60));
      return diffMinutes < 1 ? 'Just now' : `${diffMinutes}m ago`;
    } else if (diffHours < 24) {
      return `${diffHours}h ago`;
    } else if (diffHours < 48) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString();
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

  // Filter sessions by current directory
  const directorySessions = React.useMemo(() => {
    return getSessionsByDirectory(currentDirectory);
  }, [sessions, currentDirectory, getSessionsByDirectory]);

  return (
    <div className="flex flex-col h-full bg-sidebar">
      <DirectoryNav />
      <div className="p-3 border-b dark:border-white/[0.05]">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Chat History</h2>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button 
              className="w-full justify-start gap-2 bg-primary/10 hover:bg-primary/20 border-0" 
              variant="outline" 
              size="sm"
            >
              <Plus className="h-4 w-4" />
              <span>New Chat</span>
            </Button>
          </DialogTrigger>
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
                className="hover:bg-muted"
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

      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="py-2 pl-2 pr-1 space-y-1">
          {directorySessions.length === 0 ? (
            <div className="text-center py-12 px-4 text-muted-foreground">
              <MessagesSquare className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p className="text-sm font-medium">No sessions yet</p>
              <p className="text-xs mt-1 opacity-75">Create one to get started</p>
            </div>
          ) : (
            directorySessions.map((session) => (
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
                      className="h-6 text-[13px]"
                      autoFocus
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 flex-shrink-0"
                      onClick={handleSaveEdit}
                    >
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 flex-shrink-0"
                      onClick={handleCancelEdit}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ) : (
                  <div className="relative">
                    <div className="w-full flex items-center justify-between py-1.5 px-2 pr-1 rounded-lg transition-colors hover:bg-background/5">
                      <button
                        onClick={() => setCurrentSession(session.id)}
                        className="flex-1 text-left overflow-hidden"
                      >
                        <div className="flex items-center gap-2">
                          <div className="text-[13px] font-medium truncate flex-1">
                            {session.title || 'Untitled Session'}
                          </div>
                          
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
                                  <Circle className="h-2 w-2 fill-primary text-primary animate-pulse" />
                                  {memoryState.backgroundMessageCount > 0 && (
                                    <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded-full font-medium">
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
                            className="h-6 w-6 flex-shrink-0 -mr-1 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <MoreVertical className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-fit min-w-20">
                          <div className="px-2 py-1.5 text-xs text-muted-foreground border-b border-border mb-1 text-center">
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
            ))
          )}
        </div>
      </div>
    </div>
  );
};