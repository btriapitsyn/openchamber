import React from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Menu } from 'lucide-react';
import { OpenCodeIcon } from '@/components/ui/OpenCodeIcon';
import { ThemeSwitcher } from '@/components/ui/ThemeSwitcher';
import { useUIStore } from '@/stores/useUIStore';
import { useConfigStore } from '@/stores/useConfigStore';

export const Header: React.FC = () => {
  const { 
    toggleSidebar,
    isSidebarOpen 
  } = useUIStore();
  
  const {
    isConnected
  } = useConfigStore();

  return (
    <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80" style={{ borderColor: 'var(--interactive-border)' }}>
      <div className="flex items-center justify-between px-4 h-12">
        <div className="flex items-center gap-4">
          <button
            onClick={() => {
              console.log('Hamburger clicked, current sidebar state:', isSidebarOpen);
              toggleSidebar();
              console.log('After toggle, new state should be:', !isSidebarOpen);
            }}
            className="h-9 w-9 p-2 hover:bg-accent rounded-md"
          >
            <Menu className="h-5 w-5" />
          </button>
          
          <div className="flex items-center gap-2.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors cursor-help" style={{ backgroundColor: 'var(--surface-muted)' }}>
                  <OpenCodeIcon width={16} height={16} className="opacity-70" />
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>{isConnected ? 'Connected to OpenCode server' : 'Disconnected from OpenCode server'}</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Theme Switcher */}
          <ThemeSwitcher />
        </div>
      </div>
    </header>
  );
};