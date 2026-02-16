import React from 'react';
import { useInstancesStore } from '@/stores/useInstancesStore';
import { useUIStore } from '@/stores/useUIStore';
import { DeviceLoginView } from './DeviceLoginView';
import type { RuntimeAPIs } from '@/lib/api/types';
import { isMobileRuntime } from '@/lib/desktop';
import {
  isLikelyLocalHostname,
  isLocalOpenChamberHealthPayload,
  shouldBypassDeviceLoginForVerification,
  shouldForceDeviceLogin,
} from '@/lib/auth/deviceLoginGate';

type DeviceLoginGateProps = {
  children: React.ReactNode;
};

export const DeviceLoginGate: React.FC<DeviceLoginGateProps> = ({ children }) => {
  const hydrated = useInstancesStore((state) => state.hydrated);
  const instancesCount = useInstancesStore((state) => state.instances.length);
  const isDeviceLoginOpen = useUIStore((state) => state.isDeviceLoginOpen);
  const [localSidecarStatus, setLocalSidecarStatus] = React.useState<'unknown' | 'running' | 'not-running'>('unknown');

  const runtime = React.useMemo(() => {
    if (typeof window === 'undefined') {
      return { hasDesktopSidecar: false, isMobileRuntime: false };
    }
    const runtimeApis = (window as typeof window & { __OPENCHAMBER_RUNTIME_APIS__?: RuntimeAPIs }).__OPENCHAMBER_RUNTIME_APIS__;
    return {
      hasDesktopSidecar: Boolean(runtimeApis?.runtime?.isDesktop && window.__OPENCHAMBER_DESKTOP_SERVER__?.origin),
      isMobileRuntime: isMobileRuntime(),
    };
  }, []);

  const hasDesktopSidecar = runtime.hasDesktopSidecar;
  const bypassDeviceLoginGate = React.useMemo(() => {
    if (typeof window === 'undefined') {
      return false;
    }
    return shouldBypassDeviceLoginForVerification(window.location.search);
  }, []);

  React.useEffect(() => {
    if (!hydrated || instancesCount !== 0 || hasDesktopSidecar) {
      return;
    }

    if (runtime.isMobileRuntime) {
      setLocalSidecarStatus('not-running');
      return;
    }

    if (typeof window === 'undefined') {
      setLocalSidecarStatus('not-running');
      return;
    }

    const host = window.location.hostname;
    const isLocalHost = isLikelyLocalHostname(host);
    if (!isLocalHost) {
      setLocalSidecarStatus('not-running');
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 2000);

    void fetch('/health', {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          return null;
        }
        return response.json().catch(() => null);
      })
      .then((payload) => {
        if (cancelled) {
          return;
        }
        const running = isLocalOpenChamberHealthPayload(payload);
        setLocalSidecarStatus(running ? 'running' : 'not-running');
      })
      .catch(() => {
        if (!cancelled) {
          setLocalSidecarStatus('not-running');
        }
      })
      .finally(() => {
        window.clearTimeout(timer);
      });

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [hydrated, instancesCount, hasDesktopSidecar, runtime.isMobileRuntime]);

  const mustGate = shouldForceDeviceLogin({ hydrated, instancesCount, hasDesktopSidecar, localSidecarStatus });

  if (bypassDeviceLoginGate) {
    return <>{children}</>;
  }

  if (hydrated && instancesCount === 0 && !hasDesktopSidecar && localSidecarStatus === 'unknown' && !isDeviceLoginOpen) {
    return <>{children}</>;
  }

  if (mustGate || isDeviceLoginOpen) {
    return <DeviceLoginView forceOpen={mustGate} />;
  }

  return <>{children}</>;
};
