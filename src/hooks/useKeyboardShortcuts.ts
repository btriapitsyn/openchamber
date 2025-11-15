import React from 'react';
import { useSessionStore } from '@/stores/useSessionStore';
import { useUIStore } from '@/stores/useUIStore';
import { useConfigStore } from '@/stores/useConfigStore';
import { useThemeSystem } from '@/contexts/useThemeSystem';
import { useAssistantStatus } from '@/hooks/useAssistantStatus';

export const useKeyboardShortcuts = () => {
  const { createSession, abortCurrentOperation, initializeNewOpenChamberSession, armAbortPrompt, clearAbortPrompt, currentSessionId } = useSessionStore();
  const {
    toggleCommandPalette,
    toggleHelpDialog,
    toggleRightSidebar,
    toggleSidebar,
    setSessionSwitcherOpen,
    setSessionCreateDialogOpen,
    setRightSidebarOpen,
    setRightSidebarActiveTab,
    setSettingsDialogOpen,
  } = useUIStore();
  const { agents } = useConfigStore();
  const { themeMode, setThemeMode } = useThemeSystem();
  const { working } = useAssistantStatus();
  const abortPrimedUntilRef = React.useRef<number | null>(null);
  const abortPrimedTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetAbortPriming = React.useCallback(() => {
    if (abortPrimedTimeoutRef.current) {
      clearTimeout(abortPrimedTimeoutRef.current);
      abortPrimedTimeoutRef.current = null;
    }
    abortPrimedUntilRef.current = null;
    clearAbortPrompt();
  }, [clearAbortPrompt]);

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl + RiCloseLine - Open command palette
      if (e.ctrlKey && e.key === 'x') {
        e.preventDefault();
        toggleCommandPalette();
      }

      // Ctrl + H - Open help dialog
      if (e.ctrlKey && e.key === 'h') {
        e.preventDefault();
        toggleHelpDialog();
      }

      // Ctrl + N - New session (Shift opens advanced dialog)
      if (e.ctrlKey && !e.metaKey && e.key.toLowerCase() === 'n') {
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

      // RiCommandLine/Ctrl + / - Toggle theme
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

      // Ctrl + T - Toggle RiTerminalBoxLine panel
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

      // Ctrl + L - Toggle session sidebar / mobile switcher
      if (e.ctrlKey && !e.metaKey && !e.shiftKey && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        const { isMobile, isSessionSwitcherOpen } = useUIStore.getState();
        if (isMobile) {
          setSessionSwitcherOpen(!isSessionSwitcherOpen);
        } else {
          toggleSidebar();
        }
        return;
      }

      // Ctrl + I - Focus chat input
      if (e.ctrlKey && !e.metaKey && !e.shiftKey && e.key.toLowerCase() === 'i') {
        e.preventDefault();
        const textarea = document.querySelector<HTMLTextAreaElement>('textarea[data-chat-input="true"]');
        textarea?.focus();
        return;
      }

      // Escape - Primed abort (double press to confirm)
      if (e.key === 'Escape') {
        const sessionId = currentSessionId;
        const canAbortNow = working.canAbort && Boolean(sessionId);
        if (!canAbortNow) {
          resetAbortPriming();
          return;
        }

        const now = Date.now();
        const primedUntil = abortPrimedUntilRef.current;

        if (primedUntil && now < primedUntil) {
          e.preventDefault();
          resetAbortPriming();
          void abortCurrentOperation();
          return;
        }

        e.preventDefault();
        const expiresAt = armAbortPrompt(3000) ?? now + 3000;
        abortPrimedUntilRef.current = expiresAt;

        if (abortPrimedTimeoutRef.current) {
          clearTimeout(abortPrimedTimeoutRef.current);
        }

        const delay = Math.max(expiresAt - now, 0);
        abortPrimedTimeoutRef.current = setTimeout(() => {
          if (abortPrimedUntilRef.current && Date.now() >= abortPrimedUntilRef.current) {
            resetAbortPriming();
          }
        }, delay || 0);
        return;
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
    toggleSidebar,
    setSessionSwitcherOpen,
    setSessionCreateDialogOpen,
    setRightSidebarActiveTab,
    setRightSidebarOpen,
    setSettingsDialogOpen,
    setThemeMode,
    themeMode,
    initializeNewOpenChamberSession,
    agents,
    working,
    armAbortPrompt,
    resetAbortPriming,
    currentSessionId,
  ]);

  React.useEffect(() => {
    return () => {
      resetAbortPriming();
    };
  }, [resetAbortPriming]);
};
