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
  MessageSquare, 
  MoreVertical, 
  Trash2, 
  Edit2,
  Check,
  X
} from 'lucide-react';
import { useSessionStore } from '@/stores/useSessionStore';
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
    loadSessions
  } = useSessionStore();

  // Load sessions on mount
  React.useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const handleCreateSession = async () => {
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

  return (
    <div className="flex flex-col h-full bg-sidebar">
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
              <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
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
        <div className="py-2 px-2 space-y-1">
          {sessions.length === 0 ? (
            <div className="text-center py-12 px-4 text-muted-foreground">
              <MessageSquare className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p className="text-sm font-medium">No sessions yet</p>
              <p className="text-xs mt-1 opacity-75">Create one to get started</p>
            </div>
          ) : (
            sessions.map((session) => (
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
                  <div className="flex items-center gap-1 p-2">
                    <Input
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveEdit();
                        if (e.key === 'Escape') handleCancelEdit();
                      }}
                      className="h-8 text-sm"
                      autoFocus
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 flex-shrink-0"
                      onClick={handleSaveEdit}
                    >
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 flex-shrink-0"
                      onClick={handleCancelEdit}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ) : (
                  <div className="relative">
                    <button
                      onClick={() => setCurrentSession(session.id)}
                      className="w-full flex items-start gap-2 text-left p-2 pr-9 rounded-lg transition-colors hover:bg-background/5"
                    >
                      <MessageSquare className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                      <div className="flex-1 overflow-hidden">
                        <div className="text-sm font-medium truncate">
                          {session.title || 'Untitled Session'}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5 opacity-75">
                          {formatDate(session.time?.created || Date.now())}
                        </div>
                      </div>
                    </button>
                    
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="absolute right-1 top-2 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <MoreVertical className="h-3.5 w-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40">
                          <DropdownMenuItem 
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEditSession(session);
                            }}
                          >
                            <Edit2 className="h-4 w-4 mr-2" />
                            Rename
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteSession(session.id);
                            }}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
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