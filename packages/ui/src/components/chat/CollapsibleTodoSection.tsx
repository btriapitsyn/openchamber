import React from "react";
import { RiArrowUpSLine, RiArrowDownSLine } from "@remixicon/react";
import { cn } from "@/lib/utils";
import { useTodoStore, type TodoItem, type TodoStatus } from "@/stores/useTodoStore";
import { useSessionStore } from "@/stores/useSessionStore";
import { renderTodoOutput } from "./message/toolRenderers";

const EMPTY_TODOS: TodoItem[] = [];

interface CollapsibleTodoSectionProps {
  className?: string;
}

export const CollapsibleTodoSection: React.FC<CollapsibleTodoSectionProps> = ({ className }) => {
  const [isExpanded, setIsExpanded] = React.useState(false);
  const currentSessionId = useSessionStore((state) => state.currentSessionId);
  const todos = useTodoStore((state) =>
    currentSessionId ? state.sessionTodos.get(currentSessionId) ?? EMPTY_TODOS : EMPTY_TODOS
  );
  const loadTodos = useTodoStore((state) => state.loadTodos);

  React.useEffect(() => {
    if (currentSessionId) {
      void loadTodos(currentSessionId);
    }
  }, [currentSessionId, loadTodos]);

  const visibleTodos = React.useMemo(() => {
    const statusOrder: Record<TodoStatus, number> = {
      in_progress: 0,
      pending: 1,
      completed: 2,
      cancelled: 3,
    };

    return [...todos]
      .filter((todo) => todo.status !== "cancelled")
      .sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);
  }, [todos]);

  const activeTodo = React.useMemo(() => {
    return (
      visibleTodos.find((t) => t.status === "in_progress") ||
      visibleTodos.find((t) => t.status === "pending") ||
      null
    );
  }, [visibleTodos]);

  const progress = React.useMemo(() => {
    const total = todos.filter((t) => t.status !== "cancelled").length;
    const completed = todos.filter((t) => t.status === "completed").length;
    return { completed, total };
  }, [todos]);

  const hasActiveTodos = visibleTodos.some((t) => t.status === "in_progress" || t.status === "pending");

  if (!hasActiveTodos) {
    return null;
  }

  const toggleExpanded = () => setIsExpanded((prev) => !prev);

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'var(--status-error)';
      case 'medium':
        return 'var(--status-warning)';
      case 'low':
        return 'var(--muted-foreground)';
      default:
        return 'var(--muted-foreground)';
    }
  };

  return (
    <div className={cn("w-full bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-t border-border", className)}>
      <div className="chat-column py-2">
        {!isExpanded && activeTodo && (
          <button
            type="button"
            onClick={toggleExpanded}
            className="flex items-center justify-between w-full group hover:bg-accent/50 rounded-lg px-3 py-2 transition-colors"
          >
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div
                className="h-2 w-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: getPriorityColor(activeTodo.priority) }}
              />
              <span className="typography-ui-label text-foreground truncate">
                {activeTodo.content}
              </span>
              <span className="typography-meta text-muted-foreground flex-shrink-0">
                {progress.completed}/{progress.total}
              </span>
            </div>
            <RiArrowDownSLine className="h-4 w-4 text-muted-foreground flex-shrink-0 ml-2" />
          </button>
        )}

        {isExpanded && (
          <div className="flex flex-col">
            <button
              type="button"
              onClick={toggleExpanded}
              className="flex items-center justify-between w-full group hover:bg-accent/50 rounded-lg px-3 py-2 transition-colors mb-2"
            >
              <span className="typography-ui-label text-foreground">
                Tasks ({progress.completed}/{progress.total})
              </span>
              <RiArrowUpSLine className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            </button>
            
            <div className="rounded-xl border border-border bg-background">
              {renderTodoOutput(JSON.stringify(visibleTodos), { unstyled: false })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
