import React from 'react';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command';
import { useUIStore } from '@/stores/useUIStore';
import { useSessionStore } from '@/stores/useSessionStore';
import { useDirectoryStore } from '@/stores/useDirectoryStore';
import { useConfigStore } from '@/stores/useConfigStore';
import { useProjectsStore } from '@/stores/useProjectsStore';
import { useThemeSystem } from '@/contexts/useThemeSystem';
import { useDeviceInfo } from '@/lib/device';
import { RiAddLine, RiChatAi3Line, RiCheckLine, RiCodeLine, RiComputerLine, RiFolderLine, RiGitBranchLine, RiLayoutLeftLine, RiMoonLine, RiQuestionLine, RiSettings3Line, RiSunLine, RiTerminalBoxLine, RiTimeLine } from '@remixicon/react';
import { getModifierLabel } from '@/lib/utils';
import { createWorktreeSession } from '@/lib/worktreeSessionCreator';

export const CommandPalette: React.FC = () => {
  const {
    isCommandPaletteOpen,
    setCommandPaletteOpen,
    setHelpDialogOpen,
    setActiveMainTab,
    setSettingsDialogOpen,
    setSessionSwitcherOpen,
    setTimelineDialogOpen,
    toggleSidebar,
  } = useUIStore();

  const {
    openNewSessionDraft,
    setCurrentSession,
    getSessionsByDirectory,
  } = useSessionStore();

  const settingsAutoCreateWorktree = useConfigStore((state) => state.settingsAutoCreateWorktree);

  const { projects, activeProjectId, setActiveProject } = useProjectsStore();

  const { currentDirectory } = useDirectoryStore();
  const { themeMode, setThemeMode } = useThemeSystem();

  const handleClose = () => {
    setCommandPaletteOpen(false);
  };

  const handleCreateSession = async () => {
    setActiveMainTab('chat');
    setSessionSwitcherOpen(false);
    openNewSessionDraft();
    handleClose();
  };

  const handleOpenSession = (sessionId: string) => {
    setCurrentSession(sessionId);
    handleClose();
  };

  const handleSetThemeMode = (mode: 'light' | 'dark' | 'system') => {
    setThemeMode(mode);
    handleClose();
  };

  const handleShowHelp = () => {
    setHelpDialogOpen(true);
    handleClose();
  };

  const handleCreateWorktreeSession = () => {
    handleClose();
    createWorktreeSession();
  };

  const { isMobile } = useDeviceInfo();

  const handleOpenSessionList = () => {
    if (isMobile) {
      const { isSessionSwitcherOpen } = useUIStore.getState();
      setSessionSwitcherOpen(!isSessionSwitcherOpen);
    } else {
      toggleSidebar();
    }
    handleClose();
  };

  const handleOpenDiffPanel = () => {
    setActiveMainTab('diff');
    handleClose();
  };

  const handleOpenGitPanel = () => {
    setActiveMainTab('git');
    handleClose();
  };

  const handleOpenTerminal = () => {
    setActiveMainTab('terminal');
    handleClose();
  };

  const handleOpenSettings = () => {
    setSettingsDialogOpen(true);
    handleClose();
  };

  const handleOpenTimeline = () => {
    setTimelineDialogOpen(true);
    handleClose();
  };

  const handleSelectProject = (projectId: string) => {
    setActiveProject(projectId);
    handleClose();
  };

  const directorySessions = getSessionsByDirectory(currentDirectory ?? '');
  const currentSessions = React.useMemo(() => {
    return directorySessions.slice(0, 5);
  }, [directorySessions]);

  return (
    <CommandDialog open={isCommandPaletteOpen} onOpenChange={setCommandPaletteOpen}>
      <CommandInput placeholder="Type a command or search..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        <CommandGroup heading="Actions">
          <CommandItem onSelect={handleOpenSessionList}>
            <RiLayoutLeftLine className="mr-2 h-4 w-4" />
            <span>Open Session List</span>
            <CommandShortcut>{getModifierLabel()} + L</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={handleCreateSession}>
            <RiAddLine className="mr-2 h-4 w-4" />
            <span>New Session</span>
            <CommandShortcut>
              {settingsAutoCreateWorktree ? `Shift + ${getModifierLabel()} + N` : `${getModifierLabel()} + N`}
            </CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={handleCreateWorktreeSession}>
            <RiGitBranchLine className="mr-2 h-4 w-4" />
            <span>New Session with Worktree</span>
            <CommandShortcut>
              {settingsAutoCreateWorktree ? `${getModifierLabel()} + N` : `Shift + ${getModifierLabel()} + N`}
            </CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={handleShowHelp}>
            <RiQuestionLine className="mr-2 h-4 w-4" />
            <span>Keyboard Shortcuts</span>
            <CommandShortcut>{getModifierLabel()} + .</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={handleOpenDiffPanel}>
            <RiCodeLine className="mr-2 h-4 w-4" />
            <span>Open Diff Panel</span>
            <CommandShortcut>{getModifierLabel()} + 2</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={handleOpenTerminal}>
            <RiTerminalBoxLine className="mr-2 h-4 w-4" />
            <span>Open Terminal</span>
            <CommandShortcut>{getModifierLabel()} + 3</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={handleOpenGitPanel}>
            <RiGitBranchLine className="mr-2 h-4 w-4" />
            <span>Open Git Panel</span>
            <CommandShortcut>{getModifierLabel()} + 4</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={handleOpenTimeline}>
            <RiTimeLine className="mr-2 h-4 w-4" />
            <span>Open Timeline</span>
            <CommandShortcut>{getModifierLabel()} + T</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={handleOpenSettings}>
            <RiSettings3Line className="mr-2 h-4 w-4" />
            <span>Open Settings</span>
            <CommandShortcut>{getModifierLabel()} + ,</CommandShortcut>
          </CommandItem>
        </CommandGroup>

        {projects.length >= 2 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Projects">
              {projects.map((project) => {
                const label = project.label || project.path.split('/').filter(Boolean).pop() || project.path;
                const isActive = project.id === activeProjectId;
                
                return (
                  <CommandItem
                    key={project.id}
                    onSelect={() => handleSelectProject(project.id)}
                  >
                    <RiFolderLine className="mr-2 h-4 w-4" />
                    <span>{label}</span>
                    <span className="ml-auto text-xs text-[var(--color-muted-foreground)] truncate max-w-[200px]">
                      {project.path}
                    </span>
                    {isActive && <RiCheckLine className="ml-2 h-4 w-4 flex-shrink-0" />}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </>
        )}

        <CommandSeparator />

        <CommandGroup heading="Theme">
          <CommandItem onSelect={() => handleSetThemeMode('light')}>
            <RiSunLine className="mr-2 h-4 w-4" />
            <span>Light Theme</span>
            {themeMode === 'light' && <RiCheckLine className="ml-auto h-4 w-4" />}
          </CommandItem>
          <CommandItem onSelect={() => handleSetThemeMode('dark')}>
            <RiMoonLine className="mr-2 h-4 w-4" />
            <span>Dark Theme</span>
            {themeMode === 'dark' && <RiCheckLine className="ml-auto h-4 w-4" />}
          </CommandItem>
          <CommandItem onSelect={() => handleSetThemeMode('system')}>
            <RiComputerLine className="mr-2 h-4 w-4" />
            <span>System Theme</span>
            {themeMode === 'system' && <RiCheckLine className="ml-auto h-4 w-4" />}
          </CommandItem>
        </CommandGroup>

        {currentSessions.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Recent Sessions">
              {currentSessions.map((session) => (
                <CommandItem
                  key={session.id}
                  onSelect={() => handleOpenSession(session.id)}
                >
                  <RiChatAi3Line className="mr-2 h-4 w-4" />
                  <span className="truncate">
                    {session.title || 'Untitled Session'}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {}
      </CommandList>
    </CommandDialog>
  );
};
