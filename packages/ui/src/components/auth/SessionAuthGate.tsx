import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { OpenCodeIcon } from '@/components/ui/OpenCodeIcon';
import { isDesktopRuntime } from '@/lib/desktop';
import { syncDesktopSettings, initializeAppearancePreferences } from '@/lib/persistence';
import { applyPersistedDirectoryPreferences } from '@/lib/directoryPersistence';

const STATUS_CHECK_ENDPOINT = '/auth/session';

const fetchSessionStatus = async (): Promise<Response> => {
  return fetch(STATUS_CHECK_ENDPOINT, {
    method: 'GET',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
    },
  });
};

const submitPassword = async (password: string): Promise<Response> => {
  return fetch(STATUS_CHECK_ENDPOINT, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ password }),
  });
};

const AuthShell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background text-foreground"
    style={{ fontFamily: '"Inter", "SF Pro Text", -apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", sans-serif' }}
  >
    <div
      className="pointer-events-none absolute inset-0 opacity-55"
      style={{
        background: 'radial-gradient(120% 140% at 50% -20%, var(--surface-overlay) 0%, transparent 68%)',
      }}
    />
    <div
      className="pointer-events-none absolute inset-0"
      style={{
        backgroundColor: 'var(--surface-subtle)',
        opacity: 0.22,
      }}
    />
    <div className="relative z-10 flex w-full justify-center px-4 py-12 sm:px-6">
      {children}
    </div>
  </div>
);

const LoadingScreen: React.FC<{ message?: string }> = ({ message = 'Preparing workspace…' }) => (
  <AuthShell>
    <div className="w-full max-w-sm rounded-3xl border border-border/40 bg-card/90 px-6 py-5 text-center shadow-none backdrop-blur">
      <p className="typography-ui-label text-muted-foreground">{message}</p>
    </div>
  </AuthShell>
);

const ErrorScreen: React.FC<{ onRetry: () => void }> = ({ onRetry }) => (
  <AuthShell>
    <div className="w-full max-w-sm rounded-3xl border border-destructive/30 bg-card/90 p-6 shadow-none backdrop-blur">
      <div className="space-y-3 text-center">
        <div className="flex justify-center">
          <OpenCodeIcon width={28} height={28} className="text-destructive" />
        </div>
        <h1 className="typography-ui-header font-semibold text-destructive">Unable to reach server</h1>
        <p className="typography-meta text-muted-foreground">
          We couldn't verify the UI session. Check that the service is running and try again.
        </p>
        <Button type="button" onClick={onRetry} className="w-full">
          Retry
        </Button>
      </div>
    </div>
  </AuthShell>
);

interface SessionAuthGateProps {
  children: React.ReactNode;
}

type GateState = 'pending' | 'authenticated' | 'locked' | 'error';

export const SessionAuthGate: React.FC<SessionAuthGateProps> = ({ children }) => {
  const desktopRuntime = React.useMemo(() => isDesktopRuntime(), []);
  const [state, setState] = React.useState<GateState>(() => (desktopRuntime ? 'authenticated' : 'pending'));
  const [password, setPassword] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState('');
  const passwordInputRef = React.useRef<HTMLInputElement | null>(null);
  const hasResyncedRef = React.useRef(desktopRuntime);

  const checkStatus = React.useCallback(async () => {
    if (desktopRuntime) {
      setState('authenticated');
      return;
    }

    setState((prev) => (prev === 'authenticated' ? prev : 'pending'));
    try {
      const response = await fetchSessionStatus();
      if (response.ok) {
        setState('authenticated');
        setErrorMessage('');
        return;
      }
      if (response.status === 401) {
        setState('locked');
        return;
      }
      setState('error');
    } catch (error) {
      console.warn('Failed to check session status:', error);
      setState('error');
    }
  }, [desktopRuntime]);

  React.useEffect(() => {
    if (desktopRuntime) {
      return;
    }
    void checkStatus();
  }, [checkStatus, desktopRuntime]);

  React.useEffect(() => {
    if (!desktopRuntime && state === 'locked') {
      hasResyncedRef.current = false;
    }
  }, [desktopRuntime, state]);

  React.useEffect(() => {
    if (state === 'locked' && passwordInputRef.current) {
      passwordInputRef.current.focus();
      passwordInputRef.current.select();
    }
  }, [state]);

  React.useEffect(() => {
    if (desktopRuntime) {
      return;
    }
    if (state === 'authenticated' && !hasResyncedRef.current) {
      hasResyncedRef.current = true;
      void (async () => {
        await syncDesktopSettings();
        await initializeAppearancePreferences();
        await applyPersistedDirectoryPreferences();
      })();
    }
  }, [desktopRuntime, state]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!password || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');

    try {
      const response = await submitPassword(password);
      if (response.ok) {
        setPassword('');
        setState('authenticated');
        return;
      }

      if (response.status === 401) {
        setErrorMessage('Incorrect password. Try again.');
        setState('locked');
        return;
      }

      setErrorMessage('Unexpected response from server.');
      setState('error');
    } catch (error) {
      console.warn('Failed to submit UI password:', error);
      setErrorMessage('Network error. Check connection and retry.');
      setState('error');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (state === 'pending') {
    return <LoadingScreen />;
  }

  if (state === 'error') {
    return <ErrorScreen onRetry={() => void checkStatus()} />;
  }

  if (state === 'locked') {
    return (
      <AuthShell>
        <div className="w-full max-w-sm rounded-3xl border border-border/40 bg-card/95 p-8 shadow-none backdrop-blur">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15 text-primary">
              <OpenCodeIcon width={24} height={24} className="opacity-80" />
            </div>
            <div className="space-y-1">
              <h1 className="typography-ui-header font-semibold text-foreground">Unlock OpenChamber</h1>
              <p className="typography-meta text-muted-foreground">
                Enter the password configured for this web session.
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div className="space-y-2">
              <label
                htmlFor="openchamber-ui-password"
                className="typography-ui-label text-left font-medium text-foreground"
              >
                Password
              </label>
              <Input
                id="openchamber-ui-password"
                ref={passwordInputRef}
                type="password"
                autoComplete="current-password"
                placeholder="Enter password"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  if (errorMessage) {
                    setErrorMessage('');
                  }
                }}
                aria-invalid={Boolean(errorMessage) || undefined}
                aria-describedby={errorMessage ? 'oc-ui-auth-error' : undefined}
                disabled={isSubmitting}
              />
              {errorMessage && (
                <p id="oc-ui-auth-error" className="typography-meta text-destructive">
                  {errorMessage}
                </p>
              )}
            </div>

            <Button type="submit" className="w-full" disabled={!password || isSubmitting}>
              {isSubmitting ? 'Unlocking…' : 'Unlock'}
            </Button>
          </form>
        </div>
      </AuthShell>
    );
  }

  return <>{children}</>;
};
