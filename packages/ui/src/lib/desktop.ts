import type { ProjectEntry, RuntimeDescriptor } from '@/lib/api/types';

export type AssistantNotificationPayload = {
  title?: string;
  body?: string;
};

export type UpdateInfo = {
  available: boolean;
  version?: string;
  currentVersion: string;
  body?: string;
  date?: string;
  // Web-specific fields
  packageManager?: string;
  updateCommand?: string;
};

export type UpdateProgress = {
  downloaded: number;
  total?: number;
};

export type SkillCatalogConfig = {
  id: string;
  label: string;
  source: string;
  subpath?: string;
  gitIdentityId?: string;
};

export type DesktopSettings = {
  themeId?: string;
  useSystemTheme?: boolean;
  themeVariant?: 'light' | 'dark';
  lightThemeId?: string;
  darkThemeId?: string;
  lastDirectory?: string;
  homeDirectory?: string;
  // Optional absolute path to `opencode` binary.
  opencodeBinary?: string;
  projects?: ProjectEntry[];
  activeProjectId?: string;
  approvedDirectories?: string[];
  securityScopedBookmarks?: string[];
  pinnedDirectories?: string[];
  showReasoningTraces?: boolean;
  showTextJustificationActivity?: boolean;
  nativeNotificationsEnabled?: boolean;
  notificationMode?: 'always' | 'hidden-only';
  mobileHapticsEnabled?: boolean;
  biometricLockEnabled?: boolean;
  notifyOnSubtasks?: boolean;

  // Event toggles (which events trigger notifications)
  notifyOnCompletion?: boolean;
  notifyOnError?: boolean;
  notifyOnQuestion?: boolean;

  // Per-event notification templates
  notificationTemplates?: {
    completion: { title: string; message: string };
    error: { title: string; message: string };
    question: { title: string; message: string };
    subtask: { title: string; message: string };
  };

  // Summarization settings
  summarizeLastMessage?: boolean;
  summaryThreshold?: number;
  summaryLength?: number;
  maxLastMessageLength?: number;

  usageAutoRefresh?: boolean;
  usageRefreshIntervalMs?: number;
  usageDisplayMode?: 'usage' | 'remaining';
  usageDropdownProviders?: string[];
  usageSelectedModels?: Record<string, string[]>;  // Map of providerId -> selected model names
  usageCollapsedFamilies?: Record<string, string[]>;  // Map of providerId -> collapsed family IDs (UsagePage)
  usageExpandedFamilies?: Record<string, string[]>;  // Map of providerId -> EXPANDED family IDs (header dropdown - inverted)
  usageModelGroups?: Record<string, {
    customGroups?: Array<{id: string; label: string; models: string[]; order: number}>;
    modelAssignments?: Record<string, string>;  // modelName -> groupId
    renamedGroups?: Record<string, string>;  // groupId -> custom label
  }>;  // Per-provider custom model groups configuration
  autoDeleteEnabled?: boolean;
  autoDeleteAfterDays?: number;
  defaultModel?: string; // format: "provider/model"
  defaultVariant?: string;
  defaultAgent?: string;
  defaultGitIdentityId?: string; // ''/undefined = unset, 'global' or profile id
  openInAppId?: string;
  autoCreateWorktree?: boolean;
  queueModeEnabled?: boolean;
  gitmojiEnabled?: boolean;
  zenModel?: string;
  toolCallExpansion?: 'collapsed' | 'activity' | 'detailed';
  fontSize?: number;
  terminalFontSize?: number;
  padding?: number;
  cornerRadius?: number;
  inputBarOffset?: number;

  favoriteModels?: Array<{ providerID: string; modelID: string }>;
  recentModels?: Array<{ providerID: string; modelID: string }>;
  diffLayoutPreference?: 'dynamic' | 'inline' | 'side-by-side';
  diffViewMode?: 'single' | 'stacked';
  directoryShowHidden?: boolean;
  filesViewShowGitignored?: boolean;

  // Message limit — controls fetch, trim, and Load More chunk size (default: 200)
  messageLimit?: number;

  // User-added skills catalogs (persisted to ~/.config/openchamber/settings.json)
  skillCatalogs?: SkillCatalogConfig[];
};

