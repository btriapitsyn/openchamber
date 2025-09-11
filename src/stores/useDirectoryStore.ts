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
  goHome: () => Promise<void>;
}

// Store the home directory once we fetch it
let cachedHomeDirectory: string | null = null;

// Get home directory
const getHomeDirectory = () => {
  // In browser, we'll default to saved directory or cached home
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('lastDirectory');
    if (saved) return saved;
    
    // Use cached home directory if available
    if (cachedHomeDirectory) return cachedHomeDirectory;
    
    // Try to get from localStorage
    const storedHome = localStorage.getItem('homeDirectory');
    if (storedHome) {
      cachedHomeDirectory = storedHome;
      return storedHome;
    }
  }
  // Default fallback - will be updated when we get system info
  return process?.cwd?.() || '/';
};

// Initialize home directory from system info
const initializeHomeDirectory = async () => {
  try {
    const info = await opencodeClient.getSystemInfo();
    cachedHomeDirectory = info.homeDirectory;
    if (typeof window !== 'undefined') {
      localStorage.setItem('homeDirectory', info.homeDirectory);
    }
    return info.homeDirectory;
  } catch (error) {
    console.warn('Failed to get home directory:', error);
    return getHomeDirectory();
  }
};

// Initialize home directory on app start
if (typeof window !== 'undefined') {
  initializeHomeDirectory();
}

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
          console.log('Directory changed to:', path, 'Reloading sessions...');
          useSessionStore.getState().loadSessions();
        }).catch(err => {
          console.error('Failed to reload sessions:', err);
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
        const homeDir = cachedHomeDirectory || getHomeDirectory();
        
        // Handle different path formats
        if (currentDirectory === homeDir || currentDirectory === '/') {
          return; // Already at root or home
        }
        
        // Remove trailing slash if present
        const cleanPath = currentDirectory.endsWith('/') 
          ? currentDirectory.slice(0, -1) 
          : currentDirectory;
        
        // Find parent
        const lastSlash = cleanPath.lastIndexOf('/');
        if (lastSlash === -1) {
          const home = cachedHomeDirectory || getHomeDirectory();
          setDirectory(home);
        } else if (lastSlash === 0) {
          setDirectory('/');
        } else {
          setDirectory(cleanPath.substring(0, lastSlash));
        }
      },

      // Go to home directory
      goHome: async () => {
        const homeDir = cachedHomeDirectory || await initializeHomeDirectory();
        get().setDirectory(homeDir);
      }
    }),
    {
      name: 'directory-store'
    }
  )
);