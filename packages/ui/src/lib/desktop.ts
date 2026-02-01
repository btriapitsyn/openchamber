import type { ProjectEntry } from '@/lib/api/types';

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

export type DesktopServerInfo = {
  webPort: number | null;
  openCodePort: number | null;
  host: string | null;
  ready: boolean;
  cliAvailable: boolean;
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
  projects?: ProjectEntry[];
  activeProjectId?: string;
  approvedDirectories?: string[];
  securityScopedBookmarks?: string[];
  pinnedDirectories?: string[];
  showReasoningTraces?: boolean;
  showTextJustificationActivity?: boolean;
  nativeNotificationsEnabled?: boolean;
  notificationMode?: 'always' | 'hidden-only';
  notifyOnSubtasks?: boolean;
  usageAutoRefresh?: boolean;
  usageRefreshIntervalMs?: number;
  autoDeleteEnabled?: boolean;
  autoDeleteAfterDays?: number;
  defaultModel?: string; // format: "provider/model"
  defaultVariant?: string;
  defaultAgent?: string;
  defaultGitIdentityId?: string; // ''/undefined = unset, 'global' or profile id
  autoCreateWorktree?: boolean;
  queueModeEnabled?: boolean;
  gitmojiEnabled?: boolean;
  toolCallExpansion?: 'collapsed' | 'activity' | 'detailed';
  fontSize?: number;
  padding?: number;
  cornerRadius?: number;
  inputBarOffset?: number;
  diffLayoutPreference?: 'dynamic' | 'inline' | 'side-by-side';
  diffViewMode?: 'single' | 'stacked';
  directoryShowHidden?: boolean;
  filesViewShowGitignored?: boolean;

  // Memory limits for message viewport management
  memoryLimitHistorical?: number;   // Default fetch limit when loading/syncing (default: 90)
  memoryLimitViewport?: number;     // Trim target when leaving session (default: 120)
  memoryLimitActiveSession?: number; // Trim target for active session (default: 180)

  // User-added skills catalogs (persisted to ~/.config/openchamber/settings.json)
  skillCatalogs?: SkillCatalogConfig[];
};

export type DesktopSettingsApi = {
  getSettings: () => Promise<DesktopSettings>;
  updateSettings: (changes: Partial<DesktopSettings>) => Promise<DesktopSettings>;
};

export type DesktopApi = {
  homeDirectory?: string;
  macosMajorVersion?: number | null;
  getServerInfo: () => Promise<DesktopServerInfo>;
  restartOpenCode: () => Promise<{ success: boolean }>;
  shutdown: () => Promise<{ success: boolean }>;
  markRendererReady?: () => Promise<void> | void;
  windowControl?: (action: 'close' | 'minimize' | 'maximize') => Promise<{ success: boolean }>;
  getHomeDirectory?: () => Promise<{ success: boolean; path: string | null }>;
  getSettings?: () => Promise<DesktopSettings>;
  updateSettings?: (changes: Partial<DesktopSettings>) => Promise<DesktopSettings>;
  requestDirectoryAccess?: (path: string) => Promise<{ success: boolean; path?: string; projectId?: string; error?: string }>;
  startAccessingDirectory?: (path: string) => Promise<{ success: boolean; error?: string }>;
  stopAccessingDirectory?: (path: string) => Promise<{ success: boolean; error?: string }>;
  notifyAssistantCompletion?: (payload?: AssistantNotificationPayload) => Promise<{ success: boolean }>;
  checkForUpdates?: () => Promise<UpdateInfo>;
  downloadUpdate?: (onProgress?: (progress: UpdateProgress) => void) => Promise<void>;
  restartToUpdate?: () => Promise<void>;
  openExternal?: (url: string) => Promise<{ success: boolean; error?: string }>;
};

export const isDesktopRuntime = (): boolean =>
  typeof window !== "undefined" && typeof window.opencodeDesktop !== "undefined";

export const isVSCodeRuntime = (): boolean => {
  if (typeof window === "undefined") return false;
  const apis = (window as { __OPENCHAMBER_RUNTIME_APIS__?: { runtime?: { isVSCode?: boolean } } }).__OPENCHAMBER_RUNTIME_APIS__;
  return apis?.runtime?.isVSCode === true;
};

export const isWebRuntime = (): boolean => {
  if (typeof window === "undefined") return false;
  // Web runtime: not desktop, not VSCode
  return !isDesktopRuntime() && !isVSCodeRuntime();
};

export const getDesktopApi = (): DesktopApi | null => {
  if (!isDesktopRuntime()) {
    return null;
  }
  return window.opencodeDesktop ?? null;
};