type TauriGlobal = {
  core?: {
    invoke?: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
  };
  dialog?: {
    open?: (options: Record<string, unknown>) => Promise<unknown>;
  };
  notification?: {
    isPermissionGranted?: () => Promise<boolean>;
    requestPermission?: () => Promise<'granted' | 'denied' | 'default' | string>;
    sendNotification?: (payload: { title?: string; body?: string; tag?: string }) => Promise<void> | void;
  };
  opener?: {
    openUrl?: (url: string) => Promise<void>;
  };
  clipboardManager?: {
    writeText?: (text: string) => Promise<void>;
    readText?: () => Promise<string>;
  };
  haptics?: {
    vibrate?: (duration: number) => Promise<void>;
    impactFeedback?: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => Promise<void>;
    notificationFeedback?: (kind: 'success' | 'warning' | 'error') => Promise<void>;
    selectionFeedback?: () => Promise<void>;
  };
  biometric?: {
    checkStatus?: () => Promise<{ isAvailable?: boolean; error?: string }>;
    authenticate?: (
      reason: string,
      options?: {
        allowDeviceCredential?: boolean;
        cancelTitle?: string;
        fallbackTitle?: string;
        title?: string;
        subtitle?: string;
        confirmationRequired?: boolean;
      }
    ) => Promise<void>;
  };
  event?: {
    listen?: (
      event: string,
      handler: (evt: { payload?: unknown }) => void,
    ) => Promise<() => void>;
  };
  shell?: {
    open?: (url: string) => Promise<unknown>;
  };
};

type TauriNotificationPermission = 'granted' | 'denied' | 'default';
type HapticFeedbackType = 'selection' | 'success' | 'warning' | 'error' | 'impact-light' | 'impact-medium' | 'impact-heavy';

const getTauriGlobal = (): TauriGlobal | null => {
  if (typeof window === 'undefined') {
    return null;
  }
  return (window as unknown as { __TAURI__?: TauriGlobal }).__TAURI__ ?? null;
};

const getRuntimeDescriptor = (): RuntimeDescriptor | null => {
  if (typeof window === 'undefined') {
    return null;
  }
  const apis = (window as { __OPENCHAMBER_RUNTIME_APIS__?: { runtime?: RuntimeDescriptor } }).__OPENCHAMBER_RUNTIME_APIS__;
  return apis?.runtime ?? null;
};

export const isTauriShell = (): boolean => {
  if (typeof window === 'undefined') return false;
  const tauri = getTauriGlobal();
  return typeof tauri?.core?.invoke === 'function';
};

export const isNativeMobileApp = (): boolean => isTauriMobileShell();

const isLikelyMobileUserAgent = (): boolean => {
  if (typeof navigator === 'undefined') {
    return false;
  }
  const ua = navigator.userAgent.toLowerCase();
  return /iphone|ipad|ipod|android|mobile/.test(ua);
};

export const isTauriMobileShell = (): boolean => {
  const runtime = getRuntimeDescriptor();
  if (runtime?.platform === 'mobile') {
    return true;
  }
  if (runtime?.platform === 'desktop' || runtime?.platform === 'vscode') {
    return false;
  }
  return isTauriShell() && isLikelyMobileUserAgent();
};

const normalizeOrigin = (raw: string): string | null => {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed).origin;
  } catch {
    try {
      return new URL(trimmed.endsWith('/') ? trimmed : `${trimmed}/`).origin;
    } catch {
      return null;
    }
  }
};

export const isDesktopLocalOriginActive = (): boolean => {
  if (typeof window === 'undefined') return false;
  const local = typeof window.__OPENCHAMBER_LOCAL_ORIGIN__ === 'string' ? window.__OPENCHAMBER_LOCAL_ORIGIN__ : '';
  const localOrigin = normalizeOrigin(local);
  const currentOrigin = normalizeOrigin(window.location.origin) || window.location.origin;
  return Boolean(localOrigin && currentOrigin && localOrigin === currentOrigin);
};

