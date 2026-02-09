import React from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';
import { AnimatedTabs } from '@/components/ui/animated-tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';

import { RiAddLine, RiDeleteBinLine, RiRefreshLine, RiDownloadLine, RiStarLine } from '@remixicon/react';

import { useSkillsCatalogStore } from '@/stores/useSkillsCatalogStore';
import type { SkillsCatalogItem } from '@/lib/api/types';

import { getRegisteredRuntimeAPIs } from '@/contexts/runtimeAPIRegistry';
import { updateDesktopSettings } from '@/lib/persistence';
import type { DesktopSettings, SkillCatalogConfig } from '@/lib/desktop';

import { AddCatalogDialog } from './AddCatalogDialog';
import { InstallSkillDialog } from './InstallSkillDialog';

type SkillsMode = 'manual' | 'external';

interface SkillsCatalogPageProps {
  mode: SkillsMode;
  onModeChange: (mode: SkillsMode) => void;
}

const loadSettings = async (): Promise<DesktopSettings | null> => {
  try {
    const runtimeSettings = getRegisteredRuntimeAPIs()?.settings;
    if (runtimeSettings) {
      const result = await runtimeSettings.load();
      return (result?.settings || {}) as DesktopSettings;
    }

    const response = await fetch('/api/config/settings', {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json().catch(() => null)) as DesktopSettings | null;
  } catch {
    return null;
  }
};

export const SkillsCatalogPage: React.FC<SkillsCatalogPageProps> = ({ mode, onModeChange }) => {
  const {
    sources,
    itemsBySource,
    selectedSourceId,
    setSelectedSource,
    loadCatalog,
    loadSource,
    loadMoreClawdHub,
    isLoadingCatalog,
    isLoadingSource,
    isLoadingMore,
    loadedSourceIds,
    clawdhubHasMoreBySource,
    lastCatalogError,
  } = useSkillsCatalogStore();

  const [search, setSearch] = React.useState('');
  const [addCatalogOpen, setAddCatalogOpen] = React.useState(false);
  const [installDialogOpen, setInstallDialogOpen] = React.useState(false);
  const [installItem, setInstallItem] = React.useState<SkillsCatalogItem | null>(null);
  const [isRemovingCatalog, setIsRemovingCatalog] = React.useState(false);
  const [isRemoveCatalogDialogOpen, setIsRemoveCatalogDialogOpen] = React.useState(false);

  React.useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  React.useEffect(() => {
    if (!selectedSourceId) {
      return;
    }
    if (!loadedSourceIds[selectedSourceId]) {
      void loadSource(selectedSourceId);
    }
  }, [selectedSourceId, loadedSourceIds, loadSource]);

  const items = React.useMemo(() => {
    if (!selectedSourceId) return [];
    return itemsBySource[selectedSourceId] || [];
  }, [itemsBySource, selectedSourceId]);

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => {
      const name = item.skillName.toLowerCase();
      const desc = (item.description || '').toLowerCase();
      const fm = (item.frontmatterName || '').toLowerCase();
      return name.includes(q) || desc.includes(q) || fm.includes(q);
    });
  }, [items, search]);

  const selectedSource = React.useMemo(() => sources.find((s) => s.id === selectedSourceId) || null, [sources, selectedSourceId]);

  const isCustomSource = Boolean(selectedSourceId && selectedSourceId.startsWith('custom:'));
  const isClawdHubSource = selectedSource?.source === 'clawdhub:registry' || selectedSource?.sourceType === 'clawdhub';
  const hasMoreClawdHub = Boolean(
    selectedSourceId && (clawdhubHasMoreBySource[selectedSourceId] ?? true)
  );

  const removeSelectedCatalog = async () => {
    if (!selectedSourceId || !isCustomSource) {
      return;
    }

    setIsRemovingCatalog(true);
    try {
      const settings = await loadSettings();
      const catalogs = (Array.isArray(settings?.skillCatalogs) ? settings?.skillCatalogs : []) as SkillCatalogConfig[];
      const updated = catalogs.filter((c) => c.id !== selectedSourceId);
      await updateDesktopSettings({ skillCatalogs: updated });
      await loadCatalog({ refresh: true });
      setIsRemoveCatalogDialogOpen(false);
    } finally {
      setIsRemovingCatalog(false);
    }
  };

  return (
    <ScrollableOverlay keyboardAvoid outerClassName="h-full" className="w-full">
      <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="space-y-3">
        <AnimatedTabs
          tabs={[
            { value: 'manual', label: 'Manual' },
            { value: 'external', label: 'External' },
          ]}
          value={mode}
          onValueChange={onModeChange}
          animate={false}
        />

        <div className="space-y-1">
          <h1 className="typography-ui-header font-semibold text-lg">Skills Catalog</h1>
          <p className="typography-meta text-muted-foreground">
            Browse curated repositories and install skills into your OpenCode configuration.
          </p>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex-1 space-y-2">
            <label className="typography-ui-label font-medium text-foreground">Source</label>
            <Select
              value={selectedSourceId || ''}
              onValueChange={(v) => setSelectedSource(v)}
            >
              <SelectTrigger className="!h-9 w-full justify-between">
                <span>{selectedSource?.label || 'Select source'}</span>
              </SelectTrigger>
              <SelectContent align="start">
                {sources.map((src) => (
                  <SelectItem key={src.id} value={src.id} className="pr-2 [&>span:first-child]:hidden">
                    {src.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (selectedSourceId) {
                  void loadSource(selectedSourceId, { refresh: true });
                } else {
                  void loadCatalog({ refresh: true });
                }
              }}
              disabled={isLoadingCatalog || isLoadingSource}
              className="gap-2"
            >
              <RiRefreshLine className="h-4 w-4" />
              Refresh
            </Button>
            {isCustomSource ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsRemoveCatalogDialogOpen(true)}
                disabled={isRemovingCatalog}
                className="gap-2"
              >
                <RiDeleteBinLine className="h-4 w-4" />
                Remove
              </Button>
            ) : null}
            <Button
              type="button"
              variant="default"
              onClick={() => setAddCatalogOpen(true)}
              className="gap-2"
            >
              <RiAddLine className="h-4 w-4" />
              Add catalog
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search skills…"
            className="max-w-md"
          />
          <div className="typography-meta text-muted-foreground">
            {isLoadingCatalog ? 'Loading…' : `${filtered.length} skill(s)`}
          </div>
        </div>

        {lastCatalogError ? (
          <div className="rounded-lg border bg-muted/20 px-3 py-2">
            <div className="typography-ui-label font-medium text-foreground">Catalog error</div>
            <div className="typography-meta text-muted-foreground mt-1">{lastCatalogError.message}</div>
          </div>
        ) : null}
      </div>

      <div className="space-y-2">
        {filtered.length === 0 && !isLoadingSource ? (
          <div className="py-10 text-center text-muted-foreground">
            <p className="typography-body">No skills found</p>
            <p className="typography-meta mt-1 opacity-75">Try a different search or refresh the catalog</p>
          </div>
        ) : isLoadingSource ? (
          <div className="py-10 text-center text-muted-foreground">
            <p className="typography-body">Loading skills…</p>
          </div>
        ) : (
          <>
            {filtered.map((item) => {
              const installed = item.installed?.isInstalled;
              const installedScope = item.installed?.scope;

              return (
                <div
                  key={`${item.sourceId}:${item.skillDir}`}
                  className="rounded-lg border bg-muted/10 px-3 py-2"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="typography-ui-label truncate">{item.skillName}</div>
                        {installed ? (
                          <span className="typography-micro text-muted-foreground bg-muted px-1 rounded flex-shrink-0 leading-none pb-px border border-border/50">
                            installed ({installedScope || 'unknown'})
                          </span>
                        ) : null}
                        {!item.installable ? (
                          <span className="typography-micro text-muted-foreground bg-muted px-1 rounded flex-shrink-0 leading-none pb-px border border-border/50">
                            not installable
                          </span>
                        ) : null}
                      </div>
                      {item.description ? (
                        <div className="typography-meta text-muted-foreground mt-0.5 line-clamp-2">{item.description}</div>
                      ) : (
                        <div className="typography-micro text-muted-foreground mt-0.5">No description provided</div>
                      )}
                      {item.clawdhub ? (
                        <div className="typography-micro text-muted-foreground mt-1 flex items-center gap-3">
                          {item.clawdhub.owner ? (
                            <span>by {item.clawdhub.owner}</span>
                          ) : null}
                          <span className="flex items-center gap-1">
                            <RiDownloadLine className="h-3 w-3" />
                            {item.clawdhub.downloads?.toLocaleString() ?? 0}
                          </span>
                          {(item.clawdhub.stars ?? 0) > 0 ? (
                            <span className="flex items-center gap-1">
                              <RiStarLine className="h-3 w-3" />
                              {item.clawdhub.stars}
                            </span>
                          ) : null}
                          <span>v{item.clawdhub.version}</span>
                        </div>
                      ) : null}
                      {item.warnings?.length ? (
                        <div className="typography-micro text-muted-foreground mt-1">{item.warnings.join(' · ')}</div>
                      ) : null}
                    </div>

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      disabled={!item.installable}
                      onClick={() => {
                        setInstallItem(item);
                        setInstallDialogOpen(true);
                      }}
                    >
                      Install
                    </Button>
                  </div>
                </div>
              );
            })}
            {isClawdHubSource && hasMoreClawdHub ? (
              <div className="flex justify-center pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void loadMoreClawdHub()}
                  disabled={isLoadingMore || isLoadingSource}
                >
                  {isLoadingMore ? 'Loading…' : 'Load more'}
                </Button>
              </div>
            ) : null}
          </>
        )}
      </div>

      <AddCatalogDialog open={addCatalogOpen} onOpenChange={setAddCatalogOpen} />
      <InstallSkillDialog open={installDialogOpen} onOpenChange={setInstallDialogOpen} item={installItem} />
      <Dialog
        open={isRemoveCatalogDialogOpen}
        onOpenChange={(open) => {
          if (!isRemovingCatalog) {
            setIsRemoveCatalogDialogOpen(open);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Remove Catalog</DialogTitle>
            <DialogDescription>Are you sure you want to remove this catalog?</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setIsRemoveCatalogDialogOpen(false)}
              disabled={isRemovingCatalog}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void removeSelectedCatalog()} disabled={isRemovingCatalog}>
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </ScrollableOverlay>
  );
};
