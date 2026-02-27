import React from 'react';
import QRCode from 'qrcode';
import {
  RiCheckLine,
  RiErrorWarningLine,
  RiFileCopyLine,
  RiLoader4Line,
  RiRestartLine,
} from '@remixicon/react';
import { toast } from '@/components/ui';
import { ButtonSmall } from '@/components/ui/button-small';
import { GridLoader } from '@/components/ui/grid-loader';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { updateDesktopSettings } from '@/lib/persistence';
import { cn } from '@/lib/utils';

type TunnelState =
  | 'checking'
  | 'not-available'
  | 'idle'
  | 'starting'
  | 'active'
  | 'stopping'
  | 'error';

type TtlOption = { value: string; label: string; ms: number | null };

const BOOTSTRAP_TTL_OPTIONS: TtlOption[] = [
  { value: '180000', label: '3 minutes (recommended)', ms: 3 * 60 * 1000 },
  { value: '1800000', label: '30 minutes', ms: 30 * 60 * 1000 },
  { value: '7200000', label: '2 hours', ms: 2 * 60 * 60 * 1000 },
  { value: '28800000', label: '8 hours', ms: 8 * 60 * 60 * 1000 },
  { value: '86400000', label: '24 hours', ms: 24 * 60 * 60 * 1000 },
  { value: 'never', label: 'Never expires (risky)', ms: null },
];

const SESSION_TTL_OPTIONS: TtlOption[] = [
  { value: '3600000', label: '1 hour', ms: 60 * 60 * 1000 },
  { value: '28800000', label: '8 hours (workday)', ms: 8 * 60 * 60 * 1000 },
  { value: '43200000', label: '12 hours', ms: 12 * 60 * 60 * 1000 },
  { value: '86400000', label: '24 hours', ms: 24 * 60 * 60 * 1000 },
];

interface TunnelInfo {
  url: string;
  connectUrl: string | null;
  bootstrapExpiresAt: number | null;
}

interface TunnelStatusResponse {
  active: boolean;
  url: string | null;
  hasBootstrapToken?: boolean;
  bootstrapExpiresAt?: number | null;
  policy?: string;
  ttlConfig?: {
    bootstrapTtlMs?: number | null;
    sessionTtlMs?: number;
  };
}

const ttlOptionValue = (options: TtlOption[], ttlMs: number | null, fallback: string) => {
  const matched = options.find((entry) => entry.ms === ttlMs);
  return matched?.value || fallback;
};

