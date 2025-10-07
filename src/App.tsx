import React from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { ThemeProvider } from '@/components/providers/ThemeProvider';
import { ThemeSystemProvider } from '@/contexts/ThemeSystemContext';
import { PhosphorIconProvider } from '@/contexts/PhosphorIconContext';
import { Toaster } from '@/components/ui/sonner';
import { MemoryDebugPanel } from '@/components/ui/MemoryDebugPanel';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { ChatErrorBoundary } from '@/components/chat/ChatErrorBoundary';
import { useEventStream } from '@/hooks/useEventStream';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useMessageSync } from '@/hooks/useMessageSync';
import { useConfigStore } from '@/stores/useConfigStore';
import { useSessionStore } from '@/stores/useSessionStore';
import { useDirectoryStore } from '@/stores/useDirectoryStore';
import { opencodeClient } from '@/lib/opencode/client';
import { useMarkdownDisplayMode } from '@/hooks/useMarkdownDisplayMode';
import { MARKDOWN_MODE_VARIABLES } from '@/lib/markdownDisplayModes';

function App() {
  const { initializeApp, loadProviders, isInitialized } = useConfigStore();
  const { error, clearError, loadSessions } = useSessionStore();
  const { currentDirectory } = useDirectoryStore();
  const [showMemoryDebug, setShowMemoryDebug] = React.useState(false);
  const [markdownMode] = useMarkdownDisplayMode();
  
  React.useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }
    const root = document.documentElement;
    root.setAttribute('data-markdown-mode', markdownMode);
    const variables = MARKDOWN_MODE_VARIABLES[markdownMode] ?? MARKDOWN_MODE_VARIABLES.compact;
    Object.entries(variables).forEach(([key, value]) => {
      root.style.setProperty(key, value);
    });
  }, [markdownMode]);
  
  // Hide initial loading screen once app is fully initialized
  React.useEffect(() => {
    if (isInitialized) {
      const hideInitialLoading = () => {
        const loadingElement = document.getElementById('initial-loading');
        if (loadingElement) {
          loadingElement.classList.add('fade-out');
          // Remove element after fade transition completes
          setTimeout(() => {
            loadingElement.remove();
          }, 300);
        }
      };

      // Small delay to ensure UI is rendered
      const timer = setTimeout(hideInitialLoading, 150);
      return () => clearTimeout(timer);
    }
  }, [isInitialized]);

  // Fallback: hide loading screen after reasonable time even if not initialized
  React.useEffect(() => {
    const fallbackTimer = setTimeout(() => {
      const loadingElement = document.getElementById('initial-loading');
      if (loadingElement && !isInitialized) {
        loadingElement.classList.add('fade-out');
        setTimeout(() => {
          loadingElement.remove();
        }, 300);
      }
    }, 5000);

    return () => clearTimeout(fallbackTimer);
  }, [isInitialized]);
  
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
      // Using toast for error display
      setTimeout(() => clearError(), 5000);
    }
  }, [error, clearError]);

  return (
    <ErrorBoundary>
      <PhosphorIconProvider>
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
      </PhosphorIconProvider>
    </ErrorBoundary>
  );
}

export default App;
