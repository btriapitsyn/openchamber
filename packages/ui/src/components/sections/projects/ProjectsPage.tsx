import React from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';
import { cn } from '@/lib/utils';
import { useProjectsStore } from '@/stores/useProjectsStore';
import { useUIStore } from '@/stores/useUIStore';
import { PROJECT_COLORS, PROJECT_ICONS, PROJECT_COLOR_MAP as COLOR_MAP } from '@/lib/projectMeta';
import { WorktreeSectionContent } from '@/components/sections/openchamber/WorktreeSectionContent';

export const ProjectsPage: React.FC = () => {
  const projects = useProjectsStore((state) => state.projects);
  const updateProjectMeta = useProjectsStore((state) => state.updateProjectMeta);
  const selectedId = useUIStore((state) => state.settingsProjectsSelectedId);
  const setSelectedId = useUIStore((state) => state.setSettingsProjectsSelectedId);

  const selectedProject = React.useMemo(() => {
    if (!selectedId) return null;
    return projects.find((p) => p.id === selectedId) ?? null;
  }, [projects, selectedId]);

  React.useEffect(() => {
    if (projects.length === 0) {
      setSelectedId(null);
      return;
    }
    if (selectedId && projects.some((p) => p.id === selectedId)) {
      return;
    }
    setSelectedId(projects[0].id);
  }, [projects, selectedId, setSelectedId]);

  const [name, setName] = React.useState('');
  const [icon, setIcon] = React.useState<string | null>(null);
  const [color, setColor] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!selectedProject) {
      setName('');
      setIcon(null);
      setColor(null);
      return;
    }
    setName(selectedProject.label ?? '');
    setIcon(selectedProject.icon ?? null);
    setColor(selectedProject.color ?? null);
  }, [selectedProject]);

  const hasChanges = Boolean(selectedProject) && (
    name.trim() !== (selectedProject?.label ?? '').trim()
    || icon !== (selectedProject?.icon ?? null)
    || color !== (selectedProject?.color ?? null)
  );

  const handleSave = React.useCallback(() => {
    if (!selectedProject) return;
    updateProjectMeta(selectedProject.id, { label: name.trim(), icon, color });
  }, [color, icon, name, selectedProject, updateProjectMeta]);

  if (!selectedProject) {
    return (
      <ScrollableOverlay keyboardAvoid outerClassName="h-full" className="w-full">
        <div className="mx-auto max-w-3xl p-6">
          <p className="typography-meta text-muted-foreground">No projects available.</p>
        </div>
      </ScrollableOverlay>
    );
  }

  const currentColorVar = color ? (COLOR_MAP[color] ?? null) : null;

  return (
    <ScrollableOverlay keyboardAvoid outerClassName="h-full" className="w-full">
      <div className="mx-auto max-w-3xl space-y-6 p-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="typography-ui-header font-semibold text-foreground truncate">{selectedProject.label ?? 'Project'}</h2>
              <p className="typography-meta text-muted-foreground truncate" title={selectedProject.path}>{selectedProject.path}</p>
            </div>
            <Button onClick={handleSave} disabled={!hasChanges || name.trim().length === 0}>
              Save
            </Button>
          </div>

          <div className="space-y-2">
            <label className="typography-ui-label font-medium text-foreground">Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Project name" />
          </div>

          <div className="space-y-2">
            <label className="typography-ui-label font-medium text-foreground">Color</label>
            <div className="flex gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => setColor(null)}
                className={cn(
                  'w-8 h-8 rounded-lg border-2 transition-all flex items-center justify-center',
                  color === null ? 'border-foreground scale-110' : 'border-border hover:border-border/80'
                )}
                title="None"
              >
                <span className="w-4 h-0.5 bg-muted-foreground/40 rotate-45 rounded-full" />
              </button>
              {PROJECT_COLORS.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setColor(c.key)}
                  className={cn(
                    'w-8 h-8 rounded-lg border-2 transition-all',
                    color === c.key ? 'border-foreground scale-110' : 'border-transparent hover:border-border'
                  )}
                  style={{ backgroundColor: c.cssVar }}
                  title={c.label}
                />
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="typography-ui-label font-medium text-foreground">Icon</label>
            <div className="flex gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => setIcon(null)}
                className={cn(
                  'w-8 h-8 rounded-lg border-2 transition-all flex items-center justify-center',
                  icon === null ? 'border-foreground scale-110 bg-[var(--surface-elevated)]' : 'border-border hover:border-border/80'
                )}
                title="None"
              >
                <span className="w-4 h-0.5 bg-muted-foreground/40 rotate-45 rounded-full" />
              </button>
              {PROJECT_ICONS.map((i) => {
                const IconComponent = i.Icon;
                return (
                  <button
                    key={i.key}
                    type="button"
                    onClick={() => setIcon(i.key)}
                    className={cn(
                      'w-8 h-8 rounded-lg border-2 transition-all flex items-center justify-center',
                      icon === i.key ? 'border-foreground scale-110 bg-[var(--surface-elevated)]' : 'border-border hover:border-border/80'
                    )}
                    title={i.label}
                  >
                    <IconComponent className="w-4 h-4" style={currentColorVar ? { color: currentColorVar } : undefined} />
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="border-t border-border/40 pt-6">
          <div className="space-y-1 mb-4">
            <h3 className="typography-ui-header font-semibold text-foreground">Worktree</h3>
            <p className="typography-meta text-muted-foreground">Setup commands and existing worktrees for this project.</p>
          </div>
          <WorktreeSectionContent projectRef={{ id: selectedProject.id, path: selectedProject.path }} />
        </div>
      </div>
    </ScrollableOverlay>
  );
};