// Desktop shell detection that doesn't require Tauri IPC availability.
// (Remote pages can temporarily lose window.__TAURI__ if URL doesn't match remote allowlist.)
export const isDesktopShell = (): boolean => {
  if (typeof window === 'undefined') return false;
  if (isTauriMobileShell()) {
    return false;
  }
  const runtime = getRuntimeDescriptor();
  if (runtime) {
    if (runtime.platform === 'mobile') {
      return false;
    }
    if (runtime.platform === 'desktop' || runtime.isDesktop) {
      return true;
    }
    if (runtime.platform === 'web' || runtime.platform === 'vscode') {
      return false;
    }
  }
  if (typeof window.__OPENCHAMBER_LOCAL_ORIGIN__ === 'string' && window.__OPENCHAMBER_LOCAL_ORIGIN__.length > 0) {
    return true;
  }
  return isTauriShell();
};

export const isVSCodeRuntime = (): boolean => {
  const runtime = getRuntimeDescriptor();
  return runtime?.isVSCode === true || runtime?.platform === 'vscode';
};

export const isMobileRuntime = (): boolean => {
  const runtime = getRuntimeDescriptor();
  return runtime?.platform === 'mobile' || isTauriMobileShell();
};

export const isWebRuntime = (): boolean => {
  if (typeof window === "undefined") return false;
  if (isTauriMobileShell()) {
    return false;
  }
  const platform = getRuntimeDescriptor()?.platform;
  if (platform === 'web') {
    return true;
  }
  if (platform === 'desktop' || platform === 'vscode' || platform === 'mobile') {
    return false;
  }
  return !isVSCodeRuntime();
};

export const getDesktopHomeDirectory = async (): Promise<string | null> => {
  if (typeof window !== 'undefined') {
    const embedded = window.__OPENCHAMBER_HOME__;
    if (embedded && embedded.length > 0) {
      return embedded;
    }
  }

  return null;
};

