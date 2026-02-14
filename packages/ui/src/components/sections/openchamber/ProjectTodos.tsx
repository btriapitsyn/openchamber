import React from 'react';
import { useProjectsStore } from '@/stores/useProjectsStore';
import { useProjectTodosStore } from '@/stores/useProjectTodosStore';
import { cn } from '@/lib/utils';
import { RiAddLine, RiArrowDownSLine, RiDraggable } from '@remixicon/react';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type Priority = 'high' | 'medium' | 'low';

const getPriorityColor = (priority: Priority): string => {
  switch (priority) {
    case 'high':
      return 'var(--color-status-error)';
    case 'medium':
      return 'var(--color-status-warning)';
    case 'low':
      return 'var(--color-muted-foreground)';
  }
};

const getPriorityLabel = (priority: Priority): string => {
  switch (priority) {
    case 'high':
      return 'High';
    case 'medium':
      return 'Medium';
    case 'low':
      return 'Low';
  }
};

interface TodoItemProps {
  todoId: string;
  projectId: string;
  content: string;
  status: 'pending' | 'in_progress' | 'done';
  priority: Priority;
  onContextMenu: (e: React.MouseEvent) => void;
  onToggleStatus: () => void;
  onStartEdit: () => void;
  dragAttributes?: React.HTMLAttributes<HTMLDivElement>;
  dragListeners?: Record<string, unknown>;
}

const TodoItem = React.memo<TodoItemProps>(({
  content,
  status,
  priority,
  onContextMenu,
  onToggleStatus,
  onStartEdit,
  dragAttributes,
  dragListeners,
}) => {
  const isDone = status === 'done';
  const priorityColor = getPriorityColor(priority);

  return (
    <div
      className={cn(
        'group flex items-start gap-2 rounded-md px-3 py-2 transition-colors',
        'hover:bg-[var(--color-interactive-hover)]'
      )}
    >
      {/* Drag Handle */}
      <div
        className="flex-shrink-0 pt-0.5 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity"
        {...dragAttributes}
        {...dragListeners}
        aria-label="Drag to reorder"
      >
        <RiDraggable className="w-4 h-4 text-muted-foreground" />
      </div>

      {/* Checkbox */}
      <div className="flex-shrink-0 pt-0.5">
        <input
          type="checkbox"
          checked={isDone}
          onChange={onToggleStatus}
          onClick={(e) => e.stopPropagation()}
          className="w-4 h-4 rounded cursor-pointer accent-[var(--color-accent)]"
          aria-label={`Mark "${content}" as ${isDone ? 'pending' : 'done'}`}
        />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 cursor-pointer" onClick={onStartEdit} onContextMenu={onContextMenu}>
        <div className="flex items-start gap-2">
          <span
            className={cn(
              'typography-ui text-foreground flex-1',
              isDone && 'line-through text-muted-foreground'
            )}
          >
            {content}
          </span>
          {/* Priority badge */}
          <span
            className="typography-micro font-semibold px-1.5 py-0.5 rounded"
            style={{
              color: priorityColor,
              backgroundColor: `color-mix(in srgb, ${priorityColor} 15%, transparent)`,
              borderWidth: '1px',
              borderStyle: 'solid',
              borderColor: `color-mix(in srgb, ${priorityColor} 30%, transparent)`,
            }}
          >
            {getPriorityLabel(priority)}
          </span>
        </div>
      </div>
    </div>
  );
});
TodoItem.displayName = 'TodoItem';

type SortableTodoItemProps = Omit<TodoItemProps, 'dragAttributes' | 'dragListeners'>;

const SortableTodoItem = React.memo<SortableTodoItemProps>((props) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: props.todoId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} className={cn(isDragging && 'opacity-40')}>
      <TodoItem {...props} dragAttributes={attributes} dragListeners={listeners} />
    </div>
  );
});
SortableTodoItem.displayName = 'SortableTodoItem';

