import * as React from 'react';
import { ButtonSmall } from '@/components/ui/button-small';
import { Input } from '@/components/ui/input';
import { isDesktopShell, isTauriShell } from '@/lib/desktop';
import { updateDesktopSettings } from '@/lib/persistence';
import { reloadOpenCodeConfiguration } from '@/stores/useAgentsStore';

export const OpenCodeCliSettings: React.FC = () => {
  const [value, setValue] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(true);
  const [isSaving, setIsSaving] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch('/api/config/settings', {
          method: 'GET',
          headers: { Accept: 'application/json' },
        });
        if (!response.ok) {
          return;
        }
        const data = (await response.json().catch(() => null)) as null | { opencodeBinary?: unknown };
        if (cancelled || !data) {
          return;
        }
        const next = typeof data.opencodeBinary === 'string' ? data.opencodeBinary.trim() : '';
        setValue(next);
      } catch {
        // ignore
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleBrowse = React.useCallback(async () => {
    if (typeof window === 'undefined') {
      return;
    }

    if (!isDesktopShell() || !isTauriShell()) {
      return;
    }

    const tauri = (window as unknown as { __TAURI__?: { dialog?: { open?: (opts: Record<string, unknown>) => Promise<unknown> } } }).__TAURI__;
    if (!tauri?.dialog?.open) {
      return;
    }

    try {
      const selected = await tauri.dialog.open({
        title: 'Select opencode binary',
        multiple: false,
        directory: false,
      });
      if (typeof selected === 'string' && selected.trim().length > 0) {
        setValue(selected.trim());
      }
    } catch {
      // ignore
    }
  }, []);

  const handleSaveAndReload = React.useCallback(async () => {
    setIsSaving(true);
    try {
      await updateDesktopSettings({ opencodeBinary: value.trim() });
      await reloadOpenCodeConfiguration({ message: 'Restarting OpenCode…', mode: 'projects', scopes: ['all'] });
    } finally {
      setIsSaving(false);
    }
  }, [value]);

  return (
    <div className="mb-8">
      <div className="mb-3 px-1">
        <h3 className="typography-ui-header font-semibold text-foreground">
          OpenCode CLI
        </h3>
        <p className="typography-meta text-muted-foreground mt-0.5">
          Optional absolute path to the <code className="font-mono text-xs">opencode</code> binary.
        </p>
      </div>

      <div className="rounded-lg bg-[var(--surface-elevated)]/70 overflow-hidden flex flex-col">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-4 py-3 border-b border-[var(--surface-subtle)]">
          <div className="flex min-w-0 flex-col sm:w-1/3 shrink-0">
            <span className="typography-ui-label text-foreground">Binary Path</span>
            <span className="typography-meta text-muted-foreground">Useful when launch environment has stale PATH</span>
          </div>
          <div className="flex items-center gap-2 flex-1 justify-end">
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="/Users/you/.bun/bin/opencode"
              disabled={isLoading || isSaving}
              className="flex-1 max-w-sm font-mono text-xs h-8 border-[var(--interactive-border)] focus-visible:ring-[var(--primary-base)]"
            />
            <ButtonSmall
              type="button"
              variant="outline"
              onClick={handleBrowse}
              disabled={isLoading || isSaving || !isDesktopShell() || !isTauriShell()}
            >
              Browse
            </ButtonSmall>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-4 py-4">
          <div className="typography-micro text-muted-foreground/70 flex-1">
            Tip: you can also use <span className="font-mono">OPENCODE_BINARY</span> env var, but this setting persists in <span className="font-mono">~/.config/openchamber/settings.json</span>.
          </div>
          <ButtonSmall
            type="button"
            onClick={handleSaveAndReload}
            disabled={isLoading || isSaving}
            className="shrink-0"
          >
            {isSaving ? 'Saving…' : 'Save + Reload'}
          </ButtonSmall>
        </div>
      </div>
    </div>
  );
};