export const requestDirectoryAccess = async (
  directoryPath: string
): Promise<{ success: boolean; path?: string; projectId?: string; error?: string }> => {
  // Desktop shell on local instance: use native folder picker.
  if (isTauriShell() && isDesktopLocalOriginActive()) {
    try {
      const tauri = getTauriGlobal();
      const selected = await tauri?.dialog?.open?.({
        directory: true,
        multiple: false,
        title: 'Select Working Directory',
      });
      if (!selected || typeof selected !== 'string') {
        return { success: false, error: 'Directory selection cancelled' };
      }
      return { success: true, path: selected };
    } catch (error) {
      console.warn('Failed to request directory access (tauri)', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  return { success: true, path: directoryPath };
};

export const startAccessingDirectory = async (
  directoryPath: string
): Promise<{ success: boolean; error?: string }> => {
  void directoryPath;
  return { success: true };
};

export const stopAccessingDirectory = async (
  directoryPath: string
): Promise<{ success: boolean; error?: string }> => {
  void directoryPath;
  return { success: true };
};

export const sendAssistantCompletionNotification = async (
  payload?: AssistantNotificationPayload
): Promise<boolean> => {
  if (isTauriShell()) {
    try {
      const tauri = getTauriGlobal();
      if (tauri?.notification?.sendNotification) {
        const permission = await requestNativeNotificationPermission();
        if (permission !== 'granted') {
          return false;
        }
        await tauri.notification.sendNotification({
          title: payload?.title ?? 'OpenChamber',
          body: payload?.body,
          tag: 'openchamber-agent-complete',
        });
        return true;
      }

      await tauri?.core?.invoke?.('desktop_notify', {
        payload: {
          title: payload?.title,
          body: payload?.body,
          tag: 'openchamber-agent-complete',
        },
      });
      return true;
    } catch (error) {
      console.warn('Failed to send assistant completion notification (tauri)', error);
      return false;
    }
  }

  return false;
};

export const checkForDesktopUpdates = async (): Promise<UpdateInfo | null> => {
  if (!isTauriShell() || !isDesktopLocalOriginActive()) {
    return null;
  }

  try {
    const tauri = getTauriGlobal();
    const info = await tauri?.core?.invoke?.('desktop_check_for_updates');
    return info as UpdateInfo;
  } catch (error) {
    console.warn('Failed to check for updates (tauri)', error);
    return null;
  }
};

export const downloadDesktopUpdate = async (
  onProgress?: (progress: UpdateProgress) => void
): Promise<boolean> => {
  if (!isTauriShell() || !isDesktopLocalOriginActive()) {
    return false;
  }

  const tauri = getTauriGlobal();
  let unlisten: null | (() => void | Promise<void>) = null;
  let downloaded = 0;
  let total: number | undefined;

  try {
    if (typeof onProgress === 'function' && tauri?.event?.listen) {
      unlisten = await tauri.event.listen('openchamber:update-progress', (evt) => {
        const payload = evt?.payload;
        if (!payload || typeof payload !== 'object') return;
        const data = payload as { event?: unknown; data?: unknown };
        const eventName = typeof data.event === 'string' ? data.event : null;
        const eventData = data.data && typeof data.data === 'object' ? (data.data as Record<string, unknown>) : null;

        if (eventName === 'Started') {
          downloaded = 0;
          total = typeof eventData?.contentLength === 'number' ? (eventData.contentLength as number) : undefined;
          onProgress({ downloaded, total });
          return;
        }

        if (eventName === 'Progress') {
          const d = eventData?.downloaded;
          const t = eventData?.total;
          if (typeof d === 'number') downloaded = d;
          if (typeof t === 'number') total = t;
          onProgress({ downloaded, total });
          return;
        }

        if (eventName === 'Finished') {
          onProgress({ downloaded, total });
        }
      });
    }

    await tauri?.core?.invoke?.('desktop_download_and_install_update');
    return true;
  } catch (error) {
    console.warn('Failed to download update (tauri)', error);
    return false;
  } finally {
    if (unlisten) {
      try {
        const result = unlisten();
        if (result instanceof Promise) {
          await result;
        }
      } catch {
        // ignored
      }
    }
  }
};

export const restartToApplyUpdate = async (): Promise<boolean> => {
  if (!isTauriShell() || !isDesktopLocalOriginActive()) {
    return false;
  }

  try {
    const tauri = getTauriGlobal();
    await tauri?.core?.invoke?.('desktop_restart');
    return true;
  } catch (error) {
    console.warn('Failed to restart for update (tauri)', error);
    return false;
  }
};

export const openDesktopPath = async (path: string, app?: string | null): Promise<boolean> => {
  if (!isTauriShell() || !isDesktopLocalOriginActive()) {
    return false;
  }

  const trimmed = path?.trim();
  if (!trimmed) {
    return false;
  }

  try {
    const tauri = getTauriGlobal();
    await tauri?.core?.invoke?.('desktop_open_path', {
      path: trimmed,
      app: typeof app === 'string' && app.trim().length > 0 ? app.trim() : undefined,
    });
    return true;
  } catch (error) {
    console.warn('Failed to open path (tauri)', error);
    return false;
  }
};

export const filterInstalledDesktopApps = async (apps: string[]): Promise<string[]> => {
  if (!isTauriShell() || !isDesktopLocalOriginActive()) {
    return [];
  }

  const candidate = Array.isArray(apps) ? apps.filter((value) => typeof value === 'string') : [];
  if (candidate.length === 0) {
    return [];
  }

  try {
    const tauri = getTauriGlobal();
    const result = await tauri?.core?.invoke?.('desktop_filter_installed_apps', {
      apps: candidate,
    });
    return Array.isArray(result) ? result.filter((value) => typeof value === 'string') : [];
  } catch (error) {
    console.warn('Failed to check installed apps (tauri)', error);
    return [];
  }
};

export const fetchDesktopAppIcons = async (apps: string[]): Promise<Record<string, string>> => {
  if (!isTauriShell() || !isDesktopLocalOriginActive()) {
    return {};
  }

  const candidate = Array.isArray(apps) ? apps.filter((value) => typeof value === 'string') : [];
  if (candidate.length === 0) {
    return {};
  }

  try {
    const tauri = getTauriGlobal();
    const result = await tauri?.core?.invoke?.('desktop_fetch_app_icons', {
      apps: candidate,
    });
    if (!Array.isArray(result)) {
      return {};
    }
    const map: Record<string, string> = {};
    for (const entry of result) {
      if (!entry || typeof entry !== 'object') continue;
      const candidateEntry = entry as { app?: unknown; data_url?: unknown };
      if (typeof candidateEntry.app !== 'string' || typeof candidateEntry.data_url !== 'string') continue;
      map[candidateEntry.app] = candidateEntry.data_url;
    }
    return map;
  } catch (error) {
    console.warn('Failed to fetch installed app icons (tauri)', error);
    return {};
  }
};

export type InstalledDesktopAppInfo = {
  name: string;
  iconDataUrl?: string | null;
};

export type FetchDesktopInstalledAppsResult = {
  apps: InstalledDesktopAppInfo[];
  success: boolean;
  hasCache: boolean;
  isCacheStale: boolean;
};

export const fetchDesktopInstalledApps = async (
  apps: string[],
  force?: boolean
): Promise<FetchDesktopInstalledAppsResult> => {
  if (!isTauriShell() || !isDesktopLocalOriginActive()) {
    return { apps: [], success: false, hasCache: false, isCacheStale: false };
  }

  const candidate = Array.isArray(apps) ? apps.filter((value) => typeof value === 'string') : [];
  if (candidate.length === 0) {
    return { apps: [], success: true, hasCache: false, isCacheStale: false };
  }

  try {
    const tauri = getTauriGlobal();
    const result = await tauri?.core?.invoke?.('desktop_get_installed_apps', {
      apps: candidate,
      force: force === true ? true : undefined,
    });
    if (!result || typeof result !== 'object') {
      return { apps: [], success: false, hasCache: false, isCacheStale: false };
    }
    const payload = result as { apps?: unknown; hasCache?: unknown; isCacheStale?: unknown };
    if (!Array.isArray(payload.apps)) {
      return { apps: [], success: false, hasCache: false, isCacheStale: false };
    }
    const installedApps = payload.apps
      .filter((entry) => entry && typeof entry === 'object')
      .map((entry) => {
        const record = entry as { name?: unknown; iconDataUrl?: unknown };
        return {
          name: typeof record.name === 'string' ? record.name : '',
          iconDataUrl: typeof record.iconDataUrl === 'string' ? record.iconDataUrl : null,
        };
      })
      .filter((entry) => entry.name.length > 0);
    return {
      apps: installedApps,
      success: true,
      hasCache: payload.hasCache === true,
      isCacheStale: payload.isCacheStale === true,
    };
  } catch (error) {
    console.warn('Failed to fetch installed apps (tauri)', error);
    return { apps: [], success: false, hasCache: false, isCacheStale: false };
  }
};

export const requestNativeNotificationPermission = async (): Promise<TauriNotificationPermission> => {
  if (!isTauriShell()) {
    if (typeof Notification === 'undefined') {
      return 'denied';
    }
    if (Notification.permission === 'default') {
      try {
        const permission = await Notification.requestPermission();
        if (permission === 'granted' || permission === 'denied' || permission === 'default') {
          return permission;
        }
      } catch {
        return 'denied';
      }
    }
    return Notification.permission;
  }

  const tauri = getTauriGlobal();
  const isGranted = await tauri?.notification?.isPermissionGranted?.();
  if (isGranted === true) {
    return 'granted';
  }
  const requested = await tauri?.notification?.requestPermission?.();
  if (requested === 'granted' || requested === 'denied' || requested === 'default') {
    return requested;
  }
  return 'denied';
};

export const writeTextToClipboard = async (text: string): Promise<boolean> => {
  const value = typeof text === 'string' ? text : String(text);
  if (!value) {
    return false;
  }

  const tauri = getTauriGlobal();
  if (tauri?.clipboardManager?.writeText) {
    try {
      await tauri.clipboardManager.writeText(value);
      return true;
    } catch {
      return false;
    }
  }

  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      return false;
    }
  }

  return false;
};

const fileNameFromUri = (uri: string): string => {
  try {
    const parsed = new URL(uri);
    const raw = parsed.pathname.split('/').pop() ?? '';
    const decoded = decodeURIComponent(raw);
    return decoded || 'attachment';
  } catch {
    const raw = uri.split('/').pop() ?? '';
    return raw || 'attachment';
  }
};

export const pickFilesFromNativeDialog = async (): Promise<File[]> => {
  if (!isNativeMobileApp()) {
    return [];
  }

  const tauri = getTauriGlobal();
  if (!tauri?.dialog?.open) {
    return [];
  }

  try {
    const selected = await tauri.dialog.open({
      multiple: true,
      directory: false,
      title: 'Attach files',
    });

    const values: string[] = Array.isArray(selected)
      ? selected.filter((value): value is string => typeof value === 'string')
      : typeof selected === 'string'
        ? [selected]
        : [];

    if (values.length === 0) {
      return [];
    }

    const files: File[] = [];
    for (const uri of values) {
      try {
        const response = await fetch(uri);
        if (!response.ok) {
          continue;
        }
        const blob = await response.blob();
        const name = fileNameFromUri(uri);
        files.push(new File([blob], name, { type: blob.type || 'application/octet-stream' }));
      } catch {
        continue;
      }
    }

    return files;
  } catch {
    return [];
  }
};

export const openExternalUrl = async (url: string): Promise<boolean> => {
  const value = typeof url === 'string' ? url.trim() : '';
  if (!value) {
    return false;
  }

  const tauri = getTauriGlobal();
  if (tauri?.opener?.openUrl) {
    try {
      await tauri.opener.openUrl(value);
      return true;
    } catch {
      return false;
    }
  }

  if (tauri?.shell?.open) {
    try {
      await tauri.shell.open(value);
      return true;
    } catch {
      return false;
    }
  }

  if (typeof window !== 'undefined') {
    try {
      window.open(value, '_blank', 'noopener,noreferrer');
      return true;
    } catch {
      return false;
    }
  }

  return false;
};

export const runHapticFeedback = async (type: HapticFeedbackType, enabled = true): Promise<void> => {
  if (!enabled) {
    return;
  }

  const tauri = getTauriGlobal();
  if (tauri?.haptics) {
    try {
      if (type === 'selection') {
        await tauri.haptics.selectionFeedback?.();
        return;
      }
      if (type === 'success' || type === 'warning' || type === 'error') {
        await tauri.haptics.notificationFeedback?.(type);
        return;
      }
      if (type === 'impact-light') {
        await tauri.haptics.impactFeedback?.('light');
        return;
      }
      if (type === 'impact-medium') {
        await tauri.haptics.impactFeedback?.('medium');
        return;
      }
      if (type === 'impact-heavy') {
        await tauri.haptics.impactFeedback?.('heavy');
        return;
      }
    } catch {
      return;
    }
  }

  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    try {
      if (type === 'selection') {
        navigator.vibrate(10);
      } else if (type === 'success') {
        navigator.vibrate([20, 20, 20]);
      } else if (type === 'warning') {
        navigator.vibrate([30, 20, 30]);
      } else if (type === 'error') {
        navigator.vibrate([40, 30, 40]);
      } else if (type === 'impact-light') {
        navigator.vibrate(12);
      } else if (type === 'impact-medium') {
        navigator.vibrate(18);
      } else if (type === 'impact-heavy') {
        navigator.vibrate(24);
      }
    } catch {
      return;
    }
  }
};

export const getBiometricStatus = async (): Promise<{ isAvailable: boolean; error?: string }> => {
  if (!isNativeMobileApp()) {
    return { isAvailable: false, error: 'not_mobile' };
  }

  const tauri = getTauriGlobal();
  if (!tauri?.biometric?.checkStatus) {
    return { isAvailable: false, error: 'plugin_unavailable' };
  }

  try {
    const status = await tauri.biometric.checkStatus();
    return {
      isAvailable: status?.isAvailable === true,
      error: typeof status?.error === 'string' ? status.error : undefined,
    };
  } catch (error) {
    return {
      isAvailable: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

export const authenticateWithBiometrics = async (
  reason: string,
  options?: {
    allowDeviceCredential?: boolean;
    cancelTitle?: string;
    fallbackTitle?: string;
    title?: string;
    subtitle?: string;
    confirmationRequired?: boolean;
  }
): Promise<boolean> => {
  if (!isNativeMobileApp()) {
    return false;
  }

  const tauri = getTauriGlobal();
  if (!tauri?.biometric?.authenticate) {
    return false;
  }

  try {
    await tauri.biometric.authenticate(reason, options);
    return true;
  } catch {
    return false;
  }
};
