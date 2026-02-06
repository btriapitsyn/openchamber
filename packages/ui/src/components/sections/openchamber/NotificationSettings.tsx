import React from 'react';
import { useUIStore } from '@/stores/useUIStore';
import { isDesktopShell, isVSCodeRuntime } from '@/lib/desktop';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/components/ui';
import { getRegisteredRuntimeAPIs } from '@/contexts/runtimeAPIRegistry';

import { GridLoader } from '@/components/ui/grid-loader';

export const NotificationSettings: React.FC = () => {
  const isDesktop = React.useMemo(() => isDesktopShell(), []);
  const isVSCode = React.useMemo(() => isVSCodeRuntime(), []);
  const isBrowser = !isDesktop && !isVSCode;
  const nativeNotificationsEnabled = useUIStore(state => state.nativeNotificationsEnabled);
  const setNativeNotificationsEnabled = useUIStore(state => state.setNativeNotificationsEnabled);
  const notificationMode = useUIStore(state => state.notificationMode);
  const setNotificationMode = useUIStore(state => state.setNotificationMode);
  const notifyOnSubtasks = useUIStore(state => state.notifyOnSubtasks);
  const setNotifyOnSubtasks = useUIStore(state => state.setNotifyOnSubtasks);
  const notifyOnCompletion = useUIStore(state => state.notifyOnCompletion);
  const setNotifyOnCompletion = useUIStore(state => state.setNotifyOnCompletion);
  const notifyOnError = useUIStore(state => state.notifyOnError);
  const setNotifyOnError = useUIStore(state => state.setNotifyOnError);
  const notifyOnQuestion = useUIStore(state => state.notifyOnQuestion);
  const setNotifyOnQuestion = useUIStore(state => state.setNotifyOnQuestion);
  const notificationTemplates = useUIStore(state => state.notificationTemplates);
  const setNotificationTemplates = useUIStore(state => state.setNotificationTemplates);
  const summarizeLastMessage = useUIStore(state => state.summarizeLastMessage);
  const setSummarizeLastMessage = useUIStore(state => state.setSummarizeLastMessage);
  const summaryThreshold = useUIStore(state => state.summaryThreshold);
  const setSummaryThreshold = useUIStore(state => state.setSummaryThreshold);
  const summaryLength = useUIStore(state => state.summaryLength);
  const setSummaryLength = useUIStore(state => state.setSummaryLength);
  const maxLastMessageLength = useUIStore(state => state.maxLastMessageLength);
  const setMaxLastMessageLength = useUIStore(state => state.setMaxLastMessageLength);

  const [notificationPermission, setNotificationPermission] = React.useState<NotificationPermission>('default');
  const [pushSupported, setPushSupported] = React.useState(false);
  const [pushSubscribed, setPushSubscribed] = React.useState(false);
  const [pushBusy, setPushBusy] = React.useState(false);

  React.useEffect(() => {
    if (!isBrowser) {
      setPushSupported(false);
      setPushSubscribed(false);
      return;
    }

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
  }, [isBrowser]);

  const handleToggleChange = async (checked: boolean) => {
    if (isDesktop) {
      setNativeNotificationsEnabled(checked);
      return;
    }

    if (!isBrowser) {
      setNativeNotificationsEnabled(checked);
      return;
    }
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

  const canShowNotifications = isDesktop || (isBrowser && typeof Notification !== 'undefined' && Notification.permission === 'granted');

  const updateTemplate = (
    event: 'completion' | 'error' | 'question' | 'subtask',
    field: 'title' | 'message',
    value: string,
  ) => {
    setNotificationTemplates({
      ...notificationTemplates,
      [event]: {
        ...notificationTemplates[event],
        [field]: value,
      },
    });
  };

  const base64UrlToUint8Array = (base64Url: string): Uint8Array<ArrayBuffer> => {
    const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
    const base64 = (base64Url + padding)
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    const raw = atob(base64);
    const output = new Uint8Array(raw.length) as Uint8Array<ArrayBuffer>;
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

  return (
    <div className="space-y-6">
      <div className="space-y-1 pt-2">
        <h3 className="typography-ui-header font-semibold text-foreground">
          When to notify
        </h3>
        <p className="typography-ui text-muted-foreground">
          Customize when notifications show up.
        </p>
      </div>

      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <span className="typography-ui text-foreground">
            Enable notifications
          </span>
          <p className="typography-micro text-muted-foreground">
            Turns notifications on or off.
          </p>
        </div>
        <Switch
          checked={nativeNotificationsEnabled && canShowNotifications}
          onCheckedChange={handleToggleChange}
          className="data-[state=checked]:bg-status-info"
        />
      </div>

      {isBrowser && (
        <p className="typography-micro text-muted-foreground">
          Your browser may ask for permission the first time.
        </p>
      )}

      {nativeNotificationsEnabled && canShowNotifications && (
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <span className="typography-ui text-foreground">
              Notify while app is focused
            </span>
            <p className="typography-micro text-muted-foreground">
              When off, only notify when you are not looking at OpenChamber.
            </p>
          </div>
          <Switch
            checked={notificationMode === 'always'}
            onCheckedChange={(checked: boolean) => setNotificationMode(checked ? 'always' : 'hidden-only')}
            className="data-[state=checked]:bg-status-info"
          />
        </div>
      )}

      {nativeNotificationsEnabled && canShowNotifications && (
        <div className="space-y-3 pt-2">
          <div className="space-y-0.5">
            <span className="typography-ui text-foreground font-medium">
              Events
            </span>
            <p className="typography-micro text-muted-foreground">
              Choose which events trigger notifications.
            </p>
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="typography-ui text-foreground">Completion</span>
              <p className="typography-micro text-muted-foreground">Agent finished its task.</p>
            </div>
            <Switch
              checked={notifyOnCompletion}
              onCheckedChange={setNotifyOnCompletion}
              className="data-[state=checked]:bg-status-info"
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="typography-ui text-foreground">Errors</span>
              <p className="typography-micro text-muted-foreground">A tool call failed.</p>
            </div>
            <Switch
              checked={notifyOnError}
              onCheckedChange={setNotifyOnError}
              className="data-[state=checked]:bg-status-info"
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="typography-ui text-foreground">Questions</span>
              <p className="typography-micro text-muted-foreground">Agent is asking for input or permission.</p>
            </div>
            <Switch
              checked={notifyOnQuestion}
              onCheckedChange={setNotifyOnQuestion}
              className="data-[state=checked]:bg-status-info"
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="typography-ui text-foreground">Subagents</span>
              <p className="typography-micro text-muted-foreground">Also notify for child sessions started by the main one.</p>
            </div>
            <Switch
              checked={notifyOnSubtasks}
              onCheckedChange={(checked: boolean) => setNotifyOnSubtasks(checked)}
              className="data-[state=checked]:bg-status-info"
            />
          </div>
        </div>
      )}

      {nativeNotificationsEnabled && canShowNotifications && (
        <div className="space-y-4 pt-4">
          <div className="space-y-1">
            <h3 className="typography-ui-header font-semibold text-foreground">
              Customize content
            </h3>
            <p className="typography-micro text-muted-foreground">
              Use template variables: <code className="text-accent-foreground">{'{project_name}'}</code>{' '}
              <code className="text-accent-foreground">{'{worktree}'}</code>{' '}
              <code className="text-accent-foreground">{'{branch}'}</code>{' '}
              <code className="text-accent-foreground">{'{session_name}'}</code>{' '}
              <code className="text-accent-foreground">{'{agent_name}'}</code>{' '}
              <code className="text-accent-foreground">{'{last_message}'}</code>
            </p>
          </div>

          {(['completion', 'error', 'question', 'subtask'] as const).map((event) => (
            <div key={event} className="space-y-2">
              <span className="typography-ui text-foreground font-medium capitalize">{event}</span>
              <div className="space-y-1.5">
                <div>
                  <label className="typography-micro text-muted-foreground block mb-1">Title</label>
                  <input
                    type="text"
                    value={notificationTemplates[event].title}
                    onChange={(e) => updateTemplate(event, 'title', e.target.value)}
                    className="w-full rounded-md border border-border bg-background px-3 py-1.5 typography-ui text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-accent"
                    placeholder={`Title for ${event} notifications`}
                  />
                </div>
                <div>
                  <label className="typography-micro text-muted-foreground block mb-1">Message</label>
                  <input
                    type="text"
                    value={notificationTemplates[event].message}
                    onChange={(e) => updateTemplate(event, 'message', e.target.value)}
                    className="w-full rounded-md border border-border bg-background px-3 py-1.5 typography-ui text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-accent"
                    placeholder={`Message for ${event} notifications`}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {nativeNotificationsEnabled && canShowNotifications && (
        <div className="space-y-3 pt-4">
          <div className="space-y-1">
            <h3 className="typography-ui-header font-semibold text-foreground">
              Summarization
            </h3>
            <p className="typography-micro text-muted-foreground">
              Summarize long messages in notifications using AI.
            </p>
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="typography-ui text-foreground">
                Summarize last message
              </span>
              <p className="typography-micro text-muted-foreground">
                Uses AI to shorten the {'{last_message}'} variable.
              </p>
            </div>
            <Switch
              checked={summarizeLastMessage}
              onCheckedChange={setSummarizeLastMessage}
              className="data-[state=checked]:bg-status-info"
            />
          </div>

          {summarizeLastMessage ? (
            <>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="typography-ui text-foreground">
                    Summary threshold
                  </label>
                  <span className="typography-micro text-muted-foreground tabular-nums">{summaryThreshold} chars</span>
                </div>
                <p className="typography-micro text-muted-foreground">
                  Messages longer than this will be summarized.
                </p>
                <input
                  type="range"
                  min={50}
                  max={2000}
                  step={50}
                  value={summaryThreshold}
                  onChange={(e) => setSummaryThreshold(Number(e.target.value))}
                  className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-primary [&::-moz-range-thumb]:border-0"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="typography-ui text-foreground">
                    Summary length
                  </label>
                  <span className="typography-micro text-muted-foreground tabular-nums">{summaryLength} chars</span>
                </div>
                <p className="typography-micro text-muted-foreground">
                  Target length of the summary.
                </p>
                <input
                  type="range"
                  min={20}
                  max={500}
                  step={10}
                  value={summaryLength}
                  onChange={(e) => setSummaryLength(Number(e.target.value))}
                  className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-primary [&::-moz-range-thumb]:border-0"
                />
              </div>
            </>
          ) : (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="typography-ui text-foreground">
                  Max last message length
                </label>
                <span className="typography-micro text-muted-foreground tabular-nums">{maxLastMessageLength} chars</span>
              </div>
              <p className="typography-micro text-muted-foreground">
                Truncate {'{last_message}'} to this many characters.
              </p>
              <input
                type="range"
                min={50}
                max={1000}
                step={10}
                value={maxLastMessageLength}
                onChange={(e) => setMaxLastMessageLength(Number(e.target.value))}
                className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-primary [&::-moz-range-thumb]:border-0"
              />
            </div>
          )}
        </div>
      )}

      {isBrowser && (
        <>
          {notificationPermission === 'denied' && (
            <p className="typography-micro text-destructive">
              Notification permission denied. Enable it in your browser settings.
            </p>
          )}

          {notificationPermission === 'granted' && !nativeNotificationsEnabled && (
            <p className="typography-micro text-muted-foreground">
              Permission granted, but notifications are disabled.
            </p>
          )}

          <div className="space-y-1 pt-4">
            <h3 className="typography-ui-header font-semibold text-foreground">
              Background (Push)
            </h3>
            <p className="typography-ui text-muted-foreground">
              Get notified even if this page is closed.
            </p>
          </div>

          {!pushSupported ? (
            <p className="typography-micro text-muted-foreground">
              Push not supported in this browser.
            </p>
          ) : (
            <p className="typography-micro text-muted-foreground">
              Desktop Chrome/Edge and Android support push. iOS requires an installed PWA.
            </p>
          )}

          {pushSupported && (
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-0.5">
                <span className="typography-ui text-foreground">
                  Enable push notifications
                </span>
                <p className="typography-micro text-muted-foreground">
                  Clicking a notification opens the relevant session.
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
                  onCheckedChange={(checked: boolean) => {
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
        </>
      )}

      {isVSCode && (
        <div className="space-y-1 pt-4">
          <h3 className="typography-ui-header font-semibold text-foreground">
            Delivery
          </h3>
          <p className="typography-ui text-muted-foreground">
            VS Code runtime handles notifications separately.
          </p>
        </div>
      )}
    </div>
  );
};
