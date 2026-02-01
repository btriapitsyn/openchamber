import React from 'react';
import { RiInformationLine } from '@remixicon/react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Checkbox } from '@/components/ui/checkbox';
import { updateDesktopSettings } from '@/lib/persistence';
import { isDesktopRuntime, getDesktopSettings } from '@/lib/desktop';
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

        // 1. Desktop runtime (Tauri)
        if (isDesktopRuntime()) {
          data = await getDesktopSettings();
        } else {
          // 2. Runtime settings API (VSCode)
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
              // Fall through to fetch
            }
          }

          // 3. Fetch API (Web)
          if (!data) {
            const response = await fetch('/api/config/settings', {
              method: 'GET',
              headers: { Accept: 'application/json' },
            });
            if (response.ok) {
              data = await response.json();
            }
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

  const handleGitmojiChange = React.useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const enabled = event.target.checked;
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
    <div className="space-y-6">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <h3 className="typography-ui-header font-semibold text-foreground">Commit Messages</h3>
          <Tooltip delayDuration={1000}>
            <TooltipTrigger asChild>
              <RiInformationLine className="h-3.5 w-3.5 text-muted-foreground/60 cursor-help" />
            </TooltipTrigger>
            <TooltipContent sideOffset={8} className="max-w-xs">
              Configure how commit messages are generated.
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox
              checked={settingsGitmojiEnabled}
              onChange={(checked) => handleGitmojiChange({ target: { checked } } as React.ChangeEvent<HTMLInputElement>)}
            />
            <span className="typography-ui-label text-foreground">Enable gitmoji picker</span>
          </label>
          <p className="typography-meta text-muted-foreground pl-5.5">
            Adds a gitmoji selector to the Git commit message input.
          </p>
        </div>
      </div>

      <div className="space-y-1">
        <h3 className="typography-ui-header font-semibold text-foreground">Files Overview</h3>
        <p className="typography-meta text-muted-foreground">
          Show gitignored files in the Files browser pane only.
        </p>
      </div>
      <div className="space-y-3">
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox
              checked={showGitignored}
              onChange={setFilesViewShowGitignored}
            />
            <span className="typography-ui-label text-foreground">Display gitignored files</span>
          </label>
          <p className="typography-meta text-muted-foreground pl-5.5">
            Toggles gitignored files in the Files tree and search results.
          </p>
        </div>
      </div>
    </div>
  );
};
