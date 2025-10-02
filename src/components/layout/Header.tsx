 import React, { useEffect } from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { Menu, RefreshCcw } from 'lucide-react';
import { OpenCodeIcon } from '@/components/ui/OpenCodeIcon';
import { ThemeSwitcher } from '@/components/ui/ThemeSwitcher';
 import { useUIStore } from '@/stores/useUIStore';
 import { useConfigStore } from '@/stores/useConfigStore';
 import { useSessionStore } from '@/stores/useSessionStore';
 import { ContextUsageDisplay } from '@/components/ui/ContextUsageDisplay';

 export const Header: React.FC = () => {
   const { 
     toggleSidebar,
     isSidebarOpen 
   } = useUIStore();
   
     const {
       isConnected,
       getCurrentModel,
       loadProviders,
       loadAgents
     } = useConfigStore();


     const { getContextUsage, updateSessionContextUsage, messages, currentSessionId } = useSessionStore();
 
     const currentModel = getCurrentModel();
     const contextLimit = currentModel?.limit?.context || 0;
     const contextUsage = getContextUsage(contextLimit);
     const [isReloadingConfig, setIsReloadingConfig] = React.useState(false);
 
     const handleReloadConfiguration = React.useCallback(async () => {
       if (isReloadingConfig) {
         return;
       }
 
       setIsReloadingConfig(true);
       try {
         await Promise.all([loadProviders(), loadAgents()]);
       } catch (error) {
         console.error('Failed to reload configuration:', error);
       } finally {
         setIsReloadingConfig(false);
       }
     }, [isReloadingConfig, loadAgents, loadProviders]);


    // Update cache after render to avoid setState during render
    useEffect(() => {
        if (contextUsage && contextLimit > 0 && currentSessionId) {
            updateSessionContextUsage(currentSessionId, contextLimit);
        }
    }, [contextLimit, currentSessionId]);

   return (

    <header className="header-safe-area border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80" style={{ borderColor: 'var(--interactive-border)' }}>
      <div className="flex items-center justify-between px-4 h-12">
        <div className="flex items-center gap-4">
          <button
            onClick={() => {
              toggleSidebar();
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
           {contextUsage && contextUsage.totalTokens > 0 && (
             <ContextUsageDisplay
               totalTokens={contextUsage.totalTokens}
               percentage={contextUsage.percentage}
               contextLimit={contextUsage.contextLimit}
             />
           )}
           <Tooltip>
             <TooltipTrigger asChild>
               <Button
                 type="button"
                 variant="ghost"
                 size="sm"
                 onClick={handleReloadConfiguration}
                 disabled={isReloadingConfig}
                 aria-label="Refresh OpenCode configuration"
                 className="h-8 px-2"
                >
                  <RefreshCcw className={`h-3.5 w-3.5 ${isReloadingConfig ? 'animate-spin-once' : ''}`} />
                </Button>

             </TooltipTrigger>
             <TooltipContent>
               <p>Refresh OpenCode configuration</p>
             </TooltipContent>
           </Tooltip>
           {/* Theme Switcher */}
           <ThemeSwitcher />
         </div>
      </div>
    </header>
  );
};