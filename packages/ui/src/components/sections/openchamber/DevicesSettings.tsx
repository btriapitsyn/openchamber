import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui';
import { resolveRuntimeApiBaseUrl } from '@/lib/instances/runtimeApiBaseUrl';
import { useUIStore } from '@/stores/useUIStore';
import { authenticateWithBiometrics, getBiometricStatus, isNativeMobileApp } from '@/lib/desktop';
import { Switch } from '@/components/ui/switch';

type DeviceRecord = {
  id: string;
  name: string;
  createdAt: number;
  lastUsedAt: number | null;
  expiresAt: number;
  userAgent?: string;
  platform?: { os?: string; model?: string };
};

type DevicesSettingsProps = {
  prefillUserCode?: string | null;
};

const formatTimestamp = (value: number | null): string => {
  if (!value || !Number.isFinite(value)) {
    return 'Never';
  }
  try {
    return new Date(value).toLocaleString();
  } catch {
    return 'Never';
  }
};

const getApiBase = (): string => resolveRuntimeApiBaseUrl().replace(/\/+$/, '');

export const DevicesSettings: React.FC<DevicesSettingsProps> = ({ prefillUserCode }) => {
  const setDeviceLoginOpen = useUIStore((state) => state.setDeviceLoginOpen);
  const biometricLockEnabled = useUIStore((state) => state.biometricLockEnabled);
  const setBiometricLockEnabled = useUIStore((state) => state.setBiometricLockEnabled);
  const isNativeMobile = React.useMemo(() => isNativeMobileApp(), []);
  const [devices, setDevices] = React.useState<DeviceRecord[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [approveCode, setApproveCode] = React.useState(prefillUserCode || '');
  const [approveName, setApproveName] = React.useState('');
  const [approveError, setApproveError] = React.useState<string | null>(null);
  const [biometricAvailable, setBiometricAvailable] = React.useState(false);

  React.useEffect(() => {
    if (typeof prefillUserCode === 'string' && prefillUserCode.trim().length > 0) {
      setApproveCode(prefillUserCode.trim());
    }
  }, [prefillUserCode]);

  React.useEffect(() => {
    if (!isNativeMobile) {
      setBiometricAvailable(false);
      return;
    }

    void getBiometricStatus().then((status) => {
      setBiometricAvailable(status.isAvailable);
    });
  }, [isNativeMobile]);

  const loadDevices = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${getApiBase()}/auth/devices`, {
        method: 'GET',
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });
      const payload = (await response.json().catch(() => null)) as { devices?: DeviceRecord[]; error?: string } | null;
      if (!response.ok || !payload) {
        throw new Error(payload?.error || response.statusText || 'Failed to load devices');
      }
      setDevices(Array.isArray(payload.devices) ? payload.devices : []);
    } catch (error) {
      console.error('Failed to load devices:', error);
      toast.error('Failed to load devices');
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadDevices();
  }, [loadDevices]);

  const approveDevice = React.useCallback(async () => {
    const userCode = approveCode.trim();
    if (!userCode) {
      setApproveError('User code is required');
      return;
    }

    setBusyId('approve');
    setApproveError(null);
    try {
      const response = await fetch(`${getApiBase()}/auth/devices/approve`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ user_code: userCode, name: approveName.trim() || undefined }),
      });
      const payload = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!response.ok || !payload?.ok) {
        const errorCode = payload?.error || 'invalid_code';
        const message = errorCode === 'expired_token'
          ? 'Code expired'
          : errorCode === 'not_found'
            ? 'Code not found'
            : 'Unable to approve device';
        setApproveError(message);
        return;
      }

      setApproveCode('');
      setApproveName('');
      toast.success('Device approved');
      await loadDevices();
    } catch (error) {
      console.error('Failed to approve device:', error);
      setApproveError('Unable to approve device');
    } finally {
      setBusyId(null);
    }
  }, [approveCode, approveName, loadDevices]);

  const updateName = React.useCallback(async (id: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }
    setBusyId(`rename:${id}`);
    try {
      const response = await fetch(`${getApiBase()}/auth/devices/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!response.ok) {
        throw new Error(response.statusText || 'Failed to update device');
      }
      toast.success('Device updated');
      await loadDevices();
    } catch (error) {
      console.error('Failed to update device:', error);
      toast.error('Failed to update device');
    } finally {
      setBusyId(null);
    }
  }, [loadDevices]);

  const revokeDevice = React.useCallback(async (id: string) => {
    setBusyId(`revoke:${id}`);
    try {
      const response = await fetch(`${getApiBase()}/auth/devices/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) {
        throw new Error(response.statusText || 'Failed to revoke device');
      }
      setDevices((prev) => prev.filter((entry) => entry.id !== id));
      toast.success('Device revoked');
    } catch (error) {
      console.error('Failed to revoke device:', error);
      toast.error('Failed to revoke device');
    } finally {
      setBusyId(null);
    }
  }, []);

  const handleBiometricToggle = React.useCallback(async (checked: boolean) => {
    if (!isNativeMobile) {
      setBiometricLockEnabled(false);
      return;
    }

    if (!checked) {
      setBiometricLockEnabled(false);
      return;
    }

    const status = await getBiometricStatus();
    if (!status.isAvailable) {
      setBiometricLockEnabled(false);
      toast.error('Biometric authentication is unavailable on this device');
      return;
    }

    const authenticated = await authenticateWithBiometrics('Unlock OpenChamber', {
      allowDeviceCredential: true,
      title: 'Unlock OpenChamber',
      subtitle: 'Use biometrics to enable app lock',
      confirmationRequired: false,
    });

    if (!authenticated) {
      setBiometricLockEnabled(false);
      toast.error('Biometric verification failed');
      return;
    }

    setBiometricLockEnabled(true);
    toast.success('Biometric lock enabled');
  }, [isNativeMobile, setBiometricLockEnabled]);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h3 className="typography-ui-header font-semibold text-foreground">Devices</h3>
        <p className="typography-meta text-muted-foreground">Approve pending devices and revoke existing tokens.</p>
      </div>

      {isNativeMobile && (
        <div className="flex items-center justify-between rounded-lg border border-border/50 bg-background/60 p-3">
          <div className="space-y-0.5">
            <div className="typography-ui text-foreground">Require biometric unlock</div>
            <p className="typography-micro text-muted-foreground">
              Protect app access with Face ID or fingerprint.
            </p>
          </div>
          <Switch
            checked={biometricLockEnabled && biometricAvailable}
            onCheckedChange={(checked) => {
              void handleBiometricToggle(checked);
            }}
            disabled={!biometricAvailable && !biometricLockEnabled}
            className="data-[state=checked]:bg-status-info"
          />
        </div>
      )}

      <div className="space-y-3 rounded-lg border border-border/50 bg-background/60 p-3">
        <div className="typography-ui-label text-foreground">Approve Device</div>
        <Input
          value={approveCode}
          onChange={(event) => {
            setApproveCode(event.target.value);
            if (approveError) {
              setApproveError(null);
            }
          }}
          placeholder="XXXX-YYYY"
        />
        <Input
          value={approveName}
          onChange={(event) => setApproveName(event.target.value)}
          placeholder="Optional display name"
        />
        {approveError ? <p className="typography-meta text-status-error">{approveError}</p> : null}
        <div className="flex justify-end">
          <Button type="button" onClick={() => void approveDevice()} disabled={busyId === 'approve'}>Approve</Button>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="typography-ui-label text-foreground">Registered Devices</div>
          <div className="flex items-center gap-1">
            <Button type="button" variant="ghost" size="sm" onClick={() => setDeviceLoginOpen(true)}>Add Instance</Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => void loadDevices()} disabled={isLoading}>Refresh</Button>
          </div>
        </div>

        <div className="space-y-2">
          {devices.length === 0 && !isLoading ? (
            <div className="rounded-lg border border-border/40 bg-background/50 px-3 py-2 typography-meta text-muted-foreground">No devices yet.</div>
          ) : null}

          {devices.map((device) => (
            <DeviceItem
              key={device.id}
              device={device}
              busyId={busyId}
              onRename={updateName}
              onRevoke={revokeDevice}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

const DeviceItem: React.FC<{
  device: DeviceRecord;
  busyId: string | null;
  onRename: (id: string, name: string) => Promise<void>;
  onRevoke: (id: string) => Promise<void>;
}> = ({ device, busyId, onRename, onRevoke }) => {
  const [name, setName] = React.useState(device.name);

  React.useEffect(() => {
    setName(device.name);
  }, [device.name]);

  return (
    <div className="rounded-lg border border-border/40 bg-background/50 p-3">
      <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-start">
        <div className="space-y-2">
          <Input value={name} onChange={(event) => setName(event.target.value)} />
          <div className="typography-meta text-muted-foreground">Platform: {device.platform?.model || device.platform?.os || 'Unknown'}</div>
          <div className="typography-meta text-muted-foreground">Last used: {formatTimestamp(device.lastUsedAt)}</div>
          <div className="typography-meta text-muted-foreground">Expires: {formatTimestamp(device.expiresAt)}</div>
        </div>
        <div className="flex gap-2 sm:flex-col">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void onRename(device.id, name)}
            disabled={busyId === `rename:${device.id}`}
          >
            Save
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void onRevoke(device.id)}
            disabled={busyId === `revoke:${device.id}`}
          >
            Revoke
          </Button>
        </div>
      </div>
    </div>
  );
};
