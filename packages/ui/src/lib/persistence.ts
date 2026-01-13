import { getDesktopSettings, updateDesktopSettings as updateDesktopSettingsApi, isDesktopRuntime } from '@/lib/desktop';
import type { DesktopSettings } from '@/lib/desktop';
import { useUIStore } from '@/stores/useUIStore';
import { useMessageQueueStore } from '@/stores/messageQueueStore';
import { loadAppearancePreferences, applyAppearancePreferences } from '@/lib/appearancePersistence';
import { getRegisteredRuntimeAPIs } from '@/contexts/runtimeAPIRegistry';

const persistToLocalStorage = (settings: DesktopSettings) => {
  if (typeof window === 'undefined') {
    return;
  }

  if (settings.themeId) {
    localStorage.setItem('selectedThemeId', settings.themeId);
  }
  if (settings.themeVariant) {
    localStorage.setItem('selectedThemeVariant', settings.themeVariant);
  }
  if (settings.lightThemeId) {
    localStorage.setItem('lightThemeId', settings.lightThemeId);
  }
  if (settings.darkThemeId) {
    localStorage.setItem('darkThemeId', settings.darkThemeId);
  }
  if (typeof settings.useSystemTheme === 'boolean') {
    localStorage.setItem('useSystemTheme', String(settings.useSystemTheme));
  }
  if (settings.lastDirectory) {
    localStorage.setItem('lastDirectory', settings.lastDirectory);
  }
  if (settings.homeDirectory) {
    localStorage.setItem('homeDirectory', settings.homeDirectory);
    window.__OPENCHAMBER_HOME__ = settings.homeDirectory;
  }
  if (Array.isArray(settings.projects) && settings.projects.length > 0) {
    localStorage.setItem('projects', JSON.stringify(settings.projects));
  } else {
    localStorage.removeItem('projects');
  }
  if (settings.activeProjectId) {
    localStorage.setItem('activeProjectId', settings.activeProjectId);
  } else {
    localStorage.removeItem('activeProjectId');
  }
  if (Array.isArray(settings.pinnedDirectories) && settings.pinnedDirectories.length > 0) {
    localStorage.setItem('pinnedDirectories', JSON.stringify(settings.pinnedDirectories));
  } else {
    localStorage.removeItem('pinnedDirectories');
  }
  if (settings.commitMessageModel) {
    localStorage.setItem('commitMessageModel', settings.commitMessageModel);
  } else {
    localStorage.removeItem('commitMessageModel');
  }
};

type PersistApi = {
  hasHydrated?: () => boolean;
  onFinishHydration?: (callback: () => void) => (() => void) | void;
};

const sanitizeSkillCatalogs = (value: unknown): DesktopSettings['skillCatalogs'] | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const result: NonNullable<DesktopSettings['skillCatalogs']> = [];
  const seen = new Set<string>();

  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const candidate = entry as Record<string, unknown>;

    const id = typeof candidate.id === 'string' ? candidate.id.trim() : '';
    const label = typeof candidate.label === 'string' ? candidate.label.trim() : '';
    const source = typeof candidate.source === 'string' ? candidate.source.trim() : '';
    const subpath = typeof candidate.subpath === 'string' ? candidate.subpath.trim() : '';
    const gitIdentityId = typeof candidate.gitIdentityId === 'string' ? candidate.gitIdentityId.trim() : '';

    if (!id || !label || !source) continue;
    if (seen.has(id)) continue;
    seen.add(id);

    result.push({
      id,
      label,
      source,
      ...(subpath ? { subpath } : {}),
      ...(gitIdentityId ? { gitIdentityId } : {}),
    });
  }

  return result;
};

const sanitizeProjects = (value: unknown): DesktopSettings['projects'] | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const result: NonNullable<DesktopSettings['projects']> = [];
  const seenIds = new Set<string>();
  const seenPaths = new Set<string>();

  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const candidate = entry as Record<string, unknown>;

    const id = typeof candidate.id === 'string' ? candidate.id.trim() : '';
    const rawPath = typeof candidate.path === 'string' ? candidate.path.trim() : '';
    if (!id || !rawPath) continue;

    const normalizedPath = rawPath === '/' ? rawPath : rawPath.replace(/\\/g, '/').replace(/\/+$/, '');
    if (!normalizedPath) continue;

    if (seenIds.has(id) || seenPaths.has(normalizedPath)) continue;
    seenIds.add(id);
    seenPaths.add(normalizedPath);

    const project: NonNullable<DesktopSettings['projects']>[number] = {
      id,
      path: normalizedPath,
    };

    if (typeof candidate.label === 'string' && candidate.label.trim().length > 0) {
      project.label = candidate.label.trim();
    }
    if (typeof candidate.addedAt === 'number' && Number.isFinite(candidate.addedAt) && candidate.addedAt >= 0) {
      project.addedAt = candidate.addedAt;
    }
    if (
      typeof candidate.lastOpenedAt === 'number' &&
      Number.isFinite(candidate.lastOpenedAt) &&
      candidate.lastOpenedAt >= 0
    ) {
      project.lastOpenedAt = candidate.lastOpenedAt;
    }
    // Preserve worktreeDefaults
    if (candidate.worktreeDefaults && typeof candidate.worktreeDefaults === 'object') {
      const wt = candidate.worktreeDefaults as Record<string, unknown>;
      const defaults: Record<string, unknown> = {};
      if (typeof wt.branchPrefix === 'string' && wt.branchPrefix.trim()) {
        defaults.branchPrefix = wt.branchPrefix.trim();
      }
      if (typeof wt.baseBranch === 'string' && wt.baseBranch.trim()) {
        defaults.baseBranch = wt.baseBranch.trim();
      }
      if (typeof wt.autoCreateWorktree === 'boolean') {
        defaults.autoCreateWorktree = wt.autoCreateWorktree;
      }
      if (Object.keys(defaults).length > 0) {
        (project as unknown as Record<string, unknown>).worktreeDefaults = defaults;
      }
    }

    result.push(project);
  }

  return result.length > 0 ? result : undefined;
};

