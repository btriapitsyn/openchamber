import { useUIStore, type TypographySizes } from '@/stores/useUIStore';

let started = false;

const applyTypographySizes = (sizes: TypographySizes): void => {
  if (typeof document === 'undefined') {
    return;
  }
  const root = document.documentElement;
  Object.entries(sizes).forEach(([key, value]) => {
    const cssVarName = `--text-${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`;
    root.style.setProperty(cssVarName, value);
  });
};

export const startTypographyWatcher = (): void => {
  if (started || typeof window === 'undefined') {
    return;
  }
  started = true;

  let previous = useUIStore.getState().typographySizes;
  applyTypographySizes(previous);

  useUIStore.subscribe((state) => {
    const next = state.typographySizes;
    if (next === previous) {
      return;
    }
    let changed = false;
    const keys = Object.keys(next) as Array<keyof TypographySizes>;
    for (const key of keys) {
      if (next[key] !== previous[key]) {
        changed = true;
        break;
      }
    }
    if (!changed) {
      return;
    }
    previous = next;
    applyTypographySizes(next);
  });
};
