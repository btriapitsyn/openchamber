import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { opencodeClient } from '@/lib/opencode/client';
import type { ProjectEntry } from '@/lib/api/types';
import type { DesktopSettings } from '@/lib/desktop';
import { updateDesktopSettings } from '@/lib/persistence';
import { getSafeStorage } from './utils/safeStorage';
import { useDirectoryStore } from './useDirectoryStore';
import { streamDebugEnabled } from '@/stores/utils/streamDebug';

interface ProjectPathValidationResult {
  ok: boolean;
  normalizedPath?: string;
  reason?: string;
}

interface ProjectsStore {
  projects: ProjectEntry[];
  activeProjectId: string | null;

  addProject: (path: string, options?: { label?: string; id?: string }) => ProjectEntry | null;
  removeProject: (id: string) => void;
  setActiveProject: (id: string) => void;
  setActiveProjectIdOnly: (id: string) => void;
  renameProject: (id: string, label: string) => void;
  reorderProjects: (fromIndex: number, toIndex: number) => void;
  validateProjectPath: (path: string) => ProjectPathValidationResult;
  synchronizeFromSettings: (settings: DesktopSettings) => void;
  getActiveProject: () => ProjectEntry | null;
}

const safeStorage = getSafeStorage();
const PROJECTS_STORAGE_KEY = 'projects';
const ACTIVE_PROJECT_STORAGE_KEY = 'activeProjectId';

const resolveTildePath = (value: string, homeDir?: string | null): string => {
  const trimmed = value.trim();
  if (!trimmed.startsWith('~')) {
    return trimmed;
  }
  if (!homeDir) {
    return trimmed;
  }
  if (trimmed === '~') {
    return homeDir;
  }
  if (trimmed.startsWith('~/') || trimmed.startsWith('~\\')) {
    return `${homeDir}${trimmed.slice(1)}`;
  }
  return trimmed;
};

const normalizeProjectPath = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  const homeDirectory = safeStorage.getItem('homeDirectory') || useDirectoryStore.getState().homeDirectory || '';
  const expanded = resolveTildePath(trimmed, homeDirectory);

  const normalized = expanded.replace(/\\/g, '/');
  if (normalized === '/') {
    return '/';
  }
  return normalized.length > 1 ? normalized.replace(/\/+$/, '') : normalized;
};

const deriveProjectLabel = (path: string): string => {
  const normalized = normalizeProjectPath(path);
  if (!normalized || normalized === '/') {
    return 'Root';
  }
  const segments = normalized.split('/').filter(Boolean);
  return segments[segments.length - 1] || normalized;
};

