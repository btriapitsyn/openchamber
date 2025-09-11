import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Home, 
  ChevronLeft, 
  ChevronRight, 
  ChevronUp,
  Folder,
  FolderOpen
} from 'lucide-react';
import { useDirectoryStore } from '@/stores/useDirectoryStore';
import { cn } from '@/lib/utils';

export const DirectoryNav: React.FC = () => {
  const [isEditing, setIsEditing] = React.useState(false);
  const [editPath, setEditPath] = React.useState('');
  
  const {
    currentDirectory,
    directoryHistory,
    historyIndex,
    setDirectory,
    goBack,
    goForward,
    goToParent,
    goHome
  } = useDirectoryStore();

  const canGoBack = historyIndex > 0;
  const canGoForward = historyIndex < directoryHistory.length - 1;
  const canGoUp = currentDirectory !== '~/' && currentDirectory !== '/';

  const handleEditStart = () => {
    // Show ~ in edit mode for user convenience
    setEditPath(currentDirectory.replace('/Users/btriapitsyn', '~'));
    setIsEditing(true);
  };

  const handleEditComplete = () => {
    if (editPath.trim()) {
      // Convert ~ back to absolute path
      const fullPath = editPath.trim().replace(/^~/, '/Users/btriapitsyn');
      setDirectory(fullPath);
    }
    setIsEditing(false);
  };

  const handleEditCancel = () => {
    setIsEditing(false);
    setEditPath('');
  };

  const formatPath = (path: string) => {
    // Replace home directory with ~ for display
    const displayPath = path.replace('/Users/btriapitsyn', '~');
    
    // Truncate long paths for display
    if (displayPath.length > 40) {
      const parts = displayPath.split('/');
      if (parts.length > 3) {
        return `${parts[0]}/.../${parts.slice(-2).join('/')}`;
      }
    }
    return displayPath;
  };

  return (
    <div className="px-3 py-2 border-b dark:border-white/[0.05] bg-sidebar-accent/30" title="Directory navigation (visual only - sessions are not filtered by directory)">
      <div className="flex items-center gap-1">
        {/* Navigation buttons */}
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          onClick={goBack}
          disabled={!canGoBack}
          title="Go back"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
        
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          onClick={goForward}
          disabled={!canGoForward}
          title="Go forward"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
        
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          onClick={goToParent}
          disabled={!canGoUp}
          title="Go to parent directory"
        >
          <ChevronUp className="h-3.5 w-3.5" />
        </Button>
        
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          onClick={goHome}
          title="Go to home directory"
        >
          <Home className="h-3.5 w-3.5" />
        </Button>

        {/* Directory path */}
        <div className="flex-1 flex items-center gap-1.5 ml-1">
          <FolderOpen className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
          {isEditing ? (
            <Input
              value={editPath}
              onChange={(e) => setEditPath(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleEditComplete();
                if (e.key === 'Escape') handleEditCancel();
              }}
              onBlur={handleEditComplete}
              className="h-6 text-xs px-2"
              autoFocus
            />
          ) : (
            <button
              onClick={handleEditStart}
              className={cn(
                "flex-1 text-left text-xs font-medium text-muted-foreground",
                "hover:text-foreground transition-colors truncate",
                "px-2 py-0.5 rounded hover:bg-background/50"
              )}
              title={currentDirectory}
            >
              {formatPath(currentDirectory)}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};