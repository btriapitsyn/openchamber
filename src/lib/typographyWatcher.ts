import { SEMANTIC_TYPOGRAPHY } from '@/lib/typography';

let started = false;

const applySemanticTypography = (): void => {
  if (typeof document === 'undefined') {
    return;
  }
  const root = document.documentElement;
  Object.entries(SEMANTIC_TYPOGRAPHY).forEach(([key, value]) => {
    const cssVarName = `--text-${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`;
    root.style.setProperty(cssVarName, value);
  });
};

/**
 * Applies default typography sizes to CSS variables.
 * Typography sizes are no longer configurable - uses hardcoded comfortable defaults.
 */
export const startTypographyWatcher = (): void => {
  if (started || typeof window === 'undefined') {
    return;
  }
  started = true;

  // Apply semantic typography sizes once on startup
  applySemanticTypography();
};
