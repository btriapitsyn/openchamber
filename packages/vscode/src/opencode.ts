import * as vscode from 'vscode';
import { spawn, ChildProcess, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Optimized timeouts for faster startup
const PORT_DETECTION_TIMEOUT_MS = 10000;
const READY_CHECK_TIMEOUT_MS = 12000;
const READY_CHECK_INTERVAL_MS = 100;  // Fast polling during startup
const HEALTH_CHECK_INTERVAL_MS = 5000;
const SHUTDOWN_TIMEOUT_MS = 3000;

// Regex to detect port from CLI output (matches desktop pattern)
const URL_REGEX = /https?:\/\/[^:\s]+:(\d+)(\/[^\s"']*)?/gi;
const FALLBACK_PORT_REGEX = /(?:^|\s)(?:127\.0\.0\.1|localhost):(\d+)/i;

const API_PREFIX_CANDIDATES = ['', '/api'] as const;

const BIN_CANDIDATES = [
  process.env.OPENCHAMBER_OPENCODE_PATH,
  process.env.OPENCHAMBER_OPENCODE_BIN,
  process.env.OPENCODE_PATH,
  process.env.OPENCODE_BINARY,
  '/opt/homebrew/bin/opencode',
  '/usr/local/bin/opencode',
  '/usr/bin/opencode',
  path.join(os.homedir(), '.local/bin/opencode'),
  path.join(os.homedir(), '.opencode/bin/opencode'),
].filter(Boolean) as string[];

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

function isExecutable(filePath: string): boolean {
  try {
    fs.accessSync(filePath, fs.constants.X_OK);
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function getLoginShellPath(): string | null {
  if (process.platform === 'win32') {
    return null;
  }

  const shell = process.env.SHELL || '/bin/zsh';
  const shellName = path.basename(shell);

  // Nushell requires different flag syntax and PATH access
  const isNushell = shellName === 'nu' || shellName === 'nushell';
  const args = isNushell
    ? ['-l', '-i', '-c', '$env.PATH | str join (char esep)']
    : ['-lic', 'echo -n "$PATH"'];

  try {
    const result = spawnSync(shell, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (result.status === 0 && typeof result.stdout === 'string') {
      const value = result.stdout.trim();
      if (value) {
        return value;
      }
    }
  } catch {
    // ignore
  }
  return null;
}

function buildAugmentedPath(): string {
  const augmented = new Set<string>();

  const loginPath = getLoginShellPath();
  if (loginPath) {
    for (const segment of loginPath.split(path.delimiter)) {
      if (segment) {
        augmented.add(segment);
      }
    }
  }

  const current = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  for (const segment of current) {
    augmented.add(segment);
  }

  return Array.from(augmented).join(path.delimiter);
}

function resolveCliPath(): string | null {
  // First check explicit candidates
  for (const candidate of BIN_CANDIDATES) {
    if (candidate && isExecutable(candidate)) {
      return candidate;
    }
  }

  // Then search in augmented PATH
  const augmentedPath = buildAugmentedPath();
  for (const segment of augmentedPath.split(path.delimiter)) {
    const candidate = path.join(segment, 'opencode');
    if (isExecutable(candidate)) {
      return candidate;
    }
  }

  // Fallback: try login shell detection
  if (process.platform !== 'win32') {
    const shellCandidates = [
      process.env.SHELL,
      '/bin/bash',
      '/bin/zsh',
      '/bin/sh',
    ].filter(Boolean) as string[];

    for (const shellPath of shellCandidates) {
      if (!isExecutable(shellPath)) continue;
      try {
        const shellName = path.basename(shellPath);
        const isNushell = shellName === 'nu' || shellName === 'nushell';
        const args = isNushell
          ? ['-l', '-i', '-c', 'which opencode']
          : ['-lic', 'command -v opencode'];

        const result = spawnSync(shellPath, args, {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        if (result.status === 0) {
          const candidate = result.stdout.trim().split(/\s+/).pop();
          if (candidate && isExecutable(candidate)) {
            return candidate;
          }
        }
      } catch {
        // continue
      }
    }
  }

  return null;
}

async function checkHealth(apiUrl: string, quick = false): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutMs = quick ? 1500 : 3000;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const normalized = apiUrl.replace(/\/+$/, '');
    const candidates: string[] = [`${normalized}/config`];

    for (const target of candidates) {
      try {
        const response = await fetch(target, {
          signal: controller.signal,
          headers: { Accept: 'application/json' },
        });
        if (response.ok) {
          clearTimeout(timeout);
          return true;
        }
      } catch {
        // try next
      }
    }

    clearTimeout(timeout);
  } catch {
    // ignore
  }
  return false;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function createOpenCodeManager(_context: vscode.ExtensionContext): OpenCodeManager {
  let childProcess: ChildProcess | null = null;
  let status: ConnectionStatus = 'disconnected';
  let healthCheckInterval: NodeJS.Timeout | null = null;
  let lastError: string | undefined;
  const listeners = new Set<(status: ConnectionStatus, error?: string) => void>();
  let workingDirectory: string = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || os.homedir();
  let startCount = 0;
  let restartCount = 0;
  let lastStartAt: number | null = null;
  let lastConnectedAt: number | null = null;
  let lastExitCode: number | null = null;

  // Port detection state (like desktop)
  let detectedPort: number | null = null;
  let portWaiters: Array<(port: number) => void> = [];

  // OpenCode API prefix detection (some versions serve under /api)
  let apiPrefix: string = '';
  let apiPrefixDetected = false;

  // Check if user configured a specific API URL
  const config = vscode.workspace.getConfiguration('openchamber');
  const configuredApiUrl = config.get<string>('apiUrl') || '';
  const useConfiguredUrl = configuredApiUrl && configuredApiUrl.trim().length > 0;

  // Parse configured URL to extract port if specified
  let configuredPort: number | null = null;
  if (useConfiguredUrl) {
    try {
      const parsed = new URL(configuredApiUrl);
      if (parsed.port) {
        configuredPort = parseInt(parsed.port, 10);
      }
    } catch {
      // Invalid URL, will use dynamic port
    }
  }

  const cliPath = resolveCliPath();
  const cliAvailable = cliPath !== null;

  const normalizeApiPrefix = (prefix: string): string => {
    const trimmed = (prefix || '').trim();
    if (!trimmed || trimmed === '/') return '';
    const withLeading = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
    return withLeading.endsWith('/') ? withLeading.slice(0, -1) : withLeading;
  };

  const inferPrefixFromLogPath = (candidatePath: string | null | undefined): string | null => {
    if (!candidatePath) return null;
    const normalized = normalizeApiPrefix(candidatePath);
    if (normalized === '/api' || normalized.startsWith('/api/')) {
      return '/api';
    }
    return null;
  };

  const setDetectedApiPrefix = (prefix: string) => {
    const normalized = normalizeApiPrefix(prefix);
    if (!apiPrefixDetected || apiPrefix !== normalized) {
      apiPrefix = normalized;
      apiPrefixDetected = true;
    }
  };

  const buildApiBaseUrlFromPort = (port: number, prefixOverride?: string): string => {
    const prefix = normalizeApiPrefix(prefixOverride !== undefined ? prefixOverride : apiPrefixDetected ? apiPrefix : '');
    return `http://localhost:${port}${prefix}`;
  };

  const detectApiPrefixFromOutput = (text: string) => {
    if (!text) return;
    URL_REGEX.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = URL_REGEX.exec(text)) !== null) {
      const port = parseInt(match[1], 10);
      if (!Number.isFinite(port) || port <= 0) continue;
      if (detectedPort !== null && port !== detectedPort) continue;

      const inferred = inferPrefixFromLogPath(match[2] || '');
      if (inferred !== null) {
        setDetectedApiPrefix(inferred);
        return;
      }
    }
  };

  const extractPrefixFromOpenApiDoc = (content: string): string | null => {
    const match = content.match(/__OPENCODE_API_BASE__\s*=\s*['"]([^'"]+)['"]/);
    if (!match?.[1]) return null;
    try {
      const parsed = new URL(match[1], 'http://localhost');
      return normalizeApiPrefix(parsed.pathname || '');
    } catch {
      return normalizeApiPrefix(match[1]);
    }
  };

  const detectApiPrefix = async (port: number): Promise<string> => {
    if (apiPrefixDetected) return apiPrefix;

    const origin = `http://localhost:${port}`;

    // Try /doc for explicit base hints first (best signal when available).
    for (const candidate of API_PREFIX_CANDIDATES) {
      const prefix = normalizeApiPrefix(candidate);
      try {
        const response = await fetch(`${origin}${prefix}/doc`, { method: 'GET', headers: { Accept: '*/*' } });
        if (!response.ok) continue;
        const text = await response.text();
        const extracted = extractPrefixFromOpenApiDoc(text);
        if (extracted !== null) {
          setDetectedApiPrefix(extracted);
          return apiPrefix;
        }
      } catch {
        // ignore
      }
    }

    // Fallback: probe a stable endpoint under root vs /api.
    for (const candidate of API_PREFIX_CANDIDATES) {
      try {
        const base = buildApiBaseUrlFromPort(port, candidate);
        const response = await fetch(`${base}/config`, { method: 'GET', headers: { Accept: 'application/json' } });
        if (!response.ok) continue;
        await response.json().catch(() => null);
        setDetectedApiPrefix(candidate);
        return apiPrefix;
      } catch {
        // ignore
      }
    }

    return apiPrefix;
  };

  function setStatus(newStatus: ConnectionStatus, error?: string) {
    if (status !== newStatus || lastError !== error) {
      status = newStatus;
      lastError = error;
      if (newStatus === 'connected') {
        lastConnectedAt = Date.now();
      }
      listeners.forEach(cb => cb(status, error));
    }
  }

  function setDetectedPort(port: number) {
    if (detectedPort !== port) {
      detectedPort = port;

      // Notify all waiters
      const waiters = portWaiters;
      portWaiters = [];
      for (const notify of waiters) {
        try {
          notify(port);
        } catch {
          // Ignore waiter errors
        }
      }
    }
  }

  function detectPortFromOutput(text: string) {
    // Match URL pattern first (like desktop)
    URL_REGEX.lastIndex = 0;
    let match;
    while ((match = URL_REGEX.exec(text)) !== null) {
      const port = parseInt(match[1], 10);
      if (Number.isFinite(port) && port > 0) {
        setDetectedPort(port);
        const inferred = inferPrefixFromLogPath(match[2] || '');
        if (inferred !== null) {
          setDetectedApiPrefix(inferred);
        }
        return;
      }
    }

    // Fallback pattern
    const fallbackMatch = FALLBACK_PORT_REGEX.exec(text);
    if (fallbackMatch) {
      const port = parseInt(fallbackMatch[1], 10);
      if (Number.isFinite(port) && port > 0) {
        setDetectedPort(port);
      }
    }
  }

  async function waitForPort(timeoutMs: number): Promise<number> {
    if (detectedPort !== null) {
      return detectedPort;
    }

    return new Promise((resolve, reject) => {
      const onPortDetected = (port: number) => {
        clearTimeout(timeout);
        resolve(port);
      };

      const timeout = setTimeout(() => {
        portWaiters = portWaiters.filter(cb => cb !== onPortDetected);
        reject(new Error('Timed out waiting for OpenCode port detection'));
      }, timeoutMs);

      portWaiters.push(onPortDetected);
    });
  }

  async function waitForReady(apiUrl: string, timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      // Use quick health check during startup for faster response
      if (await checkHealth(apiUrl, true)) {
        return true;
      }
      await new Promise(r => setTimeout(r, READY_CHECK_INTERVAL_MS));
    }

    return false;
  }

  function getApiUrl(): string | null {
    if (useConfiguredUrl && configuredApiUrl) {
      return configuredApiUrl.replace(/\/+$/, '');
    }
    if (detectedPort !== null) {
      return buildApiBaseUrlFromPort(detectedPort);
    }
    return null;
  }

  function startHealthCheck() {
    stopHealthCheck();
    healthCheckInterval = setInterval(async () => {
      const apiUrl = getApiUrl();
      if (!apiUrl) {
        if (status === 'connected') {
          setStatus('disconnected');
        }
        return;
      }

      const healthy = await checkHealth(apiUrl);
      if (healthy && status !== 'connected') {
        setStatus('connected');
      } else if (!healthy && status === 'connected') {
        setStatus('disconnected');
      }
    }, HEALTH_CHECK_INTERVAL_MS);
  }

  function stopHealthCheck() {
    if (healthCheckInterval) {
      clearInterval(healthCheckInterval);
      healthCheckInterval = null;
    }
  }

  async function start(workdir?: string): Promise<void> {
    startCount += 1;
    lastStartAt = Date.now();

    if (typeof workdir === 'string' && workdir.trim().length > 0) {
      workingDirectory = workdir.trim();
    }

    // If user configured an external API URL, do NOT start a local CLI instance.
    if (useConfiguredUrl && configuredApiUrl) {
      setStatus('connecting');
      const healthy = await checkHealth(configuredApiUrl);
      if (healthy) {
        setStatus('connected');
        startHealthCheck();
        return;
      }
      setStatus('error', `OpenCode API at ${configuredApiUrl} is not responding.`);
      return;
    }

    // Check for existing running instance (only if port is known)
    const currentUrl = getApiUrl();
    if (currentUrl && await checkHealth(currentUrl)) {
      setStatus('connected');
      startHealthCheck();
      return;
    }

    if (!cliAvailable) {
      setStatus('error', 'OpenCode CLI not found. Install it or set OPENCODE_BINARY env var.');
      vscode.window.showErrorMessage(
        'OpenCode CLI not found. Please install it or set the OPENCODE_BINARY environment variable.',
        'More Info'
      ).then(selection => {
        if (selection === 'More Info') {
          vscode.env.openExternal(vscode.Uri.parse('https://github.com/opencode-ai/opencode'));
        }
      });
      return;
    }

    setStatus('connecting');

    // Reset port detection for fresh start
    detectedPort = null;
    apiPrefix = '';
    apiPrefixDetected = false;
    lastExitCode = null;

    const spawnCwd = workingDirectory || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || os.homedir();

    // Use port 0 for dynamic assignment unless user configured a specific port
    const portArg = configuredPort !== null ? configuredPort.toString() : '0';

    try {
      const augmentedEnv = {
        ...process.env,
        PATH: buildAugmentedPath(),
      };

      childProcess = spawn(cliPath!, ['serve', '--port', portArg], {
        cwd: spawnCwd,
        env: augmentedEnv,
        detached: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      childProcess.stdout?.on('data', (data) => {
        const text = data.toString();
        detectPortFromOutput(text);
        detectApiPrefixFromOutput(text);
      });

      childProcess.stderr?.on('data', (data) => {
        const text = data.toString();
        detectPortFromOutput(text);
        detectApiPrefixFromOutput(text);
      });

      childProcess.on('error', (err) => {
        setStatus('error', `Failed to start OpenCode: ${err.message}`);
        childProcess = null;
      });

      childProcess.on('exit', (code) => {
        if (status !== 'disconnected') {
          setStatus('disconnected', code !== 0 ? `OpenCode exited with code ${code}` : undefined);
        }
        childProcess = null;
        detectedPort = null;
        lastExitCode = typeof code === 'number' ? code : null;
      });

      // Wait for port detection (port comes from stdout/stderr)
      try {
        await waitForPort(PORT_DETECTION_TIMEOUT_MS);
      } catch {
        setStatus('error', 'OpenCode did not report port in time');
        await stop();
        return;
      }

      // Now wait for API to be ready
      const detected = detectedPort;
      if (detected !== null && !apiPrefixDetected) {
        await detectApiPrefix(detected);
      }

      const apiUrl = getApiUrl();
      if (!apiUrl) {
        setStatus('error', 'Failed to determine OpenCode API URL');
        await stop();
        return;
      }

      const ready = await waitForReady(apiUrl, READY_CHECK_TIMEOUT_MS);
      if (ready) {
        setStatus('connected');
        startHealthCheck();
      } else {
        setStatus('error', 'OpenCode API did not become ready in time');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setStatus('error', `Failed to start OpenCode: ${message}`);
    }
  }

  async function stop(): Promise<void> {
    stopHealthCheck();

    if (childProcess) {
      try {
        childProcess.kill('SIGTERM');
        // Wait for graceful shutdown
        await new Promise(r => setTimeout(r, SHUTDOWN_TIMEOUT_MS));
        if (childProcess && !childProcess.killed && childProcess.exitCode === null) {
          childProcess.kill('SIGKILL');
        }
      } catch {
        // ignore
      }
      childProcess = null;
    }

    detectedPort = null;
    setStatus('disconnected');
  }

  async function restart(): Promise<void> {
    restartCount += 1;
    await stop();
    // Brief delay to let OS release resources
    await new Promise(r => setTimeout(r, 250));
    await start();
  }

  async function setWorkingDirectory(newPath: string): Promise<{ success: boolean; restarted: boolean; path: string }> {
    const target = typeof newPath === 'string' && newPath.trim().length > 0 ? newPath.trim() : workingDirectory;
    if (target === workingDirectory) {
      return { success: true, restarted: false, path: target };
    }

    // Track requested directory for UI + path resolution.
    // OpenCode requests should use the `directory` parameter instead of relying on process cwd.
    workingDirectory = target;

    // When pointing at an external API URL, avoid restarting a local CLI process.
    if (useConfiguredUrl && configuredApiUrl) {
      return { success: true, restarted: false, path: target };
    }

    return { success: true, restarted: false, path: target };
  }

  return {
    start,
    stop,
    restart,
    setWorkingDirectory,
    getStatus: () => status,
    getApiUrl,
    getWorkingDirectory: () => workingDirectory,
    isCliAvailable: () => cliAvailable,
    getDebugInfo: () => ({
      mode: useConfiguredUrl && configuredApiUrl ? 'external' : 'managed',
      status,
      lastError,
      workingDirectory,
      cliAvailable,
      cliPath,
      configuredApiUrl: useConfiguredUrl && configuredApiUrl ? configuredApiUrl.replace(/\/+$/, '') : null,
      configuredPort,
      detectedPort,
      apiPrefix,
      apiPrefixDetected,
      startCount,
      restartCount,
      lastStartAt,
      lastConnectedAt,
      lastExitCode,
    }),
    onStatusChange(callback) {
      listeners.add(callback);
      // Immediately call with current status
      callback(status, lastError);
      return new vscode.Disposable(() => listeners.delete(callback));
    },
  };
}
