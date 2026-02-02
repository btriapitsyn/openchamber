import * as vscode from 'vscode';
import * as os from 'os';
import { execSync } from 'child_process';
import { createOpencodeServer } from '@opencode-ai/sdk/v2/server';

const READY_CHECK_TIMEOUT_MS = 30000;

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export type OpenCodeDebugInfo = {
  mode: 'managed' | 'external';
  status: ConnectionStatus;
  lastError?: string;
  workingDirectory: string;
  cliAvailable: boolean;
  cliPath: string | null;
  configuredApiUrl: string | null;
  configuredPort: number | null;
  detectedPort: number | null;
  apiPrefix: string;
  apiPrefixDetected: boolean;
  startCount: number;
  restartCount: number;
  lastStartAt: number | null;
  lastConnectedAt: number | null;
  lastExitCode: number | null;
  serverUrl: string | null;
  lastReadyElapsedMs: number | null;
  lastReadyAttempts: number | null;
  lastStartAttempts: number | null;
  version: string | null;
};

export interface OpenCodeManager {
  start(workdir?: string): Promise<void>;
  stop(): Promise<void>;
  restart(): Promise<void>;
  setWorkingDirectory(path: string): Promise<{ success: boolean; restarted: boolean; path: string }>;
  getStatus(): ConnectionStatus;
  getApiUrl(): string | null;
  getWorkingDirectory(): string;
  isCliAvailable(): boolean;
  getDebugInfo(): OpenCodeDebugInfo;
  onStatusChange(callback: (status: ConnectionStatus, error?: string) => void): vscode.Disposable;
}

function resolvePortFromUrl(url: string): number | null {
  try {
    const parsed = new URL(url);
    return parsed.port ? parseInt(parsed.port, 10) : null;
  } catch {
    return null;
  }
}

type ReadyResult =
  | { ok: true; baseUrl: string; elapsedMs: number; attempts: number; version: string | null }
  | { ok: false; elapsedMs: number; attempts: number; version: null };

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, '');
}

function getCandidateBaseUrls(serverUrl: string): string[] {
  const normalized = normalizeBaseUrl(serverUrl);
  try {
    const parsed = new URL(normalized);
    const origin = parsed.origin;

    const candidates: string[] = [];
    const add = (url: string) => {
      const v = normalizeBaseUrl(url);
      if (!candidates.includes(v)) candidates.push(v);
    };

    const normalizedPath = parsed.pathname.replace(/\/+$/, '');
    // Prefer plain origin. Only keep SDK url when already root.
    add(origin);
    if (normalizedPath === '' || normalizedPath === '/') {
      add(normalized);
    }

    return candidates;
  } catch {
    return [normalized];
  }
}

async function waitForReady(serverUrl: string, timeoutMs = 15000): Promise<ReadyResult> {
  const outputChannel = vscode.window.createOutputChannel('OpenChamberManager');
  const start = Date.now();
  const candidates = getCandidateBaseUrls(serverUrl);
  let attempts = 0;

  while (Date.now() - start < timeoutMs) {
    for (const baseUrl of candidates) {
      attempts += 1;
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);

        // Keep using /config since the UI proxies to it (via /api -> strip prefix).
        const url = new URL(`${baseUrl}/global/health`);
        const res = await fetch(url.toString(), {
          method: 'GET',
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        });

        let body: { healthy?: boolean, version?: string } | null = null;
        try {
          body = (await res.json()) as { healthy?: boolean, version?: string };
        } catch {
          body = null;
        }

        clearTimeout(timeout);
        outputChannel?.appendLine(
          `Health check to ${url.toString()} returned ${res.status} with body: ${JSON.stringify(body)}`
        );

        if (res.ok && body?.healthy === true) {
          return { ok: true, baseUrl, elapsedMs: Date.now() - start, attempts, version: body?.version ?? null };
        }
      } catch {
        // ignore
      }
    }

    await new Promise(r => setTimeout(r, 100));
  }

  return { ok: false, elapsedMs: Date.now() - start, attempts, version: null };
}