const getPersistApi = (): PersistApi | undefined => {
  const candidate = (useUIStore as unknown as { persist?: PersistApi }).persist;
  if (candidate && typeof candidate === 'object') {
    return candidate;
  }
  return undefined;
};

const getRuntimeSettingsAPI = () => getRegisteredRuntimeAPIs()?.settings ?? null;

const applyDesktopUiPreferences = (settings: DesktopSettings) => {
  const store = useUIStore.getState();
  const queueStore = useMessageQueueStore.getState();

  if (typeof settings.showReasoningTraces === 'boolean' && settings.showReasoningTraces !== store.showReasoningTraces) {
    store.setShowReasoningTraces(settings.showReasoningTraces);
  }
  if (typeof settings.autoDeleteEnabled === 'boolean' && settings.autoDeleteEnabled !== store.autoDeleteEnabled) {
    store.setAutoDeleteEnabled(settings.autoDeleteEnabled);
  }
  if (typeof settings.autoDeleteAfterDays === 'number' && Number.isFinite(settings.autoDeleteAfterDays)) {
    const normalized = Math.max(1, Math.min(365, settings.autoDeleteAfterDays));
    if (normalized !== store.autoDeleteAfterDays) {
      store.setAutoDeleteAfterDays(normalized);
    }
  }
  if (typeof settings.queueModeEnabled === 'boolean' && settings.queueModeEnabled !== queueStore.queueModeEnabled) {
    queueStore.setQueueMode(settings.queueModeEnabled);
  }
};

const sanitizeWebSettings = (payload: unknown): DesktopSettings | null => {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const candidate = payload as Record<string, unknown>;
  const result: DesktopSettings = {};

  if (typeof candidate.themeId === 'string' && candidate.themeId.length > 0) {
    result.themeId = candidate.themeId;
  }
  if (candidate.useSystemTheme === true || candidate.useSystemTheme === false) {
    result.useSystemTheme = candidate.useSystemTheme;
  }
  if (typeof candidate.themeVariant === 'string' && (candidate.themeVariant === 'light' || candidate.themeVariant === 'dark')) {
    result.themeVariant = candidate.themeVariant;
  }
  if (typeof candidate.lightThemeId === 'string' && candidate.lightThemeId.length > 0) {
    result.lightThemeId = candidate.lightThemeId;
  }
  if (typeof candidate.darkThemeId === 'string' && candidate.darkThemeId.length > 0) {
    result.darkThemeId = candidate.darkThemeId;
  }
  if (typeof candidate.lastDirectory === 'string' && candidate.lastDirectory.length > 0) {
    result.lastDirectory = candidate.lastDirectory;
  }
  if (typeof candidate.homeDirectory === 'string' && candidate.homeDirectory.length > 0) {
    result.homeDirectory = candidate.homeDirectory;
  }

  const projects = sanitizeProjects(candidate.projects);
  if (projects) {
    result.projects = projects;
  }
  if (typeof candidate.activeProjectId === 'string' && candidate.activeProjectId.length > 0) {
    result.activeProjectId = candidate.activeProjectId;
  }

  if (Array.isArray(candidate.approvedDirectories)) {
    result.approvedDirectories = candidate.approvedDirectories.filter(
      (entry): entry is string => typeof entry === 'string' && entry.length > 0
    );
  }
  if (Array.isArray(candidate.securityScopedBookmarks)) {
    result.securityScopedBookmarks = candidate.securityScopedBookmarks.filter(
      (entry): entry is string => typeof entry === 'string' && entry.length > 0
    );
  }
  if (Array.isArray(candidate.pinnedDirectories)) {
    result.pinnedDirectories = Array.from(
      new Set(
        candidate.pinnedDirectories.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
      )
    );
  }
  if (typeof candidate.showReasoningTraces === 'boolean') {
    result.showReasoningTraces = candidate.showReasoningTraces;
  }
  if (typeof candidate.autoDeleteEnabled === 'boolean') {
    result.autoDeleteEnabled = candidate.autoDeleteEnabled;
  }
  if (typeof candidate.autoDeleteAfterDays === 'number' && Number.isFinite(candidate.autoDeleteAfterDays)) {
    result.autoDeleteAfterDays = candidate.autoDeleteAfterDays;
  }
  if (typeof candidate.defaultModel === 'string' && candidate.defaultModel.length > 0) {
    result.defaultModel = candidate.defaultModel;
  }
  if (typeof candidate.defaultVariant === 'string' && candidate.defaultVariant.length > 0) {
    result.defaultVariant = candidate.defaultVariant;
  }
  if (typeof candidate.defaultAgent === 'string' && candidate.defaultAgent.length > 0) {
    result.defaultAgent = candidate.defaultAgent;
  }
  if (typeof candidate.autoCreateWorktree === 'boolean') {
    result.autoCreateWorktree = candidate.autoCreateWorktree;
  }
  if (typeof candidate.commitMessageModel === 'string' && candidate.commitMessageModel.length > 0) {
    result.commitMessageModel = candidate.commitMessageModel;
  }
  if (typeof candidate.queueModeEnabled === 'boolean') {
    result.queueModeEnabled = candidate.queueModeEnabled;
  }

  const skillCatalogs = sanitizeSkillCatalogs(candidate.skillCatalogs);
  if (skillCatalogs) {
    result.skillCatalogs = skillCatalogs;
  }

  return result;
};

