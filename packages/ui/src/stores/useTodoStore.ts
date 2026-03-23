import { create } from "zustand";
import { devtools } from "zustand/middleware";

import { opencodeClient } from "@/lib/opencode/client";
import { useSessionStore } from "./useSessionStore";

export type TodoStatus = "pending" | "in_progress" | "completed" | "cancelled";
export type TodoPriority = "high" | "medium" | "low";

export interface TodoItem {
  id: string;
  content: string;
  status: TodoStatus;
  priority: TodoPriority;
}

interface TodoStore {
  // Map of sessionId -> todos
  sessionTodos: Map<string, TodoItem[]>;
  isLoading: boolean;

  // Actions
  loadTodos: (sessionId: string) => Promise<void>;
  updateTodos: (sessionId: string, todos: TodoItem[]) => void;
  getTodosForSession: (sessionId: string) => TodoItem[];
  clearTodos: (sessionId: string) => void;
}

type RawTodo = { id: string; content: string; status: string; priority: string };

const normalizeTodo = (todo: RawTodo): TodoItem => ({
  id: todo.id,
  content: todo.content,
  status: (todo.status as TodoStatus) || "pending",
  priority: (todo.priority as TodoPriority) || "medium",
});

export const useTodoStore = create<TodoStore>()(
  devtools(
    (set, get) => ({
      sessionTodos: new Map(),
      isLoading: false,

      loadTodos: async (sessionId: string) => {
        if (!sessionId) return;

        set({ isLoading: true });

        try {
          const directory = useSessionStore.getState().getDirectoryForSession(sessionId);
          const rawTodos = directory
            ? await opencodeClient.withDirectory(directory, () => opencodeClient.getSessionTodos(sessionId))
            : await opencodeClient.getSessionTodos(sessionId);
          const todos = rawTodos.map(normalizeTodo);

          set((state) => {
            const newMap = new Map(state.sessionTodos);
            newMap.set(sessionId, todos);
            return { sessionTodos: newMap, isLoading: false };
          });
        } catch (error) {
          console.warn("[TodoStore] Failed to load todos:", error);
          set({ isLoading: false });
        }
      },

      updateTodos: (sessionId: string, todos: TodoItem[]) => {
        set((state) => {
          const newMap = new Map(state.sessionTodos);
          newMap.set(sessionId, todos);
          return { sessionTodos: newMap };
        });
      },

      getTodosForSession: (sessionId: string) => {
        return get().sessionTodos.get(sessionId) || [];
      },

      clearTodos: (sessionId: string) => {
        set((state) => {
          const newMap = new Map(state.sessionTodos);
          newMap.delete(sessionId);
          return { sessionTodos: newMap };
        });
      },
    }),
    { name: "todo-store" }
  )
);

// Helper to handle SSE todo.updated events
export const handleTodoUpdatedEvent = (
  sessionId: string,
  todos: RawTodo[]
): void => {
  const normalizedTodos = todos.map(normalizeTodo);
  useTodoStore.getState().updateTodos(sessionId, normalizedTodos);
};
