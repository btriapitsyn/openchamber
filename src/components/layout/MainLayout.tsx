import React from 'react';
import { Header } from './Header';
import { SessionList } from '../session/SessionList';
import { ChatContainer } from '../chat/ChatContainer';
import { useUIStore } from '@/stores/useUIStore';
import { cn } from '@/lib/utils';

export const MainLayout: React.FC = () => {
  const { isSidebarOpen, setIsMobile, setSidebarOpen } = useUIStore();

  // Detect mobile viewport
  React.useEffect(() => {
    const checkMobile = () => {
      const isMobileView = window.innerWidth < 768;
      setIsMobile(isMobileView);
      
      // Auto-close sidebar on mobile
      if (isMobileView) {
        setSidebarOpen(false);
      }
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => window.removeEventListener('resize', checkMobile);
  }, [setIsMobile, setSidebarOpen]);

  return (
    <div className="flex flex-col h-screen bg-background">
      <Header />
      
      <div className="flex flex-1 overflow-hidden bg-background">
        {/* Sidebar */}
        <aside
          className={cn(
            "border-r bg-background transition-all duration-300",
            "md:relative md:translate-x-0",
            isSidebarOpen ? "w-64" : "w-0",
            // Mobile styles
            "absolute inset-y-0 left-0 z-40 md:z-0",
            isSidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
          )}
        >
          <div className="w-64 h-full">
            <SessionList />
          </div>
        </aside>

        {/* Overlay for mobile */}
        {isSidebarOpen && (
          <div
            className="fixed inset-0 bg-background/80 backdrop-blur-sm z-30 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Main Content */}
        <main className="flex-1 overflow-hidden bg-background">
          <ChatContainer />
        </main>
      </div>
    </div>
  );
};