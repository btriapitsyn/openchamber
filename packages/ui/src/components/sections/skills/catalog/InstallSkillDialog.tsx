import React from 'react';
import { toast } from '@/components/ui';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import { RiFolderLine, RiUser3Line } from '@remixicon/react';

import type { SkillsCatalogItem } from '@/lib/api/types';
import { useSkillsCatalogStore } from '@/stores/useSkillsCatalogStore';
import { InstallConflictsDialog, type ConflictDecision, type SkillConflict } from './InstallConflictsDialog';

interface InstallSkillDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: SkillsCatalogItem | null;
}

export const InstallSkillDialog: React.FC<InstallSkillDialogProps> = ({ open, onOpenChange, item }) => {
  const { installSkills, isInstalling } = useSkillsCatalogStore();
  const [scope, setScope] = React.useState<'user' | 'project'>('user');
  const [conflictsOpen, setConflictsOpen] = React.useState(false);
  const [conflicts, setConflicts] = React.useState<SkillConflict[]>([]);
  const [baseRequest, setBaseRequest] = React.useState<{
    source: string;
    subpath?: string;
    scope: 'user' | 'project';
    skillDir: string;
  } | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setScope('user');
    setConflictsOpen(false);
    setConflicts([]);
    setBaseRequest(null);
  }, [open]);

  const doInstall = async (request: {
    source: string;
    subpath?: string;
    scope: 'user' | 'project';
    skillDir: string;
    conflictDecisions?: Record<string, ConflictDecision>;
  }) => {
    // Build selection with clawdhub metadata if present
    const selection: { skillDir: string; clawdhub?: { slug: string; version: string } } = {
      skillDir: request.skillDir,
    };
    if (item?.clawdhub) {
      selection.clawdhub = {
        slug: item.clawdhub.slug,
        version: item.clawdhub.version,
      };
    }

    const result = await installSkills({
      source: request.source,
      subpath: request.subpath,
      gitIdentityId: item?.gitIdentityId,
      scope: request.scope,
      selections: [selection],
      conflictPolicy: 'prompt',
      conflictDecisions: request.conflictDecisions,
    });

    if (result.ok) {
      toast.success('Skill installed successfully');
      onOpenChange(false);
      return;
    }

    if (result.error?.kind === 'conflicts') {
      setBaseRequest({ source: request.source, subpath: request.subpath, scope: request.scope, skillDir: request.skillDir });
      setConflicts(result.error.conflicts);
      setConflictsOpen(true);
      return;
    }

    if (result.error?.kind === 'authRequired') {
      toast.error(result.error.message || 'Authentication required');
      return;
    }

    toast.error(result.error?.message || 'Failed to install skill');
  };

  if (!item) {
    return null;
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg" keyboardAvoid>
          <DialogHeader>
            <DialogTitle>Install skill</DialogTitle>
            <DialogDescription>
              Install <span className="font-semibold text-foreground">{item.skillName}</span> into user or project scope.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {item.warnings?.length ? (
              <div className="rounded-lg border bg-muted/30 px-3 py-2">
                <div className="typography-micro text-muted-foreground">Warnings</div>
                <ul className="mt-1 space-y-1">
                  {item.warnings.map((w) => (
                    <li key={w} className="typography-meta text-muted-foreground">{w}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          <DialogFooter className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center">
            <div className="flex items-center gap-2">
              <Select value={scope} onValueChange={(v) => setScope(v as 'user' | 'project')}>
                <SelectTrigger className="!h-9 w-full sm:w-36 justify-between">
                  <span className="flex flex-1 items-center gap-2 justify-start">
                    {scope === 'user' ? <RiUser3Line className="h-4 w-4" /> : <RiFolderLine className="h-4 w-4" />}
                    <span className="capitalize">{scope}</span>
                  </span>
                </SelectTrigger>
                <SelectContent align="start">
                  <SelectItem value="user" className="pr-2 [&>span:first-child]:hidden">
                    <div className="flex items-center gap-2">
                      <RiUser3Line className="h-4 w-4" />
                      <span>User</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="project" className="pr-2 [&>span:first-child]:hidden">
                    <div className="flex items-center gap-2">
                      <RiFolderLine className="h-4 w-4" />
                      <span>Project</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button className="w-full sm:w-auto" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                className="w-full sm:w-auto"
                variant="default"
                disabled={isInstalling || !item.installable}
                onClick={() =>
                  void doInstall({
                    source: item.repoSource,
                    subpath: item.repoSubpath,
                    scope,
                    skillDir: item.skillDir,
                  })
                }
              >
                {isInstalling ? 'Installing…' : 'Install'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <InstallConflictsDialog
        open={conflictsOpen}
        onOpenChange={setConflictsOpen}
        conflicts={conflicts}
        onConfirm={(decisions) => {
          if (!baseRequest) return;
          void doInstall({
            source: baseRequest.source,
            subpath: baseRequest.subpath,
            scope: baseRequest.scope,
            skillDir: baseRequest.skillDir,
            conflictDecisions: decisions,
          });
          setConflictsOpen(false);
        }}
      />
    </>
  );
};
