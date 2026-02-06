import React from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { updateDesktopSettings } from '@/lib/persistence';
import { cn } from '@/lib/utils';
import { filterInstalledDesktopApps, isDesktopLocalOriginActive, isTauriShell, openDesktopPath, type DesktopSettings } from '@/lib/desktop';
import { RiArrowDownSLine, RiCheckLine, RiFileCopyLine } from '@remixicon/react';

type OpenInAppOption = {
  id: string;
  label: string;
  appName: string;
  iconUrl: string;
};

const OPEN_IN_APPS: OpenInAppOption[] = [
  {
    id: 'finder',
    label: 'Finder',
    appName: 'Finder',
    iconUrl: 'https://www.apple.com/favicon.ico',
  },
  {
    id: 'terminal',
    label: 'Terminal',
    appName: 'Terminal',
    iconUrl: 'https://developer.apple.com/favicon.ico',
  },
  {
    id: 'iterm2',
    label: 'iTerm2',
    appName: 'iTerm',
    iconUrl: 'https://iterm2.com/favicon.ico',
  },
  {
    id: 'ghostty',
    label: 'Ghostty',
    appName: 'Ghostty',
    iconUrl: 'https://ghostty.org/favicon.ico',
  },
  {
    id: 'vscode',
    label: 'VS Code',
    appName: 'Visual Studio Code',
    iconUrl: 'https://code.visualstudio.com/favicon.ico',
  },
  {
    id: 'intellij',
    label: 'IntelliJ',
    appName: 'IntelliJ IDEA',
    iconUrl: 'https://www.jetbrains.com/idea/favicon.ico',
  },
  {
    id: 'visual-studio',
    label: 'Visual Studio',
    appName: 'Visual Studio',
    iconUrl: 'https://visualstudio.microsoft.com/favicon.ico',
  },
  {
    id: 'vim',
    label: 'Vim',
    appName: 'Vim',
    iconUrl: 'https://www.vim.org/images/vim_shortcut.ico',
  },
  {
    id: 'cursor',
    label: 'Cursor',
    appName: 'Cursor',
    iconUrl: 'https://www.cursor.com/favicon.ico',
  },
  {
    id: 'android-studio',
    label: 'Android Studio',
    appName: 'Android Studio',
    iconUrl: 'https://developer.android.com/favicon.ico',
  },
  {
    id: 'pycharm',
    label: 'PyCharm',
    appName: 'PyCharm',
    iconUrl: 'https://www.jetbrains.com/pycharm/favicon.ico',
  },
  {
    id: 'neovim',
    label: 'Neovim',
    appName: 'Neovim',
    iconUrl: 'https://neovim.io/favicon.ico',
  },
  {
    id: 'jupyter-nb',
    label: 'Jupyter NB',
    appName: 'Jupyter Notebook',
    iconUrl: 'https://jupyter.org/favicon.ico',
  },
  {
    id: 'jupyterlab',
    label: 'JupyterLab',
    appName: 'JupyterLab',
    iconUrl: 'https://jupyter.org/favicon.ico',
  },
  {
    id: 'claude-code',
    label: 'Claude Code',
    appName: 'Claude Code',
    iconUrl: 'https://claude.ai/favicon.ico',
  },
  {
    id: 'nano',
    label: 'Nano',
    appName: 'Nano',
    iconUrl: 'https://www.nano-editor.org/favicon.ico',
  },
  {
    id: 'xcode',
    label: 'Xcode',
    appName: 'Xcode',
    iconUrl: 'https://developer.apple.com/favicon.ico',
  },
  {
    id: 'sublime-text',
    label: 'Sublime',
    appName: 'Sublime Text',
    iconUrl: 'https://www.sublimetext.com/favicon.ico',
  },
  {
    id: 'webstorm',
    label: 'WebStorm',
    appName: 'WebStorm',
    iconUrl: 'https://www.jetbrains.com/webstorm/favicon.ico',
  },
  {
    id: 'rider',
    label: 'Rider',
    appName: 'Rider',
    iconUrl: 'https://www.jetbrains.com/rider/favicon.ico',
  },
  {
    id: 'zed',
    label: 'Zed',
    appName: 'Zed',
    iconUrl: 'https://zed.dev/favicon.ico',
  },
  {
    id: 'phpstorm',
    label: 'PhpStorm',
    appName: 'PhpStorm',
    iconUrl: 'https://www.jetbrains.com/phpstorm/favicon.ico',
  },
  {
    id: 'eclipse',
    label: 'Eclipse',
    appName: 'Eclipse',
    iconUrl: 'https://www.eclipse.org/favicon.ico',
  },
  {
    id: 'windsurf',
    label: 'Windsurf',
    appName: 'Windsurf',
    iconUrl: 'https://codeium.com/favicon.ico',
  },
  {
    id: 'vscodium',
    label: 'VSCodium',
    appName: 'VSCodium',
    iconUrl: 'https://vscodium.com/favicon.ico',
  },
  {
    id: 'rustrover',
    label: 'RustRover',
    appName: 'RustRover',
    iconUrl: 'https://www.jetbrains.com/rustrover/favicon.ico',
  },
  {
    id: 'lovable',
    label: 'Lovable',
    appName: 'Lovable',
    iconUrl: 'https://lovable.dev/favicon.ico',
  },
  {
    id: 'bolt',
    label: 'Bolt',
    appName: 'Bolt',
    iconUrl: 'https://bolt.new/favicon.ico',
  },
  {
    id: 'cline',
    label: 'Cline',
    appName: 'Cline',
    iconUrl: 'https://cline.bot/favicon.ico',
  },
  {
    id: 'roo',
    label: 'Roo',
    appName: 'Roo',
    iconUrl: 'https://roo.dev/favicon.ico',
  },
  {
    id: 'aider',
    label: 'Aider',
    appName: 'Aider',
    iconUrl: 'https://aider.chat/favicon.ico',
  },
  {
    id: 'trae',
    label: 'Trae',
    appName: 'Trae',
    iconUrl: 'https://trae.ai/favicon.ico',
  },
];

