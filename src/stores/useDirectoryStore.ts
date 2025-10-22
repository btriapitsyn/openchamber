import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { opencodeClient } from '@/lib/opencode/client';
import type { DirectorySwitchResult } from '@/lib/opencode/client';
import { getDesktopHomeDirectory } from '@/lib/desktop';
import { updateDesktopSettings } from '@/lib/persistence';
import { startConfigUpdate, finishConfigUpdate, updateConfigUpdateMessage } from '@/lib/configUpdate';
import { getSafeStorage } from './utils/safeStorage';

interface DirectoryStore {
  // State
  currentDirectory: string;
  directoryHistory: string[];
  historyIndex: number;
  homeDirectory: string;
  hasPersistedDirectory: boolean;

  // Actions
  setDirectory: (path: string, options?: { showOverlay?: boolean }) => void;
  goBack: () => void;
  goForward: () => void;
  goToParent: () => void;
  goHome: () => Promise<void>;
  synchronizeHomeDirectory: (path: string) => void;
}

// Store the home directory once we fetch it
let cachedHomeDirectory: string | null = null;
const safeStorage = getSafeStorage();
const persistedLastDirectory = safeStorage.getItem('lastDirectory');
const initialHasPersistedDirectory =
  typeof persistedLastDirectory === 'string' && persistedLastDirectory.length > 0;

const notifyOpenCodeWorkingDirectory = (path: string, options?: { showOverlay?: boolean }) => {
  const showOverlay = options?.showOverlay ?? true;
  if (showOverlay) {
    startConfigUpdate('Switching project directory…');
  }

  return opencodeClient.setOpenCodeWorkingDirectory(path).catch((error) => {
    console.warn('Failed to synchronize OpenCode working directory:', error);
    throw error;
  });
};

const scheduleDirectoryFollowUp = (
  restartPromise: Promise<DirectorySwitchResult | null>,
  options: { showOverlay: boolean }
) => {
  const { showOverlay } = options;

  const reloadSessions = () => {
    import('@/stores/useSessionStore')
      .then(({ useSessionStore }) => {
        useSessionStore.getState().loadSessions();
      })
      .catch((err) => {
        console.error('Failed to reload sessions after directory change:', err);
      });
  };

  void (async () => {
    let result: DirectorySwitchResult | null = null;

    try {
      result = await restartPromise;
    } catch (error) {
      console.error('Failed to update OpenCode working directory:', error);
      if (showOverlay) {
        updateConfigUpdateMessage('Failed to switch directory. Please try again.');
        await new Promise((resolve) => setTimeout(resolve, 1500));
        finishConfigUpdate();
      }
      reloadSessions();
      return;
    }

    try {
      if (result && result.restarted) {
        try {
          if (typeof window !== 'undefined' && window.localStorage) {
            window.localStorage.removeItem('commands-store');
          }
        } catch (storageError) {
          console.warn('Failed to reset commands-store cache:', storageError);
        }

        const { refreshAfterOpenCodeRestart } = await import('@/stores/useAgentsStore');
        await refreshAfterOpenCodeRestart({ message: 'Refreshing OpenCode configuration…' });

        try {
          const { useCommandsStore } = await import('@/stores/useCommandsStore');
          await useCommandsStore.getState().loadCommands();

          try {
            const { emitConfigChange } = await import('@/lib/configSync');
            emitConfigChange('commands', { source: 'useCommandsStore' });
          } catch (syncError) {
            console.warn('Failed to emit command configuration change:', syncError);
          }
        } catch (commandError) {
          console.warn('Failed to reload commands after directory change:', commandError);
        }
      } else if (showOverlay) {
        finishConfigUpdate();
      }
    } catch (error) {
      console.error('Failed to refresh configuration after directory change:', error);
      if (showOverlay) {
        updateConfigUpdateMessage('Failed to refresh configuration. Please reload manually.');
        await new Promise((resolve) => setTimeout(resolve, 1500));
        finishConfigUpdate();
      }
    } finally {
      reloadSessions();
    }
  })();
};

// Get home directory
const getHomeDirectory = () => {
  // In browser, we'll default to saved directory or cached home
  if (typeof window !== 'undefined') {
    const saved = safeStorage.getItem('lastDirectory');
    if (saved) return saved;
    
    // Use cached home directory if available
    if (cachedHomeDirectory) return cachedHomeDirectory;

    const desktopHome =
      (typeof window.__OPENCHAMBER_HOME__ === 'string' && window.__OPENCHAMBER_HOME__.length > 0
        ? window.__OPENCHAMBER_HOME__
        : window.opencodeDesktop && typeof window.opencodeDesktop.homeDirectory === 'string'
          ? window.opencodeDesktop.homeDirectory
          : null);

    if (desktopHome && desktopHome.length > 0) {
      cachedHomeDirectory = desktopHome;
      safeStorage.setItem('homeDirectory', desktopHome);
      return desktopHome;
    }
    
    // Try to get from localStorage
    const storedHome = safeStorage.getItem('homeDirectory');
    if (storedHome) {
      cachedHomeDirectory = storedHome;
      return storedHome;
    }
  }
  // Default fallback - will be updated when we get system info
  const nodeHome = typeof process !== 'undefined' && process?.env?.HOME;
  if (nodeHome) {
    return nodeHome;
  }
  return process?.cwd?.() || '/';
};

