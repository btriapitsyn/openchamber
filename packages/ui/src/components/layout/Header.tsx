import React, { useEffect } from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import { RiArrowLeftSLine, RiChat4Line, RiCheckLine, RiCommandLine, RiFileTextLine, RiFolder6Line, RiGitBranchLine, RiGithubFill, RiLayoutLeftLine, RiPlayListAddLine, RiQuestionLine, RiSettings3Line, RiTerminalBoxLine, type RemixiconComponentType } from '@remixicon/react';
import { DiffIcon } from '@/components/icons/DiffIcon';
import { useUIStore, type MainTab } from '@/stores/useUIStore';
import { useUpdateStore } from '@/stores/useUpdateStore';
import { useConfigStore } from '@/stores/useConfigStore';
import { useSessionStore } from '@/stores/useSessionStore';
import { useDirectoryStore } from '@/stores/useDirectoryStore';
import { useGitHubAuthStore } from '@/stores/useGitHubAuthStore';
import { useRuntimeAPIs } from '@/hooks/useRuntimeAPIs';
import { ContextUsageDisplay } from '@/components/ui/ContextUsageDisplay';
import { useDeviceInfo } from '@/lib/device';
import { cn, getModifierLabel, hasModifier } from '@/lib/utils';
import { useDiffFileCount } from '@/components/views/DiffView';
import { McpDropdown } from '@/components/mcp/McpDropdown';
import type { GitHubAuthStatus } from '@/lib/api/types';

const normalize = (value: string): string => {
  if (!value) return '';
  const replaced = value.replace(/\\/g, '/');
  return replaced === '/' ? '/' : replaced.replace(/\/+$/, '');
};

const joinPath = (base: string, segment: string): string => {
  const normalizedBase = normalize(base);
  const cleanSegment = segment.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
  if (!normalizedBase || normalizedBase === '/') {
    return `/${cleanSegment}`;
  }
  return `${normalizedBase}/${cleanSegment}`;
};

const buildRepoPlansDirectory = (directory: string): string => {
  return joinPath(joinPath(directory, '.opencode'), 'plans');
};

const buildHomePlansDirectory = (): string => {
  return '~/.opencode/plans';
};

const resolveTilde = (path: string, homeDir: string | null): string => {
  const trimmed = path.trim();
  if (!trimmed.startsWith('~')) return trimmed;
  if (trimmed === '~') return homeDir || trimmed;
  if (trimmed.startsWith('~/') || trimmed.startsWith('~\\')) {
    return homeDir ? `${homeDir}${trimmed.slice(1)}` : trimmed;
  }
  return trimmed;
};

interface TabConfig {
  id: MainTab;
  label: string;
  icon: RemixiconComponentType | 'diff';
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
  const runtimeApis = useRuntimeAPIs();

  const getContextUsage = useSessionStore((state) => state.getContextUsage);
  const currentSessionId = useSessionStore((state) => state.currentSessionId);
  const sessions = useSessionStore((state) => state.sessions);
  const homeDirectory = useDirectoryStore((state) => state.homeDirectory);
  const { isMobile } = useDeviceInfo();
  const diffFileCount = useDiffFileCount();
  const updateAvailable = useUpdateStore((state) => state.available);
  const githubAuthStatus = useGitHubAuthStore((state) => state.status);
  const setGitHubAuthStatus = useGitHubAuthStore((state) => state.setStatus);

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

