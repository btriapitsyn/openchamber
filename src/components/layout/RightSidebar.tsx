import React from 'react';
import { cn } from '@/lib/utils';
import { useUIStore, type RightSidebarTab } from '@/stores/useUIStore';
import { GitBranch, GitDiff, Terminal } from '@phosphor-icons/react';

export const RIGHT_SIDEBAR_DEFAULT_WIDTH = 460;
const RIGHT_SIDEBAR_MIN_WIDTH = 360;
const RIGHT_SIDEBAR_MAX_WIDTH = 720;

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
  const {
    rightSidebarActiveTab,
    setRightSidebarActiveTab,
    rightSidebarWidth,
    setRightSidebarWidth,
  } = useUIStore();
  const [isResizing, setIsResizing] = React.useState(false);
  const startXRef = React.useRef(0);
  const startWidthRef = React.useRef(rightSidebarWidth || RIGHT_SIDEBAR_DEFAULT_WIDTH);

  React.useEffect(() => {
    if (isMobile || !isResizing) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const delta = startXRef.current - event.clientX;
      const nextWidth = Math.min(
        RIGHT_SIDEBAR_MAX_WIDTH,
        Math.max(RIGHT_SIDEBAR_MIN_WIDTH, startWidthRef.current + delta)
      );
      setRightSidebarWidth(nextWidth);
    };

    const handlePointerUp = () => {
      setIsResizing(false);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp, { once: true });

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [isMobile, isResizing, setRightSidebarWidth]);

  React.useEffect(() => {
    if (isMobile && isResizing) {
      setIsResizing(false);
    }
  }, [isMobile, isResizing]);

  if (isMobile) {
    return null;
  }

  const appliedWidth = isOpen
    ? Math.min(
        RIGHT_SIDEBAR_MAX_WIDTH,
        Math.max(RIGHT_SIDEBAR_MIN_WIDTH, rightSidebarWidth || RIGHT_SIDEBAR_DEFAULT_WIDTH)
      )
    : 0;

  const handlePointerDown = (event: React.PointerEvent) => {
    if (!isOpen) {
      return;
    }
    setIsResizing(true);
    startXRef.current = event.clientX;
    startWidthRef.current = appliedWidth;
    event.preventDefault();
  };

  return (
    <aside
      className={cn(
        'relative flex h-full flex-col border-l bg-sidebar overflow-hidden',
        isResizing ? 'transition-none' : 'transition-all duration-300 ease-in-out',
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
        <div
          className={cn(
            'absolute left-0 top-0 z-10 h-full w-[6px] -ml-[3px] cursor-col-resize',
            isResizing ? 'bg-primary/30' : 'bg-transparent hover:bg-primary/20'
          )}
          onPointerDown={handlePointerDown}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize right panel"
        />
      )}
      <div
        className={cn(
          'flex h-full flex-col transition-opacity duration-200 ease-in-out',
          !isOpen && 'pointer-events-none opacity-0 select-none'
        )}
        aria-hidden={!isOpen}
      >
        <div className="flex items-center gap-0.5 bg-background/95 px-1.5 py-1">
          {TAB_CONFIGS.map(({ id, label, icon: Icon }) => {
            const isActive = rightSidebarActiveTab === id;
            return (
              <button
                key={id}
                onClick={() => setRightSidebarActiveTab(id)}
                className={cn(
                  'flex flex-1 items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visual:ring-primary',
                  isActive
                    ? 'text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                )}
                aria-pressed={isActive}
                tabIndex={isOpen ? 0 : -1}
              >
                <Icon size={14} weight={isActive ? 'fill' : 'regular'} />
                <span>{label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex-1 overflow-hidden">{children}</div>
      </div>
    </aside>
  );
};
