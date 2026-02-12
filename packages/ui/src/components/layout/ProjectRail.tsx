import React from 'react';
import { useProjectsStore } from '@/stores/useProjectsStore';
import { useConnectionsStore } from '@/stores/useConnectionsStore';
import { useNotificationBadgeStore, type NotificationKind } from '@/stores/useNotificationBadgeStore';
import { useSessionStore } from '@/stores/useSessionStore';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { getFirstTwoGraphemes } from '@/lib/text-utils';
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
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { RiPencilLine, RiDeleteBinLine, RiEdit2Line, RiFolderLine } from '@remixicon/react';
import { GridLoader } from '@/components/ui/grid-loader';

/**
 * Extract badge text from project entry
 */
function getProjectBadge(project: { badge?: string; label?: string; path: string }): string {
  // Use explicit badge if set
  if (project.badge && project.badge.trim()) {
    return getFirstTwoGraphemes(project.badge);
  }
  
  // Use label if available (uppercase fallback)
  if (project.label && project.label.trim()) {
    return getFirstTwoGraphemes(project.label).toUpperCase();
  }
  
  // Use basename from path (uppercase fallback)
  const normalizedPath = project.path.replace(/\\/g, '/');
  if (!normalizedPath || normalizedPath === '/') {
    return 'RT'; // Root
  }
  
  const segments = normalizedPath.split('/').filter(Boolean);
  const basename = segments[segments.length - 1] || 'RT';
  return getFirstTwoGraphemes(basename).toUpperCase();
}

/**
 * Derive status text from notification and idle state
 */
function getProjectStatus(isIdle: boolean, hasNotification: boolean, notificationKind?: NotificationKind): string {
  if (hasNotification && notificationKind) {
    switch (notificationKind) {
      case 'ready': return 'Ready';
      case 'error': return 'Error';
      case 'question': return 'Needs input';
      case 'permission': return 'Needs permission';
      default: return 'Running';
    }
  }
  
  if (isIdle) {
    return 'Idle';
  }
  
  return 'Running';
}

/**
 * Get status dot color based on notification kind or idle state
 */
function getStatusDotColor(isIdle: boolean, hasNotification: boolean, notificationKind?: NotificationKind): string {
  if (hasNotification && notificationKind) {
    switch (notificationKind) {
      case 'ready': return 'var(--status-success)';
      case 'error': return 'var(--status-error)';
      case 'question': return 'var(--status-warning)';
      case 'permission': return 'var(--status-warning)';
      default: return 'var(--status-success)';
    }
  }
  
  if (hasNotification) {
    return 'var(--status-success)';
  }
  
  if (isIdle) {
    return 'var(--color-muted-foreground)';
  }
  
  return 'var(--status-info)';
}

interface ProjectIconProps {
  projectId: string;
  badge: string;
  label: string;
  projectPath: string;
  isActive: boolean;
  isIdle: boolean;
  hasNotification: boolean;
  notificationKind?: NotificationKind;
  onSelectProject: (id: string) => void;
  onContextMenu: (e: React.MouseEvent) => void;
  dragAttributes?: React.HTMLAttributes<HTMLButtonElement>;
  dragListeners?: any;
}

