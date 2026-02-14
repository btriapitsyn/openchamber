import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { PROJECT_ICONS, PROJECT_COLORS, PROJECT_COLOR_MAP } from '@/lib/projectMeta';

interface ProjectEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectName: string;
  projectPath: string;
  initialIcon?: string | null;
  initialColor?: string | null;
  onSave: (data: { label: string; icon: string | null; color: string | null }) => void;
}

export const ProjectEditDialog: React.FC<ProjectEditDialogProps> = ({
  open,
  onOpenChange,
  projectName,
  projectPath,
  initialIcon = null,
  initialColor = null,
  onSave,
}) => {
  const [name, setName] = React.useState(projectName);
  const [icon, setIcon] = React.useState<string | null>(initialIcon);
  const [color, setColor] = React.useState<string | null>(initialColor);

  React.useEffect(() => {
    if (open) {
      setName(projectName);
      setIcon(initialIcon);
      setColor(initialColor);
    }
  }, [open, projectName, initialIcon, initialColor]);

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onSave({ label: trimmed, icon, color });
    onOpenChange(false);
  };

  const currentColorVar = color ? (PROJECT_COLOR_MAP[color] ?? null) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit project</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-1">
          {/* Name */}
          <div className="space-y-1.5">
            <label className="typography-ui-label font-medium text-foreground">
              Name
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Project name"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSave();
                }
              }}
              autoFocus
            />
            <p className="typography-meta text-muted-foreground truncate">
              {projectPath}
            </p>
          </div>

          {/* Color */}
          <div className="space-y-2">
            <label className="typography-ui-label font-medium text-foreground">
              Color
            </label>
            <div className="flex gap-2 flex-wrap">
              {/* No color option */}
              <button
                type="button"
                onClick={() => setColor(null)}
                className={cn(
                  'w-8 h-8 rounded-lg border-2 transition-all flex items-center justify-center',
                  color === null
                    ? 'border-foreground scale-110'
                    : 'border-border hover:border-border/80'
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
                    color === c.key
                      ? 'border-foreground scale-110'
                      : 'border-transparent hover:border-border'
                  )}
                  style={{ backgroundColor: c.cssVar }}
                  title={c.label}
                />
              ))}
            </div>
          </div>

          {/* Icon */}
          <div className="space-y-2">
            <label className="typography-ui-label font-medium text-foreground">
              Icon
            </label>
            <div className="flex gap-2 flex-wrap">
              {/* No icon option */}
              <button
                type="button"
                onClick={() => setIcon(null)}
                className={cn(
                  'w-8 h-8 rounded-lg border-2 transition-all flex items-center justify-center',
                  icon === null
                    ? 'border-foreground scale-110 bg-[var(--surface-elevated)]'
                    : 'border-border hover:border-border/80'
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
                      icon === i.key
                        ? 'border-foreground scale-110 bg-[var(--surface-elevated)]'
                        : 'border-border hover:border-border/80'
                    )}
                    title={i.label}
                  >
                    <IconComponent
                      className="w-4 h-4"
                      style={currentColorVar ? { color: currentColorVar } : undefined}
                    />
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!name.trim()}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
