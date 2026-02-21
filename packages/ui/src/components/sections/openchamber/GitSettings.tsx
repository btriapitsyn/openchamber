import React from 'react';
import { RiInformationLine } from '@remixicon/react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Switch } from '@/components/ui/switch';
import { updateDesktopSettings } from '@/lib/persistence';
import { useConfigStore } from '@/stores/useConfigStore';
import { getRegisteredRuntimeAPIs } from '@/contexts/runtimeAPIRegistry';
import { setFilesViewShowGitignored, useFilesViewShowGitignored } from '@/lib/filesViewShowGitignored';

export const GitSettings: React.FC = () => {
  const settingsGitmojiEnabled = useConfigStore((state) => state.settingsGitmojiEnabled);
  const setSettingsGitmojiEnabled = useConfigStore((state) => state.setSettingsGitmojiEnabled);
  const showGitignored = useFilesViewShowGitignored();

  const [isLoading, setIsLoading] = React.useState(true);

  // Load current settings
  React.useEffect(() => {
    const loadSettings = async () => {
      try {
        let data: { gitmojiEnabled?: boolean } | null = null;

        // 1. Runtime settings API (VSCode)
        if (!data) {
          const runtimeSettings = getRegisteredRuntimeAPIs()?.settings;
          if (runtimeSettings) {
            try {
              const result = await runtimeSettings.load();
              const settings = result?.settings;
              if (settings) {
                data = {
                  gitmojiEnabled: typeof (settings as Record<string, unknown>).gitmojiEnabled === 'boolean'
                    ? ((settings as Record<string, unknown>).gitmojiEnabled as boolean)
                    : undefined,
                };
              }
            } catch {
              // fall through
            }
          }
        }

        // 2. Fetch API (Web/server)
        if (!data) {
          const response = await fetch('/api/config/settings', {
            method: 'GET',
            headers: { Accept: 'application/json' },
          });
          if (response.ok) {
            data = await response.json();
          }
        }

        if (data) {
          if (typeof data.gitmojiEnabled === 'boolean') {
            setSettingsGitmojiEnabled(data.gitmojiEnabled);
          }
        }

      } catch (error) {
        console.warn('Failed to load git settings:', error);
      } finally {
        setIsLoading(false);
      }
    };
    loadSettings();
  }, [setSettingsGitmojiEnabled]);

  const handleGitmojiChange = React.useCallback(async (enabled: boolean) => {
    setSettingsGitmojiEnabled(enabled);
    try {
      await updateDesktopSettings({
        gitmojiEnabled: enabled,
      });
    } catch (error) {
      console.warn('Failed to save gitmoji setting:', error);
    }
  }, [setSettingsGitmojiEnabled]);

  if (isLoading) {
    return null;
  }

  return (
    <div className="mb-8">
      <div className="mb-3 px-1 flex items-center gap-2">
        <h3 className="typography-ui-header font-semibold text-foreground">Git Integration</h3>
        <Tooltip delayDuration={1000}>
          <TooltipTrigger asChild>
            <RiInformationLine className="h-3.5 w-3.5 text-muted-foreground/60 cursor-help" />
          </TooltipTrigger>
          <TooltipContent sideOffset={8} className="max-w-xs">
            Configure Git commit message options and file visibility.
          </TooltipContent>
        </Tooltip>
      </div>

      <div className="rounded-lg bg-[var(--surface-elevated)]/70 overflow-hidden flex flex-col">
        <label className="group flex cursor-pointer items-center justify-between gap-2 px-4 py-3 transition-colors hover:bg-[var(--interactive-hover)]/30 border-b border-[var(--surface-subtle)]">
          <div className="flex min-w-0 flex-col">
            <span className="typography-ui-label text-foreground">Enable Gitmoji Picker</span>
          </div>
          <Switch
            checked={settingsGitmojiEnabled}
            onCheckedChange={handleGitmojiChange}
            className="data-[state=checked]:bg-[var(--primary-base)]"
          />
        </label>

        <label className="group flex cursor-pointer items-center justify-between gap-2 px-4 py-3 transition-colors hover:bg-[var(--interactive-hover)]/30">
          <div className="flex min-w-0 flex-col">
            <span className="typography-ui-label text-foreground">Display Gitignored Files</span>
          </div>
          <Switch
            checked={showGitignored}
            onCheckedChange={setFilesViewShowGitignored}
            className="data-[state=checked]:bg-[var(--primary-base)]"
          />
        </label>
      </div>
    </div>
  );
};
