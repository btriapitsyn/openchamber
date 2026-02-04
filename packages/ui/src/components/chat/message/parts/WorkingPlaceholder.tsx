import React from 'react';
import { Text } from '@/components/ui/text';

interface WorkingPlaceholderProps {
  isWorking: boolean;
  statusText: string | null;
  isGenericStatus?: boolean;
  isWaitingForPermission?: boolean;
}

const STATUS_DISPLAY_TIME_MS = 1200;

export function WorkingPlaceholder({
  isWorking,
  statusText,
  isGenericStatus,
  isWaitingForPermission,
}: WorkingPlaceholderProps) {
  const [displayedText, setDisplayedText] = React.useState<string | null>(null);
  const [displayedPermission, setDisplayedPermission] = React.useState<boolean>(false);

  const statusShownAtRef = React.useRef<number>(0);
  const queuedStatusRef = React.useRef<{ text: string; permission: boolean } | null>(null);
  const processQueueTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = React.useCallback(() => {
    if (processQueueTimerRef.current) {
      clearTimeout(processQueueTimerRef.current);
      processQueueTimerRef.current = null;
    }
  }, []);

  const showStatus = React.useCallback((text: string, permission: boolean) => {
    clearTimers();
    queuedStatusRef.current = null;
    setDisplayedText(text);
    setDisplayedPermission(permission);
    statusShownAtRef.current = Date.now();
  }, [clearTimers]);

  const scheduleQueueProcess = React.useCallback(() => {
    if (processQueueTimerRef.current) return;
    const elapsed = Date.now() - statusShownAtRef.current;
    const remaining = Math.max(0, STATUS_DISPLAY_TIME_MS - elapsed);
    processQueueTimerRef.current = setTimeout(() => {
      processQueueTimerRef.current = null;

      const queued = queuedStatusRef.current;
      if (queued) {
        showStatus(queued.text, queued.permission);
      }
    }, remaining);
  }, [showStatus]);

  React.useEffect(() => {
    if (!isWorking) {
      clearTimers();
      queuedStatusRef.current = null;
      setDisplayedText(null);
      setDisplayedPermission(false);
      return;
    }

    const incomingText = isWaitingForPermission ? 'waiting for permission' : statusText;
    const incomingPermission = Boolean(isWaitingForPermission);
    const incomingGeneric = Boolean(isGenericStatus) && !incomingPermission;

    if (!incomingText) {
      return;
    }

    if (!displayedText) {
      showStatus(incomingText, incomingPermission);
      return;
    }

    if (incomingText === displayedText && incomingPermission === displayedPermission) {
      return;
    }

    // Ignore generic churn.
    if (incomingGeneric) {
      return;
    }

    const elapsed = Date.now() - statusShownAtRef.current;
    if (elapsed >= STATUS_DISPLAY_TIME_MS) {
      showStatus(incomingText, incomingPermission);
      return;
    }

    queuedStatusRef.current = { text: incomingText, permission: incomingPermission };
    scheduleQueueProcess();
  }, [
    isWorking,
    statusText,
    isGenericStatus,
    isWaitingForPermission,
    displayedText,
    displayedPermission,
    clearTimers,
    showStatus,
    scheduleQueueProcess,
  ]);

  React.useEffect(() => () => clearTimers(), [clearTimers]);

  if (!isWorking || !displayedText) {
    return null;
  }

  const label = displayedText.charAt(0).toUpperCase() + displayedText.slice(1);
  const displayText = `${label}...`;

  return (
    <div
      className={
        'flex h-full items-center text-muted-foreground pl-[2ch]'
      }
      role="status"
      aria-live={displayedPermission ? 'assertive' : 'polite'}
      aria-label={label}
      data-waiting={displayedPermission ? 'true' : undefined}
    >
      <span className="flex items-center gap-1.5">
        <Text variant="shine" className="typography-ui-header">
          {displayText}
        </Text>
      </span>
    </div>
  );
}
