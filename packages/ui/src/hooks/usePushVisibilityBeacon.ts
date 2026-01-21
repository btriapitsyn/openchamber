import React from 'react';
import { isWebRuntime } from '@/lib/desktop';
import { getRegisteredRuntimeAPIs } from '@/contexts/runtimeAPIRegistry';

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

    report();

    document.addEventListener('visibilitychange', report);
    window.addEventListener('pagehide', report);
    window.addEventListener('pageshow', report);

    return () => {
      document.removeEventListener('visibilitychange', report);
      window.removeEventListener('pagehide', report);
      window.removeEventListener('pageshow', report);
    };
  }, []);
};
