import React from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { ThemeProvider } from '@/components/providers/ThemeProvider';
import { ThemeSystemProvider } from '@/contexts/ThemeSystemContext';
import { Toaster } from '@/components/ui/sonner';
import { MemoryDebugPanel } from '@/components/ui/MemoryDebugPanel';
import { useEventStream } from '@/hooks/useEventStream';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useMessageSync } from '@/hooks/useMessageSync';
import { useConfigStore } from '@/stores/useConfigStore';
import { useSessionStore } from '@/stores/useSessionStore';
import { useDirectoryStore } from '@/stores/useDirectoryStore';
import { opencodeClient } from '@/lib/opencode/client';

function App() {
  const { initializeApp, loadProviders } = useConfigStore();
  const { error, clearError, loadSessions } = useSessionStore();
  const { currentDirectory } = useDirectoryStore();
  const [showMemoryDebug, setShowMemoryDebug] = React.useState(false);
  
  // Initialize app on mount
  React.useEffect(() => {
    const init = async () => {
      await initializeApp();
      await loadProviders();
    };
    
    init();
  }, [initializeApp, loadProviders]);
  
  // Update OpenCode client whenever directory changes and load sessions
  React.useEffect(() => {
    const syncDirectoryAndSessions = async () => {
      opencodeClient.setDirectory(currentDirectory);
      // Load sessions for the current directory
      await loadSessions();
    };
    
    syncDirectoryAndSessions();
  }, [currentDirectory, loadSessions]);
  
  // Set up event streaming
  useEventStream();
  
  // Set up keyboard shortcuts
  useKeyboardShortcuts();
  
  // Set up smart message synchronization
  useMessageSync();
  
  // Add keyboard shortcut for memory debug panel (Cmd/Ctrl + Shift + M)
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'M') {
        e.preventDefault();
        setShowMemoryDebug(prev => !prev);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
  
  // Show error toasts
  React.useEffect(() => {
    if (error) {
      // Using console.error for now, will be replaced with toast
      console.error('Error:', error);
      setTimeout(() => clearError(), 5000);
    }
  }, [error, clearError]);

  return (
    <ThemeSystemProvider>
      <ThemeProvider>
        <div className="h-full bg-background text-foreground">
          <MainLayout />
          <Toaster />
          {showMemoryDebug && (
            <MemoryDebugPanel onClose={() => setShowMemoryDebug(false)} />
          )}
        </div>
      </ThemeProvider>
    </ThemeSystemProvider>
  );
}

export default App;