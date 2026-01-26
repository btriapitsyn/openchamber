import React, { useEffect, useMemo, useState, lazy, Suspense } from 'react';
import { useRemoteConnectionStore } from '../stores/useRemoteConnectionStore';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Keyboard } from '@capacitor/keyboard';
import { App as CapApp } from '@capacitor/app';
import { setRemoteUrl, clearRemoteUrl } from '../lib/remoteClient';
import { createMobileAPIs } from '../api/mobileApi';

// Lazy load UI components to ensure remote URL is set before they initialize
const LazyApp = lazy(() => import('@openchamber/ui/App'));
const LazyThemeProvider = lazy(async () => {
  const module = await import('@openchamber/ui/components/providers/ThemeProvider');
  return { default: module.ThemeProvider };
});
const LazyThemeSystemProvider = lazy(async () => {
  const module = await import('@openchamber/ui/contexts/ThemeSystemContext');
  return { default: module.ThemeSystemProvider };
});
const LazySessionAuthGate = lazy(async () => {
  const module = await import('@openchamber/ui/components/auth/SessionAuthGate');
  return { default: module.SessionAuthGate };
});

interface MobileLayoutProps {
  onDisconnect: () => void;
}

// Loading spinner component
const LoadingSpinner: React.FC = () => (
  <div className="h-full flex items-center justify-center bg-[#0a0a0a]">
    <div className="flex flex-col items-center gap-4">
      <div className="w-10 h-10 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      <p className="text-white/60 text-sm">Connecting...</p>
    </div>
  </div>
);

export const MobileLayout: React.FC<MobileLayoutProps> = ({ onDisconnect }) => {
  const { currentConnection, disconnect } = useRemoteConnectionStore();
  const [isReady, setIsReady] = useState(false);

  // Create mobile APIs with remote connection
  const apis = useMemo(() => {
    return createMobileAPIs();
  }, []);

  // Set the remote URL BEFORE loading UI components
  useEffect(() => {
    if (currentConnection?.url) {
      // Set the remote URL - this must happen before UI components load
      setRemoteUrl(currentConnection.url, currentConnection.token);

      // Mark layout as ready immediately after setting the remote URL
      setIsReady(true);

      return () => {
        clearRemoteUrl();
      };
    }

    return () => {
      clearRemoteUrl();
    };
  }, [currentConnection?.url, currentConnection?.token]);

  // Set up mobile platform integrations
  useEffect(() => {
    // Configure status bar
    StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
    StatusBar.setBackgroundColor({ color: '#0a0a0a' }).catch(() => {});

    // Handle keyboard events
    const setupKeyboard = async () => {
      try {
        await Keyboard.setAccessoryBarVisible({ isVisible: true });
      } catch {
        // Keyboard plugin might not be available
      }
    };
    setupKeyboard();

    // Handle back button on Android with proper cleanup
    let isActive = true;
    let backButtonListener: { remove: () => void } | undefined;

    const setupBackButton = async () => {
      try {
        const listener = await CapApp.addListener('backButton', ({ canGoBack }) => {
          if (!canGoBack) {
            // Show disconnect confirmation or go to scanner
            onDisconnect();
          }
        });

        if (!isActive) {
          // Effect has already been cleaned up; remove listener immediately
          listener.remove();
          return;
        }

        backButtonListener = listener;
      } catch {
        // App plugin might not be available or listener registration failed
      }
    };

    setupBackButton();

    return () => {
      isActive = false;
      if (backButtonListener) {
        backButtonListener.remove();
        backButtonListener = undefined;
      }
    };
  }, [onDisconnect]);

  // Handle disconnect
  const handleDisconnect = () => {
    disconnect();
    clearRemoteUrl();
    onDisconnect();
  };

  if (!currentConnection) {
    return null;
  }

  if (!isReady) {
    return <LoadingSpinner />;
  }

  return (
    <Suspense fallback={<LoadingSpinner />}>
      <LazyThemeSystemProvider>
        <LazyThemeProvider>
          <LazySessionAuthGate>
            <div className="h-full flex flex-col bg-background">
              {/* Connection status bar */}
              <div className="safe-area-top bg-muted/50 border-b border-border">
                <div className="px-4 py-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                    <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                      {currentConnection.label || currentConnection.url}
                    </span>
                  </div>
                  <button
                    onClick={handleDisconnect}
                    className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded"
                  >
                    Disconnect
                  </button>
                </div>
              </div>

              {/* Main app content */}
              <div className="flex-1 overflow-hidden">
                <LazyApp apis={apis} />
              </div>

              {/* Safe area bottom */}
              <div className="safe-area-bottom bg-background" />
            </div>

            <style>{`
              .safe-area-top {
                padding-top: env(safe-area-inset-top);
              }
              .safe-area-bottom {
                padding-bottom: env(safe-area-inset-bottom);
              }
            `}</style>
          </LazySessionAuthGate>
        </LazyThemeProvider>
      </LazyThemeSystemProvider>
    </Suspense>
  );
};
