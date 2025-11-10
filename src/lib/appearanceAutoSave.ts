import { useUIStore } from '@/stores/useUIStore';
import { updateDesktopSettings } from '@/lib/persistence';
import type { DesktopSettings } from '@/lib/desktop';
import type { TypographySizes } from '@/stores/useUIStore';

type AppearanceSlice = {
  uiFont: DesktopSettings['uiFont'];
  monoFont: DesktopSettings['monoFont'];
  markdownDisplayMode: DesktopSettings['markdownDisplayMode'];
  typographySizes: TypographySizes;
};

const typographyKeys: Array<keyof TypographySizes> = ['markdown', 'code', 'uiHeader', 'uiLabel', 'meta', 'micro'];

const typographySizesEqual = (a: TypographySizes, b: TypographySizes): boolean =>
  typographyKeys.every((key) => a[key] === b[key]);

let initialized = false;

export const startAppearanceAutoSave = (): void => {
  if (initialized || typeof window === 'undefined') {
    return;
  }

  initialized = true;

  let previous: AppearanceSlice = {
    uiFont: useUIStore.getState().uiFont,
    monoFont: useUIStore.getState().monoFont,
    markdownDisplayMode: useUIStore.getState().markdownDisplayMode,
    typographySizes: useUIStore.getState().typographySizes,
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
      uiFont: state.uiFont,
      monoFont: state.monoFont,
      markdownDisplayMode: state.markdownDisplayMode,
      typographySizes: state.typographySizes,
    };

    const diff: Partial<DesktopSettings> = {};

    if (current.uiFont !== previous.uiFont) {
      diff.uiFont = current.uiFont;
    }

    if (current.monoFont !== previous.monoFont) {
      diff.monoFont = current.monoFont;
    }

    if (current.markdownDisplayMode !== previous.markdownDisplayMode) {
      diff.markdownDisplayMode = current.markdownDisplayMode as DesktopSettings['markdownDisplayMode'];
    }

    if (!typographySizesEqual(current.typographySizes, previous.typographySizes)) {
      diff.typographySizes = current.typographySizes;
    }

    previous = current;

    if (Object.keys(diff).length > 0) {
      schedule(diff);
    }
  });
};
