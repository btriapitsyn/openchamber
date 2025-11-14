import React, { useEffect } from 'react';
import type { Session } from '@opencode-ai/sdk';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { Sidebar, CaretDown as ChevronDown, CaretUp as ChevronUp, Gear, ListStar } from '@phosphor-icons/react';
import { SettingsDialog } from '@/components/layout/SettingsDialog';
import { useUIStore } from '@/stores/useUIStore';
import { useConfigStore } from '@/stores/useConfigStore';
import { useSessionStore } from '@/stores/useSessionStore';
import { ContextUsageDisplay } from '@/components/ui/ContextUsageDisplay';
import { useDirectoryStore } from '@/stores/useDirectoryStore';
import { useDeviceInfo } from '@/lib/device';
import { cn, formatDirectoryName, formatPathForDisplay } from '@/lib/utils';

type SessionWithDirectory = Session & { directory?: string | null };

export const FixedSessionsButton: React.FC = () => {
  const setSessionSwitcherOpen = useUIStore((state) => state.setSessionSwitcherOpen);
  const toggleSidebar = useUIStore((state) => state.toggleSidebar);
  const { isMobile } = useDeviceInfo();

  const [isDesktopApp, setIsDesktopApp] = React.useState<boolean>(() => {
    if (typeof window === 'undefined') {
      return false;
    }
    return typeof (window as typeof window & { opencodeDesktop?: unknown }).opencodeDesktop !== 'undefined';
  });

  const isMacPlatform = React.useMemo(() => {
    if (typeof navigator === 'undefined') {
      return false;
    }
    return /Macintosh|Mac OS X/.test(navigator.userAgent || '');
  }, []);

  React.useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const detected = typeof (window as typeof window & { opencodeDesktop?: unknown }).opencodeDesktop !== 'undefined';
    setIsDesktopApp(detected);
  }, []);

  const handleOpenSessionSwitcher = React.useCallback(() => {
    if (isMobile) {
      setSessionSwitcherOpen(true);
    } else {
      toggleSidebar();
    }
  }, [isMobile, setSessionSwitcherOpen, toggleSidebar]);

  const headerIconButtonClass = 'app-region-no-drag inline-flex h-9 w-9 items-center justify-center gap-2 p-2 typography-ui-label font-medium text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-50 hover:text-foreground';

  if (isMobile || !isDesktopApp || !isMacPlatform) {
    return null;
  }

  return (
     <div className="fixed top-[0.375rem] left-[5.25rem] z-[9999]" style={{ pointerEvents: 'auto' }}>
       <button
         type="button"
         onClick={handleOpenSessionSwitcher}
         aria-label="Open sessions"
         className={headerIconButtonClass}
       >
         <ListStar className="h-5 w-5" weight="duotone" />
       </button>
     </div>
  );
};

