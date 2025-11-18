import { createDesktopAPIs } from './api';
import { initializeDesktopBridge } from './lib/bridge';
import type { RuntimeAPIs } from '@openchamber/ui/lib/api/types';
import type { DesktopApi } from '@openchamber/ui/lib/desktop';
import '@openchamber/ui/index.css';
import '@openchamber/ui/styles/fonts';

// Shim Node.js globals for browser environment (after imports to avoid Vite HMR issues)
if (!(window as typeof globalThis & { process?: unknown }).process) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as typeof globalThis & { process?: any }).process = {
    env: {},
    platform: 'darwin',
    version: 'v20.0.0',
    versions: {},
    cwd: () => '/',
    nextTick: (fn: () => void) => Promise.resolve().then(() => fn()),
  };
}

declare global {
  interface Window {
    __OPENCHAMBER_RUNTIME_APIS__?: RuntimeAPIs;
    __OPENCHAMBER_HOME__?: string;
    opencodeDesktop?: DesktopApi;
  }
}

try {
  await initializeDesktopBridge();
  window.__OPENCHAMBER_RUNTIME_APIS__ = createDesktopAPIs();
} catch (error) {
  console.error('[main] FATAL: Failed to initialize desktop runtime:', error);
  document.body.innerHTML = `
    <div style="padding: 40px; font-family: monospace; color: #ff6b6b; background: #1a1a1a; height: 100vh;">
      <h1>Desktop Runtime Initialization Failed</h1>
      <pre style="background: #2a2a2a; padding: 20px; border-radius: 8px; overflow: auto;">
${error instanceof Error ? error.stack : String(error)}
      </pre>
      <p style="margin-top: 20px; color: #999;">Press Cmd+Option+I to open DevTools for more details</p>
    </div>
  `;
  throw error;
}

// Get home directory from Tauri
let homeDirectory: string | undefined;
try {
  const { homeDir } = await import('@tauri-apps/api/path');
  homeDirectory = await homeDir();
} catch {
  homeDirectory = undefined;
}

// Set global home directory for UI
if (homeDirectory) {
  window.__OPENCHAMBER_HOME__ = homeDirectory;
}

// Expose minimal desktop API for runtime detection and lifecycle hooks
window.opencodeDesktop = {
  homeDirectory,
  async getServerInfo() {
    const server = window.__OPENCHAMBER_DESKTOP_SERVER__;
    return {
      webPort: server?.origin ? parseInt(server.origin.split(':')[2] || '0', 10) : null,
      openCodePort: server?.opencodePort ?? null,
      host: '127.0.0.1',
      ready: true,
    };
  },
  async getSettings() {
    try {
      const response = await fetch('/api/config/settings', {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) {
        console.warn('[desktop] Failed to load settings:', response.statusText);
        return {};
      }
      return await response.json();
    } catch (error) {
      console.error('[desktop] Error loading settings:', error);
      return {};
    }
  },
  async updateSettings(changes) {
    try {
      const response = await fetch('/api/config/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(changes),
      });
      if (!response.ok) {
        console.warn('[desktop] Failed to update settings:', response.statusText);
        return {};
      }
      return await response.json();
    } catch (error) {
      console.error('[desktop] Error updating settings:', error);
      return {};
    }
  },
  async restartOpenCode() {
    try {
      const response = await fetch('/api/config/reload', { method: 'POST' });
      return { success: response.ok };
    } catch {
      return { success: false };
    }
  },
  async shutdown() {
    return { success: false };
  },
  async getHomeDirectory() {
    return { success: true, path: homeDirectory || null };
  },
  markRendererReady() {
    // Lifecycle hook for desktop runtime - no-op for Tauri Stage 1
  },
  async requestDirectoryAccess(directoryPath: string) {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({
        directory: true,
        multiple: false,
        defaultPath: directoryPath,
      });

      if (!selected || typeof selected !== 'string') {
        return { success: false, error: 'Directory selection cancelled' };
      }

      // Add to approved directories in settings
      const currentSettings = await window.opencodeDesktop?.getSettings?.();
      const approvedDirs = Array.isArray(currentSettings?.approvedDirectories)
        ? currentSettings.approvedDirectories
        : [];

      if (!approvedDirs.includes(selected)) {
        approvedDirs.push(selected);
        await window.opencodeDesktop?.updateSettings?.({ approvedDirectories: approvedDirs });
      }

      return { success: true, path: selected };
    } catch (error) {
      console.error('[desktop] Error requesting directory access:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  },
  async startAccessingDirectory(_directoryPath: string) {
    return { success: true };
  },
  async stopAccessingDirectory(_directoryPath: string) {
    return { success: true };
  },
};

try {
  await import('@openchamber/ui/main');
} catch (error) {
  console.error('[main] FATAL: Failed to load UI module:', error);
  document.body.innerHTML = `
    <div style="padding: 40px; font-family: monospace; color: #ff6b6b; background: #1a1a1a; height: 100vh;">
      <h1>UI Module Load Failed</h1>
      <pre style="background: #2a2a2a; padding: 20px; border-radius: 8px; overflow: auto;">
${error instanceof Error ? error.stack : String(error)}
      </pre>
      <p style="margin-top: 20px; color: #999;">Check DevTools console for details</p>
    </div>
  `;
  throw error;
}