const createProjectId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `proj_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
};

const sanitizeProjects = (value: unknown): ProjectEntry[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const result: ProjectEntry[] = [];
  const seenIds = new Set<string>();
  const seenPaths = new Set<string>();

  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const candidate = entry as Record<string, unknown>;

    const id = typeof candidate.id === 'string' ? candidate.id.trim() : '';
    const rawPath = typeof candidate.path === 'string' ? candidate.path.trim() : '';
    if (!id || !rawPath) continue;

    const normalizedPath = normalizeProjectPath(rawPath);
    if (!normalizedPath) continue;

    if (seenIds.has(id) || seenPaths.has(normalizedPath)) continue;
    seenIds.add(id);
    seenPaths.add(normalizedPath);

    const project: ProjectEntry = {
      id,
      path: normalizedPath,
    };

    if (typeof candidate.label === 'string' && candidate.label.trim().length > 0) {
      project.label = candidate.label.trim();
    }
    if (typeof candidate.addedAt === 'number' && Number.isFinite(candidate.addedAt) && candidate.addedAt >= 0) {
      project.addedAt = candidate.addedAt;
    }
    if (typeof candidate.lastOpenedAt === 'number' && Number.isFinite(candidate.lastOpenedAt) && candidate.lastOpenedAt >= 0) {
      project.lastOpenedAt = candidate.lastOpenedAt;
    }

    result.push(project);
  }

  return result;
};

const readPersistedProjects = (): ProjectEntry[] => {
  try {
    const raw = safeStorage.getItem(PROJECTS_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    return sanitizeProjects(JSON.parse(raw));
  } catch {
    return [];
  }
};

const readPersistedActiveProjectId = (): string | null => {
  try {
    const raw = safeStorage.getItem(ACTIVE_PROJECT_STORAGE_KEY);
    if (typeof raw === 'string' && raw.trim().length > 0) {
      return raw.trim();
    }
  } catch {
    return null;
  }
  return null;
};

const cacheProjects = (projects: ProjectEntry[], activeProjectId: string | null) => {
  try {
    safeStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(projects));
  } catch {
    // ignored
  }

  try {
    if (activeProjectId) {
      safeStorage.setItem(ACTIVE_PROJECT_STORAGE_KEY, activeProjectId);
    } else {
      safeStorage.removeItem(ACTIVE_PROJECT_STORAGE_KEY);
    }
  } catch {
    // ignored
  }
};

const persistProjects = (projects: ProjectEntry[], activeProjectId: string | null) => {
  cacheProjects(projects, activeProjectId);
  void updateDesktopSettings({ projects, activeProjectId: activeProjectId ?? undefined });
};

const initialProjects = readPersistedProjects();
const getVSCodeWorkspaceProject = (): { projects: ProjectEntry[]; activeProjectId: string | null } | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  const runtimeApis = (window as unknown as { __OPENCHAMBER_RUNTIME_APIS__?: { runtime?: { isVSCode?: boolean } } })
    .__OPENCHAMBER_RUNTIME_APIS__;
  if (!runtimeApis?.runtime?.isVSCode) {
    return null;
  }

  const workspaceFolder = (window as unknown as { __VSCODE_CONFIG__?: { workspaceFolder?: unknown } }).__VSCODE_CONFIG__?.workspaceFolder;
  if (typeof workspaceFolder !== 'string' || workspaceFolder.trim().length === 0) {
    return null;
  }

  const normalizedPath = normalizeProjectPath(workspaceFolder);
  if (!normalizedPath) {
    return null;
  }

  const id = `vscode:${normalizedPath}`;
  const entry: ProjectEntry = {
    id,
    path: normalizedPath,
    label: deriveProjectLabel(normalizedPath),
    addedAt: Date.now(),
    lastOpenedAt: Date.now(),
  };

  if (streamDebugEnabled()) {
    console.log('[OpenChamber][VSCode][projects] Using workspace fallback project', entry);
  }

  return { projects: [entry], activeProjectId: id };
};

// VS Code runtime should behave as a single-project environment scoped to the workspace folder.
// Always prefer the workspace project over any persisted multi-project registry.
const vscodeWorkspace = getVSCodeWorkspaceProject();
const effectiveInitialProjects = vscodeWorkspace?.projects ?? initialProjects;
const initialActiveProjectId = vscodeWorkspace?.activeProjectId
  ?? readPersistedActiveProjectId()
  ?? effectiveInitialProjects[0]?.id
  ?? null;

if (vscodeWorkspace) {
  cacheProjects(effectiveInitialProjects, initialActiveProjectId);
}

export const useProjectsStore = create<ProjectsStore>()(
  devtools((set, get) => ({
    projects: effectiveInitialProjects,
    activeProjectId: initialActiveProjectId,

    validateProjectPath: (path: string): ProjectPathValidationResult => {
      if (typeof path !== 'string' || path.trim().length === 0) {
        return { ok: false, reason: 'Provide a directory path.' };
      }

      const normalized = normalizeProjectPath(path);
      if (!normalized) {
        return { ok: false, reason: 'Directory path cannot be empty.' };
      }

      return { ok: true, normalizedPath: normalized };
    },

    addProject: (path: string, options?: { label?: string; id?: string }) => {
      if (vscodeWorkspace) {
        return null;
      }
      const { validateProjectPath } = get();
      const validation = validateProjectPath(path);
      if (!validation.ok || !validation.normalizedPath) {
        return null;
      }

      const normalizedPath = validation.normalizedPath;
      const existing = get().projects.find((project) => project.path === normalizedPath);
      if (existing) {
        get().setActiveProject(existing.id);
        return existing;
      }

      const now = Date.now();
      const label = options?.label?.trim() || deriveProjectLabel(normalizedPath);
      const candidateId = options?.id?.trim();
      const id = candidateId && !get().projects.some((project) => project.id === candidateId)
        ? candidateId
        : createProjectId();
      const entry: ProjectEntry = {
        id,
        path: normalizedPath,
        label,
        addedAt: now,
        lastOpenedAt: now,
      };

      const nextProjects = [...get().projects, entry];
      set({ projects: nextProjects });

      if (streamDebugEnabled()) {
        console.info('[ProjectsStore] Added project', entry);
      }

      get().setActiveProject(entry.id);
      return entry;
    },

    removeProject: (id: string) => {
      if (vscodeWorkspace) {
        return;
      }
      const current = get();
      const nextProjects = current.projects.filter((project) => project.id !== id);
      let nextActiveId = current.activeProjectId;

      if (current.activeProjectId === id) {
        nextActiveId = nextProjects[0]?.id ?? null;
      }

      set({ projects: nextProjects, activeProjectId: nextActiveId });
      persistProjects(nextProjects, nextActiveId);

      if (nextActiveId) {
        const nextActive = nextProjects.find((project) => project.id === nextActiveId);
        if (nextActive) {
          opencodeClient.setDirectory(nextActive.path);
          useDirectoryStore.getState().setDirectory(nextActive.path, { showOverlay: false });
        }
      } else {
        void useDirectoryStore.getState().goHome();
      }
    },

    setActiveProject: (id: string) => {
      if (vscodeWorkspace) {
        return;
      }
      const { projects, activeProjectId } = get();
      if (activeProjectId === id) {
        return;
      }
      const target = projects.find((project) => project.id === id);
      if (!target) {
        return;
      }

      const now = Date.now();
      const nextProjects = projects.map((project) =>
        project.id === id ? { ...project, lastOpenedAt: now } : project
      );

      set({ projects: nextProjects, activeProjectId: id });
      persistProjects(nextProjects, id);

      opencodeClient.setDirectory(target.path);
      useDirectoryStore.getState().setDirectory(target.path, { showOverlay: false });
    },

    setActiveProjectIdOnly: (id: string) => {
      if (vscodeWorkspace) {
        return;
      }
      const { projects, activeProjectId } = get();
      if (activeProjectId === id) {
        return;
      }
      const target = projects.find((project) => project.id === id);
      if (!target) {
        return;
      }

      const now = Date.now();
      const nextProjects = projects.map((project) =>
        project.id === id ? { ...project, lastOpenedAt: now } : project
      );

      set({ projects: nextProjects, activeProjectId: id });
      persistProjects(nextProjects, id);
    },

    renameProject: (id: string, label: string) => {
      if (vscodeWorkspace) {
        return;
      }
      const trimmed = label.trim();
      if (!trimmed) {
        return;
      }

      const { projects, activeProjectId } = get();
      const nextProjects = projects.map((project) =>
        project.id === id ? { ...project, label: trimmed } : project
      );
      set({ projects: nextProjects });
      persistProjects(nextProjects, activeProjectId);
    },

    reorderProjects: (fromIndex: number, toIndex: number) => {
      if (vscodeWorkspace) {
        return;
      }
      const { projects, activeProjectId } = get();
      if (
        fromIndex < 0 ||
        fromIndex >= projects.length ||
        toIndex < 0 ||
        toIndex >= projects.length ||
        fromIndex === toIndex
      ) {
        return;
      }

      const nextProjects = [...projects];
      const [moved] = nextProjects.splice(fromIndex, 1);
      nextProjects.splice(toIndex, 0, moved);

      set({ projects: nextProjects });
      persistProjects(nextProjects, activeProjectId);
    },

    synchronizeFromSettings: (settings: DesktopSettings) => {
      if (vscodeWorkspace) {
        return;
      }
      const incomingProjects = sanitizeProjects(settings.projects ?? []);
      const incomingActive = typeof settings.activeProjectId === 'string' && settings.activeProjectId.trim()
        ? settings.activeProjectId.trim()
        : null;

      const current = get();
      const projectsChanged = JSON.stringify(current.projects) !== JSON.stringify(incomingProjects);
      const activeChanged = current.activeProjectId !== incomingActive;

      if (!projectsChanged && !activeChanged) {
        return;
      }

      set({ projects: incomingProjects, activeProjectId: incomingActive });
      cacheProjects(incomingProjects, incomingActive);

      if (incomingActive) {
        const activeProject = incomingProjects.find((project) => project.id === incomingActive);
        if (activeProject) {
          opencodeClient.setDirectory(activeProject.path);
          useDirectoryStore.getState().setDirectory(activeProject.path, { showOverlay: false });
        }
      }
    },

    getActiveProject: () => {
      const { projects, activeProjectId } = get();
      if (!activeProjectId) {
        return null;
      }
      return projects.find((project) => project.id === activeProjectId) ?? null;
    },
  }), { name: 'projects-store' })
);

if (typeof window !== 'undefined') {
  window.addEventListener('openchamber:settings-synced', (event: Event) => {
    const detail = (event as CustomEvent<DesktopSettings>).detail;
    if (detail && typeof detail === 'object') {
      useProjectsStore.getState().synchronizeFromSettings(detail);
    }
  });
}
