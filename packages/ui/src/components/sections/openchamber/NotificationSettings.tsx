import React from 'react';
import { useUIStore } from '@/stores/useUIStore';
import { isWebRuntime } from '@/lib/desktop';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/components/ui';
import { getRegisteredRuntimeAPIs } from '@/contexts/runtimeAPIRegistry';

import { GridLoader } from '@/components/ui/grid-loader';

export const NotificationSettings: React.FC = () => {
  const nativeNotificationsEnabled = useUIStore(state => state.nativeNotificationsEnabled);
  const setNativeNotificationsEnabled = useUIStore(state => state.setNativeNotificationsEnabled);
  const notificationMode = useUIStore(state => state.notificationMode);
  const setNotificationMode = useUIStore(state => state.setNotificationMode);

  const [notificationPermission, setNotificationPermission] = React.useState<NotificationPermission>('default');
  const [pushSupported, setPushSupported] = React.useState(false);
  const [pushSubscribed, setPushSubscribed] = React.useState(false);
  const [pushBusy, setPushBusy] = React.useState(false);

  React.useEffect(() => {
    if (typeof Notification !== 'undefined') {
      setNotificationPermission(Notification.permission);
    }

    const supported = typeof window !== 'undefined'
      && 'serviceWorker' in navigator
      && 'PushManager' in window
      && 'Notification' in window;
    setPushSupported(supported);

    const refresh = async () => {
      if (!supported) {
        setPushSubscribed(false);
        return;
      }

      try {
        const registration = await navigator.serviceWorker.getRegistration();
        if (!registration) {
          setPushSubscribed(false);
          return;
        }
        const subscription = await registration.pushManager.getSubscription();
        setPushSubscribed(Boolean(subscription));
      } catch {
        setPushSubscribed(false);
      }
    };

    void refresh();
  }, []);

  const handleToggleChange = async (checked: boolean) => {
    if (checked && typeof Notification !== 'undefined' && Notification.permission === 'default') {
      try {
        const permission = await Notification.requestPermission();
        setNotificationPermission(permission);
        if (permission === 'granted') {
          setNativeNotificationsEnabled(true);
        } else {
          toast.error('Notification permission denied', {
            description: 'Please enable notifications in your browser settings.',
          });
        }
      } catch (error) {
        console.error('Failed to request notification permission:', error);
        toast.error('Failed to request notification permission');
      }
    } else if (checked && notificationPermission === 'granted') {
      setNativeNotificationsEnabled(true);
    } else {
      setNativeNotificationsEnabled(false);
    }
  };

  const canShowNotifications = typeof Notification !== 'undefined' && Notification.permission === 'granted';

  const base64UrlToUint8Array = (base64Url: string): Uint8Array => {
    const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
    const base64 = (base64Url + padding)
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    const raw = atob(base64);
    const output = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i += 1) {
      output[i] = raw.charCodeAt(i);
    }
    return output;
  };

  const withTimeout = async <T,>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const timeout = new Promise<never>((_resolve, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(label));
      }, timeoutMs);
    });

    try {
      return await Promise.race([promise, timeout]);
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  };

  const waitForSwActive = async (registration: ServiceWorkerRegistration): Promise<void> => {
    if (registration.active) {
      return;
    }

    const candidate = registration.installing || registration.waiting;
    if (!candidate) {
      return;
    }

    if (candidate.state === 'activated') {
      return;
    }

    await withTimeout(
      new Promise<void>((resolve) => {
        const onStateChange = () => {
          if (candidate.state === 'activated') {
            candidate.removeEventListener('statechange', onStateChange);
            resolve();
          }
        };

        candidate.addEventListener('statechange', onStateChange);
        onStateChange();
      }),
      15000,
      'Service worker activation timed out'
    );
  };

  type RegistrationOptions = {
    scope?: string;
    type?: 'classic' | 'module';
    updateViaCache?: 'imports' | 'all' | 'none';
  };

  const registerServiceWorker = async (): Promise<ServiceWorkerRegistration> => {
    if (typeof navigator.serviceWorker.register !== 'function') {
      throw new Error('navigator.serviceWorker.register unavailable');
    }

    // iOS Safari can throw non-sensical internal errors when unsupported options
    // are passed. Try no-options first, then add options progressively.
    const attempts: Array<{ label: string; opts: RegistrationOptions | null }> = [
      { label: 'no-options', opts: null },
      { label: 'scope-root', opts: { scope: '/' } },
      { label: 'type-classic', opts: { type: 'classic' } },
      { label: 'type-classic-scope', opts: { type: 'classic', scope: '/' } },
      { label: 'updateViaCache-none', opts: { type: 'classic', updateViaCache: 'none', scope: '/' } },
    ];

    let lastError: unknown = null;
    for (const attempt of attempts) {
      try {
        const promise = attempt.opts
          ? navigator.serviceWorker.register('/sw.js', attempt.opts)
          : navigator.serviceWorker.register('/sw.js');

        return await withTimeout(promise, 10000, `Service worker registration timed out (${attempt.label})`);
      } catch (error) {
        lastError = error;
        // ignore
      }
    }

    throw lastError instanceof Error ? lastError : new Error('Service worker registration failed');
  };

  const getServiceWorkerRegistration = async (): Promise<ServiceWorkerRegistration> => {
    if (!('serviceWorker' in navigator)) {
      throw new Error('Service worker not supported');
    }

    const existing = await navigator.serviceWorker.getRegistration();
    if (existing) {
      return existing;
    }

    const registered = await registerServiceWorker();

    try {
      await registered.update();
    } catch {
      // ignore
    }

    await waitForSwActive(registered);
    return registered;
  };


  const formatUnknownError = (error: unknown) => {
    const anyError = error as { name?: unknown; message?: unknown; stack?: unknown } | null;
    const parts = [
      `type=${typeof error}`,
      `toString=${String(error)}`,
      `name=${String(anyError?.name ?? '')}`,
      `message=${String(anyError?.message ?? '')}`,
    ];

    let json = '';
    try {
      json = JSON.stringify(error);
    } catch {
      // ignore
    }

    return {
      summary: parts.filter(Boolean).join(' | '),
      json,
      stack: typeof anyError?.stack === 'string' ? anyError.stack : '',
    };
  };

  const handleEnableBackgroundNotifications = async () => {
    if (!pushSupported) {
      toast.error('Push notifications not supported');
      return;
    }

    const apis = getRegisteredRuntimeAPIs();
    if (!apis?.push) {
      toast.error('Push API not available');
      return;
    }

    setPushBusy(true);
    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
        const permission = await Notification.requestPermission();
        setNotificationPermission(permission);
        if (permission !== 'granted') {
          toast.error('Notification permission denied', {
            description: 'Enable notifications in your browser settings.',
          });
          return;
        }
      }

      if (typeof Notification !== 'undefined' && Notification.permission !== 'granted') {
        toast.error('Notification permission denied', {
          description: 'Enable notifications in your browser settings.',
        });
        return;
      }

      const key = await apis.push.getVapidPublicKey();
      if (!key?.publicKey) {
        toast.error('Failed to load push key');
        return;
      }

      const registration = await getServiceWorkerRegistration();
      await waitForSwActive(registration);

      const existing = await registration.pushManager.getSubscription();

      if (!('pushManager' in registration) || !registration.pushManager) {
        throw new Error('PushManager unavailable (requires installed PWA + iOS 16.4+)');
      }


      const subscription = existing ?? await withTimeout(
        registration.pushManager.subscribe({
          userVisibleOnly: true,
          // iOS Safari is picky here; pass Uint8Array (not ArrayBuffer).
          applicationServerKey: base64UrlToUint8Array(key.publicKey),
        }),
        15000,
        'Push subscription timed out'
      );


      const json = subscription.toJSON();
      const keys = json.keys;
      if (!json.endpoint || !keys?.p256dh || !keys.auth) {
        throw new Error('Push subscription missing keys');
      }


      const ok = await withTimeout(
        apis.push.subscribe({
          endpoint: json.endpoint,
          keys: {
            p256dh: keys.p256dh,
            auth: keys.auth,
          },
          origin: typeof window !== 'undefined' ? window.location.origin : undefined,
        }),
        15000,
        'Push subscribe request timed out'
      );


      if (!ok?.ok) {
        toast.error('Failed to enable background notifications');
        return;
      }

      setPushSubscribed(true);
      toast.success('Background notifications enabled');
    } catch (error) {
      console.error('[Push] Enable failed:', error);
      const formatted = formatUnknownError(error);
      toast.error('Failed to enable background notifications', {
        description: formatted.summary,
      });

    } finally {
      setPushBusy(false);
    }
  };

  const handleDisableBackgroundNotifications = async () => {
    if (!pushSupported) {
      setPushSubscribed(false);
      return;
    }

    const apis = getRegisteredRuntimeAPIs();
    if (!apis?.push) {
      toast.error('Push API not available');
      return;
    }

    setPushBusy(true);
    try {
      const registration = await getServiceWorkerRegistration();
      const subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        setPushSubscribed(false);
        return;
      }

      const endpoint = subscription.endpoint;
      await subscription.unsubscribe();
      await apis.push.unsubscribe({ endpoint });
      setPushSubscribed(false);
      toast.success('Background notifications disabled');
    } finally {
      setPushBusy(false);
    }
  };

  if (!isWebRuntime()) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h3 className="typography-ui-header font-semibold text-foreground">
          Foreground Notifications
        </h3>
        <p className="typography-ui text-muted-foreground">
          Uses the browser Notification API while OpenChamber is open.
        </p>
      </div>

      <div className="flex items-center justify-between">
        <span className="typography-ui text-foreground">
          Enable foreground notifications
        </span>
        <Switch
          checked={nativeNotificationsEnabled && canShowNotifications}
          onCheckedChange={handleToggleChange}
          className="data-[state=checked]:bg-status-info"
        />
      </div>

      {nativeNotificationsEnabled && canShowNotifications && (
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <span className="typography-ui text-foreground">
              Notify even when visible
            </span>
            <p className="typography-micro text-muted-foreground">
              When off, only notifies when the tab is hidden or the window is not focused.
            </p>
          </div>
          <Switch
            checked={notificationMode === 'always'}
            onCheckedChange={(checked) => setNotificationMode(checked ? 'always' : 'hidden-only')}
            className="data-[state=checked]:bg-status-info"
          />
        </div>
      )}

      {notificationPermission === 'denied' && (
        <p className="typography-micro text-destructive">
          Notification permission denied. Enable notifications in your browser settings.
        </p>
      )}

       {notificationPermission === 'granted' && !nativeNotificationsEnabled && (
         <p className="typography-micro text-muted-foreground">
           Permission granted, but foreground notifications are disabled.
         </p>
       )}

      <div className="space-y-1 pt-2">
        <h3 className="typography-ui-header font-semibold text-foreground">
          Background Notifications (Push)
        </h3>
        <p className="typography-ui text-muted-foreground">
          Uses push notifications; works when OpenChamber is closed.
        </p>
      </div>

      {!pushSupported ? (
        <p className="typography-micro text-muted-foreground">
          Push not supported in this browser.
        </p>
      ) : (
        <p className="typography-micro text-muted-foreground">
          Desktop Chrome/Edge and Android support push in the browser. iOS requires an installed PWA.
        </p>
      )}

      {pushSupported && (
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-0.5">
            <span className="typography-ui text-foreground">
              Enable background notifications
            </span>
            <p className="typography-micro text-muted-foreground">
              Opens chat with /?session=&lt;id&gt; deep link.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {pushBusy && (
              <div className="text-muted-foreground">
                <GridLoader size="sm" />
              </div>
            )}

            <Switch
              checked={pushSubscribed}
              disabled={pushBusy}
              onCheckedChange={(checked) => {
                if (checked) {
                  void handleEnableBackgroundNotifications();
                } else {
                  void handleDisableBackgroundNotifications();
                }
              }}
              className="data-[state=checked]:bg-status-info"
            />
          </div>
        </div>
      )}
    </div>
  );
};
