import React from 'react';
import { useProjectsStore } from '@/stores/useProjectsStore';
import { useProjectTodosStore, type ProjectTodoItem } from '@/stores/useProjectTodosStore';
import { cn } from '@/lib/utils';
import {
  RiAddLine,
  RiArrowDownSLine,
  RiArrowRightSLine,
  RiCheckboxCircleLine,
  RiCloseLine,
} from '@remixicon/react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type Priority = 'high' | 'medium' | 'low';

const PRIORITY_COLOR: Record<Priority, string> = {
  high: 'var(--color-status-error)',
  medium: 'var(--color-status-warning)',
  low: 'var(--color-muted-foreground)',
};

const SIDEBAR_TODOS_COLLAPSED_KEY = 'oc.sidebar.todosCollapsed';

const CompactTodoRow: React.FC<{
  todo: ProjectTodoItem;
  projectId: string;
}> = React.memo(({ todo, projectId }) => {
  const updateTodo = useProjectTodosStore((s) => s.updateTodo);
  const deleteTodo = useProjectTodosStore((s) => s.deleteTodo);
  const isDone = todo.status === 'done';

  const handleToggle = React.useCallback(() => {
    updateTodo(projectId, todo.id, { status: isDone ? 'pending' : 'done' });
  }, [projectId, todo.id, isDone, updateTodo]);

  const handleDelete = React.useCallback(() => {
    deleteTodo(projectId, todo.id);
  }, [projectId, todo.id, deleteTodo]);

  return (
    <div className="group/todo flex items-center gap-1.5 px-1 py-0.5 rounded-sm hover:bg-[var(--color-interactive-hover)] min-w-0">
      <input
        type="checkbox"
        checked={isDone}
        onChange={handleToggle}
        className="h-3.5 w-3.5 flex-shrink-0 rounded cursor-pointer accent-[var(--color-accent)]"
        aria-label={`Mark "${todo.content}" as ${isDone ? 'pending' : 'done'}`}
      />
      <span
        className="h-1.5 w-1.5 rounded-full flex-shrink-0"
        style={{ backgroundColor: PRIORITY_COLOR[todo.priority] }}
        title={`${todo.priority} priority`}
        aria-hidden="true"
      />
      <span
        className={cn(
          'typography-micro text-foreground truncate flex-1 min-w-0',
          isDone && 'line-through text-muted-foreground',
        )}
        title={todo.content}
      >
        {todo.content}
      </span>
      <button
        type="button"
        onClick={handleDelete}
        className="h-4 w-4 flex-shrink-0 items-center justify-center text-muted-foreground hover:text-destructive opacity-0 group-hover/todo:opacity-100 transition-opacity hidden group-hover/todo:inline-flex"
        aria-label={`Delete "${todo.content}"`}
      >
        <RiCloseLine className="h-3 w-3" />
      </button>
    </div>
  );
});
CompactTodoRow.displayName = 'CompactTodoRow';

