import React from 'react';
import { Button } from '@/components/ui/button';
import { 
  ChevronLeft, 
  ChevronRight, 
  ChevronUp,
  Home
} from 'lucide-react';
import { useDirectoryStore } from '@/stores/useDirectoryStore';
import { DirectoryTree } from './DirectoryTree';

export const DirectoryNav: React.FC = () => {
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
  const canGoUp = currentDirectory !== '/' && currentDirectory.includes('/');

  return (
    <div className="px-2 py-1.5 border-b dark:border-white/[0.05] bg-sidebar-accent/30">
      <div className="flex items-center gap-1">
        {/* Navigation buttons */}
        <div className="flex items-center gap-0.5">
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
        </div>

        {/* Directory tree dropdown */}
        <div className="flex-1 min-w-0">
          <DirectoryTree 
            currentPath={currentDirectory}
            onSelectPath={setDirectory}
          />
        </div>
      </div>
    </div>
  );
};