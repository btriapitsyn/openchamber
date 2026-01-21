import React, { useEffect } from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

import { RiChat4Line, RiCodeLine, RiCommandLine, RiFolder6Line, RiGitBranchLine, RiLayoutLeftLine, RiPlayListAddLine, RiQuestionLine, RiSettings3Line, RiTerminalBoxLine, type RemixiconComponentType } from '@remixicon/react';
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

  const headerIconButtonClass = 'app-region-no-drag inline-flex h-9 w-9 items-center justify-center gap-2 p-2 typography-ui-label font-medium text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-50 hover:text-foreground';

  if (isMobile || !isDesktopApp || !isMacPlatform) {
    return null;
  }

  return (
     <div
       className="fixed top-[0.375rem] left-[5.25rem] z-[9999]"
       style={{ pointerEvents: 'auto', ['--padding-scale' as string]: '1' } as React.CSSProperties}
     >
       <button
         type="button"
         onClick={handleOpenSessionSwitcher}
         aria-label="Open sessions"
         className={headerIconButtonClass}
       >
         <RiLayoutLeftLine className="h-5 w-5" />
       </button>
     </div>
  );
};

export const Header: React.FC = () => {
  const setSessionSwitcherOpen = useUIStore((state) => state.setSessionSwitcherOpen);
  const toggleSidebar = useUIStore((state) => state.toggleSidebar);
  const setSettingsDialogOpen = useUIStore((state) => state.setSettingsDialogOpen);
  const toggleCommandPalette = useUIStore((state) => state.toggleCommandPalette);
  const toggleHelpDialog = useUIStore((state) => state.toggleHelpDialog);
  const isSidebarOpen = useUIStore((state) => state.isSidebarOpen);
  const sidebarWidth = useUIStore((state) => state.sidebarWidth);
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

  const headerIconButtonClass = 'app-region-no-drag inline-flex h-9 w-9 items-center justify-center gap-2 p-2 typography-ui-label font-medium text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-50 hover:text-foreground';

  const desktopPaddingClass = React.useMemo(() => {
    if (isDesktopApp && isMacPlatform) {

      return isSidebarOpen ? 'pl-0' : 'pl-[8.0rem]';
    }
    return 'pl-3';
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

  const renderTab = (tab: TabConfig, isLast: boolean) => {
    const isActive = activeMainTab === tab.id;
    const Icon = tab.icon;
    const isChatTab = tab.id === 'chat';
    const isGitTab = tab.id === 'git';

    return (
      <React.Fragment key={tab.id}>
        <button
          type="button"
          onClick={() => setActiveMainTab(tab.id)}
          onMouseDown={isActive ? handleActiveTabDragStart : undefined}
          className={cn(
            'relative flex h-full items-center gap-2 px-4 typography-ui-label font-medium transition-colors',
            isActive ? 'app-region-drag' : 'app-region-no-drag',
            'hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary',
            isActive ? 'text-foreground' : 'text-muted-foreground',

            isActive && 'after:absolute after:bottom-[-1px] after:left-0 after:right-0 after:h-[2px] after:bg-background',

            isActive && isChatTab && isSidebarOpen && 'before:absolute before:bottom-[-1px] before:right-full before:h-px before:bg-[var(--interactive-border)] before:w-[var(--sidebar-w)]',

            isChatTab && !(isDesktopApp && isMacPlatform && isSidebarOpen) && 'border-l',

            isGitTab && 'border-r',

            isChatTab && !isMobile && 'min-w-[165px] max-[1024px]:min-w-0'
          )}
          style={{
            ...(isActive && isChatTab && isSidebarOpen ? {

              ['--sidebar-w' as string]: (isDesktopApp && isMacPlatform) ? `${sidebarWidth}px` : '64px'
            } : {}),
            ...((isChatTab && !(isDesktopApp && isMacPlatform && isSidebarOpen)) || isGitTab ? { borderColor: 'var(--interactive-border)' } : {}),
          }}
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
          {}
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
          {}
          {tab.badge !== undefined && tab.badge > 0 && (
            <span className="text-xs font-semibold text-primary">
              {tab.badge}
            </span>
          )}
        </button>
        {}
        {!isLast && (
          <div className="h-full w-px bg-border" aria-hidden="true" />
        )}
      </React.Fragment>
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
      {}
      {!(isDesktopApp && isMacPlatform) && (
        <>
          <button
            type="button"
            onClick={handleOpenSessionSwitcher}
            aria-label="Open sessions"
            className={`${headerIconButtonClass} mr-2.5`}
          >
            <RiLayoutLeftLine className="h-5 w-5" />
          </button>
        </>
      )}

      {}
      <div className="flex h-full items-center">
        {tabs.map((tab, index) => renderTab(tab, index === tabs.length - 1))}
      </div>

      {}
      <div className="flex-1" />

      {}
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
        <button
          onClick={handleOpenSessionSwitcher}
          className="app-region-no-drag h-9 w-9 p-2 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-label="Open sessions"
        >
          <RiPlayListAddLine className="h-5 w-5" />
        </button>
        {contextUsage && contextUsage.totalTokens > 0 && activeMainTab === 'chat' && (
          <ContextUsageDisplay
            totalTokens={contextUsage.totalTokens}
            percentage={contextUsage.percentage}
            contextLimit={contextUsage.contextLimit}
            outputLimit={contextUsage.outputLimit ?? 0}
            size="compact"
            isMobile={true}
          />
        )}
      </div>

       <div className="app-region-no-drag flex items-center gap-1.5">

         <div className="flex items-center" role="tablist" aria-label="Main navigation">
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
                      isActive && 'text-foreground'
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
    </div>
  );

  const headerClassName = cn(
    'header-safe-area border-b relative z-10',
    isDesktopApp ? 'bg-background' : 'bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80'
  );

  return (
    <header
      ref={headerRef}
      className={headerClassName}
      style={{ borderColor: 'var(--interactive-border)', ['--padding-scale' as string]: '1' } as React.CSSProperties}
    >
      {isMobile ? renderMobile() : renderDesktop()}
    </header>
  );
};
