import React, { useEffect } from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

import { RiArrowLeftSLine, RiChat4Line, RiCodeLine, RiCommandLine, RiFolder6Line, RiGitBranchLine, RiLayoutLeftLine, RiPlayListAddLine, RiQuestionLine, RiSettings3Line, RiTerminalBoxLine, type RemixiconComponentType } from '@remixicon/react';
import { useUIStore, type MainTab } from '@/stores/useUIStore';
import { useUpdateStore } from '@/stores/useUpdateStore';
import { useConfigStore } from '@/stores/useConfigStore';
import { useSessionStore } from '@/stores/useSessionStore';
import { ContextUsageDisplay } from '@/components/ui/ContextUsageDisplay';
import { useDeviceInfo } from '@/lib/device';
import { cn, getModifierLabel, hasModifier } from '@/lib/utils';
import { useDiffFileCount } from '@/components/views/DiffView';
import { McpDropdown } from '@/components/mcp/McpDropdown';

interface TabConfig {
  id: MainTab;
  label: string;
  icon: RemixiconComponentType;
  badge?: number;
  showDot?: boolean;
}

export const Header: React.FC = () => {
  const setSessionSwitcherOpen = useUIStore((state) => state.setSessionSwitcherOpen);
  const toggleSidebar = useUIStore((state) => state.toggleSidebar);
  const setSettingsDialogOpen = useUIStore((state) => state.setSettingsDialogOpen);
  const toggleCommandPalette = useUIStore((state) => state.toggleCommandPalette);
  const toggleHelpDialog = useUIStore((state) => state.toggleHelpDialog);
  const activeMainTab = useUIStore((state) => state.activeMainTab);
  const setActiveMainTab = useUIStore((state) => state.setActiveMainTab);

  const { getCurrentModel } = useConfigStore();

  const getContextUsage = useSessionStore((state) => state.getContextUsage);
  const { isMobile } = useDeviceInfo();
  const diffFileCount = useDiffFileCount();
  const updateAvailable = useUpdateStore((state) => state.available);

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
  const isSessionSwitcherOpen = useUIStore((state) => state.isSessionSwitcherOpen);

  const blurActiveElement = React.useCallback(() => {
    if (typeof document === 'undefined') {
      return;
    }

    const active = document.activeElement as HTMLElement | null;
    if (!active) {
      return;
    }

    const tagName = active.tagName;
    const isInput = tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT';

    if (isInput || active.isContentEditable) {
      active.blur();
    }
  }, []);

  const handleOpenSessionSwitcher = React.useCallback(() => {
    if (isMobile) {
      blurActiveElement();
      setSessionSwitcherOpen(!isSessionSwitcherOpen);
      return;
    }
    toggleSidebar();
  }, [blurActiveElement, isMobile, isSessionSwitcherOpen, setSessionSwitcherOpen, toggleSidebar]);

  const handleOpenSettings = React.useCallback(() => {
    if (isMobile) {
      blurActiveElement();
    }
    setSessionSwitcherOpen(false);
    setSettingsDialogOpen(true);
  }, [blurActiveElement, isMobile, setSessionSwitcherOpen, setSettingsDialogOpen]);

  const headerIconButtonClass = 'app-region-no-drag inline-flex h-9 w-9 items-center justify-center gap-2 p-2 rounded-md typography-ui-label font-medium text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-50 hover:text-foreground hover:bg-secondary/50 transition-colors';

  const desktopPaddingClass = React.useMemo(() => {
    if (isDesktopApp && isMacPlatform) {
      // Always reserve space for Mac traffic lights since header is always on top
      return 'pl-[5.75rem]';
    }
    return 'pl-3';
  }, [isDesktopApp, isMacPlatform]);

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
  }, [updateHeaderHeight, isMobile]);

  const handleDragStart = React.useCallback(async (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button, a, input, select, textarea')) {
      return;
    }
    if (e.button !== 0) {
      return;
    }
    if (isDesktopApp) {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        const window = getCurrentWindow();
        await window.startDragging();
      } catch (error) {
        console.error('Failed to start window dragging:', error);
      }
    }
  }, [isDesktopApp]);

  const handleActiveTabDragStart = React.useCallback(async (e: React.MouseEvent) => {
    if (e.button !== 0) {
      return;
    }
    if (isDesktopApp) {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        const window = getCurrentWindow();
        await window.startDragging();
      } catch (error) {
        console.error('Failed to start window dragging:', error);
      }
    }
  }, [isDesktopApp]);

  const tabs: TabConfig[] = React.useMemo(() => [
    { id: 'chat', label: 'Chat', icon: RiChat4Line },
    {
      id: 'diff',
      label: 'Diff',
      icon: RiCodeLine,
      badge: !isMobile && diffFileCount > 0 ? diffFileCount : undefined,
    },
    { id: 'files', label: 'Files', icon: RiFolder6Line },
    { id: 'terminal', label: 'Terminal', icon: RiTerminalBoxLine },
    {
      id: 'git',
      label: 'Git',
      icon: RiGitBranchLine,
      showDot: isMobile && diffFileCount > 0,
    },
  ], [diffFileCount, isMobile]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (hasModifier(e) && !e.shiftKey && !e.altKey) {
        const num = parseInt(e.key, 10);
        if (num >= 1 && num <= tabs.length) {
          e.preventDefault();
          setActiveMainTab(tabs[num - 1].id);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [tabs, setActiveMainTab]);

  const renderTab = (tab: TabConfig) => {
    const isActive = activeMainTab === tab.id;
    const Icon = tab.icon;
    const isChatTab = tab.id === 'chat';

    return (
      <button
        key={tab.id}
        type="button"
        onClick={() => setActiveMainTab(tab.id)}
        onMouseDown={isActive ? handleActiveTabDragStart : undefined}
        className={cn(
          'relative flex h-8 items-center gap-2 px-3 rounded-md typography-ui-label font-medium transition-colors',
          isActive ? 'app-region-drag bg-secondary text-foreground shadow-sm' : 'app-region-no-drag text-muted-foreground hover:bg-secondary/50 hover:text-foreground',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
          isChatTab && !isMobile && 'min-w-[100px] justify-center'
        )}
        aria-label={tab.label}
        aria-selected={isActive}
        role="tab"
      >
        {isMobile ? (
          <Icon size={20} />
        ) : (
          <>
            <Icon size={16} />
            <span className="header-tab-label">{tab.label}</span>
          </>
        )}

        {isChatTab && !isMobile && contextUsage && contextUsage.totalTokens > 0 && (
          <span className="ml-1">
            <ContextUsageDisplay
              totalTokens={contextUsage.totalTokens}
              percentage={contextUsage.percentage}
              contextLimit={contextUsage.contextLimit}
              outputLimit={contextUsage.outputLimit ?? 0}
              size="compact"
            />
          </span>
        )}

        {tab.badge !== undefined && tab.badge > 0 && (
          <span className="ml-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary/10 px-1 text-[10px] font-bold text-primary">
            {tab.badge}
          </span>
        )}
      </button>
    );
  };

  const renderDesktop = () => (
    <div
      onMouseDown={handleDragStart}
      className={cn(
        'app-region-drag relative flex h-12 select-none items-center',
        desktopPaddingClass
      )}
      role="tablist"
      aria-label="Main navigation"
    >
      <button
        type="button"
        onClick={handleOpenSessionSwitcher}
        aria-label="Open sessions"
        className={`${headerIconButtonClass} mr-2`}
      >
        <RiLayoutLeftLine className="h-5 w-5" />
      </button>

      <div className="flex items-center gap-1 p-1 bg-background/50 rounded-lg">
        {tabs.map((tab) => renderTab(tab))}
      </div>

      <div className="flex-1" />

       <div className="flex items-center gap-1 pr-3">
         <Tooltip delayDuration={500}>
           <TooltipTrigger asChild>
             <button
               type="button"
               onClick={toggleCommandPalette}
               aria-label="Open command palette"
               className={headerIconButtonClass}
             >
               <RiCommandLine className="h-5 w-5" />
             </button>
           </TooltipTrigger>
           <TooltipContent>
             <p>Command Palette ({getModifierLabel()}+K)</p>
           </TooltipContent>
         </Tooltip>

         <McpDropdown headerIconButtonClass={headerIconButtonClass} />

        <Tooltip delayDuration={500}>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={toggleHelpDialog}
              aria-label="Keyboard shortcuts"
              className={headerIconButtonClass}
            >
              <RiQuestionLine className="h-5 w-5" />
            </button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Keyboard Shortcuts ({getModifierLabel()}+.)</p>
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );

  const renderMobile = () => (
    <div className="app-region-drag relative flex items-center justify-between gap-2 px-3 py-2 select-none">
      <div className="flex items-center gap-2">
        {/* Show back button when sessions sidebar is open, otherwise show sessions toggle */}
        {isSessionSwitcherOpen ? (
          <button
            onClick={() => setSessionSwitcherOpen(false)}
            className="app-region-no-drag h-9 w-9 p-2 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-md active:bg-secondary"
            aria-label="Back"
          >
            <RiArrowLeftSLine className="h-5 w-5" />
          </button>
        ) : (
          <button
            onClick={handleOpenSessionSwitcher}
            className="app-region-no-drag h-9 w-9 p-2 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-md active:bg-secondary"
            aria-label="Open sessions"
          >
            <RiPlayListAddLine className="h-5 w-5" />
          </button>
        )}
        {!isSessionSwitcherOpen && contextUsage && contextUsage.totalTokens > 0 && activeMainTab === 'chat' && (
          <ContextUsageDisplay
            totalTokens={contextUsage.totalTokens}
            percentage={contextUsage.percentage}
            contextLimit={contextUsage.contextLimit}
            outputLimit={contextUsage.outputLimit ?? 0}
            size="compact"
            isMobile={true}
          />
        )}
        {isSessionSwitcherOpen && (
          <span className="typography-ui-label font-semibold text-foreground">Sessions</span>
        )}
      </div>

      {/* Hide tabs and right-side buttons when sessions sidebar is open */}
      {!isSessionSwitcherOpen && (
        <div className="app-region-no-drag flex items-center gap-1">
          <div className="flex items-center gap-0.5" role="tablist" aria-label="Main navigation">
            {tabs.map((tab) => {
              const isActive = activeMainTab === tab.id;
              const Icon = tab.icon;
              return (
                <Tooltip key={tab.id} delayDuration={500}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => {
                        if (isMobile) {
                          blurActiveElement();
                        }
                        setActiveMainTab(tab.id);
                      }}
                      aria-label={tab.label}
                      aria-selected={isActive}
                      role="tab"
                      className={cn(
                        headerIconButtonClass,
                        'relative',
                        isActive && 'text-foreground bg-secondary'
                      )}
                    >
                      <Icon className="h-5 w-5" />
                      {tab.badge !== undefined && tab.badge > 0 && (
                        <span className="absolute -top-1 -right-1 text-[10px] font-semibold text-primary">
                          {tab.badge}
                        </span>
                      )}
                      {tab.showDot && (
                        <span
                          className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-primary"
                          aria-label="Changes available"
                        />
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{tab.label}</p>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>

          <McpDropdown headerIconButtonClass={headerIconButtonClass} />

          <Tooltip delayDuration={500}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={handleOpenSettings}
                aria-label="Open settings"
                className={cn(headerIconButtonClass, 'relative')}
              >
                <RiSettings3Line className="h-5 w-5" />
                {updateAvailable && (
                  <span
                    className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-primary"
                    aria-label="Update available"
                  />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{updateAvailable ? 'Settings (Update available)' : 'Settings'}</p>
            </TooltipContent>
          </Tooltip>
        </div>
      )}
    </div>
  );

  const headerClassName = cn(
    'header-safe-area border-b border-border/50 relative z-10',
    isDesktopApp ? 'bg-background' : 'bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80'
  );

  return (
    <header
      ref={headerRef}
      className={headerClassName}
      style={{ ['--padding-scale' as string]: '1' } as React.CSSProperties}
    >
      {isMobile ? renderMobile() : renderDesktop()}
    </header>
  );
};
