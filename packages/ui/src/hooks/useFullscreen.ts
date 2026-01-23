import { useState, useEffect } from 'react';

/**
 * Hook to detect fullscreen mode in Tauri desktop apps.
 * Returns true when the window is in fullscreen mode.
 *
 * This is important because `app-region-drag` CSS classes interfere
 * with HTML5 drag-and-drop in fullscreen mode (even though window
 * dragging doesn't make sense in fullscreen).
 */
export function useFullscreen(): boolean {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Check if we're in a Tauri desktop app
    const isDesktop = typeof (window as typeof window & { opencodeDesktop?: unknown }).opencodeDesktop !== 'undefined';
    if (!isDesktop) return;

    let unlisten: (() => void) | undefined;

    const setupListener = async () => {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        const appWindow = getCurrentWindow();

        // Get initial fullscreen state
        const initial = await appWindow.isFullscreen();
        setIsFullscreen(initial);

        // Listen for fullscreen state changes
        unlisten = await appWindow.onResized(async () => {
          // Check fullscreen state after resize events
          const fs = await appWindow.isFullscreen();
          setIsFullscreen(fs);
        });
      } catch (error) {
        console.error('Failed to setup fullscreen listener:', error);
      }
    };

    setupListener();

    return () => {
      unlisten?.();
    };
  }, []);

  return isFullscreen;
}
