import React from 'react';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useConfigStore } from '@/stores/useConfigStore';

export interface AgentSelectorProps {
  /** Currently selected agent name (empty string for no agent) */
  value: string;
  /** Called when agent selection changes */
  onChange: (agentName: string) => void;
  /** Optional className for the trigger */
  className?: string;
  /** Whether the selector is disabled */
  disabled?: boolean;
  /** ID for accessibility */
  id?: string;
}

/**
 * Agent selector dropdown for selecting an agent for multi-run sessions.
 * Uses getVisibleAgents from useConfigStore to show available agents.
 */
export const AgentSelector: React.FC<AgentSelectorProps> = ({
  value,
  onChange,
  className,
  disabled,
  id,
}) => {
  const getVisibleAgents = useConfigStore((state) => state.getVisibleAgents);
  const loadAgents = useConfigStore((state) => state.loadAgents);
  const agents = getVisibleAgents();

  // Load agents on mount
  React.useEffect(() => {
    loadAgents();
  }, [loadAgents]);

  // Use empty string to represent "no agent" selection
  const handleValueChange = (newValue: string) => {
    onChange(newValue === '__none__' ? '' : newValue);
  };

  // Convert empty value to __none__ for the Select component (which doesn't handle empty strings well)
  const selectValue = value || '__none__';

  return (
    <Select
      value={selectValue}
      onValueChange={handleValueChange}
      disabled={disabled}
    >
      <SelectTrigger
        id={id}
        size="lg"
        className={className ?? 'max-w-full typography-meta text-foreground'}
      >
        <SelectValue placeholder="Select an agent (optional)" />
      </SelectTrigger>
      <SelectContent fitContent>
        <SelectGroup>
          <SelectLabel>Default</SelectLabel>
          <SelectItem value="__none__" className="w-auto whitespace-nowrap">
            No agent (default)
          </SelectItem>
        </SelectGroup>

        {agents.length > 0 && (
          <SelectGroup>
            <SelectLabel>Agents</SelectLabel>
            {agents.map((agent) => (
              <SelectItem
                key={agent.name}
                value={agent.name}
                className="w-auto whitespace-nowrap"
              >
                {agent.name}
              </SelectItem>
            ))}
          </SelectGroup>
        )}
      </SelectContent>
    </Select>
  );
};
