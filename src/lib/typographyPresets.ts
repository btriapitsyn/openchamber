import type { TypographySizes } from '@/stores/useUIStore';

/**
 * Typography Scale Presets
 * Predefined typography size configurations for quick selection
 */

export type TypographyScale = 'compact' | 'default' | 'comfortable' | 'large';

export interface TypographyScaleOption {
  id: TypographyScale;
  label: string;
  description: string;
  sizes: TypographySizes;
}

/**
 * Compact Scale - Smaller sizes for dense information display
 * Good for power users and large screens
 */
const COMPACT_SCALE: TypographySizes = {
  markdown: '0.8125rem',   // 13px
  code: '0.6875rem',       // 11px
  uiHeader: '0.75rem',     // 12px
  uiLabel: '0.6875rem',    // 11px
  meta: '0.6875rem',       // 11px
  micro: '0.625rem',       // 10px
};

/**
 * Default Scale - Standard sizes matching design system
 * Balanced for most use cases
 */
const DEFAULT_SCALE: TypographySizes = {
  markdown: '0.875rem',    // 14px
  code: '0.7rem',          // 11.2px
  uiHeader: '0.8125rem',   // 13px
  uiLabel: '0.75rem',      // 12px
  meta: '0.75rem',         // 12px
  micro: '0.6875rem',      // 11px
};

/**
 * Comfortable Scale - Slightly larger for better readability
 * Good for extended reading sessions
 */
const COMFORTABLE_SCALE: TypographySizes = {
  markdown: '0.9375rem',   // 15px
  code: '0.75rem',         // 12px
  uiHeader: '0.875rem',    // 14px
  uiLabel: '0.8125rem',    // 13px
  meta: '0.8125rem',       // 13px
  micro: '0.75rem',        // 12px
};

/**
 * Large Scale - Larger sizes for accessibility
 * Recommended for vision accessibility
 */
const LARGE_SCALE: TypographySizes = {
  markdown: '1rem',        // 16px
  code: '0.8125rem',       // 13px
  uiHeader: '0.9375rem',   // 15px
  uiLabel: '0.875rem',     // 14px
  meta: '0.875rem',        // 14px
  micro: '0.8125rem',      // 13px
};

/**
 * All available typography scale presets
 */
export const TYPOGRAPHY_SCALE_OPTIONS: TypographyScaleOption[] = [
  {
    id: 'compact',
    label: 'Compact',
    description: 'Dense layout for maximum information per screen',
    sizes: COMPACT_SCALE,
  },
  {
    id: 'default',
    label: 'Default',
    description: 'Balanced sizes for general use',
    sizes: DEFAULT_SCALE,
  },
  {
    id: 'comfortable',
    label: 'Comfortable',
    description: 'Larger text for easier reading',
    sizes: COMFORTABLE_SCALE,
  },
  {
    id: 'large',
    label: 'Large',
    description: 'Maximum readability and accessibility',
    sizes: LARGE_SCALE,
  },
];

/**
 * Get typography scale by ID
 */
export function getTypographyScale(scaleId: TypographyScale): TypographySizes {
  const scale = TYPOGRAPHY_SCALE_OPTIONS.find((s) => s.id === scaleId);
  return scale?.sizes || DEFAULT_SCALE;
}

/**
 * Detect current scale from typography sizes
 * Returns the scale ID if sizes match a preset, otherwise returns 'custom'
 */
export function detectTypographyScale(
  sizes: TypographySizes
): TypographyScale | 'custom' {
  for (const option of TYPOGRAPHY_SCALE_OPTIONS) {
    const matches = Object.entries(option.sizes).every(
      ([key, value]) => sizes[key as keyof TypographySizes] === value
    );
    if (matches) {
      return option.id;
    }
  }
  return 'custom';
}
