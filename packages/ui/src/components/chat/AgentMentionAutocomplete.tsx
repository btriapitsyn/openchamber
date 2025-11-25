import React from 'react';
import { cn } from '@/lib/utils';
import { useConfigStore } from '@/stores/useConfigStore';
import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';

interface AgentInfo {
  name: string;
  description?: string;
  mode?: string | null;
}

export interface AgentMentionAutocompleteHandle {
  handleKeyDown: (key: string) => void;
}

interface AgentMentionAutocompleteProps {
  searchQuery: string;
  onAgentSelect: (agentName: string) => void;
  onClose: () => void;
}

const isMentionable = (mode?: string | null): boolean => {
  if (!mode) {
    return false;
  }
  return mode !== 'primary';
};

export const AgentMentionAutocomplete = React.forwardRef<AgentMentionAutocompleteHandle, AgentMentionAutocompleteProps>(({
  searchQuery,
  onAgentSelect,
  onClose,
}, ref) => {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const [agents, setAgents] = React.useState<AgentInfo[]>([]);
  const { agents: allAgents } = useConfigStore();

  React.useEffect(() => {
    const filtered = allAgents
      .filter((agent) => isMentionable(agent.mode))
      .map((agent) => ({
        name: agent.name,
        description: agent.description,
        mode: agent.mode ?? undefined,
      }));

    const normalizedQuery = searchQuery.trim().toLowerCase();
    const matches = normalizedQuery.length
      ? filtered.filter((agent) => agent.name.toLowerCase().includes(normalizedQuery))
      : filtered;

    matches.sort((a, b) => a.name.localeCompare(b.name));

    setAgents(matches);
    setSelectedIndex(0);
  }, [allAgents, searchQuery]);

  React.useEffect(() => {
    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!target || !containerRef.current) {
        return;
      }
      if (!containerRef.current.contains(target)) {
        onClose();
      }
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
    };
  }, [onClose]);

  React.useImperativeHandle(ref, () => ({
    handleKeyDown: (key: string) => {
      if (key === 'Escape') {
        onClose();
        return;
      }

      if (!agents.length) {
        return;
      }

      if (key === 'ArrowDown') {
        setSelectedIndex((prev) => (prev + 1) % agents.length);
        return;
      }

      if (key === 'ArrowUp') {
        setSelectedIndex((prev) => (prev - 1 + agents.length) % agents.length);
        return;
      }

      if (key === 'Enter' || key === 'Tab') {
        const agent = agents[(selectedIndex + agents.length) % agents.length];
        if (agent) {
          onAgentSelect(agent.name);
        }
      }
    },
  }), [agents, onAgentSelect, onClose, selectedIndex]);

  const renderAgent = (agent: AgentInfo, index: number) => (
    <div
      key={agent.name}
      className={cn(
        'flex items-start gap-2 px-3 py-1.5 cursor-pointer rounded-lg typography-ui-label',
        index === selectedIndex && 'bg-accent'
      )}
      onClick={() => onAgentSelect(agent.name)}
      onMouseEnter={() => setSelectedIndex(index)}
>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold">#{agent.name}</span>
        </div>
        {agent.description && (
          <div className="typography-meta text-muted-foreground truncate">
            {agent.description}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div
      ref={containerRef}
      className="absolute z-[100] min-w-[240px] max-w-[360px] max-h-60 bg-popover border border-border rounded-xl shadow-none bottom-full mb-2 left-0 w-max flex flex-col"
    >
      <ScrollableOverlay outerClassName="flex-1 min-h-0" className="px-0">
        {agents.length ? (
          <div>
            {agents.map((agent, index) => renderAgent(agent, index))}
          </div>
        ) : (
          <div className="px-3 py-2 typography-ui-label text-muted-foreground">
            No agents found
          </div>
        )}
      </ScrollableOverlay>
      <div className="px-3 pt-1 pb-1.5 border-t typography-meta text-muted-foreground">
        ↑↓ navigate • Enter select • Esc close
      </div>
    </div>
  );
});

AgentMentionAutocomplete.displayName = 'AgentMentionAutocomplete';
