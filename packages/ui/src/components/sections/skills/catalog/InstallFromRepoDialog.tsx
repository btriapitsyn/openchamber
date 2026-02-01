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
import { ButtonLarge } from '@/components/ui/button-large';
import { Input } from '@/components/ui/input';
import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import { RiFolderLine, RiGitRepositoryLine, RiUser3Line } from '@remixicon/react';

import { isVSCodeRuntime } from '@/lib/desktop';
import type { SkillsCatalogItem } from '@/lib/api/types';
import { useSkillsCatalogStore } from '@/stores/useSkillsCatalogStore';
import { useSkillsStore } from '@/stores/useSkillsStore';
import { useGitIdentitiesStore } from '@/stores/useGitIdentitiesStore';
import { InstallConflictsDialog, type ConflictDecision, type SkillConflict } from './InstallConflictsDialog';

interface InstallFromRepoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type IdentityOption = { id: string; name: string };

export const InstallFromRepoDialog: React.FC<InstallFromRepoDialogProps> = ({ open, onOpenChange }) => {
  const { scanRepo, installSkills, isScanning, isInstalling } = useSkillsCatalogStore();
  const installedSkills = useSkillsStore((s) => s.skills);
  const defaultGitIdentityId = useGitIdentitiesStore((s) => s.defaultGitIdentityId);
  const loadDefaultGitIdentityId = useGitIdentitiesStore((s) => s.loadDefaultGitIdentityId);

  const [source, setSource] = React.useState('');
  const [subpath, setSubpath] = React.useState('');
  const [scope, setScope] = React.useState<'user' | 'project'>('user');

  const [items, setItems] = React.useState<SkillsCatalogItem[]>([]);
  const [selected, setSelected] = React.useState<Record<string, boolean>>({});
  const [search, setSearch] = React.useState('');

  const [identities, setIdentities] = React.useState<IdentityOption[]>([]);
  const [gitIdentityId, setGitIdentityId] = React.useState<string | null>(null);

  const [conflictsOpen, setConflictsOpen] = React.useState(false);
  const [conflicts, setConflicts] = React.useState<SkillConflict[]>([]);
  const [baseInstallRequest, setBaseInstallRequest] = React.useState<{
    source: string;
    subpath?: string;
    scope: 'user' | 'project';
    selections: Array<{ skillDir: string }>;
    gitIdentityId?: string;
  } | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setSource('');
    setSubpath('');
    setScope('user');
    setItems([]);
    setSelected({});
    setSearch('');
    setIdentities([]);
    setGitIdentityId(null);
    void loadDefaultGitIdentityId();

    setConflictsOpen(false);

    setConflicts([]);
    setBaseInstallRequest(null);
  }, [open, loadDefaultGitIdentityId]);

  const installedByName = React.useMemo(() => {
    const map = new Map<string, { scope: 'user' | 'project' }>();
    for (const s of installedSkills) {
      map.set(s.name, { scope: s.scope });
    }
    return map;
  }, [installedSkills]);

  const filteredItems = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => {
      const name = item.skillName.toLowerCase();
      const desc = (item.description || '').toLowerCase();
      const fm = (item.frontmatterName || '').toLowerCase();
      return name.includes(q) || desc.includes(q) || fm.includes(q);
    });
  }, [items, search]);

  const selectedDirs = React.useMemo(() => Object.keys(selected).filter((k) => selected[k]), [selected]);

  const toggleAll = (value: boolean) => {
    const next: Record<string, boolean> = {};
    for (const item of items) {
      if (!item.installable) continue;
      next[item.skillDir] = value;
    }
    setSelected(next);
  };

  const handleScan = async () => {
    const trimmed = source.trim();
    if (!trimmed) {
      toast.error('Repository source is required');
      return;
    }

    const result = await scanRepo({
      source: trimmed,
      subpath: subpath.trim() || undefined,
      gitIdentityId: gitIdentityId || undefined,
    });

    if (!result.ok) {
      if (result.error?.kind === 'authRequired') {
        if (isVSCodeRuntime()) {
          toast.error('Private repositories are not supported in VS Code yet');
          return;
        }

        const ids = (result.error.identities || []) as IdentityOption[];
        setIdentities(ids);
        if (!gitIdentityId && ids.length > 0) {
          const preferred =
            defaultGitIdentityId &&
            defaultGitIdentityId !== 'global' &&
            ids.some((i) => i.id === defaultGitIdentityId)
              ? defaultGitIdentityId
              : ids[0].id;
          setGitIdentityId(preferred);
        }
        toast.error('Authentication required. Select a Git identity and try scanning again.');
        return;
      }

      toast.error(result.error?.message || 'Failed to scan repository');
      return;
    }

    const nextItems = result.items || [];
    setItems(nextItems);

    // Auto-select all installable items when scanning returns a small set.
    const nextSelected: Record<string, boolean> = {};
    for (const item of nextItems) {
      if (item.installable) {
        nextSelected[item.skillDir] = true;
      }
    }
    setSelected(nextSelected);

    setIdentities([]);
    toast.success(`Found ${nextItems.length} skill(s)`);
  };

  const doInstall = async (opts: { conflictDecisions?: Record<string, ConflictDecision> }) => {
    if (selectedDirs.length === 0) {
      toast.error('Select at least one skill to install');
      return;
    }

    const request = {
      source: source.trim(),
      subpath: subpath.trim() || undefined,
      scope,
      selections: selectedDirs.map((dir) => ({ skillDir: dir })),
      gitIdentityId: gitIdentityId || undefined,
    };

    const result = await installSkills({
      ...request,
      conflictPolicy: 'prompt',
      conflictDecisions: opts.conflictDecisions,
    });

    if (result.ok) {
      const installedCount = result.installed?.length || 0;
      toast.success(installedCount > 0 ? `Installed ${installedCount} skill(s)` : 'Installation completed');
      onOpenChange(false);
      return;
    }

    if (result.error?.kind === 'conflicts') {
      setBaseInstallRequest(request);
      setConflicts(result.error.conflicts);
      setConflictsOpen(true);
      return;
    }

    if (result.error?.kind === 'authRequired') {
      if (isVSCodeRuntime()) {
        toast.error('Private repositories are not supported in VS Code yet');
        return;
      }
      const ids = (result.error.identities || []) as IdentityOption[];
      setIdentities(ids);
      if (!gitIdentityId && ids.length > 0) {
        const preferred =
          defaultGitIdentityId &&
          defaultGitIdentityId !== 'global' &&
          ids.some((i) => i.id === defaultGitIdentityId)
            ? defaultGitIdentityId
            : ids[0].id;
        setGitIdentityId(preferred);
      }
      toast.error('Authentication required. Select a Git identity and try installing again.');
      return;
    }

    toast.error(result.error?.message || 'Failed to install skills');
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>Install from Git repository</DialogTitle>
            <DialogDescription>
              Scan a repository for folders containing <code className="font-mono">SKILL.md</code>, then install selected skills.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 flex-shrink-0">
            <div className="space-y-2">
              <label className="typography-ui-label font-medium text-foreground">Repository</label>
              <div className="flex items-center gap-2">
                <Input
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  placeholder="owner/repo or git@github.com:owner/repo.git"
                  className="text-foreground placeholder:text-muted-foreground"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void handleScan()}
                  disabled={isScanning || !source.trim()}
                  className="gap-2"
                >
                  <RiGitRepositoryLine className="h-4 w-4" />
                  {isScanning ? 'Scanning…' : 'Scan'}
                </Button>
              </div>
              <p className="typography-meta text-muted-foreground">
                For GitHub shorthand, you can add a subpath like <code className="font-mono">owner/repo/skills</code>.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="typography-ui-label font-medium text-foreground">Optional subpath</label>
                <Input
                  value={subpath}
                  onChange={(e) => setSubpath(e.target.value)}
                  placeholder="e.g. skills"
                  className="text-foreground placeholder:text-muted-foreground"
                />
              </div>

              <div className="space-y-2">
                <label className="typography-ui-label font-medium text-foreground">Target scope</label>
                <Select value={scope} onValueChange={(v) => setScope(v as 'user' | 'project')}>
                  <SelectTrigger className="!h-9 w-full gap-1.5">
                    {scope === 'user' ? <RiUser3Line className="h-4 w-4" /> : <RiFolderLine className="h-4 w-4" />}
                    <span className="capitalize">{scope}</span>
                  </SelectTrigger>
                  <SelectContent align="start">
                    <SelectItem value="user" className="pr-2 [&>span:first-child]:hidden">
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-2">
                          <RiUser3Line className="h-4 w-4" />
                          <span>User</span>
                        </div>
                        <span className="typography-micro text-muted-foreground ml-6">Available in all projects</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="project" className="pr-2 [&>span:first-child]:hidden">
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-2">
                          <RiFolderLine className="h-4 w-4" />
                          <span>Project</span>
                        </div>
                        <span className="typography-micro text-muted-foreground ml-6">Only in current project</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {identities.length > 0 && !isVSCodeRuntime() ? (
              <div className="rounded-lg border bg-muted/20 px-3 py-2">
                <div className="typography-ui-label font-medium text-foreground">Authentication required</div>
                <div className="typography-meta text-muted-foreground mt-1">
                  Select a Git identity (SSH key) that can access this repository.
                </div>
                <div className="mt-2">
                  <Select value={gitIdentityId || ''} onValueChange={(v) => setGitIdentityId(v)}>
                    <SelectTrigger className="!h-9 w-full justify-between">
                      <span>{identities.find((i) => i.id === gitIdentityId)?.name || 'Choose identity'}</span>
                    </SelectTrigger>
                    <SelectContent align="start">
                      {identities.map((id) => (
                        <SelectItem key={id.id} value={id.id} className="pr-2 [&>span:first-child]:hidden">
                          {id.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="typography-micro text-muted-foreground mt-2">
                  Configure identities in Settings → Git Identities.
                </div>
              </div>
            ) : null}
          </div>

          <div className="flex-1 min-h-0">
            {items.length === 0 ? (
              <div className="flex h-full items-center justify-center text-center text-muted-foreground">
                <div>
                  <p className="typography-body">No scan results yet</p>
                  <p className="typography-meta mt-1 opacity-75">Scan a repository to discover skills</p>
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col gap-3">
                <div className="flex items-center justify-between gap-2">
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search skills…"
                    className="max-w-sm"
                  />
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => toggleAll(true)}>Select all</Button>
                    <Button variant="outline" size="sm" onClick={() => toggleAll(false)}>Select none</Button>
                  </div>
                </div>

                <ScrollableOverlay outerClassName="flex-1 min-h-0" className="space-y-2">
                  {filteredItems.map((item) => {
                    const installed = installedByName.get(item.skillName);
                    const checked = Boolean(selected[item.skillDir]);
                    const disabled = !item.installable;

                    return (
                      <label
                        key={item.skillDir}
                        className={
                          'flex items-start gap-3 rounded-lg border bg-muted/10 px-3 py-2 cursor-pointer transition-colors ' +
                          (disabled ? 'opacity-60 cursor-not-allowed' : 'hover:bg-interactive-hover/20')
                        }
                      >
                        <div className="mt-1">
                          <Checkbox
                            checked={checked}
                            disabled={disabled}
                            onChange={(newChecked) => setSelected((prev) => ({ ...prev, [item.skillDir]: newChecked }))}
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <div className="typography-ui-label truncate">{item.skillName}</div>
                            {installed ? (
                              <span className="typography-micro text-muted-foreground bg-muted px-1 rounded flex-shrink-0 leading-none pb-px border border-border/50">
                                installed ({installed.scope})
                              </span>
                            ) : null}
                          </div>
                          {item.description ? (
                            <div className="typography-meta text-muted-foreground mt-0.5 line-clamp-2">{item.description}</div>
                          ) : (
                            <div className="typography-micro text-muted-foreground mt-0.5">No description provided</div>
                          )}
                          {item.warnings?.length ? (
                            <div className="typography-micro text-muted-foreground mt-1">
                              {item.warnings.join(' · ')}
                            </div>
                          ) : null}
                        </div>
                      </label>
                    );
                  })}
                </ScrollableOverlay>

                <div className="typography-meta text-muted-foreground">
                  Selected: {selectedDirs.length} / {items.filter((i) => i.installable).length}
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="flex-shrink-0">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <ButtonLarge
              disabled={isInstalling || selectedDirs.length === 0 || !source.trim()}
              onClick={() => void doInstall({})}
            >
              {isInstalling ? 'Installing…' : 'Install selected'}
            </ButtonLarge>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <InstallConflictsDialog
        open={conflictsOpen}
        onOpenChange={setConflictsOpen}
        conflicts={conflicts}
        onConfirm={(decisions) => {
          if (!baseInstallRequest) {
            setConflictsOpen(false);
            return;
          }
          void doInstall({ conflictDecisions: decisions });
          setConflictsOpen(false);
        }}
      />
    </>
  );
};
