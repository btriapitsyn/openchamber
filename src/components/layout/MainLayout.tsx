import React from 'react';
import { Header } from './Header';
import { SessionList } from '../session/SessionList';
import { ChatContainer } from '../chat/ChatContainer';
import { CommandPalette } from '../ui/CommandPalette';
import { HelpDialog } from '../ui/HelpDialog';
import { useUIStore } from '@/stores/useUIStore';
import { cn } from '@/lib/utils';

export const MainLayout: React.FC = () => {
  const { isSidebarOpen, setIsMobile, setSidebarOpen } = useUIStore();
  const [sidebarWidth, setSidebarWidth] = React.useState(260);
  const [isResizing, setIsResizing] = React.useState(false);

  // Detect mobile viewport
  React.useEffect(() => {
    const checkMobile = () => {
      const isMobileView = window.innerWidth < 768;
      const wasMobile = useUIStore.getState().isMobile;
      setIsMobile(isMobileView);
      
      // Auto-close sidebar on mobile, auto-open on desktop
      if (isMobileView && !wasMobile) {
        // Transitioning to mobile
        setSidebarOpen(false);
      } else if (!isMobileView && wasMobile) {
        // Transitioning to desktop
        setSidebarOpen(true);
      }
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => window.removeEventListener('resize', checkMobile);
  }, [setIsMobile, setSidebarOpen]);

  // Handle sidebar resize
  const startResizing = React.useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  React.useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      
      const newWidth = Math.min(Math.max(200, e.clientX), 500);
      setSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  return (
    <div className="flex flex-col h-screen bg-background">
      <Header />
      <CommandPalette />
      <HelpDialog />
      
      <div className="flex flex-1 overflow-hidden bg-background">
        {/* Sidebar */}
        <aside
          className={cn(
            "relative flex-shrink-0 bg-sidebar border-r",
            // Desktop styles
            "md:block",
            // Mobile styles - slide in/out
            "fixed md:relative inset-y-0 left-0 z-40 md:z-0",
            "transform transition-all duration-300 ease-in-out",
            isSidebarOpen ? "translate-x-0 w-full opacity-100" : "-translate-x-full w-0 opacity-0"
          )}
          style={{ 
            width: isSidebarOpen ? `${sidebarWidth}px` : '0px',
            transition: 'width 300ms ease-in-out, opacity 300ms ease-in-out, transform 300ms ease-in-out'
          }}
        >
            <div className="h-full overflow-hidden">
              <SessionList />
            </div>
            
            {/* Resize handle - only on desktop */}
            <div
              className={cn(
                "absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/30 transition-colors hidden md:block",
                "hover:w-1.5",
                isResizing && "bg-primary/40 w-1.5"
              )}
              onMouseDown={startResizing}
            >
              <div className="absolute inset-y-0 -left-1 -right-1 w-3" />
            </div>
          </aside>

        {/* Overlay for mobile */}
        <div
          className={cn(
            "fixed inset-0 bg-background/80 backdrop-blur-sm z-30 md:hidden",
            "transition-opacity duration-300",
            isSidebarOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
          )}
          onClick={() => setSidebarOpen(false)}
        />

        {/* Main Content */}
        <main className="flex-1 overflow-hidden bg-background">
          <ChatContainer />
        </main>
      </div>
    </div>
  );
};