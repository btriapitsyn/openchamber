import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { DesktopSettings } from '@/lib/desktop';
import { updateDesktopSettings } from '@/lib/persistence';
import { getSafeStorage } from './utils/safeStorage';
import { streamDebugEnabled } from '@/stores/utils/streamDebug';

export type ProjectTodoItem = {
  id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'done';
  priority: 'high' | 'medium' | 'low';
  createdAt: number;
  updatedAt: number;
};

export type ArchivedProjectTodoItem = ProjectTodoItem & {
  archivedAt: number;
};

interface ProjectTodosStore {
  todosByProject: Record<string, ProjectTodoItem[]>;
  archivedTodosByProject: Record<string, ArchivedProjectTodoItem[]>;

  addTodo: (projectId: string, content: string, priority?: 'high' | 'medium' | 'low') => void;
  updateTodo: (projectId: string, todoId: string, updates: Partial<Omit<ProjectTodoItem, 'id' | 'createdAt'>>) => void;
  deleteTodo: (projectId: string, todoId: string) => void;
  reorderTodos: (projectId: string, fromIndex: number, toIndex: number) => void;
  synchronizeFromSettings: (settings: DesktopSettings) => void;
  archiveStale: () => void;
}

const safeStorage = getSafeStorage();
const PROJECT_TODOS_STORAGE_KEY = 'projectTodos';
const ARCHIVED_TODOS_STORAGE_KEY = 'archivedProjectTodos';
const ARCHIVE_AFTER_MS = 24 * 60 * 60 * 1000; // 1 day

