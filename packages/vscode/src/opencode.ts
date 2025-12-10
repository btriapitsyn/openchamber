import * as vscode from 'vscode';
import { spawn, ChildProcess, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const DEFAULT_PORT = 47339;
const HEALTH_CHECK_INTERVAL = 5000;
const STARTUP_TIMEOUT = 10000;
const SHUTDOWN_TIMEOUT = 3000;

const BIN_CANDIDATES = [
  process.env.OPENCHAMBER_OPENCODE_PATH,
  process.env.OPENCHAMBER_OPENCODE_BIN,
  process.env.OPENCODE_PATH,
  process.env.OPENCODE_BINARY,
  '/opt/homebrew/bin/opencode',
  '/usr/local/bin/opencode',
  '/usr/bin/opencode',
  path.join(os.homedir(), '.local/bin/opencode'),
].filter(Boolean) as string[];

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface OpenCodeManager {
  start(workdir?: string): Promise<void>;
  stop(): Promise<void>;
  restart(): Promise<void>;
  setWorkingDirectory(path: string): Promise<{ success: boolean; restarted: boolean; path: string }>;
  getStatus(): ConnectionStatus;
  getApiUrl(): string;
  getWorkingDirectory(): string;
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

function resolveCliPath(): string | null {
  for (const candidate of BIN_CANDIDATES) {
    if (candidate && isExecutable(candidate)) {
      return candidate;
    }
  }

  const envPath = process.env.PATH || '';
  for (const segment of envPath.split(path.delimiter)) {
    const candidate = path.join(segment, 'opencode');
    if (isExecutable(candidate)) {
      return candidate;
    }
  }

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
        const result = spawnSync(shellPath, ['-lic', 'command -v opencode'], {
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

async function checkHealth(apiUrl: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const candidates = [`${apiUrl}/health`, `${apiUrl}/api/health`];

    for (const target of candidates) {
      try {
        const response = await fetch(target, { signal: controller.signal });
        if (response.ok) {
          clearTimeout(timeout);
          return true;
        }
      } catch {
        // try next candidate
      }
    }
    clearTimeout(timeout);
  } catch {
    // ignore
  }
  return false;
}

export function createOpenCodeManager(): OpenCodeManager {
  let childProcess: ChildProcess | null = null;
  let status: ConnectionStatus = 'disconnected';
  let healthCheckInterval: NodeJS.Timeout | null = null;
  let lastError: string | undefined;
  const listeners = new Set<(status: ConnectionStatus, error?: string) => void>();
  let workingDirectory: string = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || os.homedir();

  const config = vscode.workspace.getConfiguration('openchamber');
  const configuredApiUrl = config.get<string>('apiUrl') || `http://localhost:${DEFAULT_PORT}`;
  const apiUrl = (() => {
    try {
      const parsed = new URL(configuredApiUrl);
      const origin = parsed.origin;
      const pathname = parsed.pathname && parsed.pathname !== '/' ? parsed.pathname.replace(/\/+$/, '') : '';
      return `${origin}${pathname}`;
    } catch {
      return configuredApiUrl.replace(/\/+$/, '');
    }
  })();
  const desiredPort = (() => {
    try {
      const parsed = new URL(apiUrl);
      const port = parsed.port ? parseInt(parsed.port, 10) : DEFAULT_PORT;
      return Number.isFinite(port) && port > 0 ? port : DEFAULT_PORT;
    } catch {
      const match = apiUrl.match(/:(\d+)(?:\/|$)/);
      if (match) {
        const port = parseInt(match[1], 10);
        if (Number.isFinite(port) && port > 0) {
          return port;
        }
      }
      return DEFAULT_PORT;
    }
  })();

  function setStatus(newStatus: ConnectionStatus, error?: string) {
    if (status !== newStatus || lastError !== error) {
      status = newStatus;
      lastError = error;
      listeners.forEach(cb => cb(status, error));
    }
  }

  async function waitForHealthy(timeoutMs: number): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (await checkHealth(apiUrl)) {
        return true;
      }
      await new Promise(r => setTimeout(r, 500));
    }
    return false;
  }

  function startHealthCheck() {
    stopHealthCheck();
    healthCheckInterval = setInterval(async () => {
      const healthy = await checkHealth(apiUrl);
      if (healthy && status !== 'connected') {
        setStatus('connected');
      } else if (!healthy && status === 'connected') {
        setStatus('disconnected');
      }
    }, HEALTH_CHECK_INTERVAL);
  }

  function stopHealthCheck() {
    if (healthCheckInterval) {
      clearInterval(healthCheckInterval);
      healthCheckInterval = null;
    }
  }

  async function start(workdir?: string) {
    if (typeof workdir === 'string' && workdir.trim().length > 0) {
      workingDirectory = workdir.trim();
    }

    // First check if API is already running
    if (await checkHealth(apiUrl)) {
      setStatus('connected');
      startHealthCheck();
      return;
    }

    setStatus('connecting');

    const cliPath = resolveCliPath();
    if (!cliPath) {
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

    const spawnCwd = workingDirectory || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || os.homedir();

    try {
      childProcess = spawn(cliPath, ['serve', '--port', desiredPort.toString()], {
        cwd: spawnCwd,
        env: {
          ...process.env,
          OPENCODE_PORT: desiredPort.toString(),
        },
        detached: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      childProcess.stdout?.on('data', (data) => {
        console.log('[OpenCode]', data.toString());
      });

      childProcess.stderr?.on('data', (data) => {
        console.error('[OpenCode]', data.toString());
      });

      childProcess.on('error', (err) => {
        setStatus('error', `Failed to start OpenCode: ${err.message}`);
        childProcess = null;
      });

      childProcess.on('exit', (code) => {
        if (status !== 'disconnected') {
          setStatus('disconnected');
        }
        childProcess = null;
      });

      // Wait for API to become healthy
      const healthy = await waitForHealthy(STARTUP_TIMEOUT);
      if (healthy) {
        setStatus('connected');
        startHealthCheck();
      } else {
        setStatus('error', 'OpenCode API did not start in time');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setStatus('error', `Failed to start OpenCode: ${message}`);
    }
  }

  async function stop() {
    stopHealthCheck();

    if (childProcess) {
      try {
        childProcess.kill('SIGTERM');
        // Wait a bit for graceful shutdown
        await new Promise(r => setTimeout(r, SHUTDOWN_TIMEOUT));
        if (childProcess && !childProcess.killed && childProcess.exitCode === null) {
          childProcess.kill('SIGKILL');
        }
      } catch {
        // ignore
      }
      childProcess = null;
    }

    setStatus('disconnected');
  }

  async function restart() {
    await stop();
    await start();
  }

  async function setWorkingDirectory(path: string) {
    const target = typeof path === 'string' && path.trim().length > 0 ? path.trim() : workingDirectory;
    workingDirectory = target;
    await restart();
    return { success: true, restarted: true, path: target };
  }

  return {
    start,
    stop,
    restart,
    setWorkingDirectory,
    getStatus: () => status,
    getApiUrl: () => apiUrl,
    getWorkingDirectory: () => workingDirectory,
    onStatusChange(callback) {
      listeners.add(callback);
      // Immediately call with current status
      callback(status, lastError);
      return new vscode.Disposable(() => listeners.delete(callback));
    },
  };
}
