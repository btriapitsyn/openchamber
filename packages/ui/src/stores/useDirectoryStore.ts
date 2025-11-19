import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { opencodeClient } from '@/lib/opencode/client';
import type { DirectorySwitchResult } from '@/lib/opencode/client';
import { getDesktopHomeDirectory } from '@/lib/desktop';
import { updateDesktopSettings } from '@/lib/persistence';
import { startConfigUpdate, finishConfigUpdate, updateConfigUpdateMessage } from '@/lib/configUpdate';
import { useSessionStore } from '@/stores/useSessionStore';
import { refreshAfterOpenCodeRestart } from '@/stores/useAgentsStore';
import { useCommandsStore } from '@/stores/useCommandsStore';
import { useFileSearchStore } from '@/stores/useFileSearchStore';
import { emitConfigChange } from '@/lib/configSync';
import { getSafeStorage } from './utils/safeStorage';

interface DirectoryStore {
  // State
  currentDirectory: string;
  directoryHistory: string[];
  historyIndex: number;
  homeDirectory: string;
  hasPersistedDirectory: boolean;
  isHomeReady: boolean;
  isSwitchingDirectory: boolean;

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
  options: { showOverlay: boolean },
  onComplete?: (result: DirectorySwitchResult | null) => void
) => {
  const { showOverlay } = options;

  const reloadSessions = () => {
    try {
      useSessionStore.getState().loadSessions();
    } catch (err) {
      console.error('Failed to reload sessions after directory change:', err);
    }
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
      onComplete?.(result);
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

        await refreshAfterOpenCodeRestart({ message: 'Refreshing OpenCode configuration…' });

        try {
          await useCommandsStore.getState().loadCommands();

          try {
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
      onComplete?.(result);
      reloadSessions();
    }
  })();
};

const invalidateFileSearchCache = (scope?: string | null) => {
  try {
    useFileSearchStore.getState().invalidateDirectory(scope);
  } catch (error) {
    console.warn('Failed to invalidate file search cache:', error);
  }
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

const normalizeHomeCandidate = (value?: string | null) => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const normalized = trimmed.replace(/\\/g, '/');
  if (normalized.length > 1) {
    const withoutTrailingSlash = normalized.replace(/\/+$/, '');
    if (withoutTrailingSlash && withoutTrailingSlash.length > 0) {
      if (withoutTrailingSlash === '/') {
        return null;
      }
      return withoutTrailingSlash;
    }
  }
  if (normalized === '/' || normalized.length === 0) {
    return null;
  }
  return normalized;
};

const persistResolvedHome = (resolved: string) => {
  cachedHomeDirectory = resolved;
  if (typeof window !== 'undefined') {
    safeStorage.setItem('homeDirectory', resolved);
  }
  void updateDesktopSettings({ homeDirectory: resolved });
  return resolved;
};

// Initialize home directory by resolving from filesystem and fallbacks
const initializeHomeDirectory = async () => {
  const acceptCandidate = (candidate?: string | null) => {
    const normalized = normalizeHomeCandidate(candidate);
    return normalized ? persistResolvedHome(normalized) : null;
  };

  try {
    const fsHome = await opencodeClient.getFilesystemHome();
    const resolved = acceptCandidate(fsHome);
    if (resolved) {
      return resolved;
    }
  } catch (filesystemError) {
    console.warn('Failed to obtain filesystem home directory:', filesystemError);
  }

  try {
    const info = await opencodeClient.getSystemInfo();
    const resolved = acceptCandidate(info?.homeDirectory);
    if (resolved) {
      return resolved;
    }
  } catch (error) {
    console.warn('Failed to get home directory from system info:', error);
  }

  try {
    const desktopHome = await getDesktopHomeDirectory();
    const resolved = acceptCandidate(desktopHome);
    if (resolved) {
      return resolved;
    }
  } catch (desktopError) {
    console.warn('Failed to obtain desktop-integrated home directory:', desktopError);
  }

  const fallback = getHomeDirectory();
  const resolvedFallback = acceptCandidate(fallback);
  if (resolvedFallback) {
    return resolvedFallback;
  }

  return fallback;
};

const initialHomeDirectory = getHomeDirectory();
if (initialHomeDirectory) {
  opencodeClient.setDirectory(initialHomeDirectory);
}
const initialIsHomeReady = Boolean(initialHomeDirectory && initialHomeDirectory !== '/');

