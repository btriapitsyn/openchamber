import type { MarkdownDisplayMode } from "@/lib/markdownDisplayModes";
import type { MonoFontOption, UiFontOption } from "@/lib/fontOptions";
import type { TypographySizes } from "@/stores/useUIStore";

export type AssistantNotificationPayload = {
  title?: string;
  body?: string;
};

export type DesktopServerInfo = {
  webPort: number | null;
  openCodePort: number | null;
  host: string | null;
  ready: boolean;
};

export type DesktopSettings = {
  themeId?: string;
  useSystemTheme?: boolean;
  themeVariant?: 'light' | 'dark';
  lightThemeId?: string;
  darkThemeId?: string;
  lastDirectory?: string;
  homeDirectory?: string;
  approvedDirectories?: string[];
  securityScopedBookmarks?: string[];
  uiFont?: UiFontOption;
  monoFont?: MonoFontOption;
  markdownDisplayMode?: MarkdownDisplayMode;
  typographySizes?: TypographySizes;
  pinnedDirectories?: string[];
};

export type DesktopSettingsApi = {
  getSettings: () => Promise<DesktopSettings>;
  updateSettings: (changes: Partial<DesktopSettings>) => Promise<DesktopSettings>;
};

export type DesktopApi = {
  homeDirectory?: string;
  getServerInfo: () => Promise<DesktopServerInfo>;
  restartOpenCode: () => Promise<{ success: boolean }>;
  shutdown: () => Promise<{ success: boolean }>;
  windowControl?: (action: 'close' | 'minimize' | 'maximize') => Promise<{ success: boolean }>;
  getHomeDirectory?: () => Promise<{ success: boolean; path: string | null }>;
  getSettings?: () => Promise<DesktopSettings>;
  updateSettings?: (changes: Partial<DesktopSettings>) => Promise<DesktopSettings>;
  requestDirectoryAccess?: (path: string) => Promise<{ success: boolean; path?: string; error?: string }>;
  startAccessingDirectory?: (path: string) => Promise<{ success: boolean; error?: string }>;
  stopAccessingDirectory?: (path: string) => Promise<{ success: boolean; error?: string }>;
  notifyAssistantCompletion?: (payload?: AssistantNotificationPayload) => Promise<{ success: boolean }>;
};

export const isDesktopRuntime = (): boolean =>
  typeof window !== "undefined" && typeof window.opencodeDesktop !== "undefined";

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

export const sendWindowControl = async (
  action: 'close' | 'minimize' | 'maximize'
): Promise<boolean> => {
  const api = getDesktopApi();
  if (!api || !api.windowControl) {
    return false;
  }
  try {
    const result = await api.windowControl(action);
    return Boolean(result?.success);
  } catch (error) {
    console.warn(`Failed to send window control action "${action}":`, error);
    return false;
  }
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
    console.warn('Failed to update desktop settings', error);
    return null;
  }
};

export const requestDirectoryAccess = async (
  directoryPath: string
): Promise<{ success: boolean; path?: string; error?: string }> => {
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
