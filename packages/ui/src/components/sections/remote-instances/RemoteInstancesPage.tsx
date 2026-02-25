import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  RiAddLine,
  RiArrowRightLine,
  RiComputerLine,
  RiExternalLinkLine,
  RiFileCopyLine,
  RiInformationLine,
  RiPlug2Line,
  RiRefreshLine,
  RiServerLine,
  RiTerminalWindowLine,
  RiDeleteBinLine,
  RiStopLine,
} from '@remixicon/react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { SettingsPageLayout } from '@/components/sections/shared/SettingsPageLayout';
import { SettingsSection } from '@/components/sections/shared/SettingsSection';
import { useDesktopSshStore } from '@/stores/useDesktopSshStore';
import { useUIStore } from '@/stores/useUIStore';
import { toast } from '@/components/ui';
import { copyTextToClipboard } from '@/lib/clipboard';
import {
  desktopSshLogsClear,
  desktopSshLogs,
  type DesktopSshInstance,
  type DesktopSshPortForward,
  type DesktopSshPortForwardType,
} from '@/lib/desktopSsh';

const randomPort = (): number => {
  return Math.floor(20000 + Math.random() * 30000);
};

const isPortInUseError = (error: unknown): boolean => {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return message.includes('address already in use') || message.includes('eaddrinuse') || message.includes('port already in use');
};

const phaseLabel = (phase?: string): string => {
  switch (phase) {
    case 'config_resolved':
      return 'Resolving configuration';
    case 'auth_check':
      return 'Checking auth';
    case 'master_connecting':
      return 'Establishing SSH';
    case 'remote_probe':
      return 'Probing remote';
    case 'installing':
      return 'Installing OpenChamber';
    case 'updating':
      return 'Updating OpenChamber';
    case 'server_detecting':
      return 'Detecting server';
    case 'server_starting':
      return 'Starting server';
    case 'forwarding':
      return 'Forwarding ports';
    case 'ready':
      return 'Ready';
    case 'degraded':
      return 'Reconnecting';
    case 'error':
      return 'Error';
    default:
      return 'Idle';
  }
};

const CONNECTING_PHASES = new Set<string>([
  'config_resolved',
  'auth_check',
  'master_connecting',
  'remote_probe',
  'installing',
  'updating',
  'server_detecting',
  'server_starting',
  'forwarding',
]);

const isConnectingPhase = (phase?: string): boolean => {
  return Boolean(phase && CONNECTING_PHASES.has(phase));
};

const phaseDotClass = (phase?: string): string => {
  if (phase === 'ready') {
    return 'bg-[var(--status-success)] animate-pulse';
  }
  if (phase === 'error') {
    return 'bg-[var(--status-error)] animate-pulse';
  }
  if (phase === 'degraded' || isConnectingPhase(phase)) {
    return 'bg-[var(--status-warning)] animate-pulse';
  }
  return 'bg-muted-foreground/40';
};

const buildForwardLabel = (forward: DesktopSshPortForward): string => {
  if (forward.type === 'dynamic') {
    return `${forward.localHost || '127.0.0.1'}:${forward.localPort || 0}`;
  }
  if (forward.type === 'remote') {
    return `${forward.remoteHost || '127.0.0.1'}:${forward.remotePort || 0} -> ${forward.localHost || '127.0.0.1'}:${forward.localPort || 0}`;
  }
  return `${forward.localHost || '127.0.0.1'}:${forward.localPort || 0} -> ${forward.remoteHost || '127.0.0.1'}:${forward.remotePort || 0}`;
};

