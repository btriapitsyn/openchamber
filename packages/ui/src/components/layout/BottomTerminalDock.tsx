import React from 'react';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/stores/useUIStore';

const BOTTOM_DOCK_MIN_HEIGHT = 180;
const BOTTOM_DOCK_MAX_HEIGHT = 640;
const BOTTOM_DOCK_COLLAPSE_THRESHOLD = 110;

interface BottomTerminalDockProps {
  isOpen: boolean;
  isMobile: boolean;
  children: React.ReactNode;
}

export const BottomTerminalDock: React.FC<BottomTerminalDockProps> = ({ isOpen, isMobile, children }) => {
  const bottomTerminalHeight = useUIStore((state) => state.bottomTerminalHeight);
  const setBottomTerminalHeight = useUIStore((state) => state.setBottomTerminalHeight);
  const setBottomTerminalOpen = useUIStore((state) => state.setBottomTerminalOpen);
  const [isResizing, setIsResizing] = React.useState(false);
  const startYRef = React.useRef(0);
  const startHeightRef = React.useRef(bottomTerminalHeight || 300);

  React.useEffect(() => {
    if (isMobile || !isResizing) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const delta = startYRef.current - event.clientY;
      const nextHeight = Math.min(
        BOTTOM_DOCK_MAX_HEIGHT,
        Math.max(BOTTOM_DOCK_MIN_HEIGHT, startHeightRef.current + delta)
      );
      setBottomTerminalHeight(nextHeight);
    };

    const handlePointerUp = () => {
      setIsResizing(false);
      const latestState = useUIStore.getState();
      if (latestState.bottomTerminalHeight <= BOTTOM_DOCK_COLLAPSE_THRESHOLD) {
        setBottomTerminalOpen(false);
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp, { once: true });

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [isMobile, isResizing, setBottomTerminalHeight, setBottomTerminalOpen]);

  if (isMobile) {
    return null;
  }

  const appliedHeight = isOpen
    ? Math.min(BOTTOM_DOCK_MAX_HEIGHT, Math.max(BOTTOM_DOCK_MIN_HEIGHT, bottomTerminalHeight || 300))
    : 0;

  const handlePointerDown = (event: React.PointerEvent) => {
    if (!isOpen) return;
    setIsResizing(true);
    startYRef.current = event.clientY;
    startHeightRef.current = appliedHeight;
    event.preventDefault();
  };

  return (
    <section
      className={cn(
        'relative flex overflow-hidden border-t border-border bg-sidebar',
        isResizing ? 'transition-none' : 'transition-[height] duration-300 ease-in-out',
        !isOpen && 'border-t-0'
      )}
      style={{
        height: `${appliedHeight}px`,
        minHeight: `${appliedHeight}px`,
        maxHeight: `${appliedHeight}px`,
      }}
      aria-hidden={!isOpen || appliedHeight === 0}
    >
      {isOpen && (
        <div
          className={cn(
            'absolute left-0 top-0 z-20 h-[4px] w-full cursor-row-resize hover:bg-primary/50 transition-colors',
            isResizing && 'bg-primary'
          )}
          onPointerDown={handlePointerDown}
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize terminal panel"
        />
      )}

      <div
        className={cn(
          'relative z-10 flex h-full min-h-0 w-full flex-col transition-opacity duration-300 ease-in-out',
          !isOpen && 'pointer-events-none select-none opacity-0'
        )}
        aria-hidden={!isOpen}
      >
        {children}
      </div>
    </section>
  );
};
