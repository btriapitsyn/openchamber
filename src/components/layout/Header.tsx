import React, { useEffect } from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { SidebarSimple as PanelLeftOpen, SidebarSimple as PanelLeftClose, ArrowClockwise as RefreshCcw, CaretDown as ChevronDown, CaretUp as ChevronUp, Palette } from '@phosphor-icons/react';
import { OpenCodeIcon } from '@/components/ui/OpenCodeIcon';
import { ThemeSwitcher } from '@/components/ui/ThemeSwitcher';
import { useUIStore } from '@/stores/useUIStore';
import { useConfigStore } from '@/stores/useConfigStore';
import { useSessionStore } from '@/stores/useSessionStore';
import { ContextUsageDisplay } from '@/components/ui/ContextUsageDisplay';
import { useDirectoryStore } from '@/stores/useDirectoryStore';
import { useDeviceInfo } from '@/lib/device';
import { cn, formatDirectoryName, formatPathForDisplay } from '@/lib/utils';
import { reloadOpenCodeConfiguration } from '@/stores/useAgentsStore';

export const Header: React.FC = () => {
  const toggleSidebar = useUIStore((state) => state.toggleSidebar);
  const isSidebarOpen = useUIStore((state) => state.isSidebarOpen);
  const sidebarSection = useUIStore((state) => state.sidebarSection);

  const {
    isConnected,
    getCurrentModel,
  } = useConfigStore();

  const getContextUsage = useSessionStore((state) => state.getContextUsage);
  const updateSessionContextUsage = useSessionStore((state) => state.updateSessionContextUsage);
  const currentSessionId = useSessionStore((state) => state.currentSessionId);
  const sessions = useSessionStore((state) => state.sessions);

  const { currentDirectory, homeDirectory } = useDirectoryStore();
  const { isMobile } = useDeviceInfo();

  const currentModel = getCurrentModel();
  const contextLimit = currentModel?.limit?.context || 0;
  const contextUsage = getContextUsage(contextLimit);
  const [isMobileDetailsOpen, setIsMobileDetailsOpen] = React.useState(false);

  const handleReloadConfiguration = React.useCallback(() => {
    void reloadOpenCodeConfiguration();
  }, []);

  useEffect(() => {
    if (contextLimit > 0 && currentSessionId) {
      updateSessionContextUsage(currentSessionId, contextLimit);
    }
  }, [contextLimit, currentSessionId, updateSessionContextUsage]);

  const activeSessionTitle = React.useMemo(() => {
    if (!currentSessionId) {
      return 'No active session';
    }
    const session = sessions.find((item) => item.id === currentSessionId);
    const title = session?.title?.trim() ?? '';
    if (title.length === 0) {
      return 'Untitled Session';
    }
    return title;
  }, [currentSessionId, sessions]);

  const directoryTooltip = React.useMemo(() => {
    return formatPathForDisplay(currentDirectory, homeDirectory);
  }, [currentDirectory, homeDirectory]);

  const directoryDisplay = React.useMemo(() => {
    return formatDirectoryName(currentDirectory, homeDirectory);
  }, [currentDirectory, homeDirectory]);

  const sessionTitleClass = cn(
    'truncate font-semibold text-foreground',
    isMobile ? 'typography-meta' : 'typography-ui-label'
  );

  const directoryClass = cn(
    'truncate text-muted-foreground',
    isMobile ? 'typography-micro' : 'typography-meta'
  );

  const isSessionsSection = sidebarSection === 'sessions';

  const renderDesktop = () => (
    <div className="app-region-drag relative flex h-12 select-none items-center justify-between px-4">
      <div className={cn('flex min-w-0 items-center gap-3 app-region-no-drag')}>
        <button
          onClick={toggleSidebar}
          className="app-region-no-drag h-9 w-9 rounded-md p-2 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-label="Toggle sidebar"
        >
          {isSidebarOpen ? <PanelLeftOpen className="h-5 w-5" weight="duotone" /> : <PanelLeftClose className="h-5 w-5" weight="regular" />}
        </button>
        <div className="flex items-center gap-2 min-w-0">
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className="app-region-no-drag flex h-8 w-8 cursor-help items-center justify-center rounded-lg transition-colors"
                style={{ backgroundColor: 'rgb(from var(--primary) r g b / 0.1)', color: 'var(--primary)' }}
              >
                <OpenCodeIcon width={16} height={16} className="opacity-70" />
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>{isConnected ? 'Connected to OpenCode server' : 'Disconnected from OpenCode server'}</p>
            </TooltipContent>
          </Tooltip>
          {isSessionsSection && (
            <div className="flex min-w-0 flex-col leading-tight">
              <span className={sessionTitleClass} title={activeSessionTitle}>
                {activeSessionTitle}
              </span>
              <span className={directoryClass} title={directoryTooltip}>
                {directoryDisplay}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 app-region-no-drag">
        {isSessionsSection && contextUsage && contextUsage.totalTokens > 0 && (
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
              aria-label="Refresh OpenCode configuration"
              className="app-region-no-drag h-8 px-2"
            >
              <RefreshCcw className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Refresh OpenCode configuration</p>
          </TooltipContent>
        </Tooltip>
        <div className="app-region-no-drag">
          <ThemeSwitcher />
        </div>
      </div>
    </div>
  );

  const renderMobile = () => (
    <div className="app-region-drag relative flex flex-col gap-1 px-3 py-2 select-none">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 app-region-no-drag">
          <button
            onClick={toggleSidebar}
            className="app-region-no-drag h-9 w-9 rounded-md p-2 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            aria-label="Toggle sidebar"
          >
            {isSidebarOpen ? <PanelLeftOpen className="h-5 w-5" weight="duotone" /> : <PanelLeftClose className="h-5 w-5" weight="regular" />}
          </button>
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className="app-region-no-drag flex h-8 w-8 cursor-help items-center justify-center rounded-lg transition-colors"
                style={{ backgroundColor: 'rgb(from var(--primary) r g b / 0.1)', color: 'var(--primary)' }}
              >
                <OpenCodeIcon width={16} height={16} className="opacity-70" />
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>{isConnected ? 'Connected to OpenCode server' : 'Disconnected from OpenCode server'}</p>
            </TooltipContent>
          </Tooltip>
          {isSessionsSection && (
            <span className={sessionTitleClass} title={activeSessionTitle}>
              {activeSessionTitle}
            </span>
          )}
        </div>

        <div className="app-region-no-drag flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-expanded={isMobileDetailsOpen}
            aria-controls="mobile-header-details"
            onClick={() => setIsMobileDetailsOpen((prev) => !prev)}
            className="app-region-no-drag h-8 w-8"
          >
            {isMobileDetailsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {isMobileDetailsOpen && (
        <div
          id="mobile-header-details"
          className="app-region-no-drag absolute left-0 right-0 top-full z-40 translate-y-2 px-3"
        >
          <div className="flex flex-col gap-3 rounded-lg border border-border/40 bg-background/95 px-3 py-3 shadow-xl">
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleReloadConfiguration}
                className="app-region-no-drag flex w-full items-center justify-center gap-2 rounded-md border-border/60 bg-background/80 py-2 text-foreground hover:bg-accent/40"
              >
                <RefreshCcw className="h-4 w-4" />
                Refresh config
              </Button>
              <ThemeSwitcher
                customTrigger={
                  <Button
                    type="button"
                    variant="outline"
                    className="app-region-no-drag flex w-full items-center justify-center gap-2 rounded-md border-border/60 bg-background/80 py-2 text-foreground hover:bg-accent/40"
                  >
                    <Palette className="h-4 w-4" />
                    Switch theme
                  </Button>
                }
              />
            </div>

            {isSessionsSection && (
              <div className="flex min-w-0 flex-col gap-1">
                <div className="flex flex-col">
                  <span className="typography-micro text-muted-foreground">Directory</span>
                  <span className={cn(directoryClass, 'text-foreground')} title={directoryTooltip}>
                    {directoryDisplay}
                  </span>
                </div>
                {contextUsage && contextUsage.totalTokens > 0 && (
                  <div className="flex flex-col">
                    <span className="typography-micro text-muted-foreground">Context usage</span>
                    <ContextUsageDisplay
                      totalTokens={contextUsage.totalTokens}
                      percentage={contextUsage.percentage}
                      contextLimit={contextUsage.contextLimit}
                      size="compact"
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <header
      className="header-safe-area border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80"
      style={{ borderColor: 'var(--interactive-border)' }}
    >
      {isMobile ? renderMobile() : renderDesktop()}
    </header>
  );
};
