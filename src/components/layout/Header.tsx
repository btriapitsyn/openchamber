import React from 'react';
import { Toggle } from '@/components/ui/toggle';
import { 
  Menu, 
  Moon, 
  Sun, 
  Monitor,
  Wifi,
  WifiOff,
  Terminal
} from 'lucide-react';
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
      <div className="flex items-center justify-between px-4 h-14">
        <div className="flex items-center gap-4">
          <button
            onClick={() => {
              console.log('Hamburger clicked, current sidebar state:', isSidebarOpen);
              toggleSidebar();
              console.log('After toggle, new state should be:', !isSidebarOpen);
            }}
            className="md:hidden h-9 w-9 p-2 hover:bg-accent rounded-md"
          >
            <Menu className="h-5 w-5" />
          </button>
          
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Terminal className="h-4 w-4 text-primary" />
            </div>
            <span className="font-bold text-lg tracking-tight">OpenCode</span>
          </div>

          <div className={cn(
            "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors",
            isConnected 
              ? "bg-green-600/15 text-green-800 dark:text-[#81af6c] dark:bg-[#81af6c]/10" 
              : "bg-orange-500/15 text-orange-800 dark:text-[#d98678] dark:bg-[#d98678]/10"
          )}>
            {isConnected ? (
              <>
                <Wifi className="h-3 w-3" />
                <span>Connected</span>
              </>
            ) : (
              <>
                <WifiOff className="h-3 w-3" />
                <span>Disconnected</span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Theme Selector */}
          <div className="flex items-center border border-border/10 rounded-lg p-0.5 bg-muted/10">
            <Toggle
              pressed={theme === 'light'}
              onPressedChange={(pressed) => pressed && setTheme('light')}
              size="sm"
              className="h-7 w-7 rounded-md rounded-r-none data-[state=on]:bg-background data-[state=on]:shadow-sm"
            >
              <Sun className="h-3.5 w-3.5" />
            </Toggle>
            <Toggle
              pressed={theme === 'system'}
              onPressedChange={(pressed) => pressed && setTheme('system')}
              size="sm"
              className="h-7 w-7 rounded-none border-x-0 data-[state=on]:bg-background data-[state=on]:shadow-sm"
            >
              <Monitor className="h-3.5 w-3.5" />
            </Toggle>
            <Toggle
              pressed={theme === 'dark'}
              onPressedChange={(pressed) => pressed && setTheme('dark')}
              size="sm"
              className="h-7 w-7 rounded-md rounded-l-none data-[state=on]:bg-background data-[state=on]:shadow-sm"
            >
              <Moon className="h-3.5 w-3.5" />
            </Toggle>
          </div>
        </div>
      </div>
    </header>
  );
};