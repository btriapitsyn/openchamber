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

import { RiArrowLeftSLine, RiChat4Line, RiCheckLine, RiCloseLine, RiCommandLine, RiFileTextLine, RiFolder6Line, RiGitBranchLine, RiGithubFill, RiLayoutLeftLine, RiPlayListAddLine, RiQuestionLine, RiRefreshLine, RiSettings3Line, RiTerminalBoxLine, RiTimerLine, type RemixiconComponentType } from '@remixicon/react';
import { DiffIcon } from '@/components/icons/DiffIcon';
import { useUIStore, type MainTab } from '@/stores/useUIStore';
import { useUpdateStore } from '@/stores/useUpdateStore';
import { useConfigStore } from '@/stores/useConfigStore';
import { useSessionStore } from '@/stores/useSessionStore';
import { useQuotaAutoRefresh, useQuotaStore } from '@/stores/useQuotaStore';
import { useDirectoryStore } from '@/stores/useDirectoryStore';
import { useGitHubAuthStore } from '@/stores/useGitHubAuthStore';
import { useRuntimeAPIs } from '@/hooks/useRuntimeAPIs';
import { ContextUsageDisplay } from '@/components/ui/ContextUsageDisplay';
import { useDeviceInfo } from '@/lib/device';
import { cn, getModifierLabel, hasModifier } from '@/lib/utils';
import { useDiffFileCount } from '@/components/views/DiffView';
import { McpDropdown } from '@/components/mcp/McpDropdown';
import { ProviderLogo } from '@/components/ui/ProviderLogo';
import { formatPercent, formatWindowLabel, QUOTA_PROVIDERS } from '@/lib/quota';
import { UsageProgressBar } from '@/components/sections/usage/UsageProgressBar';
import { updateDesktopSettings } from '@/lib/persistence';
import type { UsageWindow } from '@/types';
import type { GitHubAuthStatus } from '@/lib/api/types';
import { DesktopHostSwitcherButton } from '@/components/desktop/DesktopHostSwitcher';
import { OpenInAppButton } from '@/components/desktop/OpenInAppButton';
import { isDesktopShell } from '@/lib/desktop';

