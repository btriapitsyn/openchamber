import React from 'react';
import { RiCommandLine, RiFileLine, RiFlashlightLine, RiRefreshLine, RiScissorsLine, RiTerminalBoxLine, RiArrowGoBackLine, RiArrowGoForwardLine, RiTimeLine } from '@remixicon/react';
import { cn } from '@/lib/utils';
import { opencodeClient } from '@/lib/opencode/client';
import { useSessionStore } from '@/stores/useSessionStore';
import { useShallow } from 'zustand/react/shallow';
import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';

interface CommandInfo {
  name: string;
  description?: string;
  agent?: string;
  model?: string;
  isBuiltIn?: boolean;
}

export interface CommandAutocompleteHandle {
  handleKeyDown: (key: string) => void;
}

interface CommandAutocompleteProps {
  searchQuery: string;
  onCommandSelect: (command: CommandInfo) => void;
  onClose: () => void;
}

export const CommandAutocomplete = React.forwardRef<CommandAutocompleteHandle, CommandAutocompleteProps>(({
  searchQuery,
  onCommandSelect,
  onClose
}, ref) => {
  const { hasMessagesInCurrentSession, currentSessionId } = useSessionStore(
    useShallow((state) => {
      const sessionId = state.currentSessionId;
      const messageCount = sessionId ? (state.messages.get(sessionId)?.length ?? 0) : 0;
      return {
        hasMessagesInCurrentSession: messageCount > 0,
        currentSessionId: sessionId,
      };
    })
  );
  const hasSession = Boolean(currentSessionId);

  const [commands, setCommands] = React.useState<CommandInfo[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const itemRefs = React.useRef<(HTMLDivElement | null)[]>([]);
  const containerRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!target || !containerRef.current) {
        return;
      }
      if (containerRef.current.contains(target)) {
        return;
      }
      onClose();
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
    };
  }, [onClose]);

  React.useEffect(() => {
    const loadCommands = async () => {
      setLoading(true);
      try {

        const apiCommands = await opencodeClient.listCommands();

        const customCommands: CommandInfo[] = apiCommands.map(cmd => ({
          name: cmd.name,
          description: cmd.description,
          agent: cmd.agent,
          model: cmd.model,
          isBuiltIn: false
        }));

        const builtInCommands: CommandInfo[] = [
          ...(hasSession && !hasMessagesInCurrentSession
            ? [{ name: 'init', description: 'Create/update AGENTS.md file', isBuiltIn: true }]
            : []
          ),
          ...(hasSession  // Show when session exists, not when hasMessages
            ? [
                { name: 'undo', description: 'Undo the last message', isBuiltIn: true },
                { name: 'redo', description: 'Redo previously undone messages', isBuiltIn: true },
                { name: 'timeline', description: 'Jump to a specific message', isBuiltIn: true },
              ]
            : []
          ),
          { name: 'summarize', description: 'Generate a summary of the current session', isBuiltIn: true },
        ];

        const commandMap = new Map<string, CommandInfo>();

        builtInCommands.forEach(cmd => commandMap.set(cmd.name, cmd));

        customCommands.forEach(cmd => commandMap.set(cmd.name, cmd));

        const allCommands = Array.from(commandMap.values());

        const allowInitCommand = !hasMessagesInCurrentSession;
        const filtered = (searchQuery
          ? allCommands.filter(cmd =>
              cmd.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
              (cmd.description && cmd.description.toLowerCase().includes(searchQuery.toLowerCase()))
            )
          : allCommands).filter(cmd => allowInitCommand || cmd.name !== 'init');

        filtered.sort((a, b) => {
          const aStartsWith = a.name.toLowerCase().startsWith(searchQuery.toLowerCase());
          const bStartsWith = b.name.toLowerCase().startsWith(searchQuery.toLowerCase());
          if (aStartsWith && !bStartsWith) return -1;
          if (!aStartsWith && bStartsWith) return 1;
          return a.name.localeCompare(b.name);
        });

        setCommands(filtered);
      } catch {

        const allowInitCommand = !hasMessagesInCurrentSession;
        const builtInCommands: CommandInfo[] = [
          ...(hasSession && !hasMessagesInCurrentSession
            ? [{ name: 'init', description: 'Create/update AGENTS.md file', isBuiltIn: true }]
            : []
          ),
          ...(hasSession  // Show when session exists, not when hasMessages
            ? [
                { name: 'undo', description: 'Undo the last message', isBuiltIn: true },
                { name: 'redo', description: 'Redo previously undone messages', isBuiltIn: true },
                { name: 'timeline', description: 'Jump to a specific message', isBuiltIn: true },
              ]
            : []
          ),
          { name: 'summarize', description: 'Generate a summary of the current session', isBuiltIn: true },
        ];

        const filtered = (searchQuery
          ? builtInCommands.filter(cmd =>
              cmd.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
              (cmd.description && cmd.description.toLowerCase().includes(searchQuery.toLowerCase()))
            )
          : builtInCommands).filter(cmd => allowInitCommand || cmd.name !== 'init');

        setCommands(filtered);
      } finally {
        setLoading(false);
      }
    };

    loadCommands();
  }, [searchQuery, hasMessagesInCurrentSession, hasSession]);

  React.useEffect(() => {
    setSelectedIndex(0);
  }, [commands]);

  React.useEffect(() => {
    itemRefs.current[selectedIndex]?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest'
    });
  }, [selectedIndex]);

  React.useImperativeHandle(ref, () => ({
    handleKeyDown: (key: string) => {
      const total = commands.length;
      if (key === 'Escape') {
        onClose();
        return;
      }

      if (total === 0) {
        return;
      }

      if (key === 'ArrowDown') {
        setSelectedIndex((prev) => (prev + 1) % total);
        return;
      }

      if (key === 'ArrowUp') {
        setSelectedIndex((prev) => (prev - 1 + total) % total);
        return;
      }

      if (key === 'Enter' || key === 'Tab') {
        const safeIndex = ((selectedIndex % total) + total) % total;
        const command = commands[safeIndex];
        if (command) {
          onCommandSelect(command);
        }
      }
    }
  }), [commands, selectedIndex, onClose, onCommandSelect]);

  const getCommandIcon = (command: CommandInfo) => {

    switch (command.name) {
      case 'init':
        return <RiFileLine className="h-3.5 w-3.5 text-green-500" />;
      case 'undo':
        return <RiArrowGoBackLine className="h-3.5 w-3.5 text-orange-500" />;
      case 'redo':
        return <RiArrowGoForwardLine className="h-3.5 w-3.5 text-orange-500" />;
      case 'timeline':
        return <RiTimeLine className="h-3.5 w-3.5 text-blue-500" />;
      case 'summarize':
        return <RiScissorsLine className="h-3.5 w-3.5 text-purple-500" />;
      case 'test':
      case 'build':
      case 'run':
        return <RiTerminalBoxLine className="h-3.5 w-3.5 text-cyan-500" />;
      default:
        if (command.isBuiltIn) {
          return <RiFlashlightLine className="h-3.5 w-3.5 text-yellow-500" />;
        }
        return <RiCommandLine className="h-3.5 w-3.5 text-muted-foreground" />;
    }
  };

  return (
    <div
      ref={containerRef}
      className="absolute z-[100] min-w-0 w-full max-w-[450px] max-h-64 bg-background border border-border rounded-xl shadow-none bottom-full mb-2 left-0 flex flex-col"
    >
      <ScrollableOverlay outerClassName="flex-1 min-h-0" className="px-0">
        {loading ? (
          <div className="flex items-center justify-center py-4">
            <RiRefreshLine className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div>
            {commands.map((command, index) => (
              <div
                key={command.name}
                ref={(el) => { itemRefs.current[index] = el; }}
                className={cn(
                  "flex items-start gap-2 px-3 py-2 cursor-pointer rounded-lg",
                  index === selectedIndex && "bg-muted"
                )}
                onClick={() => onCommandSelect(command)}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <div className="mt-0.5">
                  {getCommandIcon(command)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="typography-ui-label font-medium">/{command.name}</span>
                    {command.agent && (
                      <span className="typography-meta text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                        {command.agent}
                      </span>
                    )}
                  </div>
                  {command.description && (
                    <div className="typography-meta text-muted-foreground mt-0.5 truncate">
                      {command.description}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {commands.length === 0 && (
              <div className="px-3 py-2 typography-ui-label text-muted-foreground">
                No commands found
              </div>
            )}
          </div>
        )}
      </ScrollableOverlay>
      <div className="px-3 pt-1 pb-1.5 border-t typography-meta text-muted-foreground">
        ↑↓ navigate • Enter select • Esc close
      </div>
    </div>
  );
});

CommandAutocomplete.displayName = 'CommandAutocomplete';

export type { CommandInfo };
