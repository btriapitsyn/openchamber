import React from 'react';
import { Text } from '@/components/ui/text';

interface WorkingPlaceholderProps {
  isWorking: boolean;
  statusText: string | null;
  isGenericStatus?: boolean;
  isWaitingForPermission?: boolean;
  retryInfo?: { attempt?: number; next?: number } | null;
}

const STATUS_DISPLAY_TIME_MS = 1200;

export function WorkingPlaceholder({
  isWorking,
  statusText,
  isGenericStatus,
  isWaitingForPermission,
  retryInfo,
}: WorkingPlaceholderProps) {
  const [displayedText, setDisplayedText] = React.useState<string | null>(null);
  const [displayedPermission, setDisplayedPermission] = React.useState<boolean>(false);

  const statusShownAtRef = React.useRef<number>(0);
  const queuedStatusRef = React.useRef<{ text: string; permission: boolean } | null>(null);
  const processQueueTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Countdown state for retry mode
  const retryNextRef = React.useRef<number | null>(null);
  const retryStartRef = React.useRef<number | null>(null);
  const [retryCountdown, setRetryCountdown] = React.useState<number | null>(null);

  React.useEffect(() => {
    const next = retryInfo?.next;
    if (!next || next <= 0) {
      retryNextRef.current = null;
      retryStartRef.current = null;
      setRetryCountdown(null);
      return;
    }

    // Start a fresh countdown when next value or attempt changes
    retryNextRef.current = next;
    retryStartRef.current = Date.now();

    const update = () => {
      const elapsed = Date.now() - (retryStartRef.current ?? Date.now());
      const remaining = Math.max(0, next - elapsed);
      setRetryCountdown(Math.ceil(remaining / 1000));
    };

    update();
    const id = setInterval(update, 500);
    return () => clearInterval(id);
  }, [retryInfo?.next, retryInfo?.attempt]);

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

    // Retry state has its own display — skip the normal queue
    if (retryInfo) {
      clearTimers();
      queuedStatusRef.current = null;
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
    retryInfo,
    displayedText,
    displayedPermission,
    clearTimers,
    showStatus,
    scheduleQueueProcess,
  ]);

  React.useEffect(() => () => clearTimers(), [clearTimers]);

  if (!isWorking) {
    return null;
  }

  // Retry state: show countdown and attempt info
  if (retryInfo) {
    const attemptLabel = retryInfo.attempt && retryInfo.attempt > 1 ? ` (attempt ${retryInfo.attempt})` : '';
    const countdownLabel = retryCountdown !== null && retryCountdown > 0 ? ` in ${retryCountdown}s` : '';
    const retryText = `Retrying${countdownLabel}${attemptLabel}...`;

    return (
      <div
        className="flex h-full items-center text-muted-foreground pl-[2ch]"
        role="status"
        aria-live="polite"
        aria-label={retryText}
      >
        <span className="flex items-center gap-1.5">
          <Text variant="shine" className="typography-ui-header">
            {retryText}
          </Text>
        </span>
      </div>
    );
  }

  if (!displayedText) {
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