export const ProjectTodos: React.FC = () => {
  const activeProjectId = useProjectsStore((state) => state.activeProjectId);
  const todosByProject = useProjectTodosStore((state) => state.todosByProject);
  const addTodo = useProjectTodosStore((state) => state.addTodo);
  const updateTodo = useProjectTodosStore((state) => state.updateTodo);
  const deleteTodo = useProjectTodosStore((state) => state.deleteTodo);
  const reorderTodos = useProjectTodosStore((state) => state.reorderTodos);

  const [newTodoContent, setNewTodoContent] = React.useState('');
  const [newTodoPriority, setNewTodoPriority] = React.useState<Priority>('medium');
  const [showPriorityDropdown, setShowPriorityDropdown] = React.useState(false);
  
  const [editingTodoId, setEditingTodoId] = React.useState<string | null>(null);
  const [editValue, setEditValue] = React.useState('');
  const editInputRef = React.useRef<HTMLInputElement>(null);

  const [contextMenuTodoId, setContextMenuTodoId] = React.useState<string | null>(null);

  const [activeDraggedTodoId, setActiveDraggedTodoId] = React.useState<string | null>(null);

  const todos = React.useMemo(() => {
    if (!activeProjectId) return [];
    const raw = todosByProject[activeProjectId] || [];
    // Sort completed todos to the bottom, preserving relative order within each group
    return [...raw].sort((a, b) => {
      const aDone = a.status === 'done' ? 1 : 0;
      const bDone = b.status === 'done' ? 1 : 0;
      return aDone - bDone;
    });
  }, [activeProjectId, todosByProject]);

  const handleAddTodo = React.useCallback(() => {
    const trimmed = newTodoContent.trim();
    if (!trimmed || !activeProjectId) return;

    addTodo(activeProjectId, trimmed, newTodoPriority);
    setNewTodoContent('');
    setNewTodoPriority('medium');
  }, [newTodoContent, newTodoPriority, activeProjectId, addTodo]);

  const handleNewTodoKeyDown = React.useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTodo();
    }
  }, [handleAddTodo]);

  const handleToggleStatus = React.useCallback((todoId: string, currentStatus: 'pending' | 'in_progress' | 'done') => {
    if (!activeProjectId) return;
    const nextStatus = currentStatus === 'done' ? 'pending' : 'done';
    updateTodo(activeProjectId, todoId, { status: nextStatus });
  }, [activeProjectId, updateTodo]);

  const handleStartEdit = React.useCallback((todoId: string, currentContent: string) => {
    setEditingTodoId(todoId);
    setEditValue(currentContent);
  }, []);

  const handleSaveEdit = React.useCallback(() => {
    if (!editingTodoId || !activeProjectId) return;
    
    const trimmed = editValue.trim();
    if (trimmed) {
      updateTodo(activeProjectId, editingTodoId, { content: trimmed });
    }
    setEditingTodoId(null);
    setEditValue('');
  }, [editingTodoId, editValue, activeProjectId, updateTodo]);

  const handleCancelEdit = React.useCallback(() => {
    setEditingTodoId(null);
    setEditValue('');
  }, []);

  const handleEditKeyDown = React.useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSaveEdit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancelEdit();
    }
  }, [handleSaveEdit, handleCancelEdit]);

  const handleContextMenu = React.useCallback((todoId: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenuTodoId(todoId);
  }, []);

  const handleSetPriority = React.useCallback((priority: Priority) => {
    if (!contextMenuTodoId || !activeProjectId) return;
    updateTodo(activeProjectId, contextMenuTodoId, { priority });
    setContextMenuTodoId(null);
  }, [contextMenuTodoId, activeProjectId, updateTodo]);

  const handleDelete = React.useCallback(() => {
    if (!contextMenuTodoId || !activeProjectId) return;
    deleteTodo(activeProjectId, contextMenuTodoId);
    setContextMenuTodoId(null);
  }, [contextMenuTodoId, activeProjectId, deleteTodo]);

  React.useEffect(() => {
    if (editingTodoId) {
      editInputRef.current?.focus();
      editInputRef.current?.select();
    }
  }, [editingTodoId]);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragStart = React.useCallback((event: DragStartEvent) => {
    setActiveDraggedTodoId(String(event.active.id));
  }, []);

  const handleDragCancel = React.useCallback(() => {
    setActiveDraggedTodoId(null);
  }, []);

  const handleDragEnd = React.useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveDraggedTodoId(null);

      if (!over || active.id === over.id || !activeProjectId) {
        return;
      }

      // Map from sorted display indices back to store array indices
      const storeTodos = todosByProject[activeProjectId] || [];
      const oldIndex = storeTodos.findIndex((todo) => todo.id === active.id);
      const newIndex = storeTodos.findIndex((todo) => todo.id === over.id);

      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) {
        return;
      }

      reorderTodos(activeProjectId, oldIndex, newIndex);
    },
    [todosByProject, activeProjectId, reorderTodos]
  );

  const draggedTodo = React.useMemo(() => {
    if (!activeDraggedTodoId) return null;
    return todos.find((t) => t.id === activeDraggedTodoId);
  }, [activeDraggedTodoId, todos]);

  if (!activeProjectId) {
    return (
      <div className="space-y-6">
        <div className="space-y-1 pt-2">
          <h3 className="typography-ui-header font-semibold text-foreground">
            Project Todos
          </h3>
          <p className="typography-meta text-muted-foreground">
            No active project selected.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1 pt-2">
        <h3 className="typography-ui-header font-semibold text-foreground">
          Project Todos
        </h3>
        <p className="typography-meta text-muted-foreground">
          Track tasks for your current project.
        </p>
      </div>

      {/* Add Todo Input */}
      <div className="space-y-2">
        <div className="flex gap-2">
          <input
            type="text"
            value={newTodoContent}
            onChange={(e) => setNewTodoContent(e.target.value)}
            onKeyDown={handleNewTodoKeyDown}
            placeholder="Add a new todo..."
            className="flex-1 rounded-md border border-border bg-background px-3 py-2 typography-ui text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent"
          />
          <DropdownMenu open={showPriorityDropdown} onOpenChange={setShowPriorityDropdown}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-1 rounded-md border border-border bg-background px-3 py-2 typography-ui text-foreground hover:bg-[var(--color-interactive-hover)] focus:outline-none focus:ring-2 focus:ring-accent"
                aria-label="Select priority"
              >
                <span style={{ color: getPriorityColor(newTodoPriority) }}>
                  {getPriorityLabel(newTodoPriority)}
                </span>
                <RiArrowDownSLine className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => { setNewTodoPriority('high'); setShowPriorityDropdown(false); }}>
                <span style={{ color: getPriorityColor('high') }}>High</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { setNewTodoPriority('medium'); setShowPriorityDropdown(false); }}>
                <span style={{ color: getPriorityColor('medium') }}>Medium</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { setNewTodoPriority('low'); setShowPriorityDropdown(false); }}>
                <span style={{ color: getPriorityColor('low') }}>Low</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <button
            type="button"
            onClick={handleAddTodo}
            disabled={!newTodoContent.trim()}
            className="flex items-center gap-1 rounded-md bg-[var(--color-accent)] px-3 py-2 typography-ui font-medium text-[var(--color-accent-foreground)] focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Add todo"
          >
            <RiAddLine className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Todo List */}
      {todos.length === 0 ? (
        <div className="rounded-md border border-border bg-muted/10 px-4 py-8 text-center">
          <p className="typography-ui text-muted-foreground">
            No todos yet. Add one above.
          </p>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragCancel={handleDragCancel}
          onDragEnd={handleDragEnd}
        >
          <div className="space-y-1 rounded-md border border-border bg-muted/10">
            <SortableContext
              items={todos.map((t) => t.id)}
              strategy={verticalListSortingStrategy}
            >
              {todos.map((todo) => {
                if (editingTodoId === todo.id) {
                  return (
                    <div
                      key={todo.id}
                      className="flex items-center gap-2 rounded-md px-3 py-2 bg-[var(--color-interactive-hover)]"
                    >
                      <div className="flex-shrink-0 w-4 h-4" />
                      <input
                        ref={editInputRef}
                        type="text"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={handleEditKeyDown}
                        onBlur={handleSaveEdit}
                        className="flex-1 bg-transparent typography-ui text-foreground outline-none"
                        data-keyboard-avoid="true"
                      />
                    </div>
                  );
                }

                return (
                  <SortableTodoItem
                    key={todo.id}
                    todoId={todo.id}
                    projectId={activeProjectId}
                    content={todo.content}
                    status={todo.status}
                    priority={todo.priority}
                    onContextMenu={handleContextMenu(todo.id)}
                    onToggleStatus={() => handleToggleStatus(todo.id, todo.status)}
                    onStartEdit={() => handleStartEdit(todo.id, todo.content)}
                  />
                );
              })}
            </SortableContext>
          </div>
          <DragOverlay dropAnimation={null}>
            {draggedTodo ? (
              <div className="rounded-md px-3 py-2 bg-[var(--color-interactive-active)] shadow-lg">
                <div className="flex items-start gap-2">
                  <div className="flex-shrink-0 pt-0.5">
                    <div className="w-4 h-4 rounded bg-[var(--color-border)]" />
                  </div>
                  <span className="typography-ui text-foreground">
                    {draggedTodo.content}
                  </span>
                </div>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      {/* Context Menu */}
      <DropdownMenu open={!!contextMenuTodoId} onOpenChange={(open) => !open && setContextMenuTodoId(null)}>
        <DropdownMenuTrigger asChild>
          <div style={{ position: 'fixed', left: -9999, top: -9999 }} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Set Priority</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem onClick={() => handleSetPriority('high')}>
                <span style={{ color: getPriorityColor('high') }}>High</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleSetPriority('medium')}>
                <span style={{ color: getPriorityColor('medium') }}>Medium</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleSetPriority('low')}>
                <span style={{ color: getPriorityColor('low') }}>Low</span>
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleDelete} variant="destructive">
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};
