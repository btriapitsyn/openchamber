import React from 'react';
import QRCode from 'qrcode';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui';
import { startDeviceFlow, pollDeviceToken, type DeviceStartResponse, type DevicePollingState } from '@/lib/auth/deviceFlow';
import { resolveInstanceApiBaseUrlAfterLogin } from '@/lib/auth/resolveInstanceAfterLogin';
import { setToken } from '@/lib/auth/tokenStorage';
import { useInstancesStore } from '@/stores/useInstancesStore';
import { useUIStore } from '@/stores/useUIStore';
import { openExternalUrl, writeTextToClipboard } from '@/lib/desktop';

type DeviceLoginViewProps = {
  forceOpen?: boolean;
};

type FlowState = 'idle' | 'starting' | 'pending' | 'denied' | 'expired' | 'error' | 'success';

export const DeviceLoginView: React.FC<DeviceLoginViewProps> = ({ forceOpen = false }) => {
  const instances = useInstancesStore((state) => state.instances);
  const addInstance = useInstancesStore((state) => state.addInstance);
  const setCurrentInstance = useInstancesStore((state) => state.setCurrentInstance);
  const setDefaultInstance = useInstancesStore((state) => state.setDefaultInstance);
  const touchInstance = useInstancesStore((state) => state.touchInstance);
  const setDeviceLoginOpen = useUIStore((state) => state.setDeviceLoginOpen);

  const [instanceUrl, setInstanceUrl] = React.useState('');
  const [deviceName, setDeviceName] = React.useState('');
  const [phase, setPhase] = React.useState<FlowState>('idle');
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [pollState, setPollState] = React.useState<DevicePollingState | null>(null);
  const [pollIntervalMs, setPollIntervalMs] = React.useState(5000);
  const [expiresAt, setExpiresAt] = React.useState<number | null>(null);
  const [flow, setFlow] = React.useState<(DeviceStartResponse & { apiBaseUrl: string }) | null>(null);
  const [qrDataUrl, setQrDataUrl] = React.useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = React.useState<number>(0);
  const pollAbortRef = React.useRef<AbortController | null>(null);

  const canClose = forceOpen ? instances.length > 0 : true;

  const clearPolling = React.useCallback(() => {
    if (pollAbortRef.current) {
      pollAbortRef.current.abort();
      pollAbortRef.current = null;
    }
  }, []);

  React.useEffect(() => {
    return () => {
      clearPolling();
    };
  }, [clearPolling]);

  React.useEffect(() => {
    if (!expiresAt) {
      setSecondsLeft(0);
      return;
    }
    const tick = () => {
      setSecondsLeft(Math.max(0, Math.floor((expiresAt - Date.now()) / 1000)));
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [expiresAt]);

  React.useEffect(() => {
    if (!flow) {
      setQrDataUrl(null);
      return;
    }

    const payload = `openchamber://device?instance=${encodeURIComponent(flow.apiBaseUrl)}`;
    void QRCode.toDataURL(payload, {
      margin: 1,
      width: 180,
      errorCorrectionLevel: 'M',
    })
      .then((next: string) => {
        setQrDataUrl(next);
      })
      .catch(() => {
        setQrDataUrl(null);
      });
  }, [flow]);

  const resetFlow = React.useCallback(() => {
    clearPolling();
    setFlow(null);
    setPhase('idle');
    setErrorMessage(null);
    setPollState(null);
    setPollIntervalMs(5000);
    setExpiresAt(null);
  }, [clearPolling]);

  const handleCancel = React.useCallback(() => {
    resetFlow();
    if (canClose) {
      setDeviceLoginOpen(false);
    }
  }, [canClose, resetFlow, setDeviceLoginOpen]);

  const handleStart = React.useCallback(async () => {
    setPhase('starting');
    setErrorMessage(null);

    let resolved;
    try {
      resolved = resolveInstanceApiBaseUrlAfterLogin({ enteredUrl: instanceUrl });
    } catch (error) {
      setPhase('error');
      setErrorMessage(error instanceof Error ? error.message : 'Invalid instance URL');
      return;
    }

    try {
      clearPolling();
      const started = await startDeviceFlow(resolved.apiBaseUrl, {
        name: deviceName.trim() || undefined,
      });
      const nextFlow = {
        ...started,
        apiBaseUrl: resolved.apiBaseUrl,
      };
      setFlow(nextFlow);
      setPhase('pending');
      setPollState('authorization_pending');
      setPollIntervalMs(Math.max(1000, started.interval * 1000));
      setExpiresAt(Date.now() + (started.expiresIn * 1000));

      const abortController = new AbortController();
      pollAbortRef.current = abortController;

      const token = await pollDeviceToken(resolved.apiBaseUrl, {
        deviceCode: started.deviceCode,
        intervalSeconds: started.interval,
        signal: abortController.signal,
        onUpdate: (update) => {
          setPollState(update.state);
          setPollIntervalMs(update.intervalMs);
        },
      });

      const instanceId = addInstance({
        apiBaseUrl: resolved.apiBaseUrl,
        label: resolved.origin,
      });
      setToken(instanceId, {
        accessToken: token.accessToken,
        tokenType: token.tokenType,
        expiresIn: token.expiresIn,
      });
      setDefaultInstance(instanceId);
      setCurrentInstance(instanceId);
      touchInstance(instanceId);

      setPhase('success');
      setDeviceLoginOpen(false);
      window.setTimeout(() => {
        window.location.reload();
      }, 150);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }
      const message = error instanceof Error ? error.message : 'Device login failed';
      if (message === 'access_denied') {
        setPhase('denied');
      } else if (message === 'expired_token') {
        setPhase('expired');
      } else {
        setPhase('error');
      }
      setErrorMessage(message);
    }
  }, [addInstance, clearPolling, deviceName, instanceUrl, setCurrentInstance, setDefaultInstance, setDeviceLoginOpen, touchInstance]);

  const handleCopy = React.useCallback(async (text: string, label: string) => {
    try {
      const copied = await writeTextToClipboard(text);
      if (!copied) {
        throw new Error('copy_failed');
      }
      toast.success(`${label} copied`);
    } catch {
      toast.error(`Failed to copy ${label.toLowerCase()}`);
    }
  }, []);

  const openVerificationUrl = React.useCallback(async (url: string) => {
    const opened = await openExternalUrl(url);
    if (!opened && typeof window !== 'undefined') {
      window.location.assign(url);
    }
  }, []);

  const canStart = phase !== 'starting' && phase !== 'pending' && instanceUrl.trim().length > 0;
  const waiting = phase === 'pending';

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-8 text-foreground sm:px-6">
      <div className="pointer-events-none absolute inset-0 opacity-60" style={{ background: 'radial-gradient(110% 150% at 50% -30%, var(--surface-overlay) 0%, transparent 68%)' }} />

      <div className="relative z-10 w-full max-w-2xl rounded-2xl border border-border/50 bg-card/90 p-4 shadow-sm backdrop-blur sm:p-6">
        <div className="mb-4 space-y-1">
          <h1 className="typography-ui-header font-semibold text-foreground">Device Login</h1>
          <p className="typography-meta text-muted-foreground">Add a remote OpenChamber instance and approve this device from Settings.</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <label htmlFor="device-instance-url" className="typography-ui-label text-foreground">Instance URL</label>
            <Input
              id="device-instance-url"
              value={instanceUrl}
              onChange={(event) => setInstanceUrl(event.target.value)}
              placeholder="https://example.com or https://example.com/api"
              disabled={waiting}
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <label htmlFor="device-name" className="typography-ui-label text-foreground">Device Name (optional)</label>
            <Input
              id="device-name"
              value={deviceName}
              onChange={(event) => setDeviceName(event.target.value)}
              placeholder="My phone"
              disabled={waiting}
            />
          </div>
        </div>

        {!flow ? null : (
          <div className="mt-4 grid gap-4 rounded-xl border border-border/50 bg-background/60 p-3 sm:grid-cols-[1fr_auto] sm:items-start">
            <div className="space-y-2">
              <div>
                <div className="typography-meta text-muted-foreground">Code</div>
                <div className="typography-ui-header font-mono text-foreground">{flow.userCode}</div>
              </div>
              <div>
                <div className="typography-meta text-muted-foreground">Verification URL</div>
                <div className="typography-meta break-all text-foreground">{flow.verificationUriComplete || flow.verificationUri}</div>
              </div>
              <div className="typography-meta text-muted-foreground">Expires in {secondsLeft}s</div>
              <div className="typography-meta text-muted-foreground">Polling every {Math.max(1, Math.round(pollIntervalMs / 1000))}s {pollState ? `(${pollState})` : ''}</div>
            </div>

            <div className="flex flex-col items-center gap-2">
              {qrDataUrl ? <img src={qrDataUrl} alt="Device login QR" className="h-[180px] w-[180px] rounded border border-border/60 bg-background" /> : null}
              <Button type="button" variant="outline" size="sm" onClick={() => void handleCopy(flow.userCode, 'Code')}>Copy Code</Button>
              <Button type="button" variant="outline" size="sm" onClick={() => void openVerificationUrl(flow.verificationUriComplete || flow.verificationUri)}>Open Verification</Button>
            </div>
          </div>
        )}

        {errorMessage ? (
          <div className="mt-3 rounded-lg border border-status-error-border bg-status-error-background px-3 py-2 typography-meta text-status-error-foreground">
            {errorMessage}
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button type="button" onClick={() => void handleStart()} disabled={!canStart}>{waiting ? 'Waiting for approval...' : 'Add'}</Button>
          {flow ? <Button type="button" variant="outline" onClick={resetFlow}>Retry</Button> : null}
          <Button type="button" variant="ghost" onClick={handleCancel} disabled={!canClose && !flow}>Cancel</Button>
        </div>
      </div>
    </div>
  );
};