const formatTime = (timestamp: number | null) => {
  if (!timestamp) return '-';
  try {
    return new Date(timestamp).toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return '-';
  }
};

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
  const quotaResults = useQuotaStore((state) => state.results);
  const fetchAllQuotas = useQuotaStore((state) => state.fetchAllQuotas);
  const isQuotaLoading = useQuotaStore((state) => state.isLoading);
  const quotaLastUpdated = useQuotaStore((state) => state.lastUpdated);
  const quotaDisplayMode = useQuotaStore((state) => state.displayMode);
  const dropdownProviderIds = useQuotaStore((state) => state.dropdownProviderIds);
  const loadQuotaSettings = useQuotaStore((state) => state.loadSettings);
  const setQuotaDisplayMode = useQuotaStore((state) => state.setDisplayMode);
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
    return isDesktopShell();
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

    const injected = (window as unknown as { __OPENCHAMBER_MACOS_MAJOR__?: unknown }).__OPENCHAMBER_MACOS_MAJOR__;
    if (typeof injected === 'number' && Number.isFinite(injected) && injected > 0) {
      return injected;
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
    setIsDesktopApp(isDesktopShell());
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
  const [isMobileRateLimitsOpen, setIsMobileRateLimitsOpen] = React.useState(false);
  useQuotaAutoRefresh();
  const rateLimitGroups = React.useMemo(() => {
    const groups: Array<{
      providerId: string;
      providerName: string;
      entries: Array<[string, UsageWindow]>;
    }> = [];

    for (const provider of QUOTA_PROVIDERS) {
      if (!dropdownProviderIds.includes(provider.id)) {
        continue;
      }
      const result = quotaResults.find((entry) => entry.providerId === provider.id);
      const windows = (result?.usage?.windows ?? {}) as Record<string, UsageWindow>;
      const entries = Object.entries(windows);
      if (entries.length > 0) {
        groups.push({ providerId: provider.id, providerName: provider.name, entries });
      }
    }

    return groups;
  }, [dropdownProviderIds, quotaResults]);
  const hasRateLimits = rateLimitGroups.length > 0;
  React.useEffect(() => {
    void loadQuotaSettings();
  }, [loadQuotaSettings]);
  const handleDisplayModeChange = React.useCallback(async (mode: 'usage' | 'remaining') => {
    setQuotaDisplayMode(mode);
    try {
      await updateDesktopSettings({ usageDisplayMode: mode });
    } catch (error) {
      console.warn('Failed to update usage display mode:', error);
    }
  }, [setQuotaDisplayMode]);

  const currentSession = React.useMemo(() => {
    if (!currentSessionId) return null;
    return sessions.find((s) => s.id === currentSessionId) ?? null;
  }, [currentSessionId, sessions]);

  const worktreePath = useSessionStore((state) => {
    if (!currentSessionId) return '';
    return state.worktreeMetadata.get(currentSessionId)?.path ?? '';
  });

  const worktreeDirectory = React.useMemo(() => {
    return normalize(worktreePath || '');
  }, [worktreePath]);

  const sessionDirectory = React.useMemo(() => {
    const raw = typeof currentSession?.directory === 'string' ? currentSession.directory : '';
    return normalize(raw || '');
  }, [currentSession?.directory]);

  const openDirectory = React.useMemo(() => {
    return worktreeDirectory || sessionDirectory;
  }, [sessionDirectory, worktreeDirectory]);


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
      return () => { };
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
        <OpenInAppButton directory={openDirectory} className="mr-1" />
        {isDesktopApp && (
          <DesktopHostSwitcherButton headerIconButtonClass={headerIconButtonClass} />
        )}
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

        <DropdownMenu onOpenChange={(open) => {
          if (open && quotaResults.length === 0) {
            fetchAllQuotas();
          }
        }}>
          <Tooltip delayDuration={500}>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="View rate limits"
                  className={headerIconButtonClass}
                  disabled={isQuotaLoading}
                >
                  <RiTimerLine className="h-5 w-5" />
                </button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>
              <p>Rate limits</p>
            </TooltipContent>
          </Tooltip>
            <DropdownMenuContent align="end" className="w-80 max-h-[70vh] overflow-y-auto overflow-x-hidden p-0">
              <div className="sticky top-0 z-20 bg-[var(--surface-elevated)] border-b border-[var(--interactive-border)]">
              <DropdownMenuLabel className="flex items-center justify-between gap-3 typography-ui-header font-semibold text-foreground">
                <span>Rate limits</span>
                <div className="flex items-center gap-1">
                  <div className="flex items-center rounded-md border border-[var(--interactive-border)] p-0.5">
                    <button
                      type="button"
                      className={cn(
                        'px-2 py-0.5 rounded-sm typography-micro text-[10px] transition-colors',
                        quotaDisplayMode === 'usage'
                          ? 'bg-interactive-selection text-interactive-selection-foreground'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                      onClick={() => handleDisplayModeChange('usage')}
                      aria-label="Show used quota"
                    >
                      Used
                    </button>
                    <button
                      type="button"
                      className={cn(
                        'px-2 py-0.5 rounded-sm typography-micro text-[10px] transition-colors',
                        quotaDisplayMode === 'remaining'
                          ? 'bg-interactive-selection text-interactive-selection-foreground'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                      onClick={() => handleDisplayModeChange('remaining')}
                      aria-label="Show remaining quota"
                    >
                      Remaining
                    </button>
                  </div>
                  <button
                    type="button"
                    className={cn(
                      'inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors',
                      'hover:text-foreground hover:bg-interactive-hover',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'
                    )}
                    onClick={() => fetchAllQuotas()}
                    disabled={isQuotaLoading}
                    aria-label="Refresh rate limits"
                  >
                    <RiRefreshLine className="h-4 w-4" />
                  </button>
                </div>
              </DropdownMenuLabel>
              <div className="px-2 pb-2 typography-micro text-muted-foreground text-[10px]">
                Last updated {formatTime(quotaLastUpdated)}
              </div>
            </div>
            {!hasRateLimits && (
              <DropdownMenuItem className="cursor-default" onSelect={(event) => event.preventDefault()}>
                <span className="typography-ui-label text-muted-foreground">No rate limits available.</span>
              </DropdownMenuItem>
            )}
            {rateLimitGroups.map((group, index) => (
              <React.Fragment key={group.providerId}>
                <DropdownMenuLabel className="sticky top-[60px] z-10 flex items-center gap-2 bg-[var(--surface-elevated)] typography-ui-label text-foreground">
                  <ProviderLogo providerId={group.providerId} className="h-4 w-4" />
                  {group.providerName}
                </DropdownMenuLabel>
                {group.entries.length === 0 ? (
                  <DropdownMenuItem
                    key={`${group.providerId}-empty`}
                    className="cursor-default"
                    onSelect={(event) => event.preventDefault()}
                  >
                    <span className="typography-ui-label text-muted-foreground">No rate limits reported.</span>
                  </DropdownMenuItem>
                ) : (
                  group.entries.map(([label, window]) => (
                    <DropdownMenuItem
                      key={`${group.providerId}-${label}`}
                      className="cursor-default items-start"
                      onSelect={(event) => event.preventDefault()}
                    >
                      <span className="flex min-w-0 flex-1 flex-col gap-2">
                        {(() => {
                          const displayPercent = quotaDisplayMode === 'remaining'
                            ? window.remainingPercent
                            : window.usedPercent;
                          return (
                            <>
                              <span className="flex min-w-0 items-center justify-between gap-3">
                                <span className="truncate typography-micro text-muted-foreground">{formatWindowLabel(label)}</span>
                                <span className="typography-ui-label text-foreground tabular-nums">
                                  {formatPercent(displayPercent) === '-' ? '' : formatPercent(displayPercent)}
                                </span>
                              </span>
                              <UsageProgressBar percent={displayPercent} tonePercent={window.usedPercent} className="h-1" />
                              <span className="flex items-center justify-between typography-micro text-muted-foreground text-[10px]">
                                <span>{window.resetAfterFormatted ?? window.resetAtFormatted ?? ''}</span>
                              </span>
                            </>
                          );
                        })()}
                      </span>
                    </DropdownMenuItem>
                  ))
                )}
                {index < rateLimitGroups.length - 1 && <DropdownMenuSeparator />}
              </React.Fragment>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
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
      <div className="flex items-center gap-2 shrink-0">
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
        <div className="app-region-no-drag flex min-w-0 flex-1 items-center">
          <div className="flex min-w-0 flex-1 overflow-x-auto overflow-y-hidden scrollbar-hidden touch-pan-x overscroll-x-contain">
            <div className="flex w-max items-center gap-1 pr-1">
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

            <DropdownMenu
              open={isMobileRateLimitsOpen}
              onOpenChange={(open) => {
                setIsMobileRateLimitsOpen(open);
                if (open && quotaResults.length === 0) {
                  fetchAllQuotas();
                }
              }}
            >
              <Tooltip delayDuration={500}>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label="View rate limits"
                      className={headerIconButtonClass}
                      disabled={isQuotaLoading}
                    >
                      <RiTimerLine className="h-5 w-5" />
                    </button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Rate limits</p>
                </TooltipContent>
              </Tooltip>
              <DropdownMenuContent
                align="end"
                sideOffset={0}
                className="h-[100vh] w-[100vw] max-h-none rounded-none border-0 p-0"
              >
                <div className="flex h-full flex-col bg-[var(--surface-elevated)]">
                  <div className="sticky top-0 z-20 border-b border-[var(--interactive-border)] bg-[var(--surface-elevated)]">
                    <div className="flex items-center justify-between gap-2 px-3 py-3">
                      <span className="typography-ui-header font-semibold text-foreground">Rate limits</span>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center rounded-md border border-[var(--interactive-border)] p-0.5">
                          <button
                            type="button"
                            className={cn(
                              'px-1.5 py-0.5 rounded-sm typography-micro text-[9px] transition-colors',
                              quotaDisplayMode === 'usage'
                                ? 'bg-interactive-selection text-interactive-selection-foreground'
                                : 'text-muted-foreground hover:text-foreground'
                            )}
                            onClick={() => handleDisplayModeChange('usage')}
                            aria-label="Show used quota"
                          >
                            Used
                          </button>
                          <button
                            type="button"
                            className={cn(
                              'px-1.5 py-0.5 rounded-sm typography-micro text-[9px] transition-colors',
                              quotaDisplayMode === 'remaining'
                                ? 'bg-interactive-selection text-interactive-selection-foreground'
                                : 'text-muted-foreground hover:text-foreground'
                            )}
                            onClick={() => handleDisplayModeChange('remaining')}
                            aria-label="Show remaining quota"
                          >
                            Remaining
                          </button>
                        </div>
                        <button
                          type="button"
                          className={cn(
                            'inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors',
                            'hover:text-foreground hover:bg-interactive-hover',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'
                          )}
                          onClick={() => fetchAllQuotas()}
                          disabled={isQuotaLoading}
                          aria-label="Refresh rate limits"
                        >
                          <RiRefreshLine className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsMobileRateLimitsOpen(false)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-interactive-hover"
                          aria-label="Close rate limits"
                        >
                          <RiCloseLine className="h-5 w-5" />
                        </button>
                      </div>
                    </div>
                    <div className="px-3 pb-3 typography-micro text-muted-foreground text-[10px]">
                      Last updated {formatTime(quotaLastUpdated)}
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto overflow-x-hidden">
                    {!hasRateLimits && (
                      <div className="px-3 py-4 typography-ui-label text-muted-foreground">
                        No rate limits available.
                      </div>
                    )}
                    {rateLimitGroups.map((group) => (
                      <React.Fragment key={group.providerId}>
                        <div className="sticky top-0 z-10 flex items-center gap-2 bg-[var(--surface-elevated)] px-3 py-2">
                          <ProviderLogo providerId={group.providerId} className="h-4 w-4" />
                          <span className="typography-ui-label text-foreground">{group.providerName}</span>
                        </div>
                        {group.entries.map(([label, window]) => {
                          const displayPercent = quotaDisplayMode === 'remaining'
                            ? window.remainingPercent
                            : window.usedPercent;
                          return (
                            <div key={`${group.providerId}-${label}`} className="px-3 py-2">
                              <div className="flex items-center justify-between gap-3">
                                <span className="truncate typography-micro text-muted-foreground">
                                  {formatWindowLabel(label)}
                                </span>
                                <span className="typography-ui-label text-foreground tabular-nums">
                                  {formatPercent(displayPercent)}
                                </span>
                              </div>
                              <UsageProgressBar percent={displayPercent} tonePercent={window.usedPercent} className="mt-2 h-1" />
                              <div className="mt-1 typography-micro text-muted-foreground text-[10px]">
                                {window.resetAfterFormatted ?? window.resetAtFormatted ?? ''}
                              </div>
                            </div>
                          );
                        })}
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>

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
