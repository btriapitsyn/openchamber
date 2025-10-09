import React from 'react';
import { useUIStore } from '@/stores/useUIStore';
import type { SemanticTypographyKey } from '@/lib/typography';

/**
 * Hook for managing typography sizes
 * Applies typography sizes to CSS custom properties
 */
export function useTypographySizes() {
  const typographySizes = useUIStore((state) => state.typographySizes);
  const setTypographySize = useUIStore((state) => state.setTypographySize);
  const setTypographySizes = useUIStore((state) => state.setTypographySizes);
  const resetTypographySizes = useUIStore((state) => state.resetTypographySizes);

  // Apply typography sizes to CSS variables
  React.useEffect(() => {
    const root = document.documentElement;

    // Convert camelCase keys to kebab-case CSS variables
    Object.entries(typographySizes).forEach(([key, value]) => {
      const cssVarName = `--text-${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`;
      root.style.setProperty(cssVarName, value);
    });
  }, [typographySizes]);

  return {
    typographySizes,
    setTypographySize,
    setTypographySizes,
    resetTypographySizes,
  };
}

/**
 * Helper function to convert rem to px
 */
export function remToPx(rem: string): number {
  return parseFloat(rem) * 16;
}

/**
 * Helper function to convert px to rem
 */
export function pxToRem(px: number): string {
  return `${(px / 16).toFixed(4)}rem`;
}

/**
 * Helper function to format typography label
 */
export function formatTypographyLabel(key: SemanticTypographyKey): string {
  const labels: Record<SemanticTypographyKey, string> = {
    markdown: 'Markdown Content',
    code: 'Code Blocks',
    uiHeader: 'UI Headers',
    uiLabel: 'UI Labels',
    meta: 'Metadata',
    micro: 'Micro Text',
  };
  return labels[key] || key;
}