// Initialize home directory from system info
const initializeHomeDirectory = async () => {
  try {
    const info = await opencodeClient.getSystemInfo();
    cachedHomeDirectory = info.homeDirectory;
    if (typeof window !== 'undefined') {
      safeStorage.setItem('homeDirectory', info.homeDirectory);
    }
    void updateDesktopSettings({ homeDirectory: info.homeDirectory });
    return info.homeDirectory;
  } catch (error) {
    console.warn('Failed to get home directory:', error);
  }

  try {
    const desktopHome = await getDesktopHomeDirectory();
    if (desktopHome) {
      cachedHomeDirectory = desktopHome;
      if (typeof window !== 'undefined') {
        safeStorage.setItem('homeDirectory', desktopHome);
      }
      void updateDesktopSettings({ homeDirectory: desktopHome });
      return desktopHome;
    }
  } catch (desktopError) {
    console.warn('Failed to obtain desktop-integrated home directory:', desktopError);
  }

  return getHomeDirectory();
};

const initialHomeDirectory = getHomeDirectory();
if (initialHomeDirectory) {
  opencodeClient.setDirectory(initialHomeDirectory);
}

export const useDirectoryStore = create<DirectoryStore>()(
  devtools(
    (set, get) => ({
      // Initial State
      currentDirectory: initialHomeDirectory,
      directoryHistory: [initialHomeDirectory],
      historyIndex: 0,
      homeDirectory: initialHomeDirectory,
      hasPersistedDirectory: initialHasPersistedDirectory,

      // Set directory
      setDirectory: (path: string, options?: { showOverlay?: boolean }) => {
        const showOverlay = options?.showOverlay ?? true;

        // Update the OpenCode client immediately
        opencodeClient.setDirectory(path);
        const restartPromise = notifyOpenCodeWorkingDirectory(path, { showOverlay });
        
        set((state) => {
          // Add to history, removing any forward history
          const newHistory = [...state.directoryHistory.slice(0, state.historyIndex + 1), path];
          
          // Save to storage
          safeStorage.setItem('lastDirectory', path);

          void updateDesktopSettings({ lastDirectory: path });
          
          return {
            currentDirectory: path,
            directoryHistory: newHistory,
            historyIndex: newHistory.length - 1,
            hasPersistedDirectory: true
          };
        });

        scheduleDirectoryFollowUp(restartPromise, { showOverlay });
      },

      // Go back in history
      goBack: () => {
        const state = get();
        if (state.historyIndex > 0) {
          const newIndex = state.historyIndex - 1;
          const newDirectory = state.directoryHistory[newIndex];
          
          // Update the OpenCode client
          opencodeClient.setDirectory(newDirectory);
          const restartPromise = notifyOpenCodeWorkingDirectory(newDirectory);
          
          safeStorage.setItem('lastDirectory', newDirectory);

          void updateDesktopSettings({ lastDirectory: newDirectory });

          set({
            currentDirectory: newDirectory,
            historyIndex: newIndex,
            hasPersistedDirectory: true
          });

          scheduleDirectoryFollowUp(restartPromise, { showOverlay: true });
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
          const restartPromise = notifyOpenCodeWorkingDirectory(newDirectory);
          
          safeStorage.setItem('lastDirectory', newDirectory);

          void updateDesktopSettings({ lastDirectory: newDirectory });

          set({
            currentDirectory: newDirectory,
            historyIndex: newIndex,
            hasPersistedDirectory: true
          });

          scheduleDirectoryFollowUp(restartPromise, { showOverlay: true });
        }
      },

      // Go to parent directory
      goToParent: () => {
        const { currentDirectory, setDirectory } = get();
        const homeDir = cachedHomeDirectory || get().homeDirectory || getHomeDirectory();
        
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
        const homeDir =
          cachedHomeDirectory ||
          get().homeDirectory ||
          (await initializeHomeDirectory());
        get().setDirectory(homeDir);
      },

      // Synchronize home directory with resolved path
      synchronizeHomeDirectory: (homePath: string) => {
        const state = get();
        const resolvedHome = homePath;
        cachedHomeDirectory = resolvedHome;
        const needsUpdate = state.homeDirectory !== resolvedHome;
        const savedLastDirectory = safeStorage.getItem('lastDirectory');
        const hasSavedLastDirectory = typeof savedLastDirectory === 'string' && savedLastDirectory.length > 0;
        const shouldReplaceCurrent =
          !hasSavedLastDirectory &&
          (
            state.currentDirectory === '/' ||
            state.currentDirectory === state.homeDirectory ||
            !state.currentDirectory
          );

        if (!needsUpdate && !shouldReplaceCurrent) {
          return;
        }

        const updates: Partial<DirectoryStore> = {
          homeDirectory: resolvedHome,
          hasPersistedDirectory: hasSavedLastDirectory
        };

        if (shouldReplaceCurrent) {
          updates.currentDirectory = resolvedHome;
          updates.directoryHistory = [resolvedHome];
          updates.historyIndex = 0;
        }

        set(() => updates as Partial<DirectoryStore>);

        if (shouldReplaceCurrent) {
          opencodeClient.setDirectory(resolvedHome);
          const restartPromise = notifyOpenCodeWorkingDirectory(resolvedHome, { showOverlay: false });
          scheduleDirectoryFollowUp(restartPromise, { showOverlay: false });
        }

        void updateDesktopSettings({ homeDirectory: resolvedHome });
      }
    }),
    {
      name: 'directory-store'
    }
  )
);

// Initialize home directory on app start and sync with store
if (typeof window !== 'undefined') {
  initializeHomeDirectory().then((home) => {
    useDirectoryStore.getState().synchronizeHomeDirectory(home);
  });
}
