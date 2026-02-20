import React from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { RiArrowDownSLine, RiFolderLine } from '@remixicon/react';
import { useProjectsStore } from '@/stores/useProjectsStore';
import { isVSCodeRuntime } from '@/lib/desktop';
import { cn } from '@/lib/utils';

const formatProjectLabel = (label: string): string => {
  return label.replace(/[-_]/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
};

export const SettingsProjectSelector: React.FC<{ className?: string }> = ({ className }) => {
  const projects = useProjectsStore((state) => state.projects);
  const activeProjectId = useProjectsStore((state) => state.activeProjectId);
  const setActiveProject = useProjectsStore((state) => state.setActiveProject);

  const isVSCode = React.useMemo(() => isVSCodeRuntime(), []);

  const sortedProjects = React.useMemo(() => {
    return [...projects].sort((a, b) => (a.label || a.path).localeCompare(b.label || b.path));
  }, [projects]);

  const activeProject = React.useMemo(() => {
    if (sortedProjects.length === 0) {
      return null;
    }
    return sortedProjects.find((p) => p.id === activeProjectId) ?? sortedProjects[0];
  }, [activeProjectId, sortedProjects]);

  if (isVSCode || sortedProjects.length === 0) {
    return null;
  }

  const rawLabel = activeProject?.label && activeProject.label.trim().length > 0
    ? activeProject.label
    : (activeProject?.path.split('/').filter(Boolean).pop() || activeProject?.path || 'Project');
  const label = formatProjectLabel(rawLabel);

  return (
    <div className={cn(className)}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Switch project"
            title="Switch project"
            className={cn(
              'flex h-9 w-full items-center gap-1.5 bg-transparent px-2 rounded-lg text-foreground outline-none',
              'hover:bg-interactive-hover/50 focus-visible:ring-2 focus-visible:ring-ring border border-[var(--interactive-border)]'
            )}
          >
            <RiFolderLine className="h-4 w-4 opacity-70" />
            <span className="min-w-0 flex-1 truncate typography-ui-label font-medium">{label}</span>
            <RiArrowDownSLine className="size-4 opacity-50" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-auto">
          <DropdownMenuRadioGroup
            value={activeProject?.id ?? ''}
            onValueChange={(value) => {
              if (!value) return;
              setActiveProject(value);
            }}
          >
            {sortedProjects.map((project) => {
              const raw = project.label?.trim()
                ? project.label.trim()
                : (project.path.split('/').filter(Boolean).pop() || project.path);
              const itemLabel = formatProjectLabel(raw);
              return (
                <DropdownMenuRadioItem key={project.id} value={project.id}>
                  <span className="min-w-0 truncate typography-ui">{itemLabel}</span>
                </DropdownMenuRadioItem>
              );
            })}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};