const makeForward = (): DesktopSshPortForward => {
  return {
    id: `forward-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    enabled: true,
    type: 'local',
    localHost: '127.0.0.1',
    localPort: randomPort(),
    remoteHost: '127.0.0.1',
    remotePort: 80,
  };
};

const suggestConcreteHost = (pattern: string): string => {
  const value = pattern.trim().replace(/\*/g, 'host').replace(/\?/g, 'x');
  return value || 'user@host';
};

const HintLabel: React.FC<{ label: string; hint: React.ReactNode }> = ({ label, hint }) => {
  return (
    <span className="inline-flex items-center gap-1 typography-meta text-muted-foreground">
      <span>{label}</span>
      <Tooltip delayDuration={700}>
        <TooltipTrigger asChild>
          <RiInformationLine className="h-3.5 w-3.5 text-muted-foreground/60 cursor-help" />
        </TooltipTrigger>
        <TooltipContent sideOffset={8} className="max-w-xs">
          <div className="typography-meta text-foreground">{hint}</div>
        </TooltipContent>
      </Tooltip>
    </span>
  );
};

const forwardTypeDescription = (type: DesktopSshPortForwardType): string => {
  switch (type) {
    case 'remote':
      return 'Remote (-R): opens a port on the remote machine and forwards it back to your local machine.';
    case 'dynamic':
      return 'Dynamic (-D): opens a local SOCKS5 proxy for flexible routing through SSH.';
    default:
      return 'Local (-L): opens a local port and forwards traffic to a remote host/port over SSH.';
  }
};

const formatEndpoint = (host: string | undefined, port: number | undefined): string => {
  const value = (host || '').trim();
  const normalizedHost = !value || value === '127.0.0.1' || value === '::1' ? 'localhost' : value;
  return `${normalizedHost}:${port || 0}`;
};

const toBrowserHost = (host: string | undefined): string => {
  const value = (host || '').trim();
  if (!value || value === '0.0.0.0' || value === '::') {
    return '127.0.0.1';
  }
  return value;
};

const formatLogLine = (line: string): string => {
  const match = line.match(/^\[(\d{10,})\]\s*(?:\[([A-Z]+)\]\s*)?(.*)$/);
  if (!match) {
    return line;
  }

  const millis = Number(match[1]);
  const iso = Number.isFinite(millis) ? new Date(millis).toISOString() : match[1];
  const level = (match[2] || 'INFO').toUpperCase();
  const message = match[3] || '';
  return `[${iso}] [${level}] ${message}`;
};

type TauriShell = {
  shell?: {
    open?: (url: string) => Promise<unknown>;
  };
};

const openExternalUrl = async (url: string): Promise<boolean> => {
  const target = url.trim();
  if (!target || typeof window === 'undefined') {
    return false;
  }

  const tauri = (window as unknown as { __TAURI__?: TauriShell }).__TAURI__;
  if (tauri?.shell?.open) {
    try {
      await tauri.shell.open(target);
      return true;
    } catch {
      // fall through
    }
  }

  try {
    window.open(target, '_blank', 'noopener,noreferrer');
    return true;
  } catch {
    return false;
  }
};

const navigateToUrl = (rawUrl: string): void => {
  const target = rawUrl.trim();
  if (!target) {
    return;
  }
  try {
    window.location.assign(target);
  } catch {
    window.location.href = target;
  }
};

const normalizeForSave = (instance: DesktopSshInstance): DesktopSshInstance => {
  const trimmedCommand = instance.sshCommand.trim();
  const nickname = instance.nickname?.trim();
  const forwards = instance.portForwards.map((forward) => ({
    ...forward,
    localHost: forward.localHost?.trim() || '127.0.0.1',
    localPort: typeof forward.localPort === 'number' ? Math.max(1, Math.min(65535, Math.round(forward.localPort))) : undefined,
    remoteHost: forward.remoteHost?.trim(),
    remotePort:
      typeof forward.remotePort === 'number'
        ? Math.max(1, Math.min(65535, Math.round(forward.remotePort)))
        : undefined,
  }));

  return {
    ...instance,
    sshCommand: trimmedCommand,
    ...(nickname ? { nickname } : { nickname: undefined }),
    connectionTimeoutSec: Math.max(5, Math.min(240, Math.round(instance.connectionTimeoutSec || 60))),
    localForward: {
      ...instance.localForward,
      bindHost:
        instance.localForward.bindHost === 'localhost' ||
        instance.localForward.bindHost === '0.0.0.0'
          ? instance.localForward.bindHost
          : '127.0.0.1',
      preferredLocalPort:
        typeof instance.localForward.preferredLocalPort === 'number'
          ? Math.max(1, Math.min(65535, Math.round(instance.localForward.preferredLocalPort)))
          : undefined,
    },
    remoteOpenchamber: {
      ...instance.remoteOpenchamber,
      preferredPort:
        typeof instance.remoteOpenchamber.preferredPort === 'number'
          ? Math.max(1, Math.min(65535, Math.round(instance.remoteOpenchamber.preferredPort)))
          : undefined,
    },
    portForwards: forwards,
  };
};

export const RemoteInstancesPage: React.FC = () => {
  const instances = useDesktopSshStore((state) => state.instances);
  const statusesById = useDesktopSshStore((state) => state.statusesById);
  const importCandidates = useDesktopSshStore((state) => state.importCandidates);
  const isImportsLoading = useDesktopSshStore((state) => state.isImportsLoading);
  const isSaving = useDesktopSshStore((state) => state.isSaving);
  const error = useDesktopSshStore((state) => state.error);
  const load = useDesktopSshStore((state) => state.load);
  const loadImports = useDesktopSshStore((state) => state.loadImports);
  const refreshStatuses = useDesktopSshStore((state) => state.refreshStatuses);
  const upsertInstance = useDesktopSshStore((state) => state.upsertInstance);
  const createFromCommand = useDesktopSshStore((state) => state.createFromCommand);
  const removeInstance = useDesktopSshStore((state) => state.removeInstance);
  const connect = useDesktopSshStore((state) => state.connect);
  const disconnect = useDesktopSshStore((state) => state.disconnect);
  const retry = useDesktopSshStore((state) => state.retry);

  const selectedId = useUIStore((state) => state.settingsRemoteInstancesSelectedId);
  const setSelectedId = useUIStore((state) => state.setSettingsRemoteInstancesSelectedId);

  const selectedInstance = React.useMemo(() => {
    if (!selectedId) return null;
    return instances.find((instance) => instance.id === selectedId) || null;
  }, [instances, selectedId]);

  const [draft, setDraft] = React.useState<DesktopSshInstance | null>(null);
  const [logDialogOpen, setLogDialogOpen] = React.useState(false);
  const [logDialogLoading, setLogDialogLoading] = React.useState(false);
  const [logDialogError, setLogDialogError] = React.useState<string | null>(null);
  const [logDialogLines, setLogDialogLines] = React.useState<string[]>([]);
  const [patternHost, setPatternHost] = React.useState<string | null>(null);
  const [patternDestination, setPatternDestination] = React.useState('');
  const [patternCreating, setPatternCreating] = React.useState(false);
  const [isPrimaryActionPending, setIsPrimaryActionPending] = React.useState(false);
  const [isRetryPending, setIsRetryPending] = React.useState(false);
  const [clockMs, setClockMs] = React.useState(() => Date.now());

  React.useEffect(() => {
    void load();
    void loadImports();
  }, [load, loadImports]);

  React.useEffect(() => {
    setDraft(selectedInstance ? JSON.parse(JSON.stringify(selectedInstance)) : null);
  }, [selectedInstance]);

  React.useEffect(() => {
    if (!selectedId) {
      return;
    }
    const interval = window.setInterval(() => {
      void refreshStatuses();
    }, 2_000);
    return () => {
      window.clearInterval(interval);
    };
  }, [refreshStatuses, selectedId]);

  React.useEffect(() => {
    const interval = window.setInterval(() => {
      setClockMs(Date.now());
    }, 1_000);
    return () => {
      window.clearInterval(interval);
    };
  }, []);

  const status = selectedId ? statusesById[selectedId] : null;
  const statusPhase = status?.phase;
  const isReady = statusPhase === 'ready';
  const isReconnecting = statusPhase === 'degraded';
  const isConnecting = isConnectingPhase(statusPhase);
  const isBusy = isConnecting || isReconnecting;
  const canDisconnect = isReady || isBusy;
  const statusAgeMs = status ? Math.max(0, clockMs - status.updatedAtMs) : 0;
  const reconnectAppearsStuck = isReconnecting && statusAgeMs > 12_000;

  const hasChanges = React.useMemo(() => {
    if (!draft || !selectedInstance) return false;
    return JSON.stringify(draft) !== JSON.stringify(selectedInstance);
  }, [draft, selectedInstance]);

  const updateDraft = React.useCallback((updater: (current: DesktopSshInstance) => DesktopSshInstance) => {
    setDraft((current) => (current ? updater(current) : current));
  }, []);

  const handleSave = React.useCallback(async () => {
    if (!draft) return;
    const normalized = normalizeForSave(draft);

    if (!normalized.sshCommand.trim()) {
      toast.error('SSH command is required');
      return;
    }

    if (normalized.localForward.bindHost === '0.0.0.0') {
      const allow = window.confirm(
        'Binding local forwards to 0.0.0.0 makes the forwarded port reachable from other devices on your network. Continue?',
      );
      if (!allow) {
        return;
      }
    }

    if (
      normalized.auth.sshPassword?.enabled &&
      normalized.auth.sshPassword.value?.trim() &&
      normalized.auth.sshPassword.store !== 'settings'
    ) {
      const store = window.confirm('Store SSH password in settings.json as plaintext?');
      normalized.auth.sshPassword.store = store ? 'settings' : 'never';
      if (!store) {
        normalized.auth.sshPassword.value = undefined;
      }
    }

    if (
      normalized.auth.openchamberPassword?.enabled &&
      normalized.auth.openchamberPassword.value?.trim() &&
      normalized.auth.openchamberPassword.store !== 'settings'
    ) {
      const store = window.confirm('Store OpenChamber UI password in settings.json as plaintext?');
      normalized.auth.openchamberPassword.store = store ? 'settings' : 'never';
      if (!store) {
        normalized.auth.openchamberPassword.value = undefined;
      }
    }

    try {
      await upsertInstance(normalized);
      toast.success('SSH instance saved');
    } catch (error) {
      toast.error('Failed to save SSH instance', {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  }, [draft, upsertInstance]);

  const createImportedInstance = React.useCallback(
    async (host: string, destination: string): Promise<boolean> => {
      const id = `ssh-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      try {
        await createFromCommand(id, `ssh ${destination}`, host);
        setSelectedId(id);
        toast.success('SSH instance created');
        return true;
      } catch (error) {
        toast.error('Failed to create SSH instance', {
          description: error instanceof Error ? error.message : String(error),
        });
        return false;
      }
    },
    [createFromCommand, setSelectedId],
  );

  const closePatternDialog = React.useCallback(() => {
    if (patternCreating) {
      return;
    }
    setPatternHost(null);
    setPatternDestination('');
  }, [patternCreating]);

  const handleImportCandidate = React.useCallback(
    (host: string, pattern: boolean) => {
      if (pattern) {
        setPatternHost(host);
        setPatternDestination(suggestConcreteHost(host));
        return;
      }
      void createImportedInstance(host, host);
    },
    [createImportedInstance],
  );

  const handlePatternCreate = React.useCallback(() => {
    const host = patternHost;
    const destination = patternDestination.trim();
    if (!host) {
      return;
    }
    if (!destination) {
      toast.error('Destination is required');
      return;
    }

    setPatternCreating(true);
    void (async () => {
      const created = await createImportedInstance(host, destination);
      setPatternCreating(false);
      if (created) {
        setPatternHost(null);
        setPatternDestination('');
      }
    })();
  }, [createImportedInstance, patternDestination, patternHost]);

  const connectWithPortRecovery = React.useCallback(async () => {
    if (!selectedInstance) return;
    try {
      await connect(selectedInstance.id);
      return;
    } catch (error) {
      if (!isPortInUseError(error)) {
        throw error;
      }

      const allow = window.confirm('Local port is already in use. Pick a random free local port and retry?');
      if (!allow) {
        throw error;
      }

      const nextInstance: DesktopSshInstance = {
        ...selectedInstance,
        localForward: {
          ...selectedInstance.localForward,
          preferredLocalPort: randomPort(),
        },
      };

      await upsertInstance(nextInstance);
      await connect(nextInstance.id);
      toast.success('Retried with a random local port');
    }
  }, [connect, selectedInstance, upsertInstance]);

  const readLogsForInstance = React.useCallback(async (id: string) => {
    const lines = await desktopSshLogs(id, 600);
    return lines.map((line) => formatLogLine(line));
  }, []);

  const handleOpenLogs = React.useCallback(async () => {
    if (!draft) return;
    setLogDialogOpen(true);
    setLogDialogLoading(true);
    setLogDialogError(null);
    try {
      const lines = await readLogsForInstance(draft.id);
      setLogDialogLines(lines);
    } catch (error) {
      setLogDialogLines([]);
      setLogDialogError(error instanceof Error ? error.message : String(error));
    } finally {
      setLogDialogLoading(false);
    }
  }, [draft, readLogsForInstance]);

  React.useEffect(() => {
    if (!logDialogOpen || !draft) {
      return;
    }

    let disposed = false;
    const run = async () => {
      try {
        const lines = await readLogsForInstance(draft.id);
        if (!disposed) {
          setLogDialogLines(lines);
          setLogDialogError(null);
        }
      } catch (error) {
        if (!disposed) {
          setLogDialogError(error instanceof Error ? error.message : String(error));
        }
      }
    };

    void run();
    const interval = window.setInterval(() => {
      void run();
    }, 1_000);

    return () => {
      disposed = true;
      window.clearInterval(interval);
    };
  }, [draft, logDialogOpen, readLogsForInstance]);

  const logLinesText = React.useMemo(() => logDialogLines.join('\n'), [logDialogLines]);

  const handleCopyAllLogs = React.useCallback(() => {
    if (!logLinesText.trim()) {
      toast.error('No logs to copy');
      return;
    }
    void copyTextToClipboard(logLinesText).then((result) => {
      if (result.ok) {
        toast.success('Logs copied');
      }
    });
  }, [logLinesText]);

  const handleClearLogs = React.useCallback(async () => {
    if (!draft) {
      return;
    }
    try {
      await desktopSshLogsClear(draft.id);
      setLogDialogLines([]);
      toast.success('Logs cleared');
    } catch (error) {
      toast.error('Failed to clear logs', {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  }, [draft]);

  const handleOpenCurrentInstance = React.useCallback(async () => {
    if (!status?.localUrl) {
      toast.error('Instance URL is not available yet');
      return;
    }

    const target = status.localUrl.trim();
    if (!target) {
      toast.error('Instance URL is not available yet');
      return;
    }

    navigateToUrl(target);
  }, [status?.localUrl]);

  const handlePrimaryConnectionAction = React.useCallback(() => {
    if (!draft) {
      return;
    }

    setIsPrimaryActionPending(true);
    const operation = canDisconnect ? disconnect(draft.id) : connectWithPortRecovery();
    void operation
      .catch((error) => {
        const actionLabel = canDisconnect ? (isReady ? 'disconnect' : 'cancel connection') : 'connect';
        toast.error(`Failed to ${actionLabel}`, {
          description: error instanceof Error ? error.message : String(error),
        });
      })
      .finally(() => {
        setIsPrimaryActionPending(false);
      });
  }, [canDisconnect, connectWithPortRecovery, disconnect, draft, isReady]);

  const handleRetryAction = React.useCallback(() => {
    if (!draft) {
      return;
    }

    if (isConnecting) {
      return;
    }

    setIsRetryPending(true);
    const operation = isReconnecting
      ? disconnect(draft.id).then(() => connectWithPortRecovery())
      : retry(draft.id);

    void operation
      .catch((error) => {
        toast.error('Retry failed', {
          description: error instanceof Error ? error.message : String(error),
        });
      })
      .finally(() => {
        setIsRetryPending(false);
      });
  }, [connectWithPortRecovery, disconnect, draft, isConnecting, isReconnecting, retry]);

  const retryButtonLabel = isConnecting
    ? 'Connecting...'
    : isReconnecting
      ? reconnectAppearsStuck
        ? 'Reconnect now'
        : 'Reconnecting...'
      : 'Retry';

  const canRetry =
    !isPrimaryActionPending &&
    !isRetryPending &&
    (statusPhase === 'error' || statusPhase === 'idle' || !statusPhase || (isReconnecting && reconnectAppearsStuck)) &&
    !isConnecting;

  const primaryButtonLabel = isReady ? 'Disconnect' : canDisconnect ? 'Cancel' : 'Connect';

  if (!draft) {
    return (
      <SettingsPageLayout>
        <SettingsSection title="Remote Instances" description="Manage SSH-backed OpenChamber instances.">
          <p className="typography-meta text-muted-foreground">Select an instance from the sidebar or import one from SSH config.</p>
        </SettingsSection>

        <SettingsSection title="Import from SSH config" divider>
          {isImportsLoading ? (
            <p className="typography-meta text-muted-foreground">Loading SSH hosts...</p>
          ) : importCandidates.length === 0 ? (
            <p className="typography-meta text-muted-foreground">No SSH config hosts found.</p>
          ) : (
            <div className="space-y-2">
              {importCandidates.map((candidate) => (
                <div key={`${candidate.source}:${candidate.host}`} className="flex items-center justify-between gap-3 rounded-md border border-[var(--interactive-border)] px-3 py-2">
                  <div className="min-w-0">
                    <div className="typography-ui-label text-foreground truncate">
                      {candidate.host}
                      {candidate.pattern ? ' (pattern)' : ''}
                    </div>
                    <div className="typography-micro text-muted-foreground">{candidate.source} config</div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void handleImportCandidate(candidate.host, candidate.pattern)}
                  >
                    Create
                  </Button>
                </div>
              ))}
            </div>
          )}
        </SettingsSection>

        <Dialog
          open={Boolean(patternHost)}
          onOpenChange={(open) => {
            if (!open) {
              closePatternDialog();
            }
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Create from wildcard pattern</DialogTitle>
              <DialogDescription>
                {patternHost ? `${patternHost} requires a concrete destination.` : 'Enter destination.'}
              </DialogDescription>
            </DialogHeader>
            <form
              className="space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                handlePatternCreate();
              }}
            >
              <Input
                value={patternDestination}
                onChange={(event) => setPatternDestination(event.target.value)}
                placeholder="user@host"
                autoFocus
              />
              <div className="flex items-center justify-end gap-2">
                <Button type="button" variant="outline" size="sm" onClick={closePatternDialog} disabled={patternCreating}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={patternCreating}>
                  Create
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </SettingsPageLayout>
    );
  }

  const isManagedMode = draft.remoteOpenchamber.mode === 'managed';

  return (
    <SettingsPageLayout>
      <SettingsSection title="Connection" description="SSH command and lifecycle settings.">
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="typography-meta text-muted-foreground">Nickname</span>
              <Input
                value={draft.nickname || ''}
                onChange={(event) =>
                  updateDraft((current) => ({
                    ...current,
                    nickname: event.target.value,
                  }))
                }
                placeholder="Production Host"
              />
            </label>

            <label className="space-y-1">
              <span className="typography-meta text-muted-foreground">Connection timeout (sec)</span>
              <Input
                type="number"
                min={5}
                max={240}
                value={draft.connectionTimeoutSec}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  updateDraft((current) => ({
                    ...current,
                    connectionTimeoutSec: Number.isFinite(next) ? next : current.connectionTimeoutSec,
                  }));
                }}
              />
            </label>
          </div>

          <label className="space-y-1 block">
            <span className="typography-meta text-muted-foreground">SSH command</span>
            <Input
              value={draft.sshCommand}
              onChange={(event) =>
                updateDraft((current) => ({
                  ...current,
                  sshCommand: event.target.value,
                }))
              }
              placeholder="ssh -J jump user@host"
            />
          </label>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant={canDisconnect ? 'outline' : 'default'}
                size="sm"
                onClick={handlePrimaryConnectionAction}
                disabled={isPrimaryActionPending || isRetryPending}
              >
                {canDisconnect ? <RiStopLine className="h-4 w-4" /> : <RiPlug2Line className="h-4 w-4" />}
                {primaryButtonLabel}
              </Button>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleRetryAction}
                disabled={!canRetry}
              >
                <RiRefreshLine className={`h-4 w-4 ${isConnecting || (isReconnecting && !reconnectAppearsStuck) ? 'animate-spin' : ''}`} />
                {retryButtonLabel}
              </Button>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  void handleOpenLogs();
                }}
              >
                <RiTerminalWindowLine className="h-4 w-4" />
                Open Logs
              </Button>

              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-[var(--status-error)] border-[var(--status-error)]/30 hover:text-[var(--status-error)]"
                onClick={() => {
                  const ok = window.confirm('Remove this SSH instance?');
                  if (!ok) return;
                  void removeInstance(draft.id)
                    .then(() => {
                      setSelectedId(null);
                      toast.success('SSH instance removed');
                    })
                    .catch((err) => {
                      toast.error('Failed to remove SSH instance', {
                        description: err instanceof Error ? err.message : String(err),
                      });
                    });
                }}
              >
                <RiDeleteBinLine className="h-4 w-4" />
                Remove
              </Button>
            </div>

            <div className="flex items-center justify-end gap-2 typography-meta text-muted-foreground min-h-5">
              <span className={`h-2.5 w-2.5 rounded-full ${phaseDotClass(statusPhase)}`} />
              <span>{phaseLabel(statusPhase)}</span>
              {status?.localUrl ? <span>· {status.localUrl}</span> : null}
              {reconnectAppearsStuck ? <span>· reconnect stale</span> : null}
            </div>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Remote OpenChamber"
        description="Controls how OpenChamber is discovered and run on the remote machine."
        divider
      >
        <div className="space-y-2">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1">
              <HintLabel
                label="Mode"
                hint="Managed installs/updates and starts OpenChamber remotely. External assumes it is already running."
              />
              <Select
                value={draft.remoteOpenchamber.mode}
                onValueChange={(value) =>
                  updateDraft((current) => ({
                    ...current,
                    remoteOpenchamber: {
                      ...current.remoteOpenchamber,
                      mode: value === 'external' ? 'external' : 'managed',
                    },
                  }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select mode" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="managed">Managed (auto start)</SelectItem>
                  <SelectItem value="external">External (already running)</SelectItem>
                </SelectContent>
              </Select>
            </label>

            <label className="space-y-1">
              <HintLabel
                label="Preferred remote port"
                hint="Port OpenChamber should use on the remote host. Leave empty to let the runtime choose."
              />
              <Input
                type="number"
                min={1}
                max={65535}
                value={draft.remoteOpenchamber.preferredPort ?? ''}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  updateDraft((current) => ({
                    ...current,
                    remoteOpenchamber: {
                      ...current.remoteOpenchamber,
                      preferredPort: Number.isFinite(next) && next > 0 ? next : undefined,
                    },
                  }));
                }}
                placeholder="Auto"
              />
            </label>

            {isManagedMode ? (
              <label className="space-y-1">
                <HintLabel
                  label="Install method"
                  hint="How OpenChamber gets installed/updated remotely when mode is Managed."
                />
                <Select
                  value={draft.remoteOpenchamber.installMethod}
                  onValueChange={(value) =>
                    updateDraft((current) => ({
                      ...current,
                      remoteOpenchamber: {
                        ...current.remoteOpenchamber,
                        installMethod:
                          value === 'npm' || value === 'download_release' || value === 'upload_bundle'
                            ? value
                            : 'bun',
                      },
                    }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select install method" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bun">bun</SelectItem>
                    <SelectItem value="npm">npm</SelectItem>
                    <SelectItem value="download_release">download release</SelectItem>
                    <SelectItem value="upload_bundle">upload bundle</SelectItem>
                  </SelectContent>
                </Select>
              </label>
            ) : null}

            {isManagedMode ? (
              <label className="space-y-1">
                <HintLabel
                  label="Keep server running"
                  hint="If enabled, OpenChamber daemon is left running remotely when you disconnect."
                />
                <div className="h-10 px-3 rounded-md border border-[var(--interactive-border)] bg-[var(--surface-elevated)] flex items-center justify-between">
                  <span className="typography-ui-label text-foreground">Keep remote daemon alive</span>
                  <Switch
                    checked={draft.remoteOpenchamber.keepRunning}
                    onCheckedChange={(checked) =>
                      updateDraft((current) => ({
                        ...current,
                        remoteOpenchamber: {
                          ...current.remoteOpenchamber,
                          keepRunning: checked,
                        },
                      }))
                    }
                  />
                </div>
              </label>
            ) : null}
          </div>

          {!isManagedMode ? (
            <p className="typography-micro text-muted-foreground/80">
              External mode expects OpenChamber to already be running remotely. Install method and keep-alive settings do not apply.
            </p>
          ) : null}
        </div>
      </SettingsSection>

      <SettingsSection
        title="Primary Local Tunnel"
        description="Main tunnel that maps the remote OpenChamber server to a local URL on your machine."
        divider
      >
        <div className="space-y-2">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1">
              <HintLabel
                label="Bind host"
                hint="Network interface for the main local URL. Use 127.0.0.1/localhost for local-only access."
              />
              <Select
                value={draft.localForward.bindHost}
                onValueChange={(value) => {
                  if (value === '0.0.0.0') {
                    const allow = window.confirm(
                      'Binding to 0.0.0.0 exposes forwarded ports to your local network. Continue?',
                    );
                    if (!allow) return;
                  }
                  updateDraft((current) => ({
                    ...current,
                    localForward: {
                      ...current.localForward,
                      bindHost: value === 'localhost' || value === '0.0.0.0' ? value : '127.0.0.1',
                    },
                  }));
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select bind host" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="127.0.0.1">127.0.0.1</SelectItem>
                  <SelectItem value="localhost">localhost</SelectItem>
                  <SelectItem value="0.0.0.0">0.0.0.0</SelectItem>
                </SelectContent>
              </Select>
            </label>

            <label className="space-y-1">
              <HintLabel
                label="Preferred local port"
                hint="Preferred local port for the main OpenChamber tunnel. Leave empty for auto-select."
              />
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  max={65535}
                  value={draft.localForward.preferredLocalPort ?? ''}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    updateDraft((current) => ({
                      ...current,
                      localForward: {
                        ...current.localForward,
                        preferredLocalPort: Number.isFinite(next) && next > 0 ? next : undefined,
                      },
                    }));
                  }}
                  placeholder="Auto"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    updateDraft((current) => ({
                      ...current,
                      localForward: {
                        ...current.localForward,
                        preferredLocalPort: randomPort(),
                      },
                    }))
                  }
                >
                  Pick random
                </Button>
              </div>
            </label>
          </div>

          <p className="typography-micro text-muted-foreground/80">
            This is separate from optional extra forwards below. It always carries the main OpenChamber UI/API traffic.
          </p>
        </div>
      </SettingsSection>

      <SettingsSection title="Passwords" divider>
        <div className="space-y-3">
          <label className="space-y-1 block">
            <span className="typography-meta text-muted-foreground">SSH password (optional)</span>
            <Input
              type="password"
              value={draft.auth.sshPassword?.value || ''}
              onChange={(event) =>
                updateDraft((current) => ({
                  ...current,
                  auth: {
                    ...current.auth,
                    sshPassword: {
                      enabled: event.target.value.trim().length > 0,
                      value: event.target.value,
                      store: current.auth.sshPassword?.store || 'never',
                    },
                  },
                }))
              }
              placeholder="Password or key passphrase"
            />
          </label>

          <label className="space-y-1 block">
            <span className="typography-meta text-muted-foreground">OpenChamber UI password (optional)</span>
            <Input
              type="password"
              value={draft.auth.openchamberPassword?.value || ''}
              onChange={(event) =>
                updateDraft((current) => ({
                  ...current,
                  auth: {
                    ...current.auth,
                    openchamberPassword: {
                      enabled: event.target.value.trim().length > 0,
                      value: event.target.value,
                      store: current.auth.openchamberPassword?.store || 'never',
                    },
                  },
                }))
              }
              placeholder="Protect remote UI with password"
            />
          </label>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Port Forwards"
        description="Optional extra SSH forwards in addition to the primary OpenChamber tunnel."
        divider
      >
        <div className="space-y-2">
          {draft.portForwards.length === 0 ? (
            <p className="typography-micro text-muted-foreground/80">No extra forwards configured yet.</p>
          ) : null}

          {draft.portForwards.map((forward, index) => {
            const updateForward = (updater: (forward: DesktopSshPortForward) => DesktopSshPortForward) => {
              updateDraft((current) => ({
                ...current,
                portForwards: current.portForwards.map((item, itemIndex) =>
                  itemIndex === index ? updater(item) : item,
                ),
              }));
            };

            const localHostLabel =
              forward.type === 'remote' ? 'Local target host' : 'Local listen host';
            const localPortLabel =
              forward.type === 'remote' ? 'Local target port' : 'Local listen port';
            const localHostHint =
              forward.type === 'remote'
                ? 'Local host on your machine that receives traffic from remote -R listener.'
                : 'Local host/interface where this forward listens on your machine.';
            const localPortHint =
              forward.type === 'remote'
                ? 'Local port on your machine that receives traffic from remote -R listener.'
                : 'Local port where this forward listens on your machine.';
            const remoteHostLabel =
              forward.type === 'remote' ? 'Remote listen host' : 'Remote target host';
            const remotePortLabel =
              forward.type === 'remote' ? 'Remote listen port' : 'Remote target port';
            const remoteHostHint =
              forward.type === 'remote'
                ? 'Remote host/interface where SSH creates the -R listener.'
                : 'Remote host that receives traffic forwarded by local -L listener.';
            const remotePortHint =
              forward.type === 'remote'
                ? 'Remote port where SSH creates the -R listener.'
                : 'Remote target port that receives traffic from local -L listener.';

            const localEndpoint = formatEndpoint(forward.localHost || 'localhost', forward.localPort);
            const remoteEndpoint = formatEndpoint(forward.remoteHost || 'localhost', forward.remotePort);
            const canOpenLocalEndpoint =
              forward.type === 'local' && typeof forward.localPort === 'number' && forward.localPort > 0;
            const localEndpointUrl = canOpenLocalEndpoint
              ? `http://${toBrowserHost(forward.localHost)}:${forward.localPort}`
              : '';

            return (
              <div key={forward.id} className="rounded-md border border-[var(--interactive-border)] px-3 py-3 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="typography-ui-label text-foreground truncate">{buildForwardLabel(forward)}</div>
                    <div className="typography-micro text-muted-foreground/80">{forwardTypeDescription(forward.type)}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={forward.enabled} onCheckedChange={(checked) => updateForward((item) => ({ ...item, enabled: checked }))} />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-[var(--status-error)]"
                      onClick={() =>
                        updateDraft((current) => ({
                          ...current,
                          portForwards: current.portForwards.filter((item) => item.id !== forward.id),
                        }))
                      }
                    >
                      <RiDeleteBinLine className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="space-y-1 block">
                      <HintLabel label="Forward type" hint="-L local, -R remote, -D dynamic (SOCKS5 proxy)." />
                      <Select
                        value={forward.type}
                        onValueChange={(value) =>
                          updateForward((item) => ({
                            ...item,
                            type: (value === 'dynamic' || value === 'remote' ? value : 'local') as DesktopSshPortForwardType,
                          }))
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="local">Local (-L)</SelectItem>
                          <SelectItem value="remote">Remote (-R)</SelectItem>
                          <SelectItem value="dynamic">Dynamic (-D)</SelectItem>
                        </SelectContent>
                      </Select>
                    </label>
                  </div>

                  <div className={`grid gap-3 ${forward.type === 'dynamic' ? '' : 'lg:grid-cols-2'}`}>
                    <div className="rounded-md border border-[var(--interactive-border)] bg-[var(--surface-elevated)] p-3 space-y-2">
                      <div className="typography-micro text-muted-foreground/80">
                        {forward.type === 'remote' ? 'Local target' : 'Local side'}
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <label className="space-y-1 block">
                          <HintLabel label={localHostLabel} hint={localHostHint} />
                          <Input
                            value={forward.localHost || '127.0.0.1'}
                            onChange={(event) =>
                              updateForward((item) => ({
                                ...item,
                                localHost: event.target.value,
                              }))
                            }
                            placeholder="127.0.0.1"
                          />
                        </label>

                        <label className="space-y-1 block">
                          <HintLabel label={localPortLabel} hint={localPortHint} />
                          <Input
                            type="number"
                            min={1}
                            max={65535}
                            value={forward.localPort ?? ''}
                            onChange={(event) => {
                              const next = Number(event.target.value);
                              updateForward((item) => ({
                                ...item,
                                localPort: Number.isFinite(next) && next > 0 ? next : undefined,
                              }));
                            }}
                            placeholder="8080"
                          />
                        </label>
                      </div>
                    </div>

                    {forward.type !== 'dynamic' ? (
                      <div className="rounded-md border border-[var(--interactive-border)] bg-[var(--surface-elevated)] p-3 space-y-2">
                        <div className="typography-micro text-muted-foreground/80">
                          {forward.type === 'remote' ? 'Remote listen' : 'Remote target'}
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <label className="space-y-1 block">
                            <HintLabel label={remoteHostLabel} hint={remoteHostHint} />
                            <Input
                              value={forward.remoteHost || ''}
                              onChange={(event) =>
                                updateForward((item) => ({
                                  ...item,
                                  remoteHost: event.target.value,
                                }))
                              }
                              placeholder="127.0.0.1"
                            />
                          </label>

                          <label className="space-y-1 block">
                            <HintLabel label={remotePortLabel} hint={remotePortHint} />
                            <Input
                              type="number"
                              min={1}
                              max={65535}
                              value={forward.remotePort ?? ''}
                              onChange={(event) => {
                                const next = Number(event.target.value);
                                updateForward((item) => ({
                                  ...item,
                                  remotePort: Number.isFinite(next) && next > 0 ? next : undefined,
                                }));
                              }}
                              placeholder="80"
                            />
                          </label>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--interactive-border)] bg-[var(--surface-elevated)] px-2 py-1.5">
                  <div className="flex flex-wrap items-center gap-1 typography-micro text-muted-foreground/80">
                    {forward.type === 'dynamic' ? (
                      <>
                        <RiComputerLine className="h-3.5 w-3.5" />
                        <span className="font-mono text-foreground">{localEndpoint}</span>
                        <span>(local SOCKS5)</span>
                      </>
                    ) : forward.type === 'remote' ? (
                      <>
                        <RiServerLine className="h-3.5 w-3.5" />
                        <span className="font-mono text-foreground">{remoteEndpoint}</span>
                        <span>(remote)</span>
                        <RiArrowRightLine className="h-3.5 w-3.5" />
                        <RiComputerLine className="h-3.5 w-3.5" />
                        <span className="font-mono text-foreground">{localEndpoint}</span>
                        <span>(local)</span>
                      </>
                    ) : (
                      <>
                        <RiComputerLine className="h-3.5 w-3.5" />
                        <span className="font-mono text-foreground">{localEndpoint}</span>
                        <span>(local)</span>
                        <RiArrowRightLine className="h-3.5 w-3.5" />
                        <RiServerLine className="h-3.5 w-3.5" />
                        <span className="font-mono text-foreground">{remoteEndpoint}</span>
                        <span>(remote)</span>
                      </>
                    )}
                  </div>

                  {canOpenLocalEndpoint ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        void openExternalUrl(localEndpointUrl).then((opened) => {
                          if (!opened) {
                            toast.error('Failed to open local endpoint');
                          }
                        });
                      }}
                    >
                      <RiExternalLinkLine className="h-4 w-4" />
                      Open local
                    </Button>
                  ) : null}
                </div>
              </div>
            );
          })}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              updateDraft((current) => ({
                ...current,
                portForwards: [...current.portForwards, makeForward()],
              }))
            }
          >
            <RiAddLine className="h-4 w-4" />
            Add forward
          </Button>
        </div>
      </SettingsSection>

      <SettingsSection title="Import from SSH config" divider>
        {isImportsLoading ? (
          <p className="typography-meta text-muted-foreground">Loading SSH hosts...</p>
        ) : importCandidates.length === 0 ? (
          <p className="typography-meta text-muted-foreground">No SSH hosts available.</p>
        ) : (
          <div className="space-y-2">
            {importCandidates.slice(0, 8).map((candidate) => (
              <div key={`${candidate.source}:${candidate.host}`} className="flex items-center justify-between gap-2 rounded-md border border-[var(--interactive-border)] px-3 py-2">
                <div className="min-w-0">
                  <div className="typography-ui-label text-foreground truncate">
                    {candidate.host}
                    {candidate.pattern ? ' (pattern)' : ''}
                  </div>
                  <div className="typography-micro text-muted-foreground truncate">{candidate.sshCommand}</div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void handleImportCandidate(candidate.host, candidate.pattern)}
                >
                  Import
                </Button>
              </div>
            ))}
          </div>
        )}
      </SettingsSection>

      <div className="sticky bottom-0 z-10 -mx-3 sm:-mx-6 bg-[var(--surface-background)] border-t border-[var(--interactive-border)] px-3 sm:px-6 py-3">
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" onClick={() => void handleSave()} disabled={!hasChanges || isSaving}>
            Save changes
          </Button>
          {status?.localUrl ? (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  void copyTextToClipboard(status.localUrl || '').then((result) => {
                    if (result.ok) {
                      toast.success('Local URL copied');
                    }
                  });
                }}
              >
                <RiFileCopyLine className="h-4 w-4" />
                Copy local URL
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  void handleOpenCurrentInstance();
                }}
              >
                <RiExternalLinkLine className="h-4 w-4" />
                Open
              </Button>
            </>
          ) : null}
          {error ? <div className="ml-auto typography-meta text-[var(--status-error)]">{error}</div> : null}
        </div>
      </div>

      <Dialog open={logDialogOpen} onOpenChange={setLogDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>SSH Logs</DialogTitle>
            <DialogDescription>
              {draft?.nickname?.trim() || draft?.sshParsed?.destination || draft?.id || 'Selected instance'}
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={handleCopyAllLogs} disabled={logDialogLoading || !logLinesText.trim()}>
              <RiFileCopyLine className="h-4 w-4" />
              Copy all
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => void handleClearLogs()} disabled={logDialogLoading}>
              <RiDeleteBinLine className="h-4 w-4" />
              Clear
            </Button>
          </div>
          {logDialogLoading ? (
            <div className="typography-meta text-muted-foreground">Loading logs...</div>
          ) : logDialogError ? (
            <div className="typography-meta text-[var(--status-error)]">{logDialogError}</div>
          ) : (
            <pre className="max-h-[55vh] overflow-auto rounded-md border border-[var(--interactive-border)] bg-[var(--surface-elevated)] p-3 typography-micro text-foreground whitespace-pre-wrap break-words">
              {logDialogLines.length > 0 ? logDialogLines.join('\n') : 'No SSH logs yet.'}
            </pre>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(patternHost)}
        onOpenChange={(open) => {
          if (!open) {
            closePatternDialog();
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create from wildcard pattern</DialogTitle>
            <DialogDescription>
              {patternHost ? `${patternHost} requires a concrete destination.` : 'Enter destination.'}
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              handlePatternCreate();
            }}
          >
            <Input
              value={patternDestination}
              onChange={(event) => setPatternDestination(event.target.value)}
              placeholder="user@host"
              autoFocus
            />
            <div className="flex items-center justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={closePatternDialog} disabled={patternCreating}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={patternCreating}>
                Create
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </SettingsPageLayout>
  );
};
