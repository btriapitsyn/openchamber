import React from 'react';
import { useUIStore } from '@/stores/useUIStore';
import { isWebRuntime } from '@/lib/desktop';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/components/ui';

export const NotificationSettings: React.FC = () => {
  const nativeNotificationsEnabled = useUIStore(state => state.nativeNotificationsEnabled);
  const setNativeNotificationsEnabled = useUIStore(state => state.setNativeNotificationsEnabled);
  const notificationMode = useUIStore(state => state.notificationMode);
  const setNotificationMode = useUIStore(state => state.setNotificationMode);

  const [notificationPermission, setNotificationPermission] = React.useState<NotificationPermission>('default');

  React.useEffect(() => {
    if (typeof Notification !== 'undefined') {
      setNotificationPermission(Notification.permission);
    }
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

  if (!isWebRuntime()) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h3 className="typography-ui-header font-semibold text-foreground">
          Native Notifications
        </h3>
        <p className="typography-ui text-muted-foreground">
          Show browser notifications when an assistant completes a task.
        </p>
      </div>

      <div className="flex items-center justify-between">
        <span className="typography-ui text-foreground">
          Enable native notifications
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
              Always notify
            </span>
            <p className="typography-micro text-muted-foreground">
              When off, only notifies if the window is out of focus.
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
          Notifications are enabled in your browser. Toggle the switch above to activate them.
        </p>
      )}
    </div>
  );
};
