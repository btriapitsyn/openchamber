
import React, { useId } from "react";
import { useThemeSystem } from '@/contexts/ThemeSystemContext';

type GlyphVariant = 'dark' | 'light' | 'auto';

interface OpenChamberGlyphProps {
  className?: string;
  width?: number;
  height?: number;
  variant?: GlyphVariant;
}

const paletteByVariant = {
  dark: {
    rect: '#4B4646',
    gradient: ['#F8F8F8', '#DAD6D0', '#BAB4AF'],
    stroke: ['rgba(255,255,255,0.08)', 'rgba(0,0,0,0.15)', 'rgba(0,0,0,0.2)'],
  },
  light: {
    rect: '#CFCDCD',
    gradient: ['#B3AEA6', '#928E86', '#6E6A63'],
    stroke: ['rgba(255,255,255,0.22)', 'rgba(60,56,47,0.25)', 'rgba(43,39,34,0.4)'],
  },
} as const;

export const OpenChamberGlyph: React.FC<OpenChamberGlyphProps> = ({
  className = '',
  width = 96,
  height = 96,
  variant = 'auto',
}) => {
  let themeVariant: 'dark' | 'light' = 'dark';
  try {
    const { currentTheme } = useThemeSystem();
    themeVariant = currentTheme.metadata.variant === 'light' ? 'light' : 'dark';
  } catch {
    if (typeof window !== 'undefined') {
      themeVariant = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
  }

  const resolvedVariant = variant === 'auto' ? themeVariant : variant;
  const palette = paletteByVariant[resolvedVariant] ?? paletteByVariant.dark;
  const id = useId();
  const gradientId = `${id}-glyph-gradient`;
  const strokeId = `${id}-glyph-stroke`;

  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 70 70"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="OpenChamber glyph"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={palette.gradient[0]} />
          <stop offset="55%" stopColor={palette.gradient[1]} />
          <stop offset="100%" stopColor={palette.gradient[2]} />
        </linearGradient>
        <linearGradient id={strokeId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={palette.stroke[0]} />
          <stop offset="45%" stopColor={palette.stroke[1]} />
          <stop offset="100%" stopColor={palette.stroke[2]} />
        </linearGradient>
      </defs>
      <rect x="8.75" y="31" width="17.5" height="20.5" fill={palette.rect} />
      <path
        d="M0 13H35V58H0V13ZM26.25 22.1957H8.75V48.701H26.25V22.1957Z"
        fill={`url(#${gradientId})`}
        stroke={`url(#${strokeId})`}
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
      <path
        d="M43.75 13H70V22.1957H52.5V48.701H70V57.8967H43.75V13Z"
        fill={`url(#${gradientId})`}
        stroke={`url(#${strokeId})`}
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
    </svg>
  );
};