const ProjectIcon = React.memo<ProjectIconProps>(({ projectId, badge, label, projectPath, isActive, isIdle, hasNotification, notificationKind, onSelectProject, onContextMenu, dragAttributes, dragListeners }) => {
  const handleClick = React.useCallback(() => {
    onSelectProject(projectId);
  }, [projectId, onSelectProject]);

  // Map notification kind to color
  const notificationColor = React.useMemo(() => {
    switch (notificationKind) {
      case 'ready': return 'bg-[var(--status-success)]';
      case 'error': return 'bg-[var(--status-error)]';
      case 'question': return 'bg-[var(--status-warning)]';
      case 'permission': return 'bg-[var(--status-warning)]';
      default: return 'bg-[var(--status-success)]';
    }
  }, [notificationKind]);

  const isQuestion = notificationKind === 'question' || notificationKind === 'permission';

  return (
    <Tooltip delayDuration={300}>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={handleClick}
          onContextMenu={onContextMenu}
          aria-label={`Switch to ${label}`}
          aria-current={isActive ? 'page' : undefined}
          className={cn(
            'relative flex items-center justify-center',
            'w-11 h-11',
            'rounded-lg',
            'text-base font-medium',
            'cursor-pointer',
            'transition-colors duration-150',
            'hover:bg-[var(--color-interactive-hover)]',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]',
            isActive && 'bg-[var(--color-interactive-active)]',
            !isActive && 'text-[var(--color-muted-foreground)]',
            isActive && 'text-[var(--color-foreground)]'
          )}
          {...dragAttributes}
          {...dragListeners}
        >
          {/* Left accent border for active project */}
          {isActive && (
            <div 
              className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 rounded-r-full bg-[var(--color-accent)]"
              aria-hidden="true"
            />
          )}
          <span className="select-none">{badge}</span>
          {/* Notification badge dot */}
          {hasNotification && !isActive && (
            isQuestion ? (
              <div
                className={cn(
                  "absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full flex items-center justify-center",
                  "text-[8px] font-bold leading-none text-black",
                  notificationColor
                )}
                aria-label="Needs input"
              >
                ?
              </div>
            ) : (
              <div
                className={cn("absolute top-0.5 right-0.5 w-2 h-2 rounded-full", notificationColor)}
                aria-label="Has notifications"
              />
            )
          )}
          {/* Running spinner for active working projects */}
          {!isIdle && !isActive && !hasNotification && (
            <div className="absolute -top-0.5 -right-0.5" aria-label="Running">
              <GridLoader size="xs" className="text-[var(--color-primary)]" />
            </div>
          )}

        </button>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>
        <div className="flex flex-col gap-1">
          <span className="font-semibold typography-ui-label">{label}</span>
          <div className="flex items-center gap-1.5 text-[11px]">
            <div
              className="w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: getStatusDotColor(isIdle, hasNotification, notificationKind) }}
              aria-hidden="true"
            />
            <span>{getProjectStatus(isIdle, hasNotification, notificationKind)}</span>
          </div>
          <span className="text-[var(--color-muted-foreground)] text-[11px]">{projectPath}</span>
        </div>
      </TooltipContent>
    </Tooltip>
  );
});
ProjectIcon.displayName = 'ProjectIcon';

/**
 * Sortable wrapper for ProjectIcon that adds drag-and-drop functionality
 */
interface SortableProjectIconProps extends Omit<ProjectIconProps, 'dragAttributes' | 'dragListeners'> {}

const SortableProjectIcon = React.memo<SortableProjectIconProps>((props) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: props.projectId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div 
      ref={setNodeRef} 
      style={style} 
      className={cn(isDragging && 'opacity-40')}
    >
      <ProjectIcon 
        {...props} 
        dragAttributes={attributes}
        dragListeners={listeners}
      />
    </div>
  );
});
SortableProjectIcon.displayName = 'SortableProjectIcon';

