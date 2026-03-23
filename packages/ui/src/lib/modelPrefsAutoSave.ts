import { useUIStore } from '@/stores/useUIStore';
import { updateDesktopSettings } from '@/lib/persistence';
import { isVSCodeRuntime } from '@/lib/desktop';

type ModelRef = { providerID: string; modelID: string };

const refsEqual = (a: ModelRef[], b: ModelRef[]): boolean => {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i]?.providerID !== b[i]?.providerID) return false;
    if (a[i]?.modelID !== b[i]?.modelID) return false;
  }
  return true;
};

export const startModelPrefsAutoSave = () => {
  if (typeof window === 'undefined') {
    return () => {};
  }
  if (isVSCodeRuntime()) {
    return () => {};
  }

  let timer: number | null = null;
  let lastSent: { favoriteModels: ModelRef[]; recentModels: ModelRef[] } | null = null;
  let didSkipInitial = false;

  const flush = () => {
    timer = null;
    const state = useUIStore.getState();
    const payload = { favoriteModels: state.favoriteModels, recentModels: state.recentModels };

    if (
      lastSent &&
      refsEqual(lastSent.favoriteModels, payload.favoriteModels) &&
      refsEqual(lastSent.recentModels, payload.recentModels)
    ) {
      return;
    }

    lastSent = {
      favoriteModels: payload.favoriteModels.slice(),
      recentModels: payload.recentModels.slice(),
    };

    void updateDesktopSettings(payload).catch(() => {});
  };

  const schedule = () => {
    if (!didSkipInitial) {
      didSkipInitial = true;
      return;
    }
    if (timer !== null) {
      window.clearTimeout(timer);
    }
    timer = window.setTimeout(flush, 1200);
  };

  const unsubscribe = useUIStore.subscribe((state, prevState) => {
    const next = { favoriteModels: state.favoriteModels, recentModels: state.recentModels };
    const prev = { favoriteModels: prevState.favoriteModels, recentModels: prevState.recentModels };
    if (refsEqual(next.favoriteModels, prev.favoriteModels) && refsEqual(next.recentModels, prev.recentModels)) {
      return;
    }
    schedule();
  });

  return () => {
    unsubscribe();
    if (timer !== null) {
      window.clearTimeout(timer);
    }
  };
};