const DEFAULT_APP_ID = 'vscode';

const getStoredAppId = (): string => {
  if (typeof window === 'undefined') {
    return DEFAULT_APP_ID;
  }
  const stored = window.localStorage.getItem('openInAppId');
  if (stored && OPEN_IN_APPS.some((app) => app.id === stored)) {
    return stored;
  }
  return DEFAULT_APP_ID;
};

const AppIcon = ({ label, iconUrl }: { label: string; iconUrl: string }) => {
  const [failed, setFailed] = React.useState(false);
  const initial = label.trim().slice(0, 1).toUpperCase() || '?';

  if (iconUrl && !failed) {
    return (
      <img
        src={iconUrl}
        alt=""
        className="h-4 w-4 rounded-sm"
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <span
      className={cn(
        'h-4 w-4 rounded-sm flex items-center justify-center',
        'bg-[var(--surface-muted)] text-[9px] font-medium text-muted-foreground'
      )}
    >
      {initial}
    </span>
  );
};

type OpenInAppButtonProps = {
  directory: string;
  className?: string;
};

export const OpenInAppButton = ({ directory, className }: OpenInAppButtonProps) => {
  const [selectedAppId, setSelectedAppId] = React.useState(getStoredAppId);
  const [availableApps, setAvailableApps] = React.useState<OpenInAppOption[]>([]);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<DesktopSettings>).detail;
      if (detail && typeof detail.openInAppId === 'string' && detail.openInAppId.length > 0) {
        setSelectedAppId(detail.openInAppId);
      }
    };
    window.addEventListener('openchamber:settings-synced', handler);
    return () => window.removeEventListener('openchamber:settings-synced', handler);
  }, []);

  const isDesktopLocal = isTauriShell() && isDesktopLocalOriginActive();
  React.useEffect(() => {
    if (!isDesktopLocal) return;
    let cancelled = false;

    const loadInstalledApps = async () => {
      const appNames = OPEN_IN_APPS.map((app) => app.appName);
      const installed = await filterInstalledDesktopApps(appNames);
      if (cancelled) return;
      if (installed.length === 0) {
        setAvailableApps([]);
        return;
      }
      const allowed = new Set(installed);
      const filtered = OPEN_IN_APPS.filter((app) => allowed.has(app.appName));
      setAvailableApps(filtered);
    };

    void loadInstalledApps();
    return () => {
      cancelled = true;
    };
  }, [isDesktopLocal]);

  const selectedApp = availableApps.find((app) => app.id === selectedAppId) ?? availableApps[0];

  React.useEffect(() => {
    if (!selectedApp) return;
    if (selectedAppId !== selectedApp.id) {
      setSelectedAppId(selectedApp.id);
      void updateDesktopSettings({ openInAppId: selectedApp.id });
    }
  }, [selectedApp, selectedAppId]);

  if (!isDesktopLocal || !directory) {
    return null;
  }

  if (availableApps.length === 0) {
    return null;
  }

  const handleOpen = async (app: OpenInAppOption) => {
    await openDesktopPath(directory, app.appName);
  };

  const handleSelect = async (app: OpenInAppOption) => {
    setSelectedAppId(app.id);
    await updateDesktopSettings({ openInAppId: app.id });
    await handleOpen(app);
  };

  const handleCopyPath = async () => {
    if (typeof navigator === 'undefined') return;
    const text = directory;
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return;
      } catch {
        // fall through
      }
    }
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'absolute';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  };

  return (
    <div
      className={cn(
        'app-region-no-drag inline-flex items-center rounded-md border border-[var(--interactive-border)]',
        'bg-[var(--surface-elevated)] shadow-sm overflow-hidden',
        className
      )}
    >
      <button
        type="button"
        onClick={() => void handleOpen(selectedApp)}
        className={cn(
          'inline-flex h-9 items-center gap-2 px-3 typography-ui-label font-medium',
          'text-foreground hover:bg-interactive-hover transition-colors'
        )}
        aria-label={`Open in ${selectedApp.label}`}
      >
        <AppIcon label={selectedApp.label} iconUrl={selectedApp.iconUrl} />
        <span>Open</span>
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              'inline-flex h-9 w-9 items-center justify-center',
              'border-l border-[var(--interactive-border)] text-muted-foreground',
              'hover:bg-interactive-hover hover:text-foreground transition-colors'
            )}
            aria-label="Choose app to open"
          >
            <RiArrowDownSLine className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64 max-h-[70vh] overflow-y-auto">
          <DropdownMenuLabel className="typography-ui-label text-muted-foreground">
            Open in
          </DropdownMenuLabel>
          {availableApps.map((app) => (
            <DropdownMenuItem
              key={app.id}
              className="flex items-center gap-2"
              onClick={() => void handleSelect(app)}
            >
              <AppIcon label={app.label} iconUrl={app.iconUrl} />
              <span className="typography-ui-label text-foreground">{app.label}</span>
              {selectedApp.id === app.id ? (
                <RiCheckLine className="ml-auto h-4 w-4 text-primary" />
              ) : null}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem className="flex items-center gap-2" onClick={() => void handleCopyPath()}>
            <RiFileCopyLine className="h-4 w-4" />
            <span className="typography-ui-label text-foreground">Copy Path</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};
