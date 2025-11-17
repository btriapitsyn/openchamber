import { useUIStore } from '@/stores/useUIStore';
import { updateDesktopSettings } from '@/lib/persistence';
import type { DesktopSettings } from '@/lib/desktop';

type AppearanceSlice = {
  markdownDisplayMode: DesktopSettings['markdownDisplayMode'];
  showReasoningTraces: boolean;
};

let initialized = false;

export const startAppearanceAutoSave = (): void => {
  if (initialized || typeof window === 'undefined') {
    return;
  }

  initialized = true;

  let previous: AppearanceSlice = {
    markdownDisplayMode: useUIStore.getState().markdownDisplayMode,
    showReasoningTraces: useUIStore.getState().showReasoningTraces,
  };

  let pending: Partial<DesktopSettings> | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    const payload = pending;
    pending = null;
    timer = null;
    if (payload && Object.keys(payload).length > 0) {
      void updateDesktopSettings(payload);
    }
  };

  const schedule = (changes: Partial<DesktopSettings>) => {
    pending = { ...(pending ?? {}), ...changes };
    if (timer) {
      return;
    }
    timer = setTimeout(flush, 150);
  };

  useUIStore.subscribe((state) => {
    const current: AppearanceSlice = {
      markdownDisplayMode: state.markdownDisplayMode,
      showReasoningTraces: state.showReasoningTraces,
    };

    const diff: Partial<DesktopSettings> = {};

    if (current.markdownDisplayMode !== previous.markdownDisplayMode) {
      diff.markdownDisplayMode = current.markdownDisplayMode as DesktopSettings['markdownDisplayMode'];
    }

    if (current.showReasoningTraces !== previous.showReasoningTraces) {
      diff.showReasoningTraces = current.showReasoningTraces;
    }

    previous = current;

    if (Object.keys(diff).length > 0) {
      schedule(diff);
    }
  });
};
