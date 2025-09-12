import React from 'react';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { useUIStore } from '@/stores/useUIStore';
import { useSessionStore } from '@/stores/useSessionStore';
import { useDirectoryStore } from '@/stores/useDirectoryStore';
import {
  Plus,
  Sun,
  Moon,
  Monitor,
  MessagesSquare,
  Folder,
  Settings,
  Palette,
  PanelLeftClose,
} from 'lucide-react';

export const CommandPalette: React.FC = () => {
  const { 
    isCommandPaletteOpen, 
    setCommandPaletteOpen, 
    setTheme, 
    theme,
    toggleSidebar 
  } = useUIStore();
  
  const { 
    createSession, 
    sessions, 
    setCurrentSession,
    getSessionsByDirectory 
  } = useSessionStore();
  
  const { currentDirectory, directories } = useDirectoryStore();

  const handleClose = () => {
    setCommandPaletteOpen(false);
  };

  const handleCreateSession = async () => {
    await createSession();
    handleClose();
  };

  const handleOpenSession = (sessionId: string) => {
    setCurrentSession(sessionId);
    handleClose();
  };

  const handleSetTheme = (newTheme: 'light' | 'dark' | 'system') => {
    setTheme(newTheme);
    handleClose();
  };

  const handleToggleSidebar = () => {
    toggleSidebar();
    handleClose();
  };

  // Get current directory sessions
  const currentSessions = React.useMemo(() => {
    return getSessionsByDirectory(currentDirectory);
  }, [sessions, currentDirectory, getSessionsByDirectory]);

  return (
    <CommandDialog open={isCommandPaletteOpen} onOpenChange={setCommandPaletteOpen}>
      <CommandInput placeholder="Type a command or search..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        
        <CommandGroup heading="Actions">
          <CommandItem onSelect={handleCreateSession}>
            <Plus className="mr-2 h-4 w-4" />
            <span>New Session</span>
            <span className="ml-auto text-xs text-muted-foreground">⌘N</span>
          </CommandItem>
          <CommandItem onSelect={handleToggleSidebar}>
            <PanelLeftClose className="mr-2 h-4 w-4" />
            <span>Toggle Sidebar</span>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Theme">
          <CommandItem onSelect={() => handleSetTheme('light')}>
            <Sun className="mr-2 h-4 w-4" />
            <span>Light Theme</span>
            {theme === 'light' && <span className="ml-auto text-xs">✓</span>}
          </CommandItem>
          <CommandItem onSelect={() => handleSetTheme('dark')}>
            <Moon className="mr-2 h-4 w-4" />
            <span>Dark Theme</span>
            {theme === 'dark' && <span className="ml-auto text-xs">✓</span>}
          </CommandItem>
          <CommandItem onSelect={() => handleSetTheme('system')}>
            <Monitor className="mr-2 h-4 w-4" />
            <span>System Theme</span>
            {theme === 'system' && <span className="ml-auto text-xs">✓</span>}
          </CommandItem>
        </CommandGroup>

        {currentSessions && currentSessions.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Recent Sessions">
              {currentSessions.slice(0, 5).map((session) => (
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

        {directories && directories.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Directories">
              {directories && directories.slice(0, 3).map((dir) => (
                <CommandItem key={dir.path} value={`directory-${dir.name}`}>
                  <Folder className="mr-2 h-4 w-4" />
                  <span className="truncate">{dir.name}</span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {dir.isPinned && '📌'}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
};