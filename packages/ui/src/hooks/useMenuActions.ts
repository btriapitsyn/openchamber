import React from 'react';
import { toast } from '@/components/ui';
import { useSessionStore } from '@/stores/useSessionStore';
import { useUIStore } from '@/stores/useUIStore';
import { useProjectsStore } from '@/stores/useProjectsStore';
import { useThemeSystem } from '@/contexts/useThemeSystem';
import { getRegisteredRuntimeAPIs } from '@/contexts/runtimeAPIRegistry';
import { sessionEvents } from '@/lib/sessionEvents';
import { isDesktopRuntime } from '@/lib/desktop';
import { useFileSystemAccess } from '@/hooks/useFileSystemAccess';
import { createWorktreeSession } from '@/lib/worktreeSessionCreator';

const MENU_ACTION_EVENT = 'openchamber:menu-action';

type MenuAction =
  | 'about'
  | 'settings'
  | 'command-palette'
  | 'new-session'
  | 'new-worktree-session'
  | 'change-workspace'
  | 'open-git-tab'
  | 'open-diff-tab'
  | 'open-terminal-tab'
  | 'theme-light'
  | 'theme-dark'
  | 'theme-system'
  | 'toggle-sidebar'
  | 'toggle-memory-debug'
  | 'help-dialog'
  | 'download-logs';

export const useMenuActions = (
  onToggleMemoryDebug?: () => void
) => {
  const { openNewSessionDraft } = useSessionStore();
  const {
    toggleCommandPalette,
    toggleHelpDialog,
    toggleSidebar,
    setSessionSwitcherOpen,
    setActiveMainTab,
    setSettingsDialogOpen,
    setAboutDialogOpen,
  } = useUIStore();
  const { addProject } = useProjectsStore();
  const { requestAccess, startAccessing } = useFileSystemAccess();
  const { setThemeMode } = useThemeSystem();
  const isDownloadingLogsRef = React.useRef(false);

  const handleChangeWorkspace = React.useCallback(() => {
    if (isDesktopRuntime()) {
      requestAccess('')
        .then(async (result) => {
          if (!result.success || !result.path) {
            if (result.error && result.error !== 'Directory selection cancelled') {
              toast.error('Failed to select directory', {
                description: result.error,
              });
            }
            return;
          }

          const accessResult = await startAccessing(result.path);
          if (!accessResult.success) {
            toast.error('Failed to open directory', {
              description: accessResult.error || 'Desktop could not grant file access.',
            });
            return;
          }

          const added = addProject(result.path, { id: result.projectId });
          if (!added) {
            toast.error('Failed to add project', {
              description: 'Please select a valid directory path.',
            });
          }
        })
        .catch((error) => {
          console.error('Desktop: Error selecting directory:', error);
          toast.error('Failed to select directory');
        });
    } else {
      sessionEvents.requestDirectoryDialog();
    }
  }, [addProject, requestAccess, startAccessing]);

  React.useEffect(() => {
    const handleMenuAction = (event: Event) => {
      const action = (event as CustomEvent<MenuAction>).detail;

      switch (action) {
        case 'about':
          setAboutDialogOpen(true);
          break;

        case 'settings':
          setSettingsDialogOpen(true);
          break;

        case 'command-palette':
          toggleCommandPalette();
          break;

        case 'new-session':
          setActiveMainTab('chat');
          setSessionSwitcherOpen(false);
          openNewSessionDraft();
          break;

        case 'new-worktree-session':
          setActiveMainTab('chat');
          setSessionSwitcherOpen(false);
          createWorktreeSession();
          break;

        case 'change-workspace':
          handleChangeWorkspace();
          break;

        case 'open-git-tab': {
          const { activeMainTab } = useUIStore.getState();
          setActiveMainTab(activeMainTab === 'git' ? 'chat' : 'git');
          break;
        }

        case 'open-diff-tab': {
          const { activeMainTab } = useUIStore.getState();
          setActiveMainTab(activeMainTab === 'diff' ? 'chat' : 'diff');
          break;
        }

        case 'open-terminal-tab': {
          const { activeMainTab } = useUIStore.getState();
          setActiveMainTab(activeMainTab === 'terminal' ? 'chat' : 'terminal');
          break;
        }

        case 'theme-light':
          setThemeMode('light');
          break;

        case 'theme-dark':
          setThemeMode('dark');
          break;

        case 'theme-system':
          setThemeMode('system');
          break;

        case 'toggle-sidebar':
          toggleSidebar();
          break;

        case 'toggle-memory-debug':
          onToggleMemoryDebug?.();
          break;

        case 'help-dialog':
          toggleHelpDialog();
          break;

        case 'download-logs': {
          const runtimeAPIs = getRegisteredRuntimeAPIs();
          const diagnostics = runtimeAPIs?.diagnostics;
          if (!diagnostics || isDownloadingLogsRef.current) {
            break;
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
              toast.success('Logs saved', {
                description: `Downloaded to ~/Downloads/${finalFileName}`,
              });
            })
            .catch(() => {
              toast.error('Failed to download logs');
            })
            .finally(() => {
              isDownloadingLogsRef.current = false;
            });
          break;
        }
      }
    };

    window.addEventListener(MENU_ACTION_EVENT, handleMenuAction);
    return () => window.removeEventListener(MENU_ACTION_EVENT, handleMenuAction);
  }, [
    openNewSessionDraft,
    toggleCommandPalette,
    toggleHelpDialog,
    toggleSidebar,
    setSessionSwitcherOpen,
    setActiveMainTab,
    setSettingsDialogOpen,
    setAboutDialogOpen,
    setThemeMode,
    onToggleMemoryDebug,
    handleChangeWorkspace,
  ]);
};