const formatRemaining = (remainingMs: number): string => {
  const safeMs = Math.max(0, remainingMs);
  const totalSeconds = Math.floor(safeMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
};

export const TunnelSettings: React.FC = () => {
  const [state, setState] = React.useState<TunnelState>('checking');
  const [tunnelInfo, setTunnelInfo] = React.useState<TunnelInfo | null>(null);
  const [qrDataUrl, setQrDataUrl] = React.useState<string | null>(null);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);
  const [isSavingTtl, setIsSavingTtl] = React.useState(false);
  const [bootstrapTtlMs, setBootstrapTtlMs] = React.useState<number | null>(3 * 60 * 1000);
  const [sessionTtlMs, setSessionTtlMs] = React.useState<number>(8 * 60 * 60 * 1000);
  const [remainingText, setRemainingText] = React.useState<string>('');

  const checkAvailabilityAndStatus = React.useCallback(async (signal: AbortSignal) => {
    try {
      const [checkRes, statusRes, settingsRes] = await Promise.all([
        fetch('/api/openchamber/tunnel/check', { signal }),
        fetch('/api/openchamber/tunnel/status', { signal }),
        fetch('/api/config/settings', { signal, headers: { Accept: 'application/json' } }),
      ]);

      const checkData = await checkRes.json();
      const statusData = (await statusRes.json()) as TunnelStatusResponse;
      const settingsData = settingsRes.ok ? await settingsRes.json() : {};

      const loadedBootstrapTtl = statusData.ttlConfig?.bootstrapTtlMs
        ?? (settingsData?.tunnelBootstrapTtlMs === null
          ? null
          : typeof settingsData?.tunnelBootstrapTtlMs === 'number'
            ? settingsData.tunnelBootstrapTtlMs
            : 3 * 60 * 1000);
      const loadedSessionTtl = typeof statusData.ttlConfig?.sessionTtlMs === 'number'
        ? statusData.ttlConfig.sessionTtlMs
        : typeof settingsData?.tunnelSessionTtlMs === 'number'
          ? settingsData.tunnelSessionTtlMs
          : 8 * 60 * 60 * 1000;

      setBootstrapTtlMs(loadedBootstrapTtl);
      setSessionTtlMs(loadedSessionTtl);

      if (statusData.active && statusData.url) {
        setTunnelInfo({
          url: statusData.url,
          connectUrl: null,
          bootstrapExpiresAt: typeof statusData.bootstrapExpiresAt === 'number' ? statusData.bootstrapExpiresAt : null,
        });
        setState('active');
        return;
      }

      setState(checkData.available ? 'idle' : 'not-available');
    } catch {
      if (!signal.aborted) {
        setState('error');
        setErrorMessage('Failed to check tunnel availability');
      }
    }
  }, []);

  React.useEffect(() => {
    const controller = new AbortController();
    void checkAvailabilityAndStatus(controller.signal);
    return () => controller.abort();
  }, [checkAvailabilityAndStatus]);

  React.useEffect(() => {
    if (!tunnelInfo?.connectUrl) {
      setQrDataUrl(null);
      return;
    }

    let cancelled = false;
    QRCode.toDataURL(tunnelInfo.connectUrl, {
      width: 256,
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' },
    }).then((dataUrl) => {
      if (!cancelled) {
        setQrDataUrl(dataUrl);
      }
    }).catch(() => {
      if (!cancelled) {
        setQrDataUrl(null);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [tunnelInfo?.connectUrl]);

  React.useEffect(() => {
    if (!tunnelInfo?.bootstrapExpiresAt) {
      setRemainingText('No expiry');
      return;
    }

    const updateRemaining = () => {
      const remaining = tunnelInfo.bootstrapExpiresAt ? tunnelInfo.bootstrapExpiresAt - Date.now() : 0;
      if (remaining <= 0) {
        setRemainingText('Expired');
      } else {
        setRemainingText(formatRemaining(remaining));
      }
    };

    updateRemaining();
    const timer = window.setInterval(updateRemaining, 1000);
    return () => window.clearInterval(timer);
  }, [tunnelInfo?.bootstrapExpiresAt]);

  const saveTtlSettings = React.useCallback(async (nextBootstrapTtlMs: number | null, nextSessionTtlMs: number) => {
    setIsSavingTtl(true);
    try {
      await updateDesktopSettings({
        tunnelBootstrapTtlMs: nextBootstrapTtlMs,
        tunnelSessionTtlMs: nextSessionTtlMs,
      });
    } catch {
      toast.error('Failed to save tunnel TTL settings');
    } finally {
      setIsSavingTtl(false);
    }
  }, []);

  const handleStart = React.useCallback(async () => {
    setState('starting');
    setErrorMessage(null);

    try {
      const res = await fetch('/api/openchamber/tunnel/start', { method: 'POST' });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        setState('error');
        setErrorMessage(data.error || 'Failed to start tunnel');
        toast.error(data.error || 'Failed to start tunnel');
        return;
      }

      setTunnelInfo({
        url: data.url,
        connectUrl: typeof data.connectUrl === 'string' ? data.connectUrl : null,
        bootstrapExpiresAt: typeof data.bootstrapExpiresAt === 'number' ? data.bootstrapExpiresAt : null,
      });
      setState('active');
      toast.success('Tunnel link ready');
    } catch {
      setState('error');
      setErrorMessage('Failed to start tunnel');
      toast.error('Failed to start tunnel');
    }
  }, []);

  const handleStop = React.useCallback(async () => {
    setState('stopping');

    try {
      await fetch('/api/openchamber/tunnel/stop', { method: 'POST' });
      setTunnelInfo(null);
      setQrDataUrl(null);
      setState('idle');
      toast.success('Tunnel stopped');
    } catch {
      setState('error');
      setErrorMessage('Failed to stop tunnel');
      toast.error('Failed to stop tunnel');
    }
  }, []);

  const handleCopyUrl = React.useCallback(async () => {
    if (!tunnelInfo?.connectUrl) {
      return;
    }

    try {
      await navigator.clipboard.writeText(tunnelInfo.connectUrl);
      setCopied(true);
      toast.success('Connect link copied');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy URL');
    }
  }, [tunnelInfo?.connectUrl]);

  const handleBootstrapTtlChange = React.useCallback(async (value: string) => {
    const option = BOOTSTRAP_TTL_OPTIONS.find((entry) => entry.value === value);
    if (!option) {
      return;
    }
    if (option.ms === null) {
      const confirmed = window.confirm('Never-expiring connect links are less secure. Continue?');
      if (!confirmed) {
        return;
      }
    }
    setBootstrapTtlMs(option.ms);
    await saveTtlSettings(option.ms, sessionTtlMs);
  }, [saveTtlSettings, sessionTtlMs]);

  const handleSessionTtlChange = React.useCallback(async (value: string) => {
    const option = SESSION_TTL_OPTIONS.find((entry) => entry.value === value);
    if (!option || option.ms === null) {
      return;
    }
    setSessionTtlMs(option.ms);
    await saveTtlSettings(bootstrapTtlMs, option.ms);
  }, [bootstrapTtlMs, saveTtlSettings]);

  if (state === 'checking') {
    return (
      <div className="flex items-center justify-center py-12">
        <GridLoader size="sm" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h3 className="typography-ui-header font-medium text-foreground">Remote Tunnel</h3>
        <p className="typography-meta mt-1 text-muted-foreground/70">
          Share a one-time connect link for secure remote access through Cloudflare Quick Tunnel.
        </p>
      </div>

      {state === 'not-available' && (
        <section className="space-y-2 px-2 pb-2 pt-0">
          <div className="flex items-start gap-2 rounded-lg border border-[var(--status-warning)]/30 bg-[var(--status-warning)]/5 p-3">
            <RiErrorWarningLine className="mt-0.5 size-4 shrink-0 text-[var(--status-warning)]" />
            <div className="space-y-1">
              <p className="typography-meta font-medium text-foreground">cloudflared not found</p>
              <p className="typography-meta text-muted-foreground/70">Install it to enable remote tunnel access:</p>
              <code className="typography-code block rounded bg-muted/50 px-2 py-1 text-xs text-foreground">
                brew install cloudflared
              </code>
            </div>
          </div>
        </section>
      )}

      {state !== 'not-available' && (
        <section className="space-y-3 px-2 pb-2 pt-0">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <p className="typography-ui-label text-foreground">Connect link TTL</p>
              <Select
                value={ttlOptionValue(BOOTSTRAP_TTL_OPTIONS, bootstrapTtlMs, '180000')}
                onValueChange={(value) => {
                  void handleBootstrapTtlChange(value);
                }}
                disabled={isSavingTtl || state === 'starting' || state === 'stopping'}
              >
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BOOTSTRAP_TTL_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <p className="typography-ui-label text-foreground">Tunnel session TTL</p>
              <Select
                value={ttlOptionValue(SESSION_TTL_OPTIONS, sessionTtlMs, '28800000')}
                onValueChange={(value) => {
                  void handleSessionTtlChange(value);
                }}
                disabled={isSavingTtl || state === 'starting' || state === 'stopping'}
              >
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SESSION_TTL_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {bootstrapTtlMs === null && (
            <div className="rounded-lg border border-[var(--status-warning)]/35 bg-[var(--status-warning)]/10 p-2.5">
              <p className="typography-meta text-[var(--status-warning)]">
                Warning: never-expiring connect links increase risk if the URL leaks. Rotate links frequently.
              </p>
            </div>
          )}
        </section>
      )}

      {(state === 'idle' || state === 'starting') && (
        <section className="space-y-3 px-2 pb-2 pt-0">
          <ButtonSmall
            variant="ghost"
            onClick={handleStart}
            disabled={state === 'starting'}
            className={cn('gap-2', state === 'starting' && 'opacity-70')}
          >
            {state === 'starting'
              ? <><RiLoader4Line className="size-3.5 animate-spin" /> Starting tunnel...</>
              : 'Start Tunnel'}
          </ButtonSmall>
        </section>
      )}

      {(state === 'active' || state === 'stopping') && tunnelInfo && (
        <section className="space-y-4 px-2 pb-2 pt-0">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="size-2 shrink-0 rounded-full bg-[var(--status-success)]" />
              <p className="typography-meta font-medium text-foreground">Tunnel active</p>
            </div>

            <div>
              <p className="typography-meta mb-1 text-muted-foreground/70">Public URL</p>
              <code className="typography-code block truncate rounded bg-muted/50 px-2 py-1 text-xs text-foreground">
                {tunnelInfo.url}
              </code>
            </div>

            {tunnelInfo.connectUrl ? (
              <>
                <div>
                  <p className="typography-meta mb-1 text-muted-foreground/70">Connect link</p>
                  <div className="flex items-center gap-2">
                    <code className="typography-code flex-1 truncate rounded bg-muted/50 px-2 py-1 text-xs text-foreground">
                      {tunnelInfo.connectUrl}
                    </code>
                    <ButtonSmall variant="ghost" onClick={handleCopyUrl} className="shrink-0 gap-1.5">
                      {copied
                        ? <RiCheckLine className="size-3.5 text-[var(--status-success)]" />
                        : <RiFileCopyLine className="size-3.5" />}
                      {copied ? 'Copied' : 'Copy'}
                    </ButtonSmall>
                  </div>
                  <p className="typography-meta mt-1 text-muted-foreground/70">
                    Expires: {tunnelInfo.bootstrapExpiresAt ? remainingText : 'Never'}
                  </p>
                </div>

                {qrDataUrl && (
                  <div className="flex flex-col items-center gap-2 rounded-lg border border-border/50 bg-[var(--surface-elevated)] p-4">
                    <img src={qrDataUrl} alt="Tunnel connect QR code" className="size-48" />
                    <p className="typography-meta text-muted-foreground">Scan with your phone to connect</p>
                  </div>
                )}
              </>
            ) : (
              <div className="rounded-lg border border-border/50 bg-muted/30 p-3">
                <p className="typography-meta text-muted-foreground">
                  Generate a fresh one-time connect link to share with your other device.
                </p>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <ButtonSmall
              variant="ghost"
              onClick={handleStart}
              disabled={state === 'stopping'}
              className="gap-2"
            >
              <RiRestartLine className="size-3.5" />
              Rotate link
            </ButtonSmall>

            <ButtonSmall
              variant="ghost"
              onClick={handleStop}
              disabled={state === 'stopping'}
              className="gap-2 text-[var(--status-error)]"
            >
              {state === 'stopping'
                ? <><RiLoader4Line className="size-3.5 animate-spin" /> Stopping...</>
                : 'Stop Tunnel'}
            </ButtonSmall>
          </div>
        </section>
      )}

      {state === 'error' && (
        <section className="space-y-3 px-2 pb-2 pt-0">
          <p className="typography-meta text-[var(--status-error)]">{errorMessage || 'An error occurred'}</p>
          <ButtonSmall variant="ghost" onClick={handleStart}>Retry</ButtonSmall>
        </section>
      )}

      <div className="px-2">
        <p className="typography-meta text-muted-foreground/60">
          Tunnel access is enforced server-side. Connect links are one-time and are revoked when tunnel stops.
        </p>
      </div>
    </div>
  );
};
