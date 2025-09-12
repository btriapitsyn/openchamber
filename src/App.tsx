import React from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { ThemeProvider } from '@/components/providers/ThemeProvider';
import { Toaster } from '@/components/ui/sonner';
import { useEventStream } from '@/hooks/useEventStream';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useConfigStore } from '@/stores/useConfigStore';
import { useSessionStore } from '@/stores/useSessionStore';
import { useDirectoryStore } from '@/stores/useDirectoryStore';
import { opencodeClient } from '@/lib/opencode/client';

function App() {
  const { initializeApp, loadProviders } = useConfigStore();
  const { error, clearError, loadSessions } = useSessionStore();
  const { currentDirectory } = useDirectoryStore();
  
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
  
  // Show error toasts
  React.useEffect(() => {
    if (error) {
      // Using console.error for now, will be replaced with toast
      console.error('Error:', error);
      setTimeout(() => clearError(), 5000);
    }
  }, [error, clearError]);

  return (
    <ThemeProvider>
      <div className="h-full bg-background text-foreground">
        <MainLayout />
        <Toaster />
      </div>
    </ThemeProvider>
  );
}

export default App;