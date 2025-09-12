import React from 'react';
import { useSessionStore } from '@/stores/useSessionStore';
import { useUIStore } from '@/stores/useUIStore';

export const useKeyboardShortcuts = () => {
  const { createSession, abortCurrentOperation } = useSessionStore();
  const { toggleCommandPalette, setTheme, theme } = useUIStore();

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl + X - Open command palette
      if (e.ctrlKey && e.key === 'x') {
        e.preventDefault();
        toggleCommandPalette();
      }

      // Command/Ctrl + N - New session
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault();
        createSession();
      }

      // Command/Ctrl + / - Toggle theme
      if ((e.metaKey || e.ctrlKey) && e.key === '/') {
        e.preventDefault();
        const themes: Array<'light' | 'dark' | 'system'> = ['light', 'dark', 'system'];
        const currentIndex = themes.indexOf(theme);
        const nextIndex = (currentIndex + 1) % themes.length;
        setTheme(themes[nextIndex]);
      }

      // Escape - Abort current operation
      if (e.key === 'Escape') {
        abortCurrentOperation();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [createSession, abortCurrentOperation, toggleCommandPalette, setTheme, theme]);
};