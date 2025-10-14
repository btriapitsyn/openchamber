import React from 'react';
import { isDesktopRuntime, sendWindowControl } from '@/lib/desktop';

const isMacPlatform = () =>
  typeof navigator !== 'undefined' && /Macintosh|Mac OS X/.test(navigator.userAgent || '');

export const MacWindowControls: React.FC = () => {
  const [enabled, setEnabled] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    if (isDesktopRuntime() && isMacPlatform()) {
      setEnabled(true);
    }
  }, []);

  if (!enabled) {
    return null;
  }

  return (
    <div className="mac-window-controls-container app-region-no-drag">
      <div className="mac-window-controls-region">
        <button
          type="button"
          aria-label="Close window"
          className="mac-window-control mac-window-control--close"
          onClick={() => void sendWindowControl('close')}
        />
        <button
          type="button"
          aria-label="Minimize window"
          className="mac-window-control mac-window-control--minimize"
          onClick={() => void sendWindowControl('minimize')}
        />
        <button
          type="button"
          aria-label="Zoom window"
          className="mac-window-control mac-window-control--maximize"
          onClick={() => void sendWindowControl('maximize')}
        />
      </div>
    </div>
  );
};
