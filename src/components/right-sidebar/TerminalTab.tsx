import React from 'react';
import { useSessionStore } from '@/stores/useSessionStore';
import { CaretRight } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';

interface CommandHistory {
  command: string;
  output: string;
  error: boolean;
  timestamp: number;
}

export const TerminalTab: React.FC = () => {
  const { currentSessionId, sessions } = useSessionStore();
  const currentSession = sessions.find(s => s.id === currentSessionId);
  const currentDirectory = (currentSession as any)?.directory;
  const [command, setCommand] = React.useState('');
  const [history, setHistory] = React.useState<CommandHistory[]>([]);
  const [isExecuting, setIsExecuting] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom when history changes
  React.useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [history]);

  const executeCommand = async (cmd: string) => {
    if (!cmd.trim() || !currentDirectory) return;

    setIsExecuting(true);

    // For MVP, we'll just show a placeholder message
    // Full implementation would need a backend endpoint for command execution
    const newEntry: CommandHistory = {
      command: cmd,
      output: 'Terminal command execution coming soon...\nThis feature requires backend support for secure command execution.',
      error: false,
      timestamp: Date.now(),
    };

    setHistory((prev) => [...prev, newEntry]);
    setCommand('');
    setIsExecuting(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    executeCommand(command);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Future: Add command history navigation with up/down arrows
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      executeCommand(command);
    }
  };

  const clearHistory = () => {
    setHistory([]);
  };

  if (!currentDirectory) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-center text-sm text-muted-foreground">
        No directory selected
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden border-t bg-black/5 dark:bg-black/20">
      {/* Terminal output */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-3 font-mono text-sm"
        onClick={() => inputRef.current?.focus()}
      >
        {/* Working directory indicator */}
        <div className="mb-2 text-xs text-muted-foreground">
          Working directory: {currentDirectory}
        </div>

        {/* Command history */}
        {history.map((entry, index) => (
          <div key={entry.timestamp + index} className="mb-3">
            <div className="flex items-center gap-2 text-green-500">
              <CaretRight size={14} weight="bold" />
              <span>{entry.command}</span>
            </div>
            <div
              className={cn(
                'mt-1 whitespace-pre-wrap pl-5',
                entry.error
                  ? 'text-red-400'
                  : 'text-foreground/80'
              )}
            >
              {entry.output}
            </div>
          </div>
        ))}

        {/* Command input */}
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <CaretRight size={14} weight="bold" className="text-green-500" />
          <input
            ref={inputRef}
            type="text"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isExecuting}
            placeholder="Enter command..."
            className="flex-1 bg-transparent outline-none placeholder:text-muted-foreground/50 disabled:opacity-50"
            autoFocus
          />
        </form>
      </div>

      {/* Info footer */}
      <div className="flex h-7 items-center border-t bg-sidebar-accent px-1.5 text-xs text-muted-foreground">
        Press Enter to execute • Feature in development
      </div>
    </div>
  );
};
