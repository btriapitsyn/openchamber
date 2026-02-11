import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { DesktopSettings } from '@/lib/desktop';
import { updateDesktopSettings } from '@/lib/persistence';
import { getSafeStorage } from './utils/safeStorage';
import { streamDebugEnabled } from '@/stores/utils/streamDebug';

interface ScratchPadStore {
  scratchPadsByProject: Record<string, string>;

  setScratchPad: (projectId: string, content: string) => void;
  synchronizeFromSettings: (settings: DesktopSettings) => void;
}

const safeStorage = getSafeStorage();
const SCRATCH_PADS_STORAGE_KEY = 'scratchPads';

const sanitizeScratchPads = (value: unknown): Record<string, string> => {
  if (!value || typeof value !== 'object') {
    return {};
  }

  const result: Record<string, string> = {};
  const candidate = value as Record<string, unknown>;

  for (const [projectId, content] of Object.entries(candidate)) {
    if (typeof content === 'string' && content.length > 0) {
      result[projectId] = content;
    }
  }

  return result;
};

const readPersistedScratchPads = (): Record<string, string> => {
  try {
    const raw = safeStorage.getItem(SCRATCH_PADS_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    return sanitizeScratchPads(JSON.parse(raw));
  } catch {
    return {};
  }
};

const cacheScratchPads = (scratchPadsByProject: Record<string, string>) => {
  try {
    safeStorage.setItem(SCRATCH_PADS_STORAGE_KEY, JSON.stringify(scratchPadsByProject));
  } catch {
    // ignored
  }
};

const persistScratchPads = (scratchPadsByProject: Record<string, string>) => {
  cacheScratchPads(scratchPadsByProject);
  void updateDesktopSettings({ scratchPads: scratchPadsByProject });
};

const initialScratchPads = readPersistedScratchPads();

export const useScratchPadStore = create<ScratchPadStore>()(
  devtools((set, get) => ({
    scratchPadsByProject: initialScratchPads,

    setScratchPad: (projectId: string, content: string) => {
      if (!projectId) {
        return;
      }

      const { scratchPadsByProject } = get();
      const nextScratchPads = { ...scratchPadsByProject };

      if (content.length === 0) {
        delete nextScratchPads[projectId];
      } else {
        nextScratchPads[projectId] = content;
      }

      set({ scratchPadsByProject: nextScratchPads });
      persistScratchPads(nextScratchPads);

      if (streamDebugEnabled()) {
        console.info('[ScratchPadStore] Updated scratch pad', projectId);
      }
    },

    synchronizeFromSettings: (settings: DesktopSettings) => {
      const incomingScratchPads = sanitizeScratchPads(settings.scratchPads ?? {});

      const current = get();
      const changed = JSON.stringify(current.scratchPadsByProject) !== JSON.stringify(incomingScratchPads);

      if (!changed) {
        return;
      }

      set({ scratchPadsByProject: incomingScratchPads });
      cacheScratchPads(incomingScratchPads);

      if (streamDebugEnabled()) {
        console.info('[ScratchPadStore] Synchronized from settings', {
          projects: Object.keys(incomingScratchPads).length,
        });
      }
    },
  }), { name: 'scratch-pad-store' })
);

if (typeof window !== 'undefined') {
  window.addEventListener('openchamber:settings-synced', (event: Event) => {
    const detail = (event as CustomEvent<DesktopSettings>).detail;
    if (detail && typeof detail === 'object') {
      useScratchPadStore.getState().synchronizeFromSettings(detail);
    }
  });
}