const createTodoId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `todo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
};

const sanitizeProjectTodos = (value: unknown): Record<string, ProjectTodoItem[]> => {
  if (!value || typeof value !== 'object') {
    return {};
  }

  const result: Record<string, ProjectTodoItem[]> = {};
  const candidate = value as Record<string, unknown>;

  for (const [projectId, todos] of Object.entries(candidate)) {
    if (!Array.isArray(todos)) continue;

    const sanitizedTodos: ProjectTodoItem[] = [];

    for (const todo of todos) {
      if (!todo || typeof todo !== 'object') continue;
      const candidateTodo = todo as Record<string, unknown>;

      const id = typeof candidateTodo.id === 'string' ? candidateTodo.id.trim() : '';
      const content = typeof candidateTodo.content === 'string' ? candidateTodo.content.trim() : '';
      const status = candidateTodo.status === 'pending' || candidateTodo.status === 'in_progress' || candidateTodo.status === 'done' 
        ? candidateTodo.status 
        : 'pending';
      const priority = candidateTodo.priority === 'high' || candidateTodo.priority === 'medium' || candidateTodo.priority === 'low' 
        ? candidateTodo.priority 
        : 'medium';
      const createdAt = typeof candidateTodo.createdAt === 'number' && Number.isFinite(candidateTodo.createdAt) && candidateTodo.createdAt >= 0
        ? candidateTodo.createdAt
        : Date.now();
      const updatedAt = typeof candidateTodo.updatedAt === 'number' && Number.isFinite(candidateTodo.updatedAt) && candidateTodo.updatedAt >= 0
        ? candidateTodo.updatedAt
        : Date.now();

      if (!id || !content) continue;

      sanitizedTodos.push({
        id,
        content,
        status,
        priority,
        createdAt,
        updatedAt,
      });
    }

    if (sanitizedTodos.length > 0) {
      result[projectId] = sanitizedTodos;
    }
  }

  return result;
};

const readPersistedProjectTodos = (): Record<string, ProjectTodoItem[]> => {
  try {
    const raw = safeStorage.getItem(PROJECT_TODOS_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    return sanitizeProjectTodos(JSON.parse(raw));
  } catch {
    return {};
  }
};

const readPersistedArchivedTodos = (): Record<string, ArchivedProjectTodoItem[]> => {
  try {
    const raw = safeStorage.getItem(ARCHIVED_TODOS_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const candidate = JSON.parse(raw);
    if (!candidate || typeof candidate !== 'object') return {};

    const result: Record<string, ArchivedProjectTodoItem[]> = {};
    for (const [projectId, todos] of Object.entries(candidate as Record<string, unknown>)) {
      if (!Array.isArray(todos)) continue;
      const sanitized: ArchivedProjectTodoItem[] = [];
      for (const todo of todos) {
        if (!todo || typeof todo !== 'object') continue;
        const t = todo as Record<string, unknown>;
        const id = typeof t.id === 'string' ? t.id.trim() : '';
        const content = typeof t.content === 'string' ? t.content.trim() : '';
        if (!id || !content) continue;
        sanitized.push({
          id,
          content,
          status: t.status === 'pending' || t.status === 'in_progress' || t.status === 'done' ? t.status : 'done',
          priority: t.priority === 'high' || t.priority === 'medium' || t.priority === 'low' ? t.priority : 'medium',
          createdAt: typeof t.createdAt === 'number' && Number.isFinite(t.createdAt) ? t.createdAt : Date.now(),
          updatedAt: typeof t.updatedAt === 'number' && Number.isFinite(t.updatedAt) ? t.updatedAt : Date.now(),
          archivedAt: typeof t.archivedAt === 'number' && Number.isFinite(t.archivedAt) ? t.archivedAt : Date.now(),
        });
      }
      if (sanitized.length > 0) {
        result[projectId] = sanitized;
      }
    }
    return result;
  } catch {
    return {};
  }
};

const cacheProjectTodos = (todosByProject: Record<string, ProjectTodoItem[]>) => {
  try {
    safeStorage.setItem(PROJECT_TODOS_STORAGE_KEY, JSON.stringify(todosByProject));
  } catch {
    // ignored
  }
};

const cacheArchivedTodos = (archivedTodosByProject: Record<string, ArchivedProjectTodoItem[]>) => {
  try {
    safeStorage.setItem(ARCHIVED_TODOS_STORAGE_KEY, JSON.stringify(archivedTodosByProject));
  } catch {
    // ignored
  }
};

const persistProjectTodos = (todosByProject: Record<string, ProjectTodoItem[]>) => {
  cacheProjectTodos(todosByProject);
  void updateDesktopSettings({ projectTodos: todosByProject });
};

const initialProjectTodos = readPersistedProjectTodos();
const initialArchivedTodos = readPersistedArchivedTodos();

export const useProjectTodosStore = create<ProjectTodosStore>()(
  devtools((set, get) => ({
    todosByProject: initialProjectTodos,
    archivedTodosByProject: initialArchivedTodos,

    addTodo: (projectId: string, content: string, priority: 'high' | 'medium' | 'low' = 'medium') => {
      const trimmedContent = content.trim();
      if (!trimmedContent || !projectId) {
        return;
      }

      const now = Date.now();
      const newTodo: ProjectTodoItem = {
        id: createTodoId(),
        content: trimmedContent,
        status: 'pending',
        priority,
        createdAt: now,
        updatedAt: now,
      };

      const { todosByProject } = get();
      const projectTodos = todosByProject[projectId] || [];
      const nextTodosByProject = {
        ...todosByProject,
        [projectId]: [...projectTodos, newTodo],
      };

      set({ todosByProject: nextTodosByProject });
      persistProjectTodos(nextTodosByProject);

      if (streamDebugEnabled()) {
        console.info('[ProjectTodosStore] Added todo', projectId, newTodo);
      }
    },

    updateTodo: (projectId: string, todoId: string, updates: Partial<Omit<ProjectTodoItem, 'id' | 'createdAt'>>) => {
      const { todosByProject } = get();
      const projectTodos = todosByProject[projectId];
      if (!projectTodos) {
        return;
      }

      const todoIndex = projectTodos.findIndex((todo) => todo.id === todoId);
      if (todoIndex === -1) {
        return;
      }

      const now = Date.now();
      const nextProjectTodos = projectTodos.map((todo) =>
        todo.id === todoId
          ? {
              ...todo,
              ...updates,
              updatedAt: now,
            }
          : todo
      );

      const nextTodosByProject = {
        ...todosByProject,
        [projectId]: nextProjectTodos,
      };

      set({ todosByProject: nextTodosByProject });
      persistProjectTodos(nextTodosByProject);

      if (streamDebugEnabled()) {
        console.info('[ProjectTodosStore] Updated todo', projectId, todoId, updates);
      }
    },

    deleteTodo: (projectId: string, todoId: string) => {
      const { todosByProject } = get();
      const projectTodos = todosByProject[projectId];
      if (!projectTodos) {
        return;
      }

      const nextProjectTodos = projectTodos.filter((todo) => todo.id !== todoId);
      
      const nextTodosByProject = { ...todosByProject };
      if (nextProjectTodos.length === 0) {
        delete nextTodosByProject[projectId];
      } else {
        nextTodosByProject[projectId] = nextProjectTodos;
      }

      set({ todosByProject: nextTodosByProject });
      persistProjectTodos(nextTodosByProject);

      if (streamDebugEnabled()) {
        console.info('[ProjectTodosStore] Deleted todo', projectId, todoId);
      }
    },

    reorderTodos: (projectId: string, fromIndex: number, toIndex: number) => {
      const { todosByProject } = get();
      const projectTodos = todosByProject[projectId];
      if (!projectTodos) {
        return;
      }

      if (
        fromIndex < 0 ||
        fromIndex >= projectTodos.length ||
        toIndex < 0 ||
        toIndex >= projectTodos.length ||
        fromIndex === toIndex
      ) {
        return;
      }

      const nextProjectTodos = [...projectTodos];
      const [moved] = nextProjectTodos.splice(fromIndex, 1);
      nextProjectTodos.splice(toIndex, 0, moved);

      const nextTodosByProject = {
        ...todosByProject,
        [projectId]: nextProjectTodos,
      };

      set({ todosByProject: nextTodosByProject });
      persistProjectTodos(nextTodosByProject);

      if (streamDebugEnabled()) {
        console.info('[ProjectTodosStore] Reordered todos', projectId, fromIndex, '->', toIndex);
      }
    },

    synchronizeFromSettings: (settings: DesktopSettings) => {
      const incomingTodos = sanitizeProjectTodos(settings.projectTodos ?? {});

      const current = get();
      const todosChanged = JSON.stringify(current.todosByProject) !== JSON.stringify(incomingTodos);

      if (!todosChanged) {
        return;
      }

      set({ todosByProject: incomingTodos });
      cacheProjectTodos(incomingTodos);

      if (streamDebugEnabled()) {
        console.info('[ProjectTodosStore] Synchronized from settings', {
          projects: Object.keys(incomingTodos).length,
        });
      }
    },

    archiveStale: () => {
      const now = Date.now();
      const { todosByProject, archivedTodosByProject } = get();
      const nextTodosByProject: Record<string, ProjectTodoItem[]> = {};
      const nextArchivedByProject: Record<string, ArchivedProjectTodoItem[]> = { ...archivedTodosByProject };
      let changed = false;

      for (const [projectId, todos] of Object.entries(todosByProject)) {
        const keep: ProjectTodoItem[] = [];
        const toArchive: ArchivedProjectTodoItem[] = [];

        for (const todo of todos) {
          if (todo.status === 'done' && now - todo.updatedAt >= ARCHIVE_AFTER_MS) {
            toArchive.push({ ...todo, archivedAt: now });
          } else {
            keep.push(todo);
          }
        }

        if (toArchive.length > 0) {
          changed = true;
          nextArchivedByProject[projectId] = [
            ...(nextArchivedByProject[projectId] ?? []),
            ...toArchive,
          ];
        }

        if (keep.length > 0) {
          nextTodosByProject[projectId] = keep;
        }
      }

      if (!changed) return;

      set({ todosByProject: nextTodosByProject, archivedTodosByProject: nextArchivedByProject });
      persistProjectTodos(nextTodosByProject);
      cacheArchivedTodos(nextArchivedByProject);

      if (streamDebugEnabled()) {
        console.info('[ProjectTodosStore] Archived stale todos');
      }
    },
  }), { name: 'project-todos-store' })
);

if (typeof window !== 'undefined') {
  // Archive stale completed todos on startup
  useProjectTodosStore.getState().archiveStale();

  // Check periodically (every hour)
  setInterval(() => {
    useProjectTodosStore.getState().archiveStale();
  }, 60 * 60 * 1000);

  window.addEventListener('openchamber:settings-synced', (event: Event) => {
    const detail = (event as CustomEvent<DesktopSettings>).detail;
    if (detail && typeof detail === 'object') {
      useProjectTodosStore.getState().synchronizeFromSettings(detail);
    }
  });
}