export const getDesktopSettingsApi = (): DesktopSettingsApi | null => {
  if (typeof window === 'undefined') {
    return null;
  }
  if (window.opencodeDesktopSettings) {
    return window.opencodeDesktopSettings;
  }
  const base = window.opencodeDesktop;
  if (base?.getSettings && base?.updateSettings) {
    return {
      getSettings: base.getSettings.bind(base),
      updateSettings: base.updateSettings.bind(base)
    };
  }
  return null;
};

export const getDesktopHomeDirectory = async (): Promise<string | null> => {
  const api = getDesktopApi();

  if (typeof window !== 'undefined') {
    const embedded = window.__OPENCHAMBER_HOME__;
    if (embedded && embedded.length > 0) {
      return embedded;
    }
  }

  if (!api) {
    return null;
  }

  if (typeof api.homeDirectory === 'string' && api.homeDirectory.length > 0) {
    return api.homeDirectory;
  }

  try {
    if (!api.getHomeDirectory) {
      return null;
    }
    const result = await api.getHomeDirectory();
    if (result?.success && typeof result.path === 'string' && result.path.length > 0) {
      return result.path;
    }
  } catch (error) {
    console.warn('Failed to obtain desktop home directory:', error);
  }

  return null;
};

export const fetchDesktopServerInfo = async (): Promise<DesktopServerInfo | null> => {
  const api = getDesktopApi();
  if (!api) {
    return null;
  }

  try {
    return await api.getServerInfo();
  } catch (error) {
    console.warn("Failed to read desktop server info", error);
    return null;
  }
};

export const isCliAvailable = (): boolean => {
  if (typeof window === 'undefined') {
    return false;
  }
  return window.__OPENCHAMBER_DESKTOP_SERVER__?.cliAvailable ?? false;
};

export const getDesktopSettings = async (): Promise<DesktopSettings | null> => {
  const api = getDesktopSettingsApi();
  if (!api) {
    return null;
  }
  try {
    return await api.getSettings();
  } catch (error) {
    console.warn('Failed to read desktop settings', error);
    return null;
  }
};

export const updateDesktopSettings = async (
  changes: Partial<DesktopSettings>
): Promise<DesktopSettings | null> => {
  const api = getDesktopSettingsApi();
  if (!api) {
    return null;
  }
  try {
    return await api.updateSettings(changes);
  } catch (error) {
    console.warn('[desktop] Failed to update desktop settings', error);
    return null;
  }
};

export const requestDirectoryAccess = async (
  directoryPath: string
): Promise<{ success: boolean; path?: string; projectId?: string; error?: string }> => {
  const api = getDesktopApi();
  if (!api || !api.requestDirectoryAccess) {
    return { success: true, path: directoryPath };
  }
  try {
    return await api.requestDirectoryAccess(directoryPath);
  } catch (error) {
    console.warn('Failed to request directory access', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
};

export const startAccessingDirectory = async (
  directoryPath: string
): Promise<{ success: boolean; error?: string }> => {
  const api = getDesktopApi();
  if (!api || !api.startAccessingDirectory) {
    return { success: true };
  }
  try {
    return await api.startAccessingDirectory(directoryPath);
  } catch (error) {
    console.warn('Failed to start accessing directory', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
};

export const stopAccessingDirectory = async (
  directoryPath: string
): Promise<{ success: boolean; error?: string }> => {
  const api = getDesktopApi();
  if (!api || !api.stopAccessingDirectory) {
    return { success: true };
  }
  try {
    return await api.stopAccessingDirectory(directoryPath);
  } catch (error) {
    console.warn('Failed to stop accessing directory', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
};

export const sendAssistantCompletionNotification = async (
  payload?: AssistantNotificationPayload
): Promise<boolean> => {
  const api = getDesktopApi();
  if (!api || !api.notifyAssistantCompletion) {
    return false;
  }
  try {
    const result = await api.notifyAssistantCompletion(payload ?? {});
    return Boolean(result?.success);
  } catch (error) {
    console.warn('Failed to send assistant completion notification', error);
    return false;
  }
};

export const checkForDesktopUpdates = async (): Promise<UpdateInfo | null> => {
  const api = getDesktopApi();
  if (!api || !api.checkForUpdates) {
    return null;
  }
  try {
    return await api.checkForUpdates();
  } catch (error) {
    console.warn('Failed to check for updates', error);
    return null;
  }
};

export const downloadDesktopUpdate = async (
  onProgress?: (progress: UpdateProgress) => void
): Promise<boolean> => {
  const api = getDesktopApi();
  if (!api || !api.downloadUpdate) {
    return false;
  }
  try {
    await api.downloadUpdate(onProgress);
    return true;
  } catch (error) {
    console.warn('Failed to download update', error);
    return false;
  }
};

export const restartToApplyUpdate = async (): Promise<boolean> => {
  const api = getDesktopApi();
  if (!api || !api.restartToUpdate) {
    return false;
  }
  try {
    await api.restartToUpdate();
    return true;
  } catch (error) {
    console.warn('Failed to restart for update', error);
    return false;
  }
};