export function createOpenCodeManager(_context: vscode.ExtensionContext): OpenCodeManager {
  // Discard unused parameter - reserved for future use (state persistence, subscriptions)
  void _context;
  let server: { url: string; close: () => void } | null = null;
  let managedApiUrlOverride: string | null = null;
  let status: ConnectionStatus = 'disconnected';
  let lastError: string | undefined;
  const listeners = new Set<(status: ConnectionStatus, error?: string) => void>();
  const workspaceDirectory = (): string =>
    vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || os.homedir();
  let workingDirectory: string = workspaceDirectory();
  let startCount = 0;
  let restartCount = 0;
  let lastStartAt: number | null = null;
  let lastConnectedAt: number | null = null;
  let lastExitCode: number | null = null;
  let lastReadyElapsedMs: number | null = null;
  let lastReadyAttempts: number | null = null;
  let lastStartAttempts: number | null = null;
  let version: string | null = null;

  let detectedPort: number | null = null;
  let cliMissing = false;

  let pendingOperation: Promise<void> | null = null;

  const config = vscode.workspace.getConfiguration('openchamber');
  const configuredApiUrl = config.get<string>('apiUrl') || '';
  const useConfiguredUrl = configuredApiUrl && configuredApiUrl.trim().length > 0;

  let configuredPort: number | null = null;
  if (useConfiguredUrl) {
    try {
      const parsed = new URL(configuredApiUrl);
      if (parsed.port) {
        configuredPort = parseInt(parsed.port, 10);
      }
    } catch {
      // Invalid URL
    }
  }

  const setStatus = (newStatus: ConnectionStatus, error?: string) => {
    if (status !== newStatus || lastError !== error) {
      status = newStatus;
      lastError = error;
      if (newStatus === 'connected') {
        lastConnectedAt = Date.now();
      }
      listeners.forEach(cb => cb(status, error));
    }
  };

  const getApiUrl = (): string | null => {
    if (useConfiguredUrl && configuredApiUrl) {
      return configuredApiUrl.replace(/\/+$/, '');
    }
    if (managedApiUrlOverride) {
      return managedApiUrlOverride.replace(/\/+$/, '');
    }
    if (server?.url) {
      return server.url.replace(/\/+$/, '');
    }
    if (detectedPort) {
      return `http://127.0.0.1:${detectedPort}`;
    }
    return null;
  };

  async function startInternal(workdir?: string): Promise<void> {
    startCount += 1;
    setStatus('connecting');
    lastStartAt = Date.now();
    lastStartAttempts = startCount;

    if (typeof workdir === 'string' && workdir.trim().length > 0) {
      workingDirectory = workdir.trim();
    } else {
      workingDirectory = workspaceDirectory();
    }

    if (useConfiguredUrl && configuredApiUrl) {
      setStatus('connecting');
      setStatus('connected');
      return;
    }

    // If server already running, don't spawn another
    if (server) {
      if (status !== 'connected') {
        setStatus('connected');
      }
      return;
    }

    setStatus('connecting');
    cliMissing = false;

    detectedPort = null;
    lastExitCode = null;
    managedApiUrlOverride = null;
 
    try {
      // SDK spawns `opencode serve` in current process cwd.
      // Some OpenCode endpoints behave differently based on server process cwd,
      // so ensure we start it from the workspace directory.
      const originalCwd = process.cwd();
      try {
        process.chdir(workingDirectory);
        server = await createOpencodeServer({
          hostname: '127.0.0.1',
          port: 0,
          timeout: READY_CHECK_TIMEOUT_MS,
          signal: undefined,
        });
      } finally {
        try {
          process.chdir(originalCwd);
        } catch {
          // ignore
        }
      }

      if (server && server.url) {
        // Validate readiness for the current workspace context.
        const ready = await waitForReady(server.url, READY_CHECK_TIMEOUT_MS);
        lastReadyElapsedMs = ready.elapsedMs;
        lastReadyAttempts = ready.attempts;
        if (ready.ok) {
          managedApiUrlOverride = ready.baseUrl;
          detectedPort = resolvePortFromUrl(ready.baseUrl);
          version = ready.version;
          setStatus('connected');
        } else {
          try {
            server.close();
          } catch {
            // ignore
          }
          server = null;
          throw new Error('Server started but health check failed');
        }
      } else {
        throw new Error('Server started but URL is missing');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      
      // Check for ENOENT or generic spawn failure which implies CLI missing
      if (message.includes('ENOENT') || message.includes('spawn opencode')) {
        cliMissing = true;
        setStatus('error', 'OpenCode CLI not found. Install it or ensure it\'s in PATH.');
        vscode.window.showErrorMessage(
          'OpenCode CLI not found. Please install it or ensure it\'s in PATH.',
          'More Info'
        ).then(selection => {
          if (selection === 'More Info') {
            vscode.env.openExternal(vscode.Uri.parse('https://github.com/anomalyco/opencode'));
          }
        });
      } else {
        setStatus('error', `Failed to start OpenCode: ${message}`);
      }
    }
  }

  async function stopInternal(): Promise<void> {
    const portToKill = detectedPort;
    
    if (server) {
      try {
        server.close();
      } catch {
        // Ignore close errors
      }
      server = null;
    }

    // SDK's proc.kill() only kills the Node wrapper, not the actual opencode binary.
    // Kill any process listening on our port to clean up orphaned children.
    if (portToKill) {
      try {
        const lsofOutput = execSync(`lsof -ti:${portToKill} 2>/dev/null || true`, { 
          encoding: 'utf8',
          timeout: 5000 
        });
        const myPid = process.pid;
        for (const pidStr of lsofOutput.split(/\s+/)) {
          const pid = parseInt(pidStr.trim(), 10);
          if (pid && pid !== myPid) {
            try {
              execSync(`kill -9 ${pid} 2>/dev/null || true`, { stdio: 'ignore', timeout: 2000 });
            } catch {
              // Ignore
            }
          }
        }
      } catch {
        // Ignore - process may already be dead
      }
    }

    managedApiUrlOverride = null;
    detectedPort = null;
    version = null;
    setStatus('disconnected');
  }

  async function restartInternal(): Promise<void> {
    restartCount += 1;
    await stopInternal();
    await new Promise(r => setTimeout(r, 250));
    await startInternal();
  }

  async function start(workdir?: string): Promise<void> {
    if (pendingOperation) {
      await pendingOperation;
      if (server) {
        return;
      }
    }
    lastStartAttempts = 1;
    pendingOperation = startInternal(workdir);
    try {
      await pendingOperation;
    } finally {
      pendingOperation = null;
    }
  }

  async function stop(): Promise<void> {
    if (pendingOperation) {
      await pendingOperation;
    }
    // Check if already stopped
    if (!server) {
      return;
    }
    pendingOperation = stopInternal();
    try {
      await pendingOperation;
    } finally {
      pendingOperation = null;
    }
  }

  async function restart(): Promise<void> {
    if (pendingOperation) {
      await pendingOperation;
    }
    lastStartAttempts = 1;
    pendingOperation = restartInternal();
    try {
      await pendingOperation;
    } finally {
      pendingOperation = null;
    }
  }

  async function setWorkingDirectory(newPath: string): Promise<{ success: boolean; restarted: boolean; path: string }> {
    void newPath;
    const workspacePath = workspaceDirectory();
    const nextDirectory = workspacePath;

    if (workingDirectory === nextDirectory) {
      return { success: true, restarted: false, path: nextDirectory };
    }

    workingDirectory = nextDirectory;

    if (useConfiguredUrl && configuredApiUrl) {
      return { success: true, restarted: false, path: nextDirectory };
    }

    return { success: true, restarted: false, path: nextDirectory };
  }

  return {
    start,
    stop,
    restart,
    setWorkingDirectory,
    getStatus: () => status,
    getApiUrl,
    getWorkingDirectory: () => workingDirectory,
    isCliAvailable: () => !cliMissing,
    getDebugInfo: () => ({
      mode: useConfiguredUrl && configuredApiUrl ? 'external' : 'managed',
      status,
      lastError,
      workingDirectory,
      cliAvailable: !cliMissing,
      cliPath: null,
      configuredApiUrl: useConfiguredUrl && configuredApiUrl ? configuredApiUrl.replace(/\/+$/, '') : null,
      configuredPort,
      detectedPort,
      apiPrefix: '',
      apiPrefixDetected: true,
      startCount,
      restartCount,
      lastStartAt,
      lastConnectedAt,
      lastExitCode,
      serverUrl: getApiUrl(),
      lastReadyElapsedMs,
      lastReadyAttempts,
      lastStartAttempts,
      version,
    }),
    onStatusChange(callback) {
      listeners.add(callback);
      callback(status, lastError);
      return new vscode.Disposable(() => listeners.delete(callback));
    },
  };
}
