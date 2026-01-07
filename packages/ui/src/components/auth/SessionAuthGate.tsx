import React from 'react';
import { RiLockLine, RiLockUnlockLine, RiLoader4Line } from '@remixicon/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { isDesktopRuntime, isVSCodeRuntime } from '@/lib/desktop';
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
    <div className="flex flex-col items-center gap-6 text-center">
      <div className="space-y-2">
        <h1 className="typography-ui-header font-semibold text-destructive">Unable to reach server</h1>
        <p className="typography-meta text-muted-foreground max-w-xs">
          We couldn't verify the UI session. Check that the service is running and try again.
        </p>
      </div>
      <Button type="button" onClick={onRetry} className="w-full max-w-xs">
        Retry
      </Button>
    </div>
  </AuthShell>
);

interface SessionAuthGateProps {
  children: React.ReactNode;
}

type GateState = 'pending' | 'authenticated' | 'locked' | 'error';

const getTokenFromUrl = (): string | null => {
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get('token');
  } catch {
    return null;
  }
};

const clearTokenFromUrl = () => {
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete('token');
    window.history.replaceState({}, '', url.toString());
  } catch {
    // Ignore errors
  }
};

export const SessionAuthGate: React.FC<SessionAuthGateProps> = ({ children }) => {
  const desktopRuntime = React.useMemo(() => isDesktopRuntime(), []);
  const vscodeRuntime = React.useMemo(() => isVSCodeRuntime(), []);
  const skipAuth = desktopRuntime || vscodeRuntime;
  const [state, setState] = React.useState<GateState>(() => (skipAuth ? 'authenticated' : 'pending'));
  const [password, setPassword] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState('');
  const passwordInputRef = React.useRef<HTMLInputElement | null>(null);
  const hasResyncedRef = React.useRef(skipAuth);
  const hasTriedUrlTokenRef = React.useRef(false);

  const checkStatus = React.useCallback(async () => {
    if (skipAuth) {
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
  }, [skipAuth]);

  React.useEffect(() => {
    if (skipAuth) {
      return;
    }
    void checkStatus();
  }, [checkStatus, skipAuth]);

  React.useEffect(() => {
    if (!skipAuth && state === 'locked') {
      hasResyncedRef.current = false;
    }
  }, [skipAuth, state]);

  React.useEffect(() => {
    if (state === 'locked' && passwordInputRef.current) {
      passwordInputRef.current.focus();
      passwordInputRef.current.select();
    }
  }, [state]);

  // Auto-login with URL token parameter
  React.useEffect(() => {
    if (skipAuth || state !== 'locked' || hasTriedUrlTokenRef.current || isSubmitting) {
      return;
    }

    const urlToken = getTokenFromUrl();
    if (!urlToken) {
      return;
    }

    hasTriedUrlTokenRef.current = true;
    clearTokenFromUrl();

    // Auto-submit the password from URL
    setIsSubmitting(true);
    setErrorMessage('');

    submitPassword(urlToken)
      .then((response) => {
        if (response.ok) {
          setPassword('');
          setState('authenticated');
          return;
        }
        if (response.status === 401) {
          setErrorMessage('URL token invalid. Please enter password manually.');
          setState('locked');
          return;
        }
        setErrorMessage('Unexpected response from server.');
        setState('error');
      })
      .catch((error) => {
        console.warn('Failed to submit URL token:', error);
        setErrorMessage('Network error. Check connection and retry.');
        setState('error');
      })
      .finally(() => {
        setIsSubmitting(false);
      });
  }, [skipAuth, state, isSubmitting]);

  React.useEffect(() => {
    if (skipAuth) {
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
  }, [skipAuth, state]);

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
        <div className="flex flex-col items-center gap-6 w-full max-w-xs">
          <div className="flex flex-col items-center gap-1 text-center">
            <h1 className="text-xl font-semibold text-foreground">
              Unlock OpenChamber
            </h1>
            <p className="typography-meta text-muted-foreground">
              This session is password-protected.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="w-full space-y-2" data-keyboard-avoid="true">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <RiLockLine className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
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
                  className="pl-10"
                  aria-invalid={Boolean(errorMessage) || undefined}
                  aria-describedby={errorMessage ? 'oc-ui-auth-error' : undefined}
                  disabled={isSubmitting}
                />
              </div>
              <Button
                type="submit"
                size="icon"
                disabled={!password || isSubmitting}
                aria-label={isSubmitting ? 'Unlocking' : 'Unlock'}
              >
                {isSubmitting ? (
                  <RiLoader4Line className="h-4 w-4 animate-spin" />
                ) : (
                  <RiLockUnlockLine className="h-4 w-4" />
                )}
              </Button>
            </div>
            {errorMessage && (
              <p id="oc-ui-auth-error" className="typography-meta text-destructive">
                {errorMessage}
              </p>
            )}
          </form>
        </div>
      </AuthShell>
    );
  }

  return <>{children}</>;
};
