import React from 'react';
import { usePromptEnhancerConfig } from '@/stores/usePromptEnhancerConfig';
import { useShallow } from 'zustand/react/shallow';
import { PromptEnhancerSettings } from './PromptEnhancerSettings';

export const PromptEnhancerPage: React.FC = () => {
  const { config, activeGroupId, setActiveGroupId } = usePromptEnhancerConfig(
    useShallow((state) => ({
      config: state.config,
      activeGroupId: state.activeGroupId,
      setActiveGroupId: state.setActiveGroupId,
    })),
  );

  const availableGroups = React.useMemo(
    () => config.groupOrder.filter((groupId) => Boolean(config.groups[groupId])),
    [config],
  );

  React.useEffect(() => {
    if (availableGroups.length === 0) {
      return;
    }
    if (!availableGroups.includes(activeGroupId)) {
      setActiveGroupId(availableGroups[0]);
    }
  }, [activeGroupId, availableGroups, setActiveGroupId]);

  if (availableGroups.length === 0) {
    return null;
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-6 p-6">
        <PromptEnhancerSettings />
      </div>
    </div>
  );
};
