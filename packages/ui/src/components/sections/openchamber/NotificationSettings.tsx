import React from 'react';
import { useUIStore } from '@/stores/useUIStore';
import { isWebRuntime } from '@/lib/desktop';
import { toast } from 'sonner';

export const NotificationSettings: React.FC = () => {
  const nativeNotificationsEnabled = useUIStore(state => state.nativeNotificationsEnabled);
  const setNativeNotificationsEnabled = useUIStore(state => state.setNativeNotificationsEnabled);

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
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={nativeNotificationsEnabled && canShowNotifications}
            onChange={(e) => handleToggleChange(e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-neutral-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary/50 dark:peer-focus:ring-primary/50 rounded-full peer dark:bg-neutral-700 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-neutral-600 peer-checked:bg-primary" />
        </label>
      </div>

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