const fetchWebSettings = async (): Promise<DesktopSettings | null> => {
  const runtimeSettings = getRuntimeSettingsAPI();
  if (runtimeSettings) {
    try {
      const result = await runtimeSettings.load();
      return sanitizeWebSettings(result.settings);
    } catch (error) {
      console.warn('Failed to load shared settings from runtime settings API:', error);

    }
  }

  try {
    const response = await fetch('/api/config/settings', {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      return null;
    }
    const data = await response.json().catch(() => null);
    return sanitizeWebSettings(data);
  } catch (error) {
    console.warn('Failed to load shared settings from server:', error);
    return null;
  }
};

export const syncDesktopSettings = async (): Promise<void> => {
  if (typeof window === 'undefined') {
    return;
  }

  const persistApi = getPersistApi();

  const applySettings = (settings: DesktopSettings) => {
    persistToLocalStorage(settings);
    const apply = () => applyDesktopUiPreferences(settings);

    if (persistApi?.hasHydrated?.()) {
      apply();
    } else {
      apply();
      if (persistApi?.onFinishHydration) {
        const unsubscribe = persistApi.onFinishHydration(() => {
          unsubscribe?.();
          apply();
        });
      }
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent<DesktopSettings>('openchamber:settings-synced', { detail: settings }));
    }
  };

  try {
    const settings = isDesktopRuntime() ? await getDesktopSettings() : await fetchWebSettings();
    if (settings) {
      applySettings(settings);
    }
  } catch (error) {
    console.warn('Failed to synchronise settings:', error);
  }
};

export const updateDesktopSettings = async (changes: Partial<DesktopSettings>): Promise<void> => {
  if (typeof window === 'undefined') {
    return;
  }

  if (isDesktopRuntime()) {
    try {
      const updated = await updateDesktopSettingsApi(changes);
      if (updated) {
        persistToLocalStorage(updated);
        applyDesktopUiPreferences(updated);
      }
    } catch (error) {
      console.warn('Failed to update desktop settings:', error);
    }
    return;
  }

  const runtimeSettings = getRuntimeSettingsAPI();
  if (runtimeSettings) {
    try {
      const updated = await runtimeSettings.save(changes);
      if (updated) {
        persistToLocalStorage(updated);
        applyDesktopUiPreferences(updated);
      }
      return;
    } catch (error) {
      console.warn('Failed to update settings via runtime settings API:', error);
    }
  }

  try {
    const response = await fetch('/api/config/settings', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(changes),
    });

    if (!response.ok) {
      console.warn('Failed to update shared settings via API:', response.status, response.statusText);
      return;
    }

    const updated = (await response.json().catch(() => null)) as DesktopSettings | null;
    if (updated) {
      persistToLocalStorage(updated);
      applyDesktopUiPreferences(updated);
    }
  } catch (error) {
    console.warn('Failed to update shared settings via API:', error);
  }
};

export const initializeAppearancePreferences = async (): Promise<void> => {
  if (typeof window === 'undefined') {
    return;
  }

  const persistApi = getPersistApi();

  try {
    const appearance = await loadAppearancePreferences();
    if (!appearance) {
      return;
    }

    const applyAppearance = () => applyAppearancePreferences(appearance);

    if (persistApi?.hasHydrated?.()) {
      applyAppearance();
      return;
    }

    applyAppearance();
    if (persistApi?.onFinishHydration) {
      const unsubscribe = persistApi.onFinishHydration(() => {
        unsubscribe?.();
        applyAppearance();
      });
    }
  } catch (error) {
    console.warn('Failed to load appearance preferences:', error);
  }
};
