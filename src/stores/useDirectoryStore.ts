import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { opencodeClient } from '@/lib/opencode/client';

interface DirectoryStore {
  // State
  currentDirectory: string;
  directoryHistory: string[];
  historyIndex: number;

  // Actions
  setDirectory: (path: string) => void;
  goBack: () => void;
  goForward: () => void;
  goToParent: () => void;
  goHome: () => void;
}

// Get home directory
const getHomeDirectory = () => {
  // In browser, we'll default to user's home path
  // This will be replaced with actual path from backend if needed
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('lastDirectory');
    // Convert ~ to actual home path for macOS
    if (saved?.startsWith('~')) {
      return saved.replace('~', '/Users/btriapitsyn');
    }
    return saved || '/Users/btriapitsyn';
  }
  return '/Users/btriapitsyn';
};

export const useDirectoryStore = create<DirectoryStore>()(
  devtools(
    (set, get) => ({
      // Initial State
      currentDirectory: getHomeDirectory(),
      directoryHistory: [getHomeDirectory()],
      historyIndex: 0,

      // Set directory
      setDirectory: (path: string) => {
        // Update the OpenCode client immediately
        opencodeClient.setDirectory(path);
        
        set((state) => {
          // Add to history, removing any forward history
          const newHistory = [...state.directoryHistory.slice(0, state.historyIndex + 1), path];
          
          // Save to localStorage
          if (typeof window !== 'undefined') {
            localStorage.setItem('lastDirectory', path);
          }
          
          return {
            currentDirectory: path,
            directoryHistory: newHistory,
            historyIndex: newHistory.length - 1
          };
        });
        
        // Force reload sessions after directory change
        // Import the session store here to avoid circular dependency at module level
        import('@/stores/useSessionStore').then(({ useSessionStore }) => {
          useSessionStore.getState().loadSessions();
        });
      },

      // Go back in history
      goBack: () => {
        const state = get();
        if (state.historyIndex > 0) {
          const newIndex = state.historyIndex - 1;
          const newDirectory = state.directoryHistory[newIndex];
          
          // Update the OpenCode client
          opencodeClient.setDirectory(newDirectory);
          
          if (typeof window !== 'undefined') {
            localStorage.setItem('lastDirectory', newDirectory);
          }
          
          set({
            currentDirectory: newDirectory,
            historyIndex: newIndex
          });
          
          // Force reload sessions
          import('@/stores/useSessionStore').then(({ useSessionStore }) => {
            useSessionStore.getState().loadSessions();
          });
        }
      },

      // Go forward in history
      goForward: () => {
        const state = get();
        if (state.historyIndex < state.directoryHistory.length - 1) {
          const newIndex = state.historyIndex + 1;
          const newDirectory = state.directoryHistory[newIndex];
          
          // Update the OpenCode client
          opencodeClient.setDirectory(newDirectory);
          
          if (typeof window !== 'undefined') {
            localStorage.setItem('lastDirectory', newDirectory);
          }
          
          set({
            currentDirectory: newDirectory,
            historyIndex: newIndex
          });
          
          // Force reload sessions
          import('@/stores/useSessionStore').then(({ useSessionStore }) => {
            useSessionStore.getState().loadSessions();
          });
        }
      },

      // Go to parent directory
      goToParent: () => {
        const { currentDirectory, setDirectory } = get();
        
        // Handle different path formats
        if (currentDirectory === '/Users/btriapitsyn' || currentDirectory === '/') {
          return; // Already at root
        }
        
        // Remove trailing slash if present
        const cleanPath = currentDirectory.endsWith('/') 
          ? currentDirectory.slice(0, -1) 
          : currentDirectory;
        
        // Find parent
        const lastSlash = cleanPath.lastIndexOf('/');
        if (lastSlash === -1) {
          setDirectory('/Users/btriapitsyn');
        } else if (lastSlash === 0) {
          setDirectory('/');
        } else {
          setDirectory(cleanPath.substring(0, lastSlash));
        }
      },

      // Go to home directory
      goHome: () => {
        get().setDirectory('/Users/btriapitsyn');
      }
    }),
    {
      name: 'directory-store'
    }
  )
);