import * as React from 'react';
import { Button } from '@/components/ui/button';
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
    <div className="space-y-3">
      <div className="space-y-1">
        <h3 className="typography-ui-header font-semibold text-foreground">OpenCode CLI</h3>
        <p className="typography-meta text-muted-foreground">
          Optional absolute path to the <code className="font-mono text-xs">opencode</code> binary.
          Useful when your desktop app launch environment has a stale PATH.
          If your <code className="font-mono text-xs">opencode</code> shim requires Node/Bun (e.g. <code className="font-mono text-xs">env node</code> or <code className="font-mono text-xs">env bun</code>), make sure that runtime is installed.
        </p>
      </div>

      <div className="flex gap-2">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="/Users/you/.bun/bin/opencode"
          disabled={isLoading || isSaving}
          className="flex-1 font-mono text-xs"
        />
        <Button
          type="button"
          variant="secondary"
          onClick={handleBrowse}
          disabled={isLoading || isSaving || !isDesktopShell() || !isTauriShell()}
        >
          Browse
        </Button>
        <Button
          type="button"
          onClick={handleSaveAndReload}
          disabled={isLoading || isSaving}
        >
          {isSaving ? 'Saving…' : 'Save + Reload'}
        </Button>
      </div>

      <div className="typography-micro text-muted-foreground">
        Tip: you can also use <span className="font-mono">OPENCODE_BINARY</span> env var, but this setting persists in
        <span className="font-mono"> ~/.config/openchamber/settings.json</span>.
      </div>
    </div>
  );
};
