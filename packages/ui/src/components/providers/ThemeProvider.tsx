import React from 'react';
import { useUIStore } from '@/stores/useUIStore';

interface ThemeProviderProps {
  children: React.ReactNode;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  const { fontSize, applyTypography, padding, applyPadding } = useUIStore();

  React.useLayoutEffect(() => {
    applyTypography();
    applyPadding();
  }, [fontSize, applyTypography, padding, applyPadding]);

  return <>{children}</>;
};
