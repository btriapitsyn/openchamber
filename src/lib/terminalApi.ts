/**
 * Terminal API Client
 * Provides typed interface for terminal operations via node-pty backend
 */

export interface TerminalSession {
  sessionId: string;
  cols: number;
  rows: number;
}

export interface TerminalStreamEvent {
  type: 'connected' | 'data' | 'exit' | 'reconnecting';
  data?: string;
  exitCode?: number;
  signal?: number | null;
  attempt?: number;
  maxAttempts?: number;
}

export interface CreateTerminalOptions {
  cwd: string;
  cols?: number;
  rows?: number;
}

export interface ConnectStreamOptions {
  maxRetries?: number;
  initialRetryDelay?: number;
  maxRetryDelay?: number;
  connectionTimeout?: number;
}

/**
 * Create a new terminal session
 */
export async function createTerminalSession(
  options: CreateTerminalOptions
): Promise<TerminalSession> {
  const response = await fetch('/api/terminal/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      cwd: options.cwd,
      cols: options.cols || 80,
      rows: options.rows || 24,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to create terminal' }));
    throw new Error(error.error || 'Failed to create terminal session');
  }

  return response.json();
}

/**
 * Connect to terminal output stream via Server-Sent Events with automatic reconnection
 */
export function connectTerminalStream(
  sessionId: string,
  onEvent: (event: TerminalStreamEvent) => void,
  onError?: (error: Error, fatal?: boolean) => void,
  options: ConnectStreamOptions = {}
): () => void {
  const {
    maxRetries = 3,
    initialRetryDelay = 1000,
    maxRetryDelay = 8000,
    connectionTimeout = 10000,
  } = options;

  let eventSource: EventSource | null = null;
  let retryCount = 0;
  let retryTimeout: ReturnType<typeof setTimeout> | null = null;
  let connectionTimeoutId: ReturnType<typeof setTimeout> | null = null;
  let isClosed = false;
  let hasDispatchedOpen = false;
  let terminalExited = false;

  const clearTimeouts = () => {
    if (retryTimeout) {
      clearTimeout(retryTimeout);
      retryTimeout = null;
    }
    if (connectionTimeoutId) {
      clearTimeout(connectionTimeoutId);
      connectionTimeoutId = null;
    }
  };

  const cleanup = () => {
    isClosed = true;
    clearTimeouts();
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
  };

  const connect = () => {
    if (isClosed || terminalExited) {
      return;
    }

    // RiCheckLine if EventSource already exists and is connecting/open
    if (eventSource && eventSource.readyState !== EventSource.CLOSED) {
      console.warn('Attempted to create duplicate EventSource, skipping');
      return;
    }

    hasDispatchedOpen = false;
    eventSource = new EventSource(`/api/terminal/${sessionId}/stream`);

    // Connection timeout detection
    connectionTimeoutId = setTimeout(() => {
      if (!hasDispatchedOpen && eventSource?.readyState !== EventSource.OPEN) {
        console.error('Terminal connection timeout');
        eventSource?.close();
        handleError(new Error('Connection timeout'), false);
      }
    }, connectionTimeout);

    eventSource.onopen = () => {
      if (hasDispatchedOpen) {
        return;
      }
      hasDispatchedOpen = true;
      retryCount = 0; // Reset retry count on successful connection
      clearTimeouts();

      // Emit synthetic connected event to unblock UI immediately
      onEvent({ type: 'connected' });
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as TerminalStreamEvent;

        // Handle terminal exit - don't reconnect
        if (data.type === 'exit') {
          terminalExited = true;
          cleanup();
        }

        onEvent(data);
      } catch (error) {
        console.error('Failed to parse terminal event:', error);
        onError?.(error as Error, false);
      }
    };

    eventSource.onerror = (error) => {
      console.error('Terminal stream error:', error, 'readyState:', eventSource?.readyState);
      clearTimeouts();

      // Differentiate between network errors and terminal death
      const isFatalError = terminalExited || eventSource?.readyState === EventSource.CLOSED;

      eventSource?.close();
      eventSource = null;

      if (!terminalExited) {
        handleError(new Error('Terminal stream connection error'), isFatalError);
      }
    };
  };

  const handleError = (error: Error, isFatal: boolean) => {
    if (isClosed || terminalExited) {
      return;
    }

    // Exponential backoff reconnection
    if (retryCount < maxRetries && !isFatal) {
      retryCount++;
      const delay = Math.min(initialRetryDelay * Math.pow(2, retryCount - 1), maxRetryDelay);

      console.log(`Reconnecting to terminal stream (attempt ${retryCount}/${maxRetries}) in ${delay}ms`);

      // Notify UI about reconnection attempt
      onEvent({
        type: 'reconnecting',
        attempt: retryCount,
        maxAttempts: maxRetries,
      });

      retryTimeout = setTimeout(() => {
        if (!isClosed && !terminalExited) {
          connect();
        }
      }, delay);
    } else {
      // Max retries reached or fatal error
      console.error(`Terminal connection failed after ${retryCount} attempts`);
      onError?.(error, true);
      cleanup();
    }
  };

  // Initial connection
  connect();

  // Return cleanup function
  return cleanup;
}

/**
 * Send input to terminal session
 */
export async function sendTerminalInput(
  sessionId: string,
  data: string
): Promise<void> {
  const response = await fetch(`/api/terminal/${sessionId}/input`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: data,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to send input' }));
    throw new Error(error.error || 'Failed to send terminal input');
  }
}

/**
 * Resize terminal session
 */
export async function resizeTerminal(
  sessionId: string,
  cols: number,
  rows: number
): Promise<void> {
  const response = await fetch(`/api/terminal/${sessionId}/resize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cols, rows }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to resize terminal' }));
    throw new Error(error.error || 'Failed to resize terminal');
  }
}

/**
 * Close terminal session
 */
export async function closeTerminal(sessionId: string): Promise<void> {
  const response = await fetch(`/api/terminal/${sessionId}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to close terminal' }));
    throw new Error(error.error || 'Failed to close terminal');
  }
}
