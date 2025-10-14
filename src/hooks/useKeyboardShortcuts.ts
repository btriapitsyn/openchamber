import React from 'react';
import { useSessionStore } from '@/stores/useSessionStore';
import { useUIStore } from '@/stores/useUIStore';
import { useConfigStore } from '@/stores/useConfigStore';

export const useKeyboardShortcuts = () => {
  const { createSession, abortCurrentOperation, initializeNewOpenChamberSession } = useSessionStore();
  const { toggleCommandPalette, toggleHelpDialog, setTheme, theme } = useUIStore();
  const { agents } = useConfigStore();

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl + X - Open command palette
      if (e.ctrlKey && e.key === 'x') {
        e.preventDefault();
        toggleCommandPalette();
      }

      // Ctrl + H - Open help dialog
      if (e.ctrlKey && e.key === 'h') {
        e.preventDefault();
        toggleHelpDialog();
      }

      // Command/Ctrl + N - New session
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault();
        createSession().then(session => {
          if (session) {
            initializeNewOpenChamberSession(session.id, agents);
          }
        });
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
  }, [createSession, abortCurrentOperation, toggleCommandPalette, toggleHelpDialog, setTheme, theme, initializeNewOpenChamberSession, agents]);
};