  const macosMajorVersion = React.useMemo(() => {
    if (typeof window === 'undefined') {
      return null;
    }
    // Use Tauri-provided version if available (accurate), otherwise fall back to UA parsing
    const desktopApi = (window as typeof window & { opencodeDesktop?: { macosMajorVersion?: number | null } }).opencodeDesktop;
    if (desktopApi?.macosMajorVersion != null) {
      return desktopApi.macosMajorVersion;
    }
    // Fallback: WebKit reports "Mac OS X 10_15_7" format where 10 is legacy prefix
    if (typeof navigator === 'undefined') {
      return null;
    }
    const match = (navigator.userAgent || '').match(/Mac OS X (\d+)[._](\d+)/);
    if (!match) {
      return null;
    }
    const first = Number.parseInt(match[1], 10);
    const second = Number.parseInt(match[2], 10);
    if (Number.isNaN(first)) {
      return null;
    }
    return first === 10 ? second : first;
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
  const githubAvatarUrl = githubAuthStatus?.connected ? githubAuthStatus.user?.avatarUrl : null;
  const githubLogin = githubAuthStatus?.connected ? githubAuthStatus.user?.login : null;
  const githubAccounts = githubAuthStatus?.accounts ?? [];
  const [isSwitchingGitHubAccount, setIsSwitchingGitHubAccount] = React.useState(false);

  const currentSession = React.useMemo(() => {
    if (!currentSessionId) return null;
    return sessions.find((s) => s.id === currentSessionId) ?? null;
  }, [currentSessionId, sessions]);

  const sessionDirectory = React.useMemo(() => {
    const raw = typeof currentSession?.directory === 'string' ? currentSession.directory : '';
    return normalize(raw || '');
  }, [currentSession?.directory]);


  const [planTabAvailable, setPlanTabAvailable] = React.useState(false);
  const showPlanTab = planTabAvailable;
  const lastPlanSessionKeyRef = React.useRef<string>('');

  const handleGitHubAccountSwitch = React.useCallback(async (accountId: string) => {
    if (!accountId || isSwitchingGitHubAccount) return;
    setIsSwitchingGitHubAccount(true);
    try {
      const payload = runtimeApis.github
        ? await runtimeApis.github.authActivate(accountId)
        : await (async () => {
            const response = await fetch('/api/github/auth/activate', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
              },
              body: JSON.stringify({ accountId }),
            });
            const body = (await response.json().catch(() => null)) as
              | (GitHubAuthStatus & { error?: string })
              | null;
            if (!response.ok || !body) {
              throw new Error(body?.error || response.statusText);
            }
            return body;
          })();

      setGitHubAuthStatus(payload);
    } catch (error) {
      console.error('Failed to switch GitHub account:', error);
    } finally {
      setIsSwitchingGitHubAccount(false);
    }
  }, [isSwitchingGitHubAccount, runtimeApis.github, setGitHubAuthStatus]);

  React.useEffect(() => {
    let cancelled = false;

    const checkExists = async (directory: string, fileName: string): Promise<boolean> => {
      if (!directory || !fileName) return false;
      if (!runtimeApis.files?.listDirectory) return false;

      try {
        const listing = await runtimeApis.files.listDirectory(directory);
        const entries = Array.isArray(listing?.entries) ? listing.entries : [];
        return entries.some((entry) => entry?.name === fileName && !entry?.isDirectory);
      } catch {
        return false;
      }
    };

    const runOnce = async () => {
      if (cancelled) return;

      if (!currentSession?.slug || !currentSession?.time?.created || !sessionDirectory) {
        setPlanTabAvailable(false);
        if (useUIStore.getState().activeMainTab === 'plan') {
          useUIStore.getState().setActiveMainTab('chat');
        }
        return;
      }

      const fileName = `${currentSession.time.created}-${currentSession.slug}.md`;
      const repoDir = buildRepoPlansDirectory(sessionDirectory);
      const homeDir = resolveTilde(buildHomePlansDirectory(), homeDirectory || null);

      const [repoExists, homeExists] = await Promise.all([
        checkExists(repoDir, fileName),
        checkExists(homeDir, fileName),
      ]);

      if (cancelled) return;

      const available = repoExists || homeExists;
      setPlanTabAvailable(available);
      if (!available && useUIStore.getState().activeMainTab === 'plan') {
        useUIStore.getState().setActiveMainTab('chat');
      }
    };

    const sessionKey = `${currentSessionId || 'none'}:${sessionDirectory || 'none'}:${currentSession?.time?.created || 0}:${currentSession?.slug || 'none'}`;
    if (lastPlanSessionKeyRef.current !== sessionKey) {
      lastPlanSessionKeyRef.current = sessionKey;
      setPlanTabAvailable(false);
    }
    void runOnce();

    const interval = window.setInterval(() => {
      void runOnce();
    }, 3000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [
    sessionDirectory,
    currentSession?.slug,
    currentSession?.time?.created,
    currentSessionId,
    homeDirectory,
    runtimeApis.files,
  ]);

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

  const headerIconButtonClass = 'app-region-no-drag inline-flex h-9 w-9 items-center justify-center gap-2 p-2 rounded-md typography-ui-label font-medium text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-50 hover:text-foreground hover:bg-interactive-hover transition-colors';

  const desktopPaddingClass = React.useMemo(() => {
    if (isDesktopApp && isMacPlatform) {
      // Always reserve space for Mac traffic lights since header is always on top
      return 'pl-[5.5rem]';
    }
    return 'pl-3';
  }, [isDesktopApp, isMacPlatform]);

  const macosHeaderSizeClass = React.useMemo(() => {
    if (!isDesktopApp || !isMacPlatform || macosMajorVersion === null) {
      return '';
    }
    if (macosMajorVersion >= 26) {
      return 'h-12';
    }
    if (macosMajorVersion <= 15) {
      return 'h-14';
    }
    return '';
  }, [isDesktopApp, isMacPlatform, macosMajorVersion]);

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
  }, [updateHeaderHeight, isMobile, macosHeaderSizeClass]);

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

