import React, { useState, useEffect } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { ThemeProvider } from '@/components/providers/ThemeProvider';
import { ThemeSystemProvider } from '@/contexts/ThemeSystemContext';
import { Toaster } from '@/components/ui/sonner';
import { MemoryDebugPanel } from '@/components/ui/MemoryDebugPanel';
import LoginPage from '@/components/ui/LoginPage'; // Import LoginPage
import { useEventStream } from '@/hooks/useEventStream';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useMessageSync } from '@/hooks/useMessageSync';
import { useConfigStore } from '@/stores/useConfigStore';
import { useSessionStore } from '@/stores/useSessionStore';
import { useDirectoryStore } from '@/stores/useDirectoryStore';
import { opencodeClient } from '@/lib/opencode/client';

function App() {
  const { initializeApp, loadProviders, isInitialized } = useConfigStore();
  const { error, clearError, loadSessions } = useSessionStore();
  const { currentDirectory } = useDirectoryStore();
  const [showMemoryDebug, setShowMemoryDebug] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authRequired, setAuthRequired] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    const checkAuthStatus = async () => {
      try {
        const response = await fetch('/auth-status');
        const data = await response.json();
        setIsAuthenticated(data.isAuthenticated);
        setAuthRequired(data.requiresAuth);
      } catch (err) {
        console.error('Failed to fetch auth status:', err);
        setIsAuthenticated(false);
        setAuthRequired(true); // Assume auth is required if status cannot be fetched
      } finally {
        setAuthLoading(false);
      }
    };
    checkAuthStatus();
  }, []);

  // Hide initial loading screen once app is fully initialized AND auth is resolved
  useEffect(() => {
    if (isInitialized && !authLoading) {
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
  }, [isInitialized, authLoading]);

  // Fallback: hide loading screen after reasonable time even if not initialized or auth not resolved
  useEffect(() => {
    const fallbackTimer = setTimeout(() => {
      const loadingElement = document.getElementById('initial-loading');
      if (loadingElement && (!isInitialized || authLoading)) {
        console.warn('Fallback: hiding loading screen after 5s timeout');
        loadingElement.classList.add('fade-out');
        setTimeout(() => {
          loadingElement.remove();
        }, 300);
      }
    }, 5000);

    return () => clearTimeout(fallbackTimer);
  }, [isInitialized, authLoading]);
  
  // Initialize app on mount - ALWAYS initialize OpenCode functionality
  useEffect(() => {
    const init = async () => {
      await initializeApp();
      await loadProviders();
    };

    init();
  }, [initializeApp, loadProviders]);

  // Update OpenCode client whenever directory changes and load sessions - ALWAYS keep synced
  useEffect(() => {
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
  useEffect(() => {
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
  useEffect(() => {
    if (error) {
      // Using console.error for now, will be replaced with toast
      console.error('Error:', error);
      setTimeout(() => clearError(), 5000);
    }
  }, [error, clearError]);

  if (authLoading) {
    return null; // Or a loading spinner
  }

  return (
    <ThemeSystemProvider>
      <ThemeProvider>
        {authRequired && !isAuthenticated ? (
          <LoginPage />
        ) : (
          <div className="h-full bg-background text-foreground">
            <MainLayout />
            <Toaster />
            {showMemoryDebug && (
              <MemoryDebugPanel onClose={() => setShowMemoryDebug(false)} />
            )}
          </div>
        )}
      </ThemeProvider>
    </ThemeSystemProvider>
  );
}

export default App;
