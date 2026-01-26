/**
 * Remote client configuration for mobile app
 *
 * This module helps configure the OpenCode client to connect to a remote server
 * instead of the local backend.
 *
 * SECURITY NOTE: The remote URL and token are stored in window globals
 * (__OPENCHAMBER_REMOTE_URL__, __OPENCHAMBER_REMOTE_TOKEN__) for the OpenCode
 * client to access. In a mobile Capacitor app context, this is acceptable as
 * the app runs in an isolated WebView. However, be aware that any JavaScript
 * running in the same context can access these values.
 */

// Store the remote URL globally for the client to use
let remoteBaseUrl: string | null = null;
let remoteToken: string | null = null;

export function setRemoteUrl(url: string, token?: string) {
  // Normalize URL: remove trailing slashes and ensure it ends with /api
  let normalizedUrl = url.trim().replace(/\/+$/, '');

  // If URL doesn't end with /api, append it
  if (!normalizedUrl.endsWith('/api')) {
    normalizedUrl = `${normalizedUrl}/api`;
  }

  remoteBaseUrl = normalizedUrl;
  remoteToken = token || null;

  // Store in window for the client to pick up
  const win = window as Window & {
    __OPENCHAMBER_REMOTE_URL__?: string;
    __OPENCHAMBER_REMOTE_TOKEN__?: string;
  };

  win.__OPENCHAMBER_REMOTE_URL__ = normalizedUrl;
  if (token) {
    win.__OPENCHAMBER_REMOTE_TOKEN__ = token;
  }

  console.log('[RemoteClient] Set remote URL:', normalizedUrl);
}

export function getRemoteUrl(): string | null {
  return remoteBaseUrl;
}

export function getRemoteToken(): string | null {
  return remoteToken;
}

export function clearRemoteUrl() {
  remoteBaseUrl = null;
  remoteToken = null;
  
  const win = window as Window & {
    __OPENCHAMBER_REMOTE_URL__?: string;
    __OPENCHAMBER_REMOTE_TOKEN__?: string;
  };
  
  delete win.__OPENCHAMBER_REMOTE_URL__;
  delete win.__OPENCHAMBER_REMOTE_TOKEN__;
}

/**
 * Check if we're in remote mode
 */
export function isRemoteMode(): boolean {
  return remoteBaseUrl !== null;
}

/**
 * Create a fetch wrapper that adds authorization header when in remote mode.
 *
 * IMPORTANT: This returns a fetch wrapper function that must be used explicitly.
 * It does NOT override the global fetch. Use this wrapper when making API calls
 * that require authentication in remote mode.
 *
 * Example usage:
 *   const remoteFetch = createRemoteFetch();
 *   const response = await remoteFetch('/api/endpoint', { method: 'GET' });
 *
 * The OpenCode client (packages/ui) automatically handles authorization via
 * the window.__OPENCHAMBER_REMOTE_TOKEN__ global when making API requests.
 */
export function createRemoteFetch(): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const token = getRemoteToken();
    
    if (token) {
      const headers = new Headers(init?.headers);
      if (!headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${token}`);
      }
      
      return fetch(input, {
        ...init,
        headers,
      });
    }
    
    return fetch(input, init);
  };
}
