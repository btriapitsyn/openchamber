import React from 'react';
import { useSessionStore } from '@/stores/useSessionStore';
import { useUIStore } from '@/stores/useUIStore';
import { useThemeSystem } from '@/contexts/useThemeSystem';
import { useAssistantStatus } from '@/hooks/useAssistantStatus';
import { getRegisteredRuntimeAPIs } from '@/contexts/runtimeAPIRegistry';
import { hasModifier } from '@/lib/utils';

export const useKeyboardShortcuts = () => {
  const { openNewSessionDraft, abortCurrentOperation, armAbortPrompt, clearAbortPrompt, currentSessionId } = useSessionStore();
  const {
    toggleCommandPalette,
    toggleHelpDialog,
    toggleSidebar,
    setSessionSwitcherOpen,
    setSessionCreateDialogOpen,
    setActiveMainTab,
    setSettingsDialogOpen,
    setModelSelectorOpen,
  } = useUIStore();
  const { themeMode, setThemeMode } = useThemeSystem();
  const { working } = useAssistantStatus();
  const abortPrimedUntilRef = React.useRef<number | null>(null);
  const abortPrimedTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDownloadingLogsRef = React.useRef(false);

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

       if (hasModifier(e) && e.key === 'k') {
        e.preventDefault();
        toggleCommandPalette();
      }

      if (hasModifier(e) && e.shiftKey && e.key.toLowerCase() === 'l') {
        const runtimeAPIs = getRegisteredRuntimeAPIs();
        const diagnostics = runtimeAPIs?.diagnostics;
        if (!diagnostics) {
          return;
        }

        e.preventDefault();
        if (isDownloadingLogsRef.current) {
          return;
        }
        isDownloadingLogsRef.current = true;

        diagnostics
          .downloadLogs()
          .then(({ fileName, content }) => {
            const finalFileName = fileName || 'openchamber.log';
            const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = finalFileName;
            document.body.appendChild(anchor);
            anchor.click();
            document.body.removeChild(anchor);
            URL.revokeObjectURL(url);
          })
          .finally(() => {
            isDownloadingLogsRef.current = false;
          });
        return;
      }

      if (hasModifier(e) && e.key === '.') {
        e.preventDefault();
        toggleHelpDialog();
      }

      if (hasModifier(e) && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        if (e.shiftKey) {
          setSessionCreateDialogOpen(true);
          return;
        }

        setActiveMainTab('chat');
        setSessionSwitcherOpen(false);
        openNewSessionDraft();
      }

       if (hasModifier(e) && e.key === '/') {
        e.preventDefault();
        const modes: Array<'light' | 'dark' | 'system'> = ['light', 'dark', 'system'];
        const currentIndex = modes.indexOf(themeMode);
        const nextIndex = (currentIndex + 1) % modes.length;
        setThemeMode(modes[nextIndex]);
      }

      if (hasModifier(e) && !e.shiftKey && e.key.toLowerCase() === 'g') {
        e.preventDefault();
        const { activeMainTab } = useUIStore.getState();
        setActiveMainTab(activeMainTab === 'git' ? 'chat' : 'git');
        return;
      }

      if (hasModifier(e) && !e.shiftKey && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        const { activeMainTab } = useUIStore.getState();
        setActiveMainTab(activeMainTab === 'diff' ? 'chat' : 'diff');
        return;
      }

       if (hasModifier(e) && !e.shiftKey && e.key.toLowerCase() === 't') {
        e.preventDefault();
        const { activeMainTab } = useUIStore.getState();
        setActiveMainTab(activeMainTab === 'terminal' ? 'chat' : 'terminal');
        return;
      }

      if (hasModifier(e) && !e.shiftKey && e.key === ',') {
        e.preventDefault();
        const { isSettingsDialogOpen } = useUIStore.getState();
        setSettingsDialogOpen(!isSettingsDialogOpen);
        return;
      }

      if (hasModifier(e) && !e.shiftKey && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        const { isMobile, isSessionSwitcherOpen } = useUIStore.getState();
        if (isMobile) {
          setSessionSwitcherOpen(!isSessionSwitcherOpen);
        } else {
          toggleSidebar();
        }
        return;
      }

      if (hasModifier(e) && !e.shiftKey && e.key.toLowerCase() === 'i') {
        e.preventDefault();
        const textarea = document.querySelector<HTMLTextAreaElement>('textarea[data-chat-input="true"]');
        textarea?.focus();
        return;
      }

      // Cmd/Ctrl+Shift+M: Open model selector (same conditions as double-ESC: chat tab, no overlays)
      if (hasModifier(e) && e.shiftKey && e.key.toLowerCase() === 'm') {
        const {
          isSettingsDialogOpen,
          isCommandPaletteOpen,
          isHelpDialogOpen,
          isSessionSwitcherOpen,
          isSessionCreateDialogOpen,
          isAboutDialogOpen,
          activeMainTab,
          isModelSelectorOpen,
        } = useUIStore.getState();

        // Skip if settings open
        if (isSettingsDialogOpen) {
          return;
        }

        // Skip if any overlay open or not on chat tab
        const hasOverlay = isCommandPaletteOpen || isHelpDialogOpen || isSessionSwitcherOpen || isSessionCreateDialogOpen || isAboutDialogOpen;
        const isChatActive = activeMainTab === 'chat';

        if (hasOverlay || !isChatActive) {
          return;
        }

        e.preventDefault();
        setModelSelectorOpen(!isModelSelectorOpen);
        return;
      }

      if (e.key === 'Escape') {
        const {
          isSettingsDialogOpen,
          isCommandPaletteOpen,
          isHelpDialogOpen,
          isSessionSwitcherOpen,
          isSessionCreateDialogOpen,
          isAboutDialogOpen,
          activeMainTab,
        } = useUIStore.getState();

        // If settings is open, close it
        if (isSettingsDialogOpen) {
          e.preventDefault();
          setSettingsDialogOpen(false);
          resetAbortPriming();
          return;
        }

        // Check if any overlay is open or not on chat tab - don't process abort
        const hasOverlay = isCommandPaletteOpen || isHelpDialogOpen || isSessionSwitcherOpen || isSessionCreateDialogOpen || isAboutDialogOpen;
        const isChatActive = activeMainTab === 'chat';

        if (hasOverlay || !isChatActive) {
          resetAbortPriming();
          return;
        }

        // Double-ESC abort logic - only when on chat tab with no overlays
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
    openNewSessionDraft,
    abortCurrentOperation,
    toggleCommandPalette,
    toggleHelpDialog,
    toggleSidebar,
    setSessionSwitcherOpen,
    setSessionCreateDialogOpen,
    setActiveMainTab,
    setSettingsDialogOpen,
    setModelSelectorOpen,
    setThemeMode,
    themeMode,
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
