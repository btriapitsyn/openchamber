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
import { useThemeSystem } from '@/contexts/useThemeSystem';
import {
  Plus,
  Sun,
  Moon,
  Monitor,
  Check,
  ChatCircleText as MessagesSquare,
  Question as HelpCircle,
  GitFork,
  GitBranch,
  Terminal,
  Gear,
  Sparkle,
} from '@phosphor-icons/react';

export const CommandPalette: React.FC = () => {
  const { 
    isCommandPaletteOpen, 
    setCommandPaletteOpen, 
    setHelpDialogOpen,
    setSessionCreateDialogOpen,
    setRightSidebarOpen,
    setRightSidebarActiveTab,
    setSettingsDialogOpen,
  } = useUIStore();
  
  const {
    createSession,
    setCurrentSession,
    getSessionsByDirectory,
    initializeNewOpenChamberSession,
  } = useSessionStore();
  
  const { currentDirectory } = useDirectoryStore();
  const { agents } = useConfigStore();
  const { themeMode, setThemeMode } = useThemeSystem();

  const handleClose = () => {
    setCommandPaletteOpen(false);
  };

  const handleCreateSession = async () => {
    const session = await createSession();
    if (session) {
      initializeNewOpenChamberSession(session.id, agents);
    }
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

  const handleOpenAdvancedSession = () => {
    setSessionCreateDialogOpen(true);
    handleClose();
  };

  const handleOpenGitPanel = () => {
    setRightSidebarActiveTab('git');
    setRightSidebarOpen(true);
    handleClose();
  };

  const handleOpenTerminal = () => {
    setRightSidebarActiveTab('terminal');
    setRightSidebarOpen(true);
    handleClose();
  };

  const handleOpenPromptEnhancer = () => {
    setRightSidebarActiveTab('prompt');
    setRightSidebarOpen(true);
    handleClose();
  };

  const handleOpenSettings = () => {
    setSettingsDialogOpen(true);
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
          <CommandItem onSelect={handleCreateSession}>
            <Plus className="mr-2 h-4 w-4" weight="regular" />
            <span>New Session</span>
            <CommandShortcut>⌘ + N</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={handleOpenAdvancedSession}>
            <GitFork className="mr-2 h-4 w-4" weight="regular" />
            <span>New Session with Worktree</span>
            <CommandShortcut>⇧ + ⌘ + N</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={handleShowHelp}>
            <HelpCircle className="mr-2 h-4 w-4" />
            <span>Keyboard Shortcuts</span>
            <CommandShortcut>Ctrl + H</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={handleOpenGitPanel}>
            <GitBranch className="mr-2 h-4 w-4" weight="regular" />
            <span>Open Git Panel</span>
            <CommandShortcut>Ctrl + G</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={handleOpenTerminal}>
            <Terminal className="mr-2 h-4 w-4" weight="regular" />
            <span>Open Terminal</span>
            <CommandShortcut>Ctrl + T</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={handleOpenPromptEnhancer}>
            <Sparkle className="mr-2 h-4 w-4" weight="regular" />
            <span>Open Prompt Enhancer</span>
            <CommandShortcut>Ctrl + P</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={handleOpenSettings}>
            <Gear className="mr-2 h-4 w-4" weight="regular" />
            <span>Open Settings</span>
            <CommandShortcut>Ctrl + ,</CommandShortcut>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Theme">
          <CommandItem onSelect={() => handleSetThemeMode('light')}>
            <Sun className="mr-2 h-4 w-4" />
            <span>Light Theme</span>
            {themeMode === 'light' && <Check className="ml-auto h-4 w-4" weight="bold" />}
          </CommandItem>
          <CommandItem onSelect={() => handleSetThemeMode('dark')}>
            <Moon className="mr-2 h-4 w-4" />
            <span>Dark Theme</span>
            {themeMode === 'dark' && <Check className="ml-auto h-4 w-4" weight="bold" />}
          </CommandItem>
          <CommandItem onSelect={() => handleSetThemeMode('system')}>
            <Monitor className="mr-2 h-4 w-4" />
            <span>System Theme</span>
            {themeMode === 'system' && <Check className="ml-auto h-4 w-4" weight="bold" />}
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
                  <MessagesSquare className="mr-2 h-4 w-4" />
                  <span className="truncate">
                    {session.title || 'Untitled Session'}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {/* Directory navigation will be added in a future update */}
      </CommandList>
    </CommandDialog>
  );
};
