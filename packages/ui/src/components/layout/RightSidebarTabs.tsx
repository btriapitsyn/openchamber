import React from 'react';
import { RiFolder3Line, RiGitBranchLine } from '@remixicon/react';

import { AnimatedTabs } from '@/components/ui/animated-tabs';
import { GitView } from '@/components/views';
import { useUIStore } from '@/stores/useUIStore';
import { SidebarFilesTree } from './SidebarFilesTree';

type RightTab = 'git' | 'files';

export const RightSidebarTabs: React.FC = () => {
  const rightSidebarTab = useUIStore((state) => state.rightSidebarTab);
  const setRightSidebarTab = useUIStore((state) => state.setRightSidebarTab);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-sidebar">
      <div className="border-b border-border/40 bg-background px-3 py-1.5">
        <AnimatedTabs<RightTab>
          value={rightSidebarTab}
          onValueChange={setRightSidebarTab}
          size="sm"
          collapseLabelsOnSmall
          collapseLabelsOnNarrow
          tabs={[
            { value: 'git', label: 'Git', icon: RiGitBranchLine },
            { value: 'files', label: 'Files', icon: RiFolder3Line },
          ]}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {rightSidebarTab === 'git' ? <GitView mode="sidebar" /> : <SidebarFilesTree />}
      </div>
    </div>
  );
};
