import React from 'react';
import { useSessionStore } from '@/stores/useSessionStore';
import { useUIStore } from '@/stores/useUIStore';
import { useConfigStore } from '@/stores/useConfigStore';
import { useThemeSystem } from '@/contexts/useThemeSystem';

export const useKeyboardShortcuts = () => {
  const { createSession, abortCurrentOperation, initializeNewOpenChamberSession } = useSessionStore();
  const {
    toggleCommandPalette,
    toggleHelpDialog,
    toggleRightSidebar,
    setSessionCreateDialogOpen,
    setRightSidebarOpen,
    setRightSidebarActiveTab,
    setSettingsDialogOpen,
  } = useUIStore();
  const { agents } = useConfigStore();
  const { themeMode, setThemeMode } = useThemeSystem();

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

      // Command/Ctrl + N - New session (Shift opens advanced dialog)
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        if (e.shiftKey) {
          setSessionCreateDialogOpen(true);
          return;
        }

        createSession().then(session => {
          if (session) {
            initializeNewOpenChamberSession(session.id, agents);
          }
        });
      }

      // Command/Ctrl + / - Toggle theme
      if ((e.metaKey || e.ctrlKey) && e.key === '/') {
        e.preventDefault();
        const modes: Array<'light' | 'dark' | 'system'> = ['light', 'dark', 'system'];
        const currentIndex = modes.indexOf(themeMode);
        const nextIndex = (currentIndex + 1) % modes.length;
        setThemeMode(modes[nextIndex]);
      }

      // Ctrl + G - Toggle Git panel
      if (e.ctrlKey && !e.metaKey && !e.shiftKey && e.key.toLowerCase() === 'g') {
        e.preventDefault();
        const { isRightSidebarOpen, rightSidebarActiveTab } = useUIStore.getState();
        if (isRightSidebarOpen && rightSidebarActiveTab === 'git') {
          setRightSidebarOpen(false);
        } else {
          setRightSidebarActiveTab('git');
          setRightSidebarOpen(true);
        }
        return;
      }

      // Ctrl + T - Toggle Terminal panel
      if (e.ctrlKey && !e.metaKey && !e.shiftKey && e.key.toLowerCase() === 't') {
        e.preventDefault();
        const { isRightSidebarOpen, rightSidebarActiveTab } = useUIStore.getState();
        if (isRightSidebarOpen && rightSidebarActiveTab === 'terminal') {
          setRightSidebarOpen(false);
        } else {
          setRightSidebarActiveTab('terminal');
          setRightSidebarOpen(true);
        }
        return;
      }

      // Ctrl + P - Toggle Prompt Enhancer panel
      if (e.ctrlKey && !e.metaKey && !e.shiftKey && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        const { isRightSidebarOpen, rightSidebarActiveTab } = useUIStore.getState();
        if (isRightSidebarOpen && rightSidebarActiveTab === 'prompt') {
          setRightSidebarOpen(false);
        } else {
          setRightSidebarActiveTab('prompt');
          setRightSidebarOpen(true);
        }
        return;
      }

      // Ctrl + , - Toggle Settings dialog
      if (e.ctrlKey && !e.metaKey && !e.shiftKey && e.key === ',') {
        e.preventDefault();
        const { isSettingsDialogOpen } = useUIStore.getState();
        setSettingsDialogOpen(!isSettingsDialogOpen);
        return;
      }

      // Command/Ctrl + L - Focus chat input
      if (e.ctrlKey && !e.metaKey && !e.shiftKey && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        const textarea = document.querySelector<HTMLTextAreaElement>('textarea[data-chat-input="true"]');
        textarea?.focus();
        return;
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
  }, [
    createSession,
    abortCurrentOperation,
    toggleCommandPalette,
    toggleHelpDialog,
    toggleRightSidebar,
    setSessionCreateDialogOpen,
    setRightSidebarActiveTab,
    setRightSidebarOpen,
    setSettingsDialogOpen,
    setThemeMode,
    themeMode,
    initializeNewOpenChamberSession,
    agents,
  ]);
};
