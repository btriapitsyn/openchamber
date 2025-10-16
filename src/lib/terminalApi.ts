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
  type: 'connected' | 'data' | 'exit';
  data?: string;
  exitCode?: number;
  signal?: number | null;
}

export interface CreateTerminalOptions {
  cwd: string;
  cols?: number;
  rows?: number;
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
 * Connect to terminal output stream via Server-Sent Events
 */
export function connectTerminalStream(
  sessionId: string,
  onEvent: (event: TerminalStreamEvent) => void,
  onError?: (error: Error) => void
): () => void {
  const eventSource = new EventSource(`/api/terminal/${sessionId}/stream`);
  let hasDispatchedOpen = false;

  eventSource.onopen = () => {
    if (hasDispatchedOpen) {
      return;
    }
    hasDispatchedOpen = true;
    // Emit synthetic connected event to unblock UI immediately
    onEvent({ type: 'connected' });
  };

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data) as TerminalStreamEvent;
      onEvent(data);
    } catch (error) {
      console.error('Failed to parse terminal event:', error);
      onError?.(error as Error);
    }
  };

  eventSource.onerror = (error) => {
    console.error('Terminal stream error:', error);
    onError?.(new Error('Terminal stream connection error'));
    eventSource.close();
  };

  // Return cleanup function
  return () => {
    eventSource.close();
  };
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