  const tabs: TabConfig[] = React.useMemo(() => {
    const base: TabConfig[] = [
      { id: 'chat', label: 'Chat', icon: RiChat4Line },
    ];

    if (showPlanTab) {
      base.push({ id: 'plan', label: 'Plan', icon: RiFileTextLine });
    }

    base.push(
      {
        id: 'diff',
        label: 'Diff',
        icon: 'diff',
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
    );

    return base;
  }, [diffFileCount, isMobile, showPlanTab]);

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
    const isDiffTab = tab.icon === 'diff';
    const Icon = isDiffTab ? null : (tab.icon as RemixiconComponentType);
    const isChatTab = tab.id === 'chat';
    const showContextTooltip = isChatTab && !isMobile && contextUsage && contextUsage.totalTokens > 0;

    const renderIcon = (iconSize: number) => {
      if (isDiffTab) {
        return <DiffIcon size={iconSize} />;
      }
      return Icon ? <Icon size={iconSize} /> : null;
    };

    const formatTokens = (tokens: number) => {
      if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
      if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`;
      return tokens.toFixed(1).replace(/\.0$/, '');
    };

    const tabButton = (
      <button
        type="button"
        onClick={() => setActiveMainTab(tab.id)}
        onMouseDown={isActive ? handleActiveTabDragStart : undefined}
        className={cn(
          'relative flex h-8 items-center gap-2 px-3 rounded-md typography-ui-label font-medium transition-colors',
          isActive
            ? 'app-region-drag bg-interactive-selection text-interactive-selection-foreground shadow-sm'
            : 'app-region-no-drag text-muted-foreground hover:bg-interactive-hover/50 hover:text-foreground',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
          isChatTab && !isMobile && 'min-w-[100px] justify-center'
        )}
        aria-label={tab.label}
        aria-selected={isActive}
        role="tab"
      >
        {isMobile ? (
          renderIcon(20)
        ) : (
          <>
            {renderIcon(16)}
            <span className="header-tab-label">{tab.label}</span>
          </>
        )}

        {showContextTooltip && (
          <span className="header-tab-badge">
            <div className={cn(
              'app-region-no-drag flex items-center gap-1.5 text-muted-foreground/60 select-none typography-micro',
            )}>
              <span className={cn(
                'font-medium',
                contextUsage.percentage >= 90 ? 'text-status-error' :
                contextUsage.percentage >= 75 ? 'text-status-warning' : 'text-status-success'
              )}>
                {Math.min(contextUsage.percentage, 999).toFixed(1)}%
              </span>
            </div>
          </span>
        )}

        {tab.badge !== undefined && tab.badge > 0 && (
          <span className="header-tab-badge typography-micro text-status-info font-medium">
            {tab.badge}
          </span>
        )}
      </button>
    );

    if (showContextTooltip) {
      const safeOutputLimit = typeof contextUsage.outputLimit === 'number' ? Math.max(contextUsage.outputLimit, 0) : 0;
      return (
        <Tooltip key={tab.id} delayDuration={1000}>
          <TooltipTrigger asChild>
            {tabButton}
          </TooltipTrigger>
          <TooltipContent>
            <div className="space-y-0.5">
              <p className="typography-micro leading-tight">Used tokens: {formatTokens(contextUsage.totalTokens)}</p>
              <p className="typography-micro leading-tight">Context limit: {formatTokens(contextUsage.contextLimit)}</p>
              <p className="typography-micro leading-tight">Output limit: {formatTokens(safeOutputLimit)}</p>
            </div>
          </TooltipContent>
        </Tooltip>
      );
    }

    return <React.Fragment key={tab.id}>{tabButton}</React.Fragment>;
  };

  const renderDesktop = () => (
    <div
      onMouseDown={handleDragStart}
      className={cn(
        'app-region-drag relative flex h-12 select-none items-center',
        desktopPaddingClass,
        macosHeaderSizeClass
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
        {githubAuthStatus?.connected && !isMobile ? (
          githubAccounts.length > 1 ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    headerIconButtonClass,
                    'h-8 w-8 p-0 overflow-hidden rounded-full border border-border/60 bg-muted/80'
                  )}
                  title={githubLogin ? `GitHub: ${githubLogin}` : 'GitHub connected'}
                  disabled={isSwitchingGitHubAccount}
                >
                  {githubAvatarUrl ? (
                    <img
                      src={githubAvatarUrl}
                      alt={githubLogin ? `${githubLogin} avatar` : 'GitHub avatar'}
                      className="h-full w-full object-cover"
                      loading="lazy"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <RiGithubFill className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel className="typography-ui-header font-semibold text-foreground">
                  GitHub Accounts
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {githubAccounts.map((account) => {
                  const accountUser = account.user;
                  const isCurrent = Boolean(account.current);
                  return (
                    <DropdownMenuItem
                      key={account.id}
                      className="gap-2"
                      disabled={isCurrent || isSwitchingGitHubAccount}
                      onSelect={() => {
                        if (!isCurrent) {
                          void handleGitHubAccountSwitch(account.id);
                        }
                      }}
                    >
                      {accountUser?.avatarUrl ? (
                        <img
                          src={accountUser.avatarUrl}
                          alt={accountUser.login ? `${accountUser.login} avatar` : 'GitHub avatar'}
                          className="h-6 w-6 rounded-full border border-border/60 bg-muted object-cover"
                          loading="lazy"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="flex h-6 w-6 items-center justify-center rounded-full border border-border/60 bg-muted">
                          <RiGithubFill className="h-3 w-3 text-muted-foreground" />
                        </div>
                      )}
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="typography-ui-label text-foreground truncate">
                          {accountUser?.name?.trim() || accountUser?.login || 'GitHub'}
                        </span>
                        {accountUser?.login ? (
                          <span className="typography-micro text-muted-foreground truncate font-mono">
                            {accountUser.login}
                          </span>
                        ) : null}
                      </span>
                      {isCurrent ? (
                        <RiCheckLine className="h-4 w-4 text-primary" />
                      ) : null}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <div
              className="app-region-no-drag flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-border/60 bg-muted/80"
              title={githubLogin ? `GitHub: ${githubLogin}` : 'GitHub connected'}
            >
              {githubAvatarUrl ? (
                <img
                  src={githubAvatarUrl}
                  alt={githubLogin ? `${githubLogin} avatar` : 'GitHub avatar'}
                  className="h-full w-full object-cover"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <RiGithubFill className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
          )
        ) : null}
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
            className="app-region-no-drag h-9 w-9 p-2 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-md active:bg-interactive-active"
            aria-label="Back"
          >
            <RiArrowLeftSLine className="h-5 w-5" />
          </button>
        ) : (
          <button
            onClick={handleOpenSessionSwitcher}
            className="app-region-no-drag h-9 w-9 p-2 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-md active:bg-interactive-active"
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
              const isDiffTab = tab.icon === 'diff';
              const Icon = isDiffTab ? null : (tab.icon as RemixiconComponentType);
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
                        isActive && 'bg-interactive-selection text-interactive-selection-foreground'
                      )}
                    >
                      {isDiffTab ? (
                        <DiffIcon className="h-5 w-5" />
                      ) : Icon ? (
                        <Icon className="h-5 w-5" />
                      ) : null}
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
