import React from 'react';
import { cn } from '@/lib/utils';
import { useUIStore, type RightSidebarTab } from '@/stores/useUIStore';
import { GitBranch, GitDiff, Terminal } from '@phosphor-icons/react';

export const RIGHT_SIDEBAR_WIDTH = 400;

interface RightSidebarProps {
  isOpen: boolean;
  isMobile: boolean;
  children: React.ReactNode;
}

const TAB_CONFIGS: Array<{ id: RightSidebarTab; label: string; icon: React.ElementType }> = [
  { id: 'git', label: 'Git', icon: GitBranch },
  { id: 'diff', label: 'Diff', icon: GitDiff },
  { id: 'terminal', label: 'Terminal', icon: Terminal },
];

export const RightSidebar: React.FC<RightSidebarProps> = ({ isOpen, isMobile, children }) => {
  const { rightSidebarActiveTab, setRightSidebarActiveTab } = useUIStore();

  // Hide on mobile
  if (isMobile) {
    return null;
  }

  const appliedWidth = isOpen ? RIGHT_SIDEBAR_WIDTH : 0;

  return (
    <aside
      className={cn(
        'relative flex h-full flex-col border-l bg-sidebar transition-all duration-300 ease-in-out overflow-hidden',
        !isOpen && 'border-l-0'
      )}
      style={{
        width: `${appliedWidth}px`,
        minWidth: `${appliedWidth}px`,
        maxWidth: `${appliedWidth}px`,
      }}
      aria-hidden={!isOpen}
    >
      {isOpen && (
        <>
          {/* Tab Navigation */}
          <div className="flex items-center gap-0.5 bg-background/95 px-1.5 py-1">
            {TAB_CONFIGS.map(({ id, label, icon: Icon }) => {
              const isActive = rightSidebarActiveTab === id;
              return (
                <button
                  key={id}
                  onClick={() => setRightSidebarActiveTab(id)}
                  className={cn(
                    'flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visual:ring-primary',
                    isActive
                      ? 'text-primary'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                  aria-pressed={isActive}
                >
                  <Icon size={14} weight={isActive ? 'fill' : 'regular'} />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-hidden">
            {children}
          </div>
        </>
      )}
    </aside>
  );
};
