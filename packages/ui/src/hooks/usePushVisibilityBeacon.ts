import React from 'react';
import { isWebRuntime } from '@/lib/desktop';
import { getRegisteredRuntimeAPIs } from '@/contexts/runtimeAPIRegistry';

const HEARTBEAT_MS = 10000;

const sendVisibility = (visible: boolean) => {
  if (!isWebRuntime()) {
    return;
  }

  const apis = getRegisteredRuntimeAPIs();
  if (!apis?.push?.setVisibility) {
    return;
  }

  void apis.push.setVisibility({ visible });
};

export const usePushVisibilityBeacon = () => {
  React.useEffect(() => {
    if (!isWebRuntime() || typeof document === 'undefined') {
      return;
    }

    const report = () => {
      sendVisibility(document.visibilityState === 'visible');
    };

    const reportVisibleOnly = () => {
      if (document.visibilityState === 'visible') {
        sendVisibility(true);
      }
    };

    report();

    // Heartbeat while visible so server TTL (30s) never expires.
    const interval = window.setInterval(reportVisibleOnly, HEARTBEAT_MS);

    document.addEventListener('visibilitychange', report);
    window.addEventListener('pagehide', report);
    window.addEventListener('pageshow', report);
    window.addEventListener('focus', report);
    window.addEventListener('blur', report);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', report);
      window.removeEventListener('pagehide', report);
      window.removeEventListener('pageshow', report);
      window.removeEventListener('focus', report);
      window.removeEventListener('blur', report);
    };
  }, []);
};