export const ProjectRail: React.FC = () => {
  const activeConnectionId = useConnectionsStore((state) => state.activeConnectionId);
  const getProjectsForConnection = useProjectsStore((state) => state.getProjectsForConnection);
  const projects = getProjectsForConnection(activeConnectionId);
  const activeProjectId = useProjectsStore((state) => state.activeProjectId);
  const setActiveProject = useProjectsStore((state) => state.setActiveProject);
  const reorderProjects = useProjectsStore((state) => state.reorderProjects);
  const setBadge = useProjectsStore((state) => state.setBadge);
  const renameProject = useProjectsStore((state) => state.renameProject);
  const removeProject = useProjectsStore((state) => state.removeProject);
  const setGroup = useProjectsStore((state) => state.setGroup);
  const unreadByPath = useNotificationBadgeStore((state) => state.unreadByPath);
  const kindByPath = useNotificationBadgeStore((state) => state.kindByPath);
  const sessionsByDirectory = useSessionStore((state) => state.sessionsByDirectory);
  const sessionAttentionStates = useSessionStore((state) => state.sessionAttentionStates);
  
  // Context menu state - combined to prevent out-of-sync issues
  const [contextMenu, setContextMenu] = React.useState<{ projectId: string; x: number; y: number } | null>(null);
  
  // Badge editor state
  const [editingBadgeProjectId, setEditingBadgeProjectId] = React.useState<string | null>(null);
  const [badgeEditValue, setBadgeEditValue] = React.useState('');
  const badgeInputRef = React.useRef<HTMLInputElement>(null);
  
  // Rename state
  const [renamingProjectId, setRenamingProjectId] = React.useState<string | null>(null);
  const [renameValue, setRenameValue] = React.useState('');
  const renameInputRef = React.useRef<HTMLInputElement>(null);
  
  // Group editor state
  const [editingGroupProjectId, setEditingGroupProjectId] = React.useState<string | null>(null);
  const [groupEditValue, setGroupEditValue] = React.useState('');
  const groupInputRef = React.useRef<HTMLInputElement>(null);
  
  // Remove confirmation dialog state
  const [removeConfirmProjectId, setRemoveConfirmProjectId] = React.useState<string | null>(null);
  
  // Hide rail when there are 0 or 1 projects
  if (projects.length <= 1) {
    return null;
  }

  // Check if any session in a project directory needs attention
  const hasAttentionByPath = React.useMemo(() => {
    const result: Record<string, boolean> = {};
    for (const [directory, sessions] of sessionsByDirectory.entries()) {
      const key = directory.replace(/\/+$/, '');
      result[key] = sessions.some(
        (s) => sessionAttentionStates.get(s.id)?.needsAttention === true
      );
    }
    return result;
  }, [sessionsByDirectory, sessionAttentionStates]);

  // Check if all sessions in a project directory are idle
  const isIdleByPath = React.useMemo(() => {
    const result: Record<string, boolean> = {};
    for (const [directory, sessions] of sessionsByDirectory.entries()) {
      const key = directory.replace(/\/+$/, '');
      if (sessions.length > 0) {
        result[key] = sessions.every((s) => {
          const state = sessionAttentionStates.get(s.id);
          // No attention state yet means the session hasn't reported activity — treat as idle
          return !state || state.status === 'idle';
        });
      }
    }
    return result;
  }, [sessionsByDirectory, sessionAttentionStates]);

  // Memoize derived data to avoid recalculating on every render
  const projectsWithBadges = React.useMemo(() => {
    return projects.map((project) => ({
      id: project.id,
      badge: getProjectBadge(project),
      label: project.label || project.path,
      projectPath: project.path,
      isActive: project.id === activeProjectId,
      project, // Keep reference to full project
    }));
  }, [projects, activeProjectId]);

  // Group projects by their group field
  const groupedProjects = React.useMemo(() => {
    const groups: Map<string, typeof projectsWithBadges> = new Map();
    
    projectsWithBadges.forEach((project) => {
      const groupName = project.project.group || '';
      if (!groups.has(groupName)) {
        groups.set(groupName, []);
      }
      groups.get(groupName)!.push(project);
    });
    
    // Sort groups: ungrouped first, then alphabetically
    const sortedGroups: Array<{ name: string; projects: typeof projectsWithBadges }> = [];
    
    if (groups.has('')) {
      sortedGroups.push({ name: '', projects: groups.get('')! });
      groups.delete('');
    }
    
    const namedGroups = Array.from(groups.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([name, projects]) => ({ name, projects }));
    
    sortedGroups.push(...namedGroups);
    
    return sortedGroups;
  }, [projectsWithBadges]);

  // Context menu handlers
  const handleContextMenu = React.useCallback((projectId: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ projectId, x: e.clientX, y: e.clientY });
  }, []);

  const handleEditBadge = React.useCallback(() => {
    if (!contextMenu) return;
    const project = projects.find(p => p.id === contextMenu.projectId);
    if (!project) return;
    
    setBadgeEditValue(project.badge || '');
    setEditingBadgeProjectId(contextMenu.projectId);
    setContextMenu(null);
  }, [contextMenu, projects]);

  const handleBadgeInputChange = React.useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Apply validation in real-time so user sees what will be saved
    const validated = getFirstTwoGraphemes(value);
    setBadgeEditValue(validated);
  }, []);

  const handleSaveBadge = React.useCallback(() => {
    if (!editingBadgeProjectId) return;
    
    const trimmed = badgeEditValue.trim();
    const validated = getFirstTwoGraphemes(trimmed);
    
    setBadge(editingBadgeProjectId, validated);
    setEditingBadgeProjectId(null);
    setBadgeEditValue('');
  }, [editingBadgeProjectId, badgeEditValue, setBadge]);

  const handleCancelBadgeEdit = React.useCallback(() => {
    setEditingBadgeProjectId(null);
    setBadgeEditValue('');
  }, []);

  const handleBadgeInputKeyDown = React.useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSaveBadge();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancelBadgeEdit();
    }
  }, [handleSaveBadge, handleCancelBadgeEdit]);

  const handleRenameProject = React.useCallback(() => {
    if (!contextMenu) return;
    const project = projects.find(p => p.id === contextMenu.projectId);
    if (!project) return;
    
    setRenameValue(project.label || project.path);
    setRenamingProjectId(contextMenu.projectId);
    setContextMenu(null);
  }, [contextMenu, projects]);

  const handleSaveRename = React.useCallback(() => {
    if (!renamingProjectId) return;
    
    const trimmed = renameValue.trim();
    if (trimmed) {
      renameProject(renamingProjectId, trimmed);
    }
    setRenamingProjectId(null);
    setRenameValue('');
  }, [renamingProjectId, renameValue, renameProject]);

  const handleCancelRename = React.useCallback(() => {
    setRenamingProjectId(null);
    setRenameValue('');
  }, []);

  const handleRenameInputKeyDown = React.useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSaveRename();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancelRename();
    }
  }, [handleSaveRename, handleCancelRename]);

  const handleSetGroup = React.useCallback(() => {
    if (!contextMenu) return;
    const project = projects.find(p => p.id === contextMenu.projectId);
    if (!project) return;
    
    setGroupEditValue(project.group || '');
    setEditingGroupProjectId(contextMenu.projectId);
    setContextMenu(null);
  }, [contextMenu, projects]);

  const handleSaveGroup = React.useCallback(() => {
    if (!editingGroupProjectId) return;
    
    const trimmed = groupEditValue.trim();
    setGroup(editingGroupProjectId, trimmed);
    setEditingGroupProjectId(null);
    setGroupEditValue('');
  }, [editingGroupProjectId, groupEditValue, setGroup]);

  const handleCancelGroupEdit = React.useCallback(() => {
    setEditingGroupProjectId(null);
    setGroupEditValue('');
  }, []);

  const handleGroupInputKeyDown = React.useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSaveGroup();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancelGroupEdit();
    }
  }, [handleSaveGroup, handleCancelGroupEdit]);

  const handleRemoveProject = React.useCallback(() => {
    if (!contextMenu) return;
    setRemoveConfirmProjectId(contextMenu.projectId);
    setContextMenu(null);
  }, [contextMenu]);

  const handleConfirmRemove = React.useCallback(() => {
    if (!removeConfirmProjectId) return;
    removeProject(removeConfirmProjectId);
    setRemoveConfirmProjectId(null);
  }, [removeConfirmProjectId, removeProject]);

  const handleCancelRemove = React.useCallback(() => {
    setRemoveConfirmProjectId(null);
  }, []);

  // Focus badge input when editor opens
  React.useEffect(() => {
    if (editingBadgeProjectId) {
      badgeInputRef.current?.focus();
      badgeInputRef.current?.select();
    }
  }, [editingBadgeProjectId]);

  // Focus rename input when editor opens
  React.useEffect(() => {
    if (renamingProjectId) {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }
  }, [renamingProjectId]);

  // Focus group input when editor opens
  React.useEffect(() => {
    if (editingGroupProjectId) {
      groupInputRef.current?.focus();
      groupInputRef.current?.select();
    }
  }, [editingGroupProjectId]);

  // DnD sensors for drag-and-drop
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

  // State for drag overlay
  const [activeDraggedProjectId, setActiveDraggedProjectId] = React.useState<string | null>(null);
  
  // State for accessibility announcements
  const [dragAnnouncement, setDragAnnouncement] = React.useState('');

  // Handle drag start
  const handleDragStart = React.useCallback((event: DragStartEvent) => {
    const project = projects.find(p => p.id === event.active.id);
    setActiveDraggedProjectId(String(event.active.id));
    setDragAnnouncement(project ? `Picked up ${project.label || project.path}. Use arrow keys to move, space to drop.` : '');
  }, [projects]);

  // Handle drag cancel
  const handleDragCancel = React.useCallback(() => {
    setActiveDraggedProjectId(null);
    setDragAnnouncement('Dropped without moving.');
  }, []);

  // Handle drag end
  const handleDragEnd = React.useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveDraggedProjectId(null);

      if (!over || active.id === over.id) {
        setDragAnnouncement('Dropped without moving.');
        return;
      }

      const oldIndex = projects.findIndex((project) => project.id === active.id);
      const newIndex = projects.findIndex((project) => project.id === over.id);

      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) {
        setDragAnnouncement('Dropped without moving.');
        return;
      }

      const project = projects[oldIndex];
      reorderProjects(oldIndex, newIndex);
      setDragAnnouncement(`Moved ${project.label || project.path} to position ${newIndex + 1}.`);
    },
    [projects, reorderProjects]
  );
  
  // Find the dragged project for overlay
  const draggedProject = React.useMemo(() => {
    if (!activeDraggedProjectId) return null;
    return projectsWithBadges.find((p) => p.id === activeDraggedProjectId);
  }, [activeDraggedProjectId, projectsWithBadges]);

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragCancel={handleDragCancel}
        onDragEnd={handleDragEnd}
      >
        {/* Hidden live region for screen reader announcements */}
        <div className="sr-only" role="status" aria-live="assertive" aria-atomic="true">
          {dragAnnouncement}
        </div>

        <div
          className="flex flex-col items-center gap-2 w-16 h-full py-3 border-r border-[var(--color-border)]"
          role="navigation"
          aria-label="Project navigation"
        >
          <SortableContext
            items={projectsWithBadges.map((p) => p.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="flex flex-col items-center gap-3 overflow-y-auto overflow-x-hidden w-full">
              {groupedProjects.map((group) => (
                <React.Fragment key={group.name || '__ungrouped__'}>
                  {/* Group header */}
                  {group.name && (
                    <div className="w-full flex flex-col items-center">
                      <div className="w-11 h-px bg-[var(--color-border)] opacity-50" />
                      <div className="typography-micro text-[var(--color-muted-foreground)] text-center px-1 mt-1 mb-0.5">
                        {group.name}
                      </div>
                    </div>
                  )}
                  {/* Projects in group */}
                  <div className="flex flex-col items-center gap-2">
                    {group.projects.map((project) => {
                      const normalizedPath = project.project.path?.replace(/\/+$/, '') ?? '';
                      return (
                        <SortableProjectIcon
                          key={project.id}
                          projectId={project.id}
                          badge={project.badge}
                          label={project.label}
                          projectPath={project.projectPath}
                          isActive={project.isActive}
                          isIdle={isIdleByPath[normalizedPath] !== false}
                          hasNotification={Boolean(unreadByPath[normalizedPath]) || Boolean(hasAttentionByPath[normalizedPath])}
                          notificationKind={kindByPath[normalizedPath]}
                          onSelectProject={setActiveProject}
                          onContextMenu={handleContextMenu(project.id)}
                        />
                      );
                    })}
                  </div>
                </React.Fragment>
              ))}
            </div>
          </SortableContext>
        </div>
        <DragOverlay dropAnimation={null}>
          {draggedProject ? (
            <div className="w-11 h-11 flex items-center justify-center rounded-lg bg-[var(--color-interactive-active)] text-base font-medium text-[var(--color-foreground)] shadow-lg">
              <span className="select-none">{draggedProject.badge}</span>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Context Menu */}
      <DropdownMenu open={!!contextMenu} onOpenChange={(open) => !open && setContextMenu(null)}>
        <DropdownMenuTrigger asChild>
          <div style={{ position: 'fixed', left: contextMenu?.x ?? -9999, top: contextMenu?.y ?? -9999, width: 1, height: 1 }} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="right" sideOffset={4}>
          <DropdownMenuItem onClick={handleEditBadge}>
            <RiEdit2Line className="mr-2 h-4 w-4" />
            Edit Shortcode
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleRenameProject}>
            <RiPencilLine className="mr-2 h-4 w-4" />
            Rename Project
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleSetGroup}>
            <RiFolderLine className="mr-2 h-4 w-4" />
            Set Group
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleRemoveProject} variant="destructive">
            <RiDeleteBinLine className="mr-2 h-4 w-4" />
            Remove Project
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Badge Editor Popover */}
      {editingBadgeProjectId && (
        <div
          className="fixed inset-0 z-50"
          onClick={handleSaveBadge}
          onContextMenu={(e) => e.preventDefault()}
        >
          <div
            className="absolute"
            style={{
              left: '60px',
              top: '50%',
              transform: 'translateY(-50%)',
            }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Edit badge"
          >
            <div
              className="rounded-lg border-2 border-[var(--color-border)] bg-[var(--color-popover)] shadow-lg p-2"
              style={{ width: '120px' }}
            >
              <label htmlFor="badge-input" className="block typography-micro text-[var(--color-muted-foreground)] mb-1 px-0.5">Shortcode</label>
              <input
                id="badge-input"
                ref={badgeInputRef}
                type="text"
                value={badgeEditValue}
                onChange={handleBadgeInputChange}
                onKeyDown={handleBadgeInputKeyDown}
                onBlur={handleSaveBadge}
                placeholder="Badge"
                maxLength={10}
                className="w-full bg-transparent text-center typography-ui-label outline-none text-[var(--color-popover-foreground)]"
                data-keyboard-avoid="true"
              />
            </div>
          </div>
        </div>
      )}

      {/* Rename Editor Popover */}
      {renamingProjectId && (
        <div
          className="fixed inset-0 z-50"
          onClick={handleSaveRename}
          onContextMenu={(e) => e.preventDefault()}
        >
          <div
            className="absolute"
            style={{
              left: '60px',
              top: '50%',
              transform: 'translateY(-50%)',
            }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Rename project"
          >
            <div
              className="rounded-lg border-2 border-[var(--color-border)] bg-[var(--color-popover)] shadow-lg p-2"
              style={{ width: '240px' }}
            >
              <label htmlFor="rename-input" className="block typography-micro text-[var(--color-muted-foreground)] mb-1 px-1">Project name</label>
              <input
                id="rename-input"
                ref={renameInputRef}
                type="text"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={handleRenameInputKeyDown}
                onBlur={handleSaveRename}
                placeholder="Project name"
                className="w-full bg-transparent typography-ui-label outline-none px-1 text-[var(--color-popover-foreground)]"
                data-keyboard-avoid="true"
              />
            </div>
          </div>
        </div>
      )}

      {/* Group Editor Popover */}
      {editingGroupProjectId && (
        <div
          className="fixed inset-0 z-50"
          onClick={handleSaveGroup}
          onContextMenu={(e) => e.preventDefault()}
        >
          <div
            className="absolute"
            style={{
              left: '60px',
              top: '50%',
              transform: 'translateY(-50%)',
            }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Set group"
          >
            <div
              className="rounded-lg border-2 border-[var(--color-border)] bg-[var(--color-popover)] shadow-lg p-2"
              style={{ width: '200px' }}
            >
              <label htmlFor="group-input" className="block typography-micro text-[var(--color-muted-foreground)] mb-1 px-1">Group name</label>
              <input
                id="group-input"
                ref={groupInputRef}
                type="text"
                value={groupEditValue}
                onChange={(e) => setGroupEditValue(e.target.value)}
                onKeyDown={handleGroupInputKeyDown}
                onBlur={handleSaveGroup}
                placeholder="Enter group name (or leave empty)"
                className="w-full bg-transparent typography-ui-label outline-none px-1 text-[var(--color-popover-foreground)]"
                data-keyboard-avoid="true"
              />
            </div>
          </div>
        </div>
      )}

      {/* Remove Confirmation Dialog */}
      <Dialog open={!!removeConfirmProjectId} onOpenChange={(open) => !open && handleCancelRemove()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Project</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove this project? This will not delete any files.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={handleCancelRemove}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleConfirmRemove}>
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
