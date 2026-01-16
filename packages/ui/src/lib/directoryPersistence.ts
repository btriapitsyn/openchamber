import { isVSCodeRuntime } from '@/lib/desktop';
import { useDirectoryStore } from '@/stores/useDirectoryStore';

export const applyPersistedDirectoryPreferences = async (): Promise<void> => {
  if (typeof window === 'undefined') {
    return;
  }

  let savedHome: string | null = null;
  let savedDirectory: string | null = null;

  try {
    savedHome = window.localStorage.getItem('homeDirectory');
    savedDirectory = window.localStorage.getItem('lastDirectory');
  } catch (error) {
    console.warn('Failed to read saved directory preferences:', error);
  }

  const directoryStore = useDirectoryStore.getState();

  if (savedHome && directoryStore.homeDirectory !== savedHome) {
    directoryStore.synchronizeHomeDirectory(savedHome);
  }

  if (savedDirectory && !isVSCodeRuntime()) {
    directoryStore.setDirectory(savedDirectory, { showOverlay: false });
  }
};