export const useDirectoryStore = create<DirectoryStore>()(
  devtools(
    (set, get) => ({
      // Initial State
      currentDirectory: initialHomeDirectory,
      directoryHistory: [initialHomeDirectory],
      historyIndex: 0,
      homeDirectory: initialHomeDirectory,
      hasPersistedDirectory: initialHasPersistedDirectory,
      isHomeReady: initialIsHomeReady,
      isSwitchingDirectory: false,

      // Set directory
      setDirectory: (path: string, options?: { showOverlay?: boolean }) => {
        console.log('[DirectoryStore] setDirectory called with path:', path);
        const showOverlay = options?.showOverlay ?? true;

        // Update the OpenCode client immediately
        opencodeClient.setDirectory(path);
        invalidateFileSearchCache();
        const restartPromise = notifyOpenCodeWorkingDirectory(path, { showOverlay });
        console.log('[DirectoryStore] notifyOpenCodeWorkingDirectory initiated');
        
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
            hasPersistedDirectory: true,
            isHomeReady: true,
            isSwitchingDirectory: true,
          };
        });

        scheduleDirectoryFollowUp(restartPromise, { showOverlay }, () => {
          set((state) => {
            if (state.currentDirectory !== path) {
              return {};
            }
            if (!state.isSwitchingDirectory) {
              return {};
            }
            return { isSwitchingDirectory: false };
          });
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
          invalidateFileSearchCache();
          const restartPromise = notifyOpenCodeWorkingDirectory(newDirectory);
          
          safeStorage.setItem('lastDirectory', newDirectory);

          void updateDesktopSettings({ lastDirectory: newDirectory });

          set({
            currentDirectory: newDirectory,
            historyIndex: newIndex,
            hasPersistedDirectory: true,
            isHomeReady: true,
            isSwitchingDirectory: true,
          });

          scheduleDirectoryFollowUp(restartPromise, { showOverlay: true }, () => {
            set((state) => {
              if (state.currentDirectory !== newDirectory) {
                return {};
              }
              if (!state.isSwitchingDirectory) {
                return {};
              }
              return { isSwitchingDirectory: false };
            });
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
          invalidateFileSearchCache();
          const restartPromise = notifyOpenCodeWorkingDirectory(newDirectory);
          
          safeStorage.setItem('lastDirectory', newDirectory);

          void updateDesktopSettings({ lastDirectory: newDirectory });

          set({
            currentDirectory: newDirectory,
            historyIndex: newIndex,
            hasPersistedDirectory: true,
            isHomeReady: true,
            isSwitchingDirectory: true,
          });

          scheduleDirectoryFollowUp(restartPromise, { showOverlay: true }, () => {
            set((state) => {
              if (state.currentDirectory !== newDirectory) {
                return {};
              }
              if (!state.isSwitchingDirectory) {
                return {};
              }
              return { isSwitchingDirectory: false };
            });
          });
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
          if (!state.isHomeReady) {
            set({ isHomeReady: true });
          }
          return;
        }

        const resolvedReady = typeof resolvedHome === 'string' && resolvedHome !== '' && resolvedHome !== '/';

        const updates: Partial<DirectoryStore> = {
          homeDirectory: resolvedHome,
          hasPersistedDirectory: hasSavedLastDirectory,
          isHomeReady: resolvedReady
        };

        if (shouldReplaceCurrent) {
          updates.currentDirectory = resolvedHome;
          updates.directoryHistory = [resolvedHome];
          updates.historyIndex = 0;
          updates.isSwitchingDirectory = true;
        }

        set(() => updates as Partial<DirectoryStore>);

        if (shouldReplaceCurrent && resolvedReady) {
          opencodeClient.setDirectory(resolvedHome);
          invalidateFileSearchCache();
          safeStorage.setItem('lastDirectory', resolvedHome);
          void updateDesktopSettings({ lastDirectory: resolvedHome });

          const restartPromise = notifyOpenCodeWorkingDirectory(resolvedHome, { showOverlay: false });
          scheduleDirectoryFollowUp(restartPromise, { showOverlay: false }, () => {
            set((state) => {
              if (state.currentDirectory !== resolvedHome) {
                return {};
              }
              if (!state.isSwitchingDirectory) {
                return {};
              }
              return { isSwitchingDirectory: false };
            });
          });
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
