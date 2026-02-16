import { resolveSelectedInstance } from '@/stores/useInstancesStore';
import type { RuntimeAPIs } from '@/lib/api/types';
import { getAccessToken } from '@/lib/auth/tokenStorage';

const DEFAULT_API_BASE_URL = import.meta.env.VITE_OPENCODE_URL || '/api';

const trimTrailingSlashes = (value: string): string => value.replace(/\/+$/, '');
const ensureLeadingSlash = (value: string): string => (value.startsWith('/') ? value : `/${value}`);

const resolveDesktopApiBaseUrl = (): string | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  const runtimeApis = (window as typeof window & { __OPENCHAMBER_RUNTIME_APIS__?: RuntimeAPIs }).__OPENCHAMBER_RUNTIME_APIS__;
  const desktopServer = window.__OPENCHAMBER_DESKTOP_SERVER__;
  const isDesktop = runtimeApis?.runtime?.isDesktop === true;

  if (!isDesktop || !desktopServer || typeof desktopServer.origin !== 'string' || desktopServer.origin.trim().length === 0) {
    return null;
  }

  return `${trimTrailingSlashes(desktopServer.origin.trim())}/api`;
};

export const resolveRuntimeApiBaseUrl = (): string => {
  const desktopBaseUrl = resolveDesktopApiBaseUrl();
  if (desktopBaseUrl) {
    return desktopBaseUrl;
  }

  const selectedInstance = resolveSelectedInstance();
  if (selectedInstance && typeof selectedInstance.apiBaseUrl === 'string' && selectedInstance.apiBaseUrl.trim().length > 0) {
    return selectedInstance.apiBaseUrl.trim();
  }

  return DEFAULT_API_BASE_URL;
};

export const resolveRuntimeApiEndpoint = (path: string): string => {
  const base = trimTrailingSlashes(resolveRuntimeApiBaseUrl() || '/api');
  return `${base}${ensureLeadingSlash(path)}`;
};

export const buildRuntimeApiHeaders = (overrides?: HeadersInit): Headers => {
  const headers = new Headers(overrides ?? undefined);
  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json');
  }

  if (!headers.has('Authorization')) {
    const selected = resolveSelectedInstance();
    if (selected?.id) {
      const token = getAccessToken(selected.id);
      if (token) {
        headers.set('Authorization', `Bearer ${token}`);
      }
    }
  }

  return headers;
};