export const Header: React.FC = () => {
  const toggleRightSidebar = useUIStore((state) => state.toggleRightSidebar);
  const isRightSidebarOpen = useUIStore((state) => state.isRightSidebarOpen);
  const setSessionSwitcherOpen = useUIStore((state) => state.setSessionSwitcherOpen);
  const toggleSidebar = useUIStore((state) => state.toggleSidebar);
  const isSidebarOpen = useUIStore((state) => state.isSidebarOpen);

  const { getCurrentModel } = useConfigStore();

  const getContextUsage = useSessionStore((state) => state.getContextUsage);
  const currentSessionId = useSessionStore((state) => state.currentSessionId);
  const sessions = useSessionStore((state) => state.sessions);
  const worktreeMetadata = useSessionStore((state) => state.worktreeMetadata);

  const { currentDirectory, homeDirectory } = useDirectoryStore();
  const { isMobile } = useDeviceInfo();
 
  const headerRef = React.useRef<HTMLElement | null>(null);
 
  const [isDesktopApp, setIsDesktopApp] = React.useState<boolean>(() => {


    if (typeof window === 'undefined') {
      return false;
    }
    return typeof (window as typeof window & { opencodeDesktop?: unknown }).opencodeDesktop !== 'undefined';
  });

  const isMacPlatform = React.useMemo(() => {
    if (typeof navigator === 'undefined') {
      return false;
    }
    return /Macintosh|Mac OS X/.test(navigator.userAgent || '');
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const detected = typeof (window as typeof window & { opencodeDesktop?: unknown }).opencodeDesktop !== 'undefined';
    setIsDesktopApp(detected);
  }, []);

  const currentModel = getCurrentModel();
  const limit = currentModel && typeof currentModel.limit === 'object' && currentModel.limit !== null
    ? (currentModel.limit as Record<string, unknown>)
    : null;
  const contextLimit = (limit && typeof limit.context === 'number' ? limit.context : 0);
  const outputLimit = (limit && typeof limit.output === 'number' ? limit.output : 0);
  const contextUsage = getContextUsage(contextLimit, outputLimit);
  const [isMobileDetailsOpen, setIsMobileDetailsOpen] = React.useState(false);
  const isSettingsDialogOpen = useUIStore((state) => state.isSettingsDialogOpen);
  const setSettingsDialogOpen = useUIStore((state) => state.setSettingsDialogOpen);
  const isSessionSwitcherOpen = useUIStore((state) => state.isSessionSwitcherOpen);

  const handleOpenSessionSwitcher = React.useCallback(() => {
    if (isMobile) {
      setSessionSwitcherOpen(!isSessionSwitcherOpen);
      return;
    }
    toggleSidebar();
  }, [isMobile, isSessionSwitcherOpen, setSessionSwitcherOpen, toggleSidebar]);

  const currentSession = React.useMemo(() => {
    if (!currentSessionId) {
      return null;
    }
    return sessions.find((item) => item.id === currentSessionId) ?? null;
  }, [currentSessionId, sessions]);

  const activeSessionTitle = React.useMemo(() => {
    if (!currentSessionId) {
      return 'No active session';
    }
    const title = currentSession?.title?.trim() ?? '';
    if (title.length === 0) {
      return 'Untitled Session';
    }
    return title;
  }, [currentSessionId, currentSession]);

  const sessionDirectory = (currentSession as SessionWithDirectory | null)?.directory ?? null;
  const currentWorktree = currentSessionId ? worktreeMetadata.get(currentSessionId) : undefined;
  const effectiveDirectory = currentWorktree?.path ?? sessionDirectory ?? currentDirectory;

  const directoryTooltip = React.useMemo(() => {
    return formatPathForDisplay(effectiveDirectory, homeDirectory);
  }, [effectiveDirectory, homeDirectory]);

  const directoryDisplay = React.useMemo(() => {
    return formatDirectoryName(effectiveDirectory, homeDirectory);
  }, [effectiveDirectory, homeDirectory]);

  const sessionTitleClass = cn(
    'truncate font-semibold text-foreground',
    isMobile ? 'typography-meta' : 'typography-ui-label'
  );

  const directoryClass = cn(
    'truncate text-muted-foreground',
    isMobile ? 'typography-micro' : 'typography-meta'
  );

  const headerIconButtonClass = 'app-region-no-drag inline-flex h-9 w-9 items-center justify-center gap-2 p-2 typography-ui-label font-medium text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-50 hover:text-foreground';

  const desktopPaddingClass = React.useMemo(() => {
    if (isDesktopApp && isMacPlatform && !isSidebarOpen) {
      // Reserve space for fixed sessions button + traffic lights when sidebar closed
      return 'pl-[8.5rem] pr-4';
    }
    return 'pl-3 pr-4';
  }, [isDesktopApp, isMacPlatform, isSidebarOpen]);

  const updateHeaderHeight = React.useCallback(() => {
    if (typeof document === 'undefined') {
      return;
    }

    const height = headerRef.current?.getBoundingClientRect().height;
    if (height) {
      document.documentElement.style.setProperty('--oc-header-height', `${height}px`);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    updateHeaderHeight();

    const node = headerRef.current;
    if (!node || typeof ResizeObserver === 'undefined') {
      return () => {};
    }

    const observer = new ResizeObserver(() => {
      updateHeaderHeight();
    });

    observer.observe(node);
    window.addEventListener('resize', updateHeaderHeight);
    window.addEventListener('orientationchange', updateHeaderHeight);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateHeaderHeight);
      window.removeEventListener('orientationchange', updateHeaderHeight);
    };
  }, [updateHeaderHeight]);

  useEffect(() => {
    updateHeaderHeight();
  }, [updateHeaderHeight, isMobile, isMobileDetailsOpen]);

  const formatTokenValue = React.useCallback((tokens: number) => {
    if (tokens >= 1_000_000) {
      return `${(tokens / 1_000_000).toFixed(1)}M`;
    }
    if (tokens >= 1_000) {
      return `${(tokens / 1_000).toFixed(1)}K`;
    }
    return tokens.toFixed(1).replace(/\.0$/, '');
  }, []);

  const renderDesktop = () => (
    <div
      className={cn(
        'app-region-drag relative flex h-12 select-none items-center justify-between transition-all duration-300 ease-in-out',
        desktopPaddingClass
      )}
    >
        <div className="flex items-center gap-2 min-w-0">
           {/* Sessions button for non-macOS desktop */}
           {!(isDesktopApp && isMacPlatform) && (
             <button
               type="button"
               onClick={handleOpenSessionSwitcher}
               aria-label="Open sessions"
               className={headerIconButtonClass}
             >
               <ListStar className="h-5 w-5" weight="duotone" />
             </button>
           )}
          <div className={cn('flex min-w-0 flex-col gap-0.5 justify-center h-full')}>
            <span className={cn(sessionTitleClass, 'translate-y-[3px] block')} title={activeSessionTitle}>
              {activeSessionTitle}
            </span>
            <span className={cn(directoryClass, '-translate-y-[3px] block')} title={directoryTooltip}>
              {directoryDisplay}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {contextUsage && contextUsage.totalTokens > 0 && (
            <ContextUsageDisplay
              totalTokens={contextUsage.totalTokens}
              percentage={contextUsage.percentage}
              contextLimit={contextUsage.contextLimit}
              outputLimit={contextUsage.outputLimit ?? 0}
            />
          )}
          <Tooltip delayDuration={1000}>
            <TooltipTrigger asChild>
              <button
                type="button"
              onClick={() => setSettingsDialogOpen(true)}
                aria-label="Open settings"
                className={headerIconButtonClass}
              >
                  <Gear className="h-5 w-5" />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Settings</p>
            </TooltipContent>
          </Tooltip>
          <Tooltip delayDuration={1000}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={toggleRightSidebar}
                aria-label="Toggle utilities panel"
                className={headerIconButtonClass}
              >
                <Sidebar className="h-5 w-5 scale-x-[-1]" weight={isRightSidebarOpen ? "duotone" : "regular"} />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Toggle utilities panel</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
  );

  const renderMobile = () => (
    <div className="app-region-drag relative flex flex-col gap-1 px-3 py-2 select-none">
      <div className="flex items-center justify-between gap-2">
         <div className="flex items-center gap-2">
           <button
             onClick={handleOpenSessionSwitcher}
             className="app-region-no-drag h-9 w-9 p-2 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
             aria-label="Open sessions"
           >
             <ListStar className="h-5 w-5" weight="duotone" />
           </button>
          {contextUsage && contextUsage.totalTokens > 0 && (
            <ContextUsageDisplay
              totalTokens={contextUsage.totalTokens}
              percentage={contextUsage.percentage}
              contextLimit={contextUsage.contextLimit}
              outputLimit={contextUsage.outputLimit ?? 0}
              size="compact"
            />
          )}
        </div>

       <div className="app-region-no-drag flex items-center gap-1.5">
          <Tooltip delayDuration={1000}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => setSettingsDialogOpen(true)}
                aria-label="Open settings"
                className={headerIconButtonClass}
              >
              <Gear className="h-5 w-5" />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Settings</p>
            </TooltipContent>
          </Tooltip>
          <Tooltip delayDuration={1000}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={toggleRightSidebar}
                aria-label="Toggle utilities panel"
                className={headerIconButtonClass}
              >
                <Sidebar className="h-5 w-5 scale-x-[-1]" weight={isRightSidebarOpen ? 'duotone' : 'regular'} />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Toggle utilities panel</p>
            </TooltipContent>
          </Tooltip>
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
          <div className="flex flex-col gap-4 rounded-xl border border-border/40 bg-background/95 px-3 py-3 shadow-none">
            <div className="flex flex-col gap-1 pl-1">
              <span className="typography-micro text-muted-foreground">Session</span>
              <span className="typography-ui-label font-semibold text-foreground translate-y-[3px] block">
                {activeSessionTitle}
              </span>
            </div>
            <div className="flex flex-col gap-1 pl-1">
              <span className="typography-micro text-muted-foreground">Directory</span>
              <span className="typography-meta text-foreground break-words -translate-y-[3px] block" title={directoryTooltip}>
                {directoryDisplay}
              </span>
            </div>
            {contextUsage && contextUsage.totalTokens > 0 && (
              <div className="flex flex-col gap-1">
                <span className="typography-micro text-muted-foreground">Context usage</span>
                <div className="rounded-lg border border-border/40 bg-muted/10 px-3 py-2 space-y-0.5">
                  <p className="typography-meta">
                    Used tokens: <span className="font-semibold text-foreground">{formatTokenValue(contextUsage.totalTokens)}</span>
                  </p>
                  <p className="typography-meta">
                    Context limit: <span className="font-semibold text-foreground">{formatTokenValue(contextUsage.contextLimit)}</span>
                  </p>
                  <p className="typography-meta">
                    Output limit: <span className="font-semibold text-foreground">{formatTokenValue(contextUsage.outputLimit ?? 0)}</span>
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );

  const headerClassName = cn(
    'header-safe-area border-b relative z-10',
    isDesktopApp ? 'bg-background' : 'bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80'
  );

  return (
    <>
      <header
        ref={headerRef}
        className={headerClassName}
        style={{ borderColor: 'var(--interactive-border)' }}
      >
        {isMobile ? renderMobile() : renderDesktop()}
      </header>
      <SettingsDialog isOpen={isSettingsDialogOpen} onClose={() => setSettingsDialogOpen(false)} />
    </>
  );
};