export const SidebarTodos: React.FC = () => {
  const activeProjectId = useProjectsStore((s) => s.activeProjectId);
  const todosByProject = useProjectTodosStore((s) => s.todosByProject);
  const addTodo = useProjectTodosStore((s) => s.addTodo);

  const [collapsed, setCollapsed] = React.useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_TODOS_COLLAPSED_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [isAdding, setIsAdding] = React.useState(false);
  const [newContent, setNewContent] = React.useState('');
  const [newPriority, setNewPriority] = React.useState<Priority>('medium');
  const inputRef = React.useRef<HTMLInputElement>(null);

  const todos = React.useMemo(() => {
    if (!activeProjectId) return [];
    const raw = todosByProject[activeProjectId] ?? [];
    // Sort completed todos to the bottom, preserving relative order within each group
    return [...raw].sort((a, b) => {
      const aDone = a.status === 'done' ? 1 : 0;
      const bDone = b.status === 'done' ? 1 : 0;
      return aDone - bDone;
    });
  }, [activeProjectId, todosByProject]);

  const { pendingCount, doneCount } = React.useMemo(() => {
    let pending = 0;
    let done = 0;
    for (const todo of todos) {
      if (todo.status === 'done') done++;
      else pending++;
    }
    return { pendingCount: pending, doneCount: done };
  }, [todos]);

  const toggleCollapsed = React.useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_TODOS_COLLAPSED_KEY, String(next));
      } catch { /* ignored */ }
      return next;
    });
  }, []);

  const handleAdd = React.useCallback(() => {
    const trimmed = newContent.trim();
    if (!trimmed || !activeProjectId) return;
    addTodo(activeProjectId, trimmed, newPriority);
    setNewContent('');
    setNewPriority('medium');
    setIsAdding(false);
  }, [newContent, newPriority, activeProjectId, addTodo]);

  const handleKeyDown = React.useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsAdding(false);
      setNewContent('');
    }
  }, [handleAdd]);

  React.useEffect(() => {
    if (isAdding) {
      inputRef.current?.focus();
    }
  }, [isAdding]);

  if (!activeProjectId) return null;

  return (
    <div className="border-t border-border/60 px-2.5 py-1.5 flex-shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between gap-1">
        <button
          type="button"
          onClick={toggleCollapsed}
          className="flex items-center gap-1 text-muted-foreground hover:text-foreground min-w-0"
        >
          {collapsed ? (
            <RiArrowRightSLine className="h-3.5 w-3.5 flex-shrink-0" />
          ) : (
            <RiArrowDownSLine className="h-3.5 w-3.5 flex-shrink-0" />
          )}
          <span className="typography-micro font-semibold">Todos</span>
          {todos.length > 0 && (
            <span className="typography-micro text-muted-foreground/70">
              {pendingCount > 0 ? `${pendingCount} open` : ''}
              {doneCount > 0 && pendingCount > 0 ? ', ' : ''}
              {doneCount > 0 ? `${doneCount} done` : ''}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => {
            if (collapsed) {
              setCollapsed(false);
              try {
                localStorage.setItem(SIDEBAR_TODOS_COLLAPSED_KEY, 'false');
              } catch { /* ignored */ }
            }
            setIsAdding(true);
          }}
          className="h-5 w-5 inline-flex items-center justify-center rounded text-muted-foreground hover:text-foreground"
          aria-label="Add todo"
        >
          <RiAddLine className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Body */}
      {!collapsed && (
        <div className="mt-1 space-y-0.5">
          {todos.length === 0 && !isAdding && (
            <p className="typography-micro text-muted-foreground/70 px-1 py-1">
              No todos yet.
            </p>
          )}

          {todos.map((todo) => (
            <CompactTodoRow key={todo.id} todo={todo} projectId={activeProjectId} />
          ))}

          {/* Inline add */}
          {isAdding && (
            <div className="flex items-center gap-1 px-1 py-0.5">
              <input
                ref={inputRef}
                type="text"
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="New todo..."
                className="flex-1 min-w-0 bg-transparent typography-micro text-foreground placeholder:text-muted-foreground outline-none"
                data-keyboard-avoid="true"
              />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="h-4 w-4 flex-shrink-0 rounded-full"
                    style={{ backgroundColor: PRIORITY_COLOR[newPriority] }}
                    aria-label={`Priority: ${newPriority}`}
                    title={`Priority: ${newPriority}`}
                  />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[100px]">
                  <DropdownMenuItem onClick={() => setNewPriority('high')}>
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: PRIORITY_COLOR.high }} />
                      High
                    </span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setNewPriority('medium')}>
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: PRIORITY_COLOR.medium }} />
                      Medium
                    </span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setNewPriority('low')}>
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: PRIORITY_COLOR.low }} />
                      Low
                    </span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <button
                type="button"
                onClick={handleAdd}
                disabled={!newContent.trim()}
                className="h-4 w-4 flex-shrink-0 inline-flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-40"
                aria-label="Add"
              >
                <RiCheckboxCircleLine className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => { setIsAdding(false); setNewContent(''); }}
                className="h-4 w-4 flex-shrink-0 inline-flex items-center justify-center text-muted-foreground hover:text-foreground"
                aria-label="Cancel"
              >
                <RiCloseLine className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
