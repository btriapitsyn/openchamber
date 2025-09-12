import React from 'react';
import { Toggle } from '@/components/ui/toggle';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { 
  Menu, 
  Moon, 
  Sun, 
  Monitor,
  Server,
  ServerOff
} from 'lucide-react';
import { OpenCodeIcon } from '@/components/ui/OpenCodeIcon';
import { useUIStore } from '@/stores/useUIStore';
import { useConfigStore } from '@/stores/useConfigStore';
import { cn } from '@/lib/utils';

export const Header: React.FC = () => {
  const { 
    theme, 
    setTheme, 
    toggleSidebar,
    isMobile,
    isSidebarOpen 
  } = useUIStore();
  
  const {
    isConnected
  } = useConfigStore();

  return (
    <header className="border-b dark:border-white/[0.05] bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
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
                <div className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors cursor-help bg-[#e5e5e5] dark:bg-[#222437]">
                  <OpenCodeIcon width={16} height={16} className="text-[#666] dark:text-white" />
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>{isConnected ? 'Connected to OpenCode server' : 'Disconnected from OpenCode server'}</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Theme Selector */}
          <div className="flex items-center border border-border/10 rounded-lg p-0.5 bg-muted/10">
            <Toggle
              pressed={theme === 'light'}
              onPressedChange={(pressed) => pressed && setTheme('light')}
              size="sm"
              className="h-7 w-7 rounded-md rounded-r-none data-[state=on]:bg-background data-[state=on]:shadow-sm focus-visible:ring-0 focus-visible:ring-offset-0"
            >
              <Sun className="h-3.5 w-3.5" />
            </Toggle>
            <Toggle
              pressed={theme === 'system'}
              onPressedChange={(pressed) => pressed && setTheme('system')}
              size="sm"
              className="h-7 w-7 rounded-none border-x-0 data-[state=on]:bg-background data-[state=on]:shadow-sm focus-visible:ring-0 focus-visible:ring-offset-0"
            >
              <Monitor className="h-3.5 w-3.5" />
            </Toggle>
            <Toggle
              pressed={theme === 'dark'}
              onPressedChange={(pressed) => pressed && setTheme('dark')}
              size="sm"
              className="h-7 w-7 rounded-md rounded-l-none data-[state=on]:bg-background data-[state=on]:shadow-sm focus-visible:ring-0 focus-visible:ring-offset-0"
            >
              <Moon className="h-3.5 w-3.5" />
            </Toggle>
          </div>
        </div>
      </div>
    </header>
  );
};