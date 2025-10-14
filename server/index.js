import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import path from 'path';
import { spawn, spawnSync } from 'child_process';
import fs from 'fs';
import http from 'http';
import { fileURLToPath } from 'url';
import os from 'os';

// Get current directory for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const DEFAULT_PORT = 3000;
const DEFAULT_OPENCODE_PORT = 0; // Let the OS choose an available port
const HEALTH_CHECK_INTERVAL = 30000; // 30 seconds
const SHUTDOWN_TIMEOUT = 10000; // 10 seconds
const MODELS_DEV_API_URL = 'https://models.dev/api.json';
const MODELS_METADATA_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const CLIENT_RELOAD_DELAY_MS = 800;
const OPEN_CODE_READY_GRACE_MS = 12000;

// Global state
let openCodeProcess = null;
let openCodePort = null;
let healthCheckInterval = null;
let server = null;
let isShuttingDown = false;
let cachedModelsMetadata = null;
let cachedModelsMetadataTimestamp = 0;
let expressApp = null;
let currentRestartPromise = null;
let isRestartingOpenCode = false;
let openCodeApiPrefix = '';
let openCodeApiPrefixDetected = false;
let openCodeApiDetectionTimer = null;
let isDetectingApiPrefix = false;
let openCodeApiDetectionPromise = null;
let lastOpenCodeError = null;
let openCodePortWaiters = [];
let isOpenCodeReady = false;
let openCodeNotReadySince = 0;
let exitOnShutdown = true;
let signalsAttached = false;

const OPENCODE_BINARY_ENV =
  process.env.OPENCODE_BINARY ||
  process.env.OPENCHAMBER_BINARY ||
  process.env.OPENCODE_PATH ||
  process.env.OPENCHAMBER_OPENCODE_PATH ||
  null;

function buildAugmentedPath() {
  const augmented = new Set();

  const loginShellPath = getLoginShellPath();
  if (loginShellPath) {
    for (const segment of loginShellPath.split(path.delimiter)) {
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

function getLoginShellPath() {
  if (process.platform === 'win32') {
    return null;
  }

  const shell = process.env.SHELL || '/bin/zsh';
  try {
    const result = spawnSync(shell, ['-lc', 'echo -n "$PATH"'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    if (result.status === 0 && typeof result.stdout === 'string') {
      const value = result.stdout.trim();
      if (value) {
        return value;
      }
    } else if (result.stderr) {
      console.warn(`Failed to read PATH from login shell (${shell}): ${result.stderr}`);
    }
  } catch (error) {
    console.warn(`Error executing login shell (${shell}) for PATH detection: ${error.message}`);
  }
  return null;
}

function resolveBinaryFromPath(binaryName, searchPath) {
  if (!binaryName) {
    return null;
  }
  if (path.isAbsolute(binaryName)) {
    return fs.existsSync(binaryName) ? binaryName : null;
  }
  const directories = searchPath.split(path.delimiter).filter(Boolean);
  for (const directory of directories) {
    try {
      const candidate = path.join(directory, binaryName);
      if (fs.existsSync(candidate)) {
        const stats = fs.statSync(candidate);
        if (stats.isFile()) {
          return candidate;
        }
      }
    } catch {
      // Ignore resolution errors, continue searching
    }
  }
  return null;
}

function getOpencodeSpawnConfig() {
  const envPath = buildAugmentedPath();
  const resolvedEnv = { ...process.env, PATH: envPath };

  if (OPENCODE_BINARY_ENV) {
    const explicit = resolveBinaryFromPath(OPENCODE_BINARY_ENV, envPath);
    if (explicit) {
      console.log(`Using OpenCode binary from OPENCODE_BINARY: ${explicit}`);
      return { command: explicit, env: resolvedEnv };
    }
    console.warn(
      `OPENCODE_BINARY path "${OPENCODE_BINARY_ENV}" not found. Falling back to search.`
    );
  }

  return { command: 'opencode', env: resolvedEnv };
}

const ENV_CONFIGURED_OPENCODE_PORT = (() => {
  const raw =
    process.env.OPENCODE_PORT ||
    process.env.OPENCHAMBER_OPENCODE_PORT ||
    process.env.OPENCHAMBER_INTERNAL_PORT;
  if (!raw) {
    return null;
  }
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
})();

const ENV_CONFIGURED_API_PREFIX = normalizeApiPrefix(
  process.env.OPENCODE_API_PREFIX || process.env.OPENCHAMBER_API_PREFIX || ''
);

if (ENV_CONFIGURED_API_PREFIX) {
  openCodeApiPrefix = ENV_CONFIGURED_API_PREFIX;
  openCodeApiPrefixDetected = true;
  console.log(`Using OpenCode API prefix from environment: ${openCodeApiPrefix}`);
}

function setOpenCodePort(port) {
  if (!Number.isFinite(port) || port <= 0) {
    return;
  }

  const numericPort = Math.trunc(port);
  const portChanged = openCodePort !== numericPort;

  if (portChanged || openCodePort === null) {
    openCodePort = numericPort;
    console.log(`Detected OpenCode port: ${openCodePort}`);

    if (portChanged) {
      isOpenCodeReady = false;
    }
    openCodeNotReadySince = Date.now();
  }

  lastOpenCodeError = null;

  if (openCodePortWaiters.length > 0) {
    const waiters = openCodePortWaiters;
    openCodePortWaiters = [];
    for (const notify of waiters) {
      try {
        notify(numericPort);
      } catch (error) {
        console.warn('Failed to notify OpenCode port waiter:', error);
      }
    }
  }
}

async function waitForOpenCodePort(timeoutMs = 15000) {
  if (openCodePort !== null) {
    return openCodePort;
  }

  return new Promise((resolve, reject) => {
    const onPortDetected = (port) => {
      clearTimeout(timeout);
      resolve(port);
    };

    const timeout = setTimeout(() => {
      openCodePortWaiters = openCodePortWaiters.filter((cb) => cb !== onPortDetected);
      reject(new Error('Timed out waiting for OpenCode port'));
    }, timeoutMs);

    openCodePortWaiters.push(onPortDetected);
  });
}

const API_PREFIX_CANDIDATES = ['', '/api']; // Simplified - only check root and /api

function normalizeApiPrefix(prefix) {
  if (!prefix) {
    return '';
  }

  if (prefix.includes('://')) {
    try {
      const parsed = new URL(prefix);
      return normalizeApiPrefix(parsed.pathname);
    } catch (error) {
      return '';
    }
  }

  const trimmed = prefix.trim();
  if (!trimmed || trimmed === '/') {
    return '';
  }
  const withLeading = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return withLeading.endsWith('/') ? withLeading.slice(0, -1) : withLeading;
}

function setDetectedOpenCodeApiPrefix(prefix) {
  const normalized = normalizeApiPrefix(prefix);
  if (!openCodeApiPrefixDetected || openCodeApiPrefix !== normalized) {
    openCodeApiPrefix = normalized;
    openCodeApiPrefixDetected = true;
    if (openCodeApiDetectionTimer) {
      clearTimeout(openCodeApiDetectionTimer);
      openCodeApiDetectionTimer = null;
    }
    console.log(`Detected OpenCode API prefix: ${normalized || '(root)'}`);
  }
}

function detectPortFromLogMessage(message) {
  if (openCodePort && ENV_CONFIGURED_OPENCODE_PORT) {
    return;
  }

  const regex = /https?:\/\/[^:\s]+:(\d+)/gi;
  let match;
  while ((match = regex.exec(message)) !== null) {
    const port = parseInt(match[1], 10);
    if (Number.isFinite(port) && port > 0) {
      setOpenCodePort(port);
      return;
    }
  }

  const fallbackMatch = /(?:^|\s)(?:127\.0\.0\.1|localhost):(\d+)/i.exec(message);
  if (fallbackMatch) {
    const port = parseInt(fallbackMatch[1], 10);
    if (Number.isFinite(port) && port > 0) {
      setOpenCodePort(port);
    }
  }
}

function detectPrefixFromLogMessage(message) {
  if (!openCodePort) {
    return;
  }

  const urlRegex = /https?:\/\/[^:\s]+:(\d+)(\/[^\s"']*)?/gi;
  let match;

  while ((match = urlRegex.exec(message)) !== null) {
    const portMatch = parseInt(match[1], 10);
    if (portMatch !== openCodePort) {
      continue;
    }

    const path = match[2] || '';
    const normalized = normalizeApiPrefix(path);
    setDetectedOpenCodeApiPrefix(normalized);
    return;
  }
}

function getCandidateApiPrefixes() {
  if (openCodeApiPrefixDetected) {
    return [openCodeApiPrefix];
  }
  return API_PREFIX_CANDIDATES;
}

function buildOpenCodeUrl(path, prefixOverride) {
  if (!openCodePort) {
    throw new Error('OpenCode port is not available');
  }
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const prefix = normalizeApiPrefix(
    prefixOverride !== undefined ? prefixOverride : openCodeApiPrefixDetected ? openCodeApiPrefix : ''
  );
  const fullPath = `${prefix}${normalizedPath}`;
  return `http://127.0.0.1:${openCodePort}${fullPath}`;
}

function extractApiPrefixFromUrl(urlString, expectedSuffix) {
  if (!urlString) {
    return null;
  }
  try {
    const parsed = new URL(urlString);
    const pathname = parsed.pathname || '';
    if (expectedSuffix && pathname.endsWith(expectedSuffix)) {
      const prefix = pathname.slice(0, pathname.length - expectedSuffix.length);
      return normalizeApiPrefix(prefix);
    }
  } catch (error) {
    console.warn(`Failed to parse OpenCode URL "${urlString}": ${error.message}`);
  }
  return null;
}

async function tryDetectOpenCodeApiPrefix() {
  if (!openCodePort) {
    return false;
  }

  const docPrefix = await detectPrefixFromDocumentation();
  if (docPrefix !== null) {
    setDetectedOpenCodeApiPrefix(docPrefix);
    return true;
  }

  const candidates = getCandidateApiPrefixes();

  for (const candidate of candidates) {
    try {
      const response = await fetch(buildOpenCodeUrl('/config', candidate), {
        method: 'GET',
        headers: { Accept: 'application/json' }
      });

      if (response.ok) {
        await response.json().catch(() => null);
        setDetectedOpenCodeApiPrefix(candidate);
        return true;
      }
    } catch (error) {
      // Ignore and try next candidate
    }
  }

  return false;
}

async function detectOpenCodeApiPrefix() {
  if (openCodeApiPrefixDetected) {
    return true;
  }

  if (!openCodePort) {
    return false;
  }

  if (isDetectingApiPrefix) {
    try {
      await openCodeApiDetectionPromise;
    } catch (error) {
      // Ignore; will retry below
    }
    return openCodeApiPrefixDetected;
  }

  isDetectingApiPrefix = true;
  openCodeApiDetectionPromise = (async () => {
    const success = await tryDetectOpenCodeApiPrefix();
    if (!success) {
      console.warn('Failed to detect OpenCode API prefix via documentation or known candidates');
    }
    return success;
  })();

  try {
    const result = await openCodeApiDetectionPromise;
    return result;
  } finally {
    isDetectingApiPrefix = false;
    openCodeApiDetectionPromise = null;
  }
}

async function ensureOpenCodeApiPrefix() {
  if (openCodeApiPrefixDetected) {
    return true;
  }

  const result = await detectOpenCodeApiPrefix();
  if (!result) {
    scheduleOpenCodeApiDetection();
  }
  return result;
}

function scheduleOpenCodeApiDetection(delayMs = 500) {
  if (openCodeApiPrefixDetected) {
    return;
  }

  if (openCodeApiDetectionTimer) {
    clearTimeout(openCodeApiDetectionTimer);
  }

  openCodeApiDetectionTimer = setTimeout(async () => {
    openCodeApiDetectionTimer = null;
    const success = await detectOpenCodeApiPrefix();
    if (!success) {
      const nextDelay = Math.min(delayMs * 2, 8000);
      scheduleOpenCodeApiDetection(nextDelay);
    }
  }, delayMs);
}

const OPENAPI_DOC_PATHS = ['/doc']; // Simplified - only check main doc endpoint

function extractPrefixFromOpenApiDocument(content) {
  // Simple check for API base in HTML content
  const globalMatch = content.match(/__OPENCODE_API_BASE__\s*=\s*['"]([^'"]+)['"]/);
  if (globalMatch && globalMatch[1]) {
    return normalizeApiPrefix(globalMatch[1]);
  }
  return null;
}

async function detectPrefixFromDocumentation() {
  if (!openCodePort) {
    return null;
  }

  const prefixesToTry = [...new Set(['', ...API_PREFIX_CANDIDATES])];

  for (const prefix of prefixesToTry) {
    for (const docPath of OPENAPI_DOC_PATHS) {
      try {
        const response = await fetch(buildOpenCodeUrl(docPath, prefix), {
          method: 'GET',
          headers: { Accept: '*/*' }
        });

        if (!response.ok) {
          continue;
        }

        const text = await response.text();
        const extracted = extractPrefixFromOpenApiDocument(text);
        if (extracted !== null) {
          return extracted;
        }
      } catch (error) {
        // Ignore and continue scanning other combinations
      }
    }
  }

  return null;
}

// Parse command line arguments
function parseArgs(argv = process.argv.slice(2)) {
  const args = Array.isArray(argv) ? [...argv] : [];
  const options = { port: DEFAULT_PORT };
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const optionName = arg.slice(2);
      const optionValue = args[i + 1];
      
      if (optionName === 'port' || optionName === 'p') {
        options.port = parseInt(optionValue) || DEFAULT_PORT;
        i++; // skip next arg as it's the value
      }
    }
  }
  
  return options;
}

// Start OpenCode process
async function startOpenCode() {
  const desiredPort = ENV_CONFIGURED_OPENCODE_PORT ?? DEFAULT_OPENCODE_PORT;
  console.log(
    desiredPort
      ? `Starting OpenCode on requested port ${desiredPort}...`
      : 'Starting OpenCode with dynamic port assignment...'
  );
  
  const { command, env } = getOpencodeSpawnConfig();
  const args = ['serve', '--port', desiredPort.toString()];
  console.log(`Launching OpenCode via "${command}" with args ${args.join(' ')}`);

  const child = spawn(command, args, {
    stdio: 'pipe',
    env
  });
  isOpenCodeReady = false;
  openCodeNotReadySince = Date.now();
  
  // Handle output
  child.stdout.on('data', (data) => {
    const text = data.toString();
    console.log(`OpenCode: ${text.trim()}`);
    detectPortFromLogMessage(text);
    detectPrefixFromLogMessage(text);
  });
  
  child.stderr.on('data', (data) => {
    const text = data.toString();
    lastOpenCodeError = text.trim();
    console.error(`OpenCode Error: ${lastOpenCodeError}`);
    detectPortFromLogMessage(text);
    detectPrefixFromLogMessage(text);
  });
  
  let startupError = await new Promise((resolve, reject) => {
    const onSpawn = () => {
      child.off('error', onError);
      resolve(null);
    };
    const onError = (error) => {
      child.off('spawn', onSpawn);
      reject(error);
    };

    child.once('spawn', onSpawn);
    child.once('error', onError);
  }).catch((error) => {
    lastOpenCodeError = error.message;
    return error;
  });

  if (startupError) {
    if (startupError.code === 'ENOENT') {
      const enhanced = new Error(
        `Failed to start OpenCode – executable "${command}" not found. ` +
        'Set OPENCODE_BINARY to the full path of the opencode CLI or ensure it is on PATH.'
      );
      enhanced.code = startupError.code;
      startupError = enhanced;
    }
    throw startupError;
  }

  child.on('exit', (code, signal) => {
    lastOpenCodeError = `OpenCode exited with code ${code}, signal ${signal ?? 'null'}`;
    isOpenCodeReady = false;
    openCodeNotReadySince = Date.now();
    
    // Do not auto-restart if we are already in restart process
    if (!isShuttingDown && !isRestartingOpenCode) {
      console.log(`OpenCode process exited with code ${code}, signal ${signal}`);
      // Restart OpenCode if not shutting down
      setTimeout(() => {
        restartOpenCode().catch((err) => {
          console.error('Failed to restart OpenCode after exit:', err);
        });
      }, 5000);
    } else if (isRestartingOpenCode) {
      console.log('OpenCode exit during controlled restart, not triggering auto-restart');
    }
  });

  child.on('error', (error) => {
    lastOpenCodeError = error.message;
    isOpenCodeReady = false;
    openCodeNotReadySince = Date.now();
    console.error(`OpenCode process error: ${error.message}`);
    if (!isShuttingDown) {
      // Restart OpenCode if not shutting down
      setTimeout(() => {
        restartOpenCode().catch((err) => {
          console.error('Failed to restart OpenCode after error:', err);
        });
      }, 5000);
    }
  });

  // Wait a bit for OpenCode to start producing output
  await new Promise(resolve => setTimeout(resolve, 2000));

  return child;
}

// Restart OpenCode process
async function restartOpenCode() {
  if (isShuttingDown) return;
  if (currentRestartPromise) {
    await currentRestartPromise;
    return;
  }

  currentRestartPromise = (async () => {
    isRestartingOpenCode = true;
    isOpenCodeReady = false;
    openCodeNotReadySince = Date.now();
    console.log('Restarting OpenCode process...');

    if (openCodeProcess) {
      console.log('Waiting for OpenCode process to terminate...');
      openCodeProcess.kill('SIGTERM');
      
      // Wait for actual process termination (up to 10 seconds)
      const processExitPromise = new Promise((resolve) => {
        const exitHandler = (code, signal) => {
          console.log(`OpenCode process exited with code ${code}, signal ${signal}`);
          resolve(true);
        };
        openCodeProcess.once('exit', exitHandler);
        
        // Timeout in case process doesn't terminate
        setTimeout(() => {
          openCodeProcess.off('exit', exitHandler);
          console.warn('OpenCode process termination timeout, forcing restart');
          resolve(false);
        }, 10000);
      });
      
      await processExitPromise;
      
      // Additional delay for complete port release
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    if (ENV_CONFIGURED_OPENCODE_PORT) {
      console.log(`Using OpenCode port from environment: ${ENV_CONFIGURED_OPENCODE_PORT}`);
      setOpenCodePort(ENV_CONFIGURED_OPENCODE_PORT);
    } else {
      openCodePort = null;
    }
    openCodeApiPrefix = '';
    openCodeApiPrefixDetected = false;
    if (openCodeApiDetectionTimer) {
      clearTimeout(openCodeApiDetectionTimer);
      openCodeApiDetectionTimer = null;
    }
    openCodeApiDetectionPromise = null;

    lastOpenCodeError = null;
    openCodeProcess = await startOpenCode();

    if (!ENV_CONFIGURED_OPENCODE_PORT) {
      await waitForOpenCodePort();
    }

    if (expressApp) {
      setupProxy(expressApp);
      scheduleOpenCodeApiDetection();
    }
  })();

  try {
    await currentRestartPromise;
  } catch (error) {
    console.error(`Failed to restart OpenCode: ${error.message}`);
    lastOpenCodeError = error.message;
    if (!ENV_CONFIGURED_OPENCODE_PORT) {
      openCodePort = null;
    }
    openCodeApiPrefixDetected = false;
    throw error;
  } finally {
    currentRestartPromise = null;
    isRestartingOpenCode = false;
  }
}

async function waitForOpenCodeReady(timeoutMs = 20000, intervalMs = 400) {
  if (!openCodePort) {
    throw new Error('OpenCode port is not available');
  }

  const deadline = Date.now() + timeoutMs;
  let lastError = null;

  while (Date.now() < deadline) {
    const prefixes = getCandidateApiPrefixes();

    for (const prefix of prefixes) {
      try {
        // First check health endpoint for detailed status
        const healthResponse = await fetch(buildOpenCodeUrl('/health', prefix), {
          method: 'GET',
          headers: { Accept: 'application/json' }
        });

        if (healthResponse.ok) {
          const healthData = await healthResponse.json().catch(() => null);
          
          // Check if OpenCode is actually ready
          if (healthData && healthData.isOpenCodeReady === false) {
            lastError = new Error('OpenCode health indicates not ready');
            continue;
          }
        }

        const configResponse = await fetch(buildOpenCodeUrl('/config', prefix), {
          method: 'GET',
          headers: { Accept: 'application/json' }
        });

        if (configResponse.ok) {
          await configResponse.json().catch(() => null);
          const detectedPrefix = extractApiPrefixFromUrl(configResponse.url, '/config');
          if (detectedPrefix !== null) {
            setDetectedOpenCodeApiPrefix(detectedPrefix);
          } else if (prefix) {
            setDetectedOpenCodeApiPrefix(prefix);
          }

          const agentResponse = await fetch(
            buildOpenCodeUrl('/agent', detectedPrefix !== null ? detectedPrefix : prefix),
            {
              method: 'GET',
              headers: { Accept: 'application/json' }
            }
          );

          if (agentResponse.ok) {
            await agentResponse.json().catch(() => []);
            if (detectedPrefix === null) {
              const agentPrefix = extractApiPrefixFromUrl(agentResponse.url, '/agent');
              if (agentPrefix !== null) {
                setDetectedOpenCodeApiPrefix(agentPrefix);
              } else {
                setDetectedOpenCodeApiPrefix(prefix);
              }
            }
            isOpenCodeReady = true;
            lastOpenCodeError = null;
            return;
          }

          lastError = new Error(`Agent endpoint responded with status ${agentResponse.status}`);
          continue;
        }

        if (configResponse.status === 404 && !openCodeApiPrefixDetected && prefix === '') {
          lastError = new Error('OpenCode config endpoint returned 404 on root prefix');
          continue;
        }
        lastError = new Error(`OpenCode config endpoint responded with status ${configResponse.status}`);
      } catch (error) {
        lastError = error;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  if (lastError) {
    lastOpenCodeError = lastError.message || String(lastError);
    throw lastError;
  }

  const timeoutError = new Error('Timed out waiting for OpenCode to become ready');
  lastOpenCodeError = timeoutError.message;
  throw timeoutError;
}

async function waitForAgentPresence(agentName, timeoutMs = 15000, intervalMs = 300) {
  if (!openCodePort) {
    throw new Error('OpenCode port is not available');
  }

  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(buildOpenCodeUrl('/agent'), {
        method: 'GET',
        headers: { Accept: 'application/json' }
      });

      if (response.ok) {
        const agents = await response.json();
        if (Array.isArray(agents) && agents.some((agent) => agent?.name === agentName)) {
          return;
        }
      }
    } catch (error) {
      // Ignore and retry
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(`Agent "${agentName}" not available after OpenCode restart`);
}

async function fetchAgentsSnapshot() {
  if (!openCodePort) {
    throw new Error('OpenCode port is not available');
  }

  const response = await fetch(buildOpenCodeUrl('/agent'), {
    method: 'GET',
    headers: { Accept: 'application/json' }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch agents snapshot (status ${response.status})`);
  }

  const agents = await response.json().catch(() => null);
  if (!Array.isArray(agents)) {
    throw new Error('Invalid agents payload from OpenCode');
  }
  return agents;
}

undefined

async function refreshOpenCodeAfterConfigChange(reason, options = {}) {
  const { agentName } = options;

  console.log(`Refreshing OpenCode after ${reason}`);
  await restartOpenCode();
  
  try {
    await waitForOpenCodeReady();
    isOpenCodeReady = true;
    openCodeNotReadySince = 0;
    
    // Simple agent presence check if needed
    if (agentName) {
      await waitForAgentPresence(agentName);
    }
    
    isOpenCodeReady = true;
    openCodeNotReadySince = 0;
  } catch (error) {
    // Do not set isOpenCodeReady = true on error!
    isOpenCodeReady = false;
    openCodeNotReadySince = Date.now();
    console.error(`Failed to refresh OpenCode after ${reason}:`, error.message);
    throw error;
  }
}

// Setup proxy middleware
function setupProxy(app) {
  if (!openCodePort) return;

  if (app.get('opencodeProxyConfigured')) {
    return;
  }

  console.log(`Setting up proxy to OpenCode on port ${openCodePort}`);
  app.set('opencodeProxyConfigured', true);

  app.use('/api', (req, res, next) => {
    if (
      req.path.startsWith('/themes/custom') ||
      req.path.startsWith('/config/agents') ||
      req.path === '/health'
    ) {
      return next();
    }

    const waitElapsed = openCodeNotReadySince === 0 ? 0 : Date.now() - openCodeNotReadySince;
    const stillWaiting =
      (!isOpenCodeReady && (openCodeNotReadySince === 0 || waitElapsed < OPEN_CODE_READY_GRACE_MS)) ||
      isRestartingOpenCode ||
      !openCodePort;

    if (stillWaiting) {
      return res.status(503).json({
        error: 'OpenCode is restarting',
        restarting: true,
      });
    }

    next();
  });

  app.use('/api', async (req, res, next) => {
    try {
      await ensureOpenCodeApiPrefix();
    } catch (error) {
      console.warn(`OpenCode API prefix detection failed for ${req.method} ${req.path}: ${error.message}`);
    }
    next();
  });

  // Debug middleware for OpenCode API routes (must be before proxy)
  app.use('/api', (req, res, next) => {
    if (req.path.startsWith('/themes/custom') || req.path.startsWith('/config/agents') || req.path === '/health') {
      return next();
    }
    console.log(`API → OpenCode: ${req.method} ${req.path}`);
    next();
  });

  const proxyMiddleware = createProxyMiddleware({
    target: openCodePort ? `http://localhost:${openCodePort}` : 'http://127.0.0.1:0',
    router: () => {
      if (!openCodePort) {
        return 'http://127.0.0.1:0';
      }
      return `http://localhost:${openCodePort}`;
    },
    changeOrigin: true,
    pathRewrite: (path) => {
      if (!path.startsWith('/api')) {
        return path;
      }

      const suffix = path.slice(4) || '/';

      if (!openCodeApiPrefixDetected || openCodeApiPrefix === '') {
        return suffix;
      }

      return `${openCodeApiPrefix}${suffix}`;
    },
    ws: true,
    onError: (err, req, res) => {
      console.error(`Proxy error: ${err.message}`);
      if (!res.headersSent) {
        res.status(503).json({ error: 'OpenCode service unavailable' });
      }
    },
    onProxyReq: (proxyReq, req, res) => {
      console.log(`Proxying ${req.method} ${req.path} to OpenCode`);
      if (req.headers.accept && req.headers.accept.includes('text/event-stream')) {
        proxyReq.setHeader('Accept', 'text/event-stream');
        proxyReq.setHeader('Cache-Control', 'no-cache');
      }
    },
    onProxyRes: (proxyRes, req, res) => {
      if (req.url?.includes('/event')) {
        proxyRes.headers['Access-Control-Allow-Origin'] = '*';
        proxyRes.headers['Access-Control-Allow-Headers'] = 'Cache-Control, Accept';
        proxyRes.headers['Content-Type'] = 'text/event-stream';
        proxyRes.headers['Cache-Control'] = 'no-cache';
        proxyRes.headers['Connection'] = 'keep-alive';
      }

      if (proxyRes.statusCode === 404 && !openCodeApiPrefixDetected) {
        scheduleOpenCodeApiDetection();
      }
    }
  });

  app.use('/api', proxyMiddleware);
}

// Start health monitoring
function startHealthMonitoring() {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
  }
  
  healthCheckInterval = setInterval(async () => {
    if (!openCodeProcess || isShuttingDown) return;
    
    try {
      // Check if OpenCode process is still running
      if (openCodeProcess.exitCode !== null) {
        console.log('OpenCode process not running, restarting...');
        await restartOpenCode();
      }
    } catch (error) {
      console.error(`Health check error: ${error.message}`);
    }
  }, HEALTH_CHECK_INTERVAL);
}

// Graceful shutdown
async function gracefulShutdown(options = {}) {
  if (isShuttingDown) return;
  
  isShuttingDown = true;
  console.log('Starting graceful shutdown...');
  const exitProcess = typeof options.exitProcess === 'boolean' ? options.exitProcess : exitOnShutdown;
  
  // Stop health monitoring
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
  }
  
  // Stop OpenCode process
  if (openCodeProcess) {
    console.log('Stopping OpenCode process...');
    openCodeProcess.kill('SIGTERM');
    
    // Wait for graceful shutdown
    await new Promise((resolve) => {
      const timeout = setTimeout(() => {
        openCodeProcess.kill('SIGKILL');
        resolve();
      }, SHUTDOWN_TIMEOUT);
      
      openCodeProcess.on('exit', () => {
        clearTimeout(timeout);
        resolve();
      });
    });
  }
  
  // Close HTTP server
  if (server) {
    await new Promise((resolve) => {
      server.close(() => {
        console.log('HTTP server closed');
        resolve();
      });
    });
  }
  
  console.log('Graceful shutdown complete');
  if (exitProcess) {
    process.exit(0);
  }
}

// Main function
async function main(options = {}) {
  const port = Number.isFinite(options.port) && options.port >= 0 ? Math.trunc(options.port) : DEFAULT_PORT;
  const attachSignals = options.attachSignals !== false;
  if (typeof options.exitOnShutdown === 'boolean') {
    exitOnShutdown = options.exitOnShutdown;
  }
  
  console.log(`Starting OpenChamber on port ${port}`);
  
  // Create Express app
  const app = express();
  expressApp = app;
  server = http.createServer(app);

  // Health check endpoint - MUST be before any other middleware that might interfere
  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      openCodePort: openCodePort,
      openCodeRunning: Boolean(openCodeProcess && openCodeProcess.exitCode === null),
      openCodeApiPrefix,
      openCodeApiPrefixDetected,
      isOpenCodeReady,
      lastOpenCodeError
    });
  });
  
  // Basic middleware - skip JSON parsing for /api routes (handled by proxy)
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/config/agents') || req.path.startsWith('/api/config/commands') || req.path.startsWith('/api/fs') || req.path.startsWith('/api/git')) {
      // Parse JSON for OpenChamber endpoints (agent config, command config, file system operations, git)
      express.json()(req, res, next);
    } else if (req.path.startsWith('/api')) {
      // Skip JSON parsing for OpenCode API routes (let proxy handle it)
      next();
    } else {
      // Parse JSON for other routes
      express.json()(req, res, next);
    }
  });
  app.use(express.urlencoded({ extended: true }));
  
  // Request logging
  app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
  });

  app.get('/api/openchamber/models-metadata', async (req, res) => {
    const now = Date.now();

    if (cachedModelsMetadata && now - cachedModelsMetadataTimestamp < MODELS_METADATA_CACHE_TTL) {
      res.setHeader('Cache-Control', 'public, max-age=60');
      return res.json(cachedModelsMetadata);
    }

    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeout = controller ? setTimeout(() => controller.abort(), 8000) : null;

    try {
      const response = await fetch(MODELS_DEV_API_URL, {
        signal: controller?.signal,
        headers: {
          Accept: 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`models.dev responded with status ${response.status}`);
      }

      const metadata = await response.json();
      cachedModelsMetadata = metadata;
      cachedModelsMetadataTimestamp = Date.now();

      res.setHeader('Cache-Control', 'public, max-age=300');
      res.json(metadata);
    } catch (error) {
      console.warn('Failed to fetch models.dev metadata via server:', error);

      if (cachedModelsMetadata) {
        res.setHeader('Cache-Control', 'public, max-age=60');
        res.json(cachedModelsMetadata);
      } else {
        const statusCode = error?.name === 'AbortError' ? 504 : 502;
        res.status(statusCode).json({ error: 'Failed to retrieve model metadata' });
      }
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  });




  // Agent configuration endpoints (OpenChamber-specific, direct file manipulation)
  const {
    getAgentSources,
    createAgent,
    updateAgent,
    deleteAgent,
    getCommandSources,
    createCommand,
    updateCommand,
    deleteCommand
  } = await import('./lib/opencode-config.js');

  // GET /api/config/agents/:name - Get agent configuration metadata
  app.get('/api/config/agents/:name', (req, res) => {
    try {
      const agentName = req.params.name;
      const sources = getAgentSources(agentName);

      res.json({
        name: agentName,
        sources: sources,
        isBuiltIn: !sources.md.exists && !sources.json.exists
      });
    } catch (error) {
      console.error('Failed to get agent sources:', error);
      res.status(500).json({ error: 'Failed to get agent configuration metadata' });
    }
  });

  // POST /api/config/agents/:name - Create new agent
  app.post('/api/config/agents/:name', async (req, res) => {
    try {
      const agentName = req.params.name;
      const config = req.body;

      createAgent(agentName, config);
      await refreshOpenCodeAfterConfigChange('agent creation', {
        agentName
      });

      res.json({
        success: true,
        requiresReload: true,
        message: `Agent ${agentName} created successfully. Reloading interface…`,
        reloadDelayMs: CLIENT_RELOAD_DELAY_MS,
      });
    } catch (error) {
      console.error('Failed to create agent:', error);
      res.status(500).json({ error: error.message || 'Failed to create agent' });
    }
  });

  // PATCH /api/config/agents/:name - Update existing agent
  app.patch('/api/config/agents/:name', async (req, res) => {
    try {
      const agentName = req.params.name;
      const updates = req.body;

      console.log(`[Server] Updating agent: ${agentName}`);
      console.log('[Server] Updates:', JSON.stringify(updates, null, 2));

      updateAgent(agentName, updates);
      await refreshOpenCodeAfterConfigChange('agent update', {
        agentName
      });

      console.log(`[Server] Agent ${agentName} updated successfully`);

      res.json({
        success: true,
        requiresReload: true,
        message: `Agent ${agentName} updated successfully. Reloading interface…`,
        reloadDelayMs: CLIENT_RELOAD_DELAY_MS,
      });
    } catch (error) {
      console.error('[Server] Failed to update agent:', error);
      console.error('[Server] Error stack:', error.stack);
      res.status(500).json({ error: error.message || 'Failed to update agent' });
    }
  });

  // DELETE /api/config/agents/:name - Delete agent
  app.delete('/api/config/agents/:name', async (req, res) => {
    try {
      const agentName = req.params.name;

      deleteAgent(agentName);
      await refreshOpenCodeAfterConfigChange('agent deletion', {
        agentName
      });

      res.json({
        success: true,
        requiresReload: true,
        message: `Agent ${agentName} deleted successfully. Reloading interface…`,
        reloadDelayMs: CLIENT_RELOAD_DELAY_MS,
      });
    } catch (error) {
      console.error('Failed to delete agent:', error);
      res.status(500).json({ error: error.message || 'Failed to delete agent' });
    }
  });

  // Command configuration endpoints (OpenChamber-specific, direct file manipulation)

  // GET /api/config/commands/:name - Get command configuration metadata
  app.get('/api/config/commands/:name', (req, res) => {
    try {
      const commandName = req.params.name;
      const sources = getCommandSources(commandName);

      res.json({
        name: commandName,
        sources: sources,
        isBuiltIn: !sources.md.exists && !sources.json.exists
      });
    } catch (error) {
      console.error('Failed to get command sources:', error);
      res.status(500).json({ error: 'Failed to get command configuration metadata' });
    }
  });

  // POST /api/config/commands/:name - Create new command
  app.post('/api/config/commands/:name', async (req, res) => {
    try {
      const commandName = req.params.name;
      const config = req.body;

      console.log('[Server] Creating command:', commandName);
      console.log('[Server] Config received:', JSON.stringify(config, null, 2));

      createCommand(commandName, config);
      await refreshOpenCodeAfterConfigChange('command creation', {
        commandName
      });

      res.json({
        success: true,
        requiresReload: true,
        message: `Command ${commandName} created successfully. Reloading interface…`,
        reloadDelayMs: CLIENT_RELOAD_DELAY_MS,
      });
    } catch (error) {
      console.error('Failed to create command:', error);
      res.status(500).json({ error: error.message || 'Failed to create command' });
    }
  });

  // PATCH /api/config/commands/:name - Update existing command
  app.patch('/api/config/commands/:name', async (req, res) => {
    try {
      const commandName = req.params.name;
      const updates = req.body;

      console.log(`[Server] Updating command: ${commandName}`);
      console.log('[Server] Updates:', JSON.stringify(updates, null, 2));

      updateCommand(commandName, updates);
      await refreshOpenCodeAfterConfigChange('command update', {
        commandName
      });

      console.log(`[Server] Command ${commandName} updated successfully`);

      res.json({
        success: true,
        requiresReload: true,
        message: `Command ${commandName} updated successfully. Reloading interface…`,
        reloadDelayMs: CLIENT_RELOAD_DELAY_MS,
      });
    } catch (error) {
      console.error('[Server] Failed to update command:', error);
      console.error('[Server] Error stack:', error.stack);
      res.status(500).json({ error: error.message || 'Failed to update command' });
    }
  });

  // DELETE /api/config/commands/:name - Delete command
  app.delete('/api/config/commands/:name', async (req, res) => {
    try {
      const commandName = req.params.name;

      deleteCommand(commandName);
      await refreshOpenCodeAfterConfigChange('command deletion', {
        commandName
      });

      res.json({
        success: true,
        requiresReload: true,
        message: `Command ${commandName} deleted successfully. Reloading interface…`,
        reloadDelayMs: CLIENT_RELOAD_DELAY_MS,
      });
    } catch (error) {
      console.error('Failed to delete command:', error);
      res.status(500).json({ error: error.message || 'Failed to delete command' });
    }
  });

  // POST /api/config/reload - Manual configuration reload (restart OpenCode)
  app.post('/api/config/reload', async (req, res) => {
    try {
      console.log('[Server] Manual configuration reload requested');

      await refreshOpenCodeAfterConfigChange('manual configuration reload');

      res.json({
        success: true,
        requiresReload: true,
        message: 'Configuration reloaded successfully. Refreshing interface…',
        reloadDelayMs: CLIENT_RELOAD_DELAY_MS,
      });
    } catch (error) {
      console.error('[Server] Failed to reload configuration:', error);
      res.status(500).json({
        error: error.message || 'Failed to reload configuration',
        success: false
      });
    }
  });

  // Git integration endpoints (OpenChamber-specific)
  // Lazy load Git libraries only when needed
  let gitLibraries = null;
  const getGitLibraries = async () => {
    if (!gitLibraries) {
      const [storage, service] = await Promise.all([
        import('./lib/git-identity-storage.js'),
        import('./lib/git-service.js')
      ]);
      gitLibraries = { ...storage, ...service };
    }
    return gitLibraries;
  };

  // GET /api/git/identities - List all identity profiles
  app.get('/api/git/identities', async (req, res) => {
    const { getProfiles } = await getGitLibraries();
    try {
      const profiles = getProfiles();
      res.json(profiles);
    } catch (error) {
      console.error('Failed to list git identity profiles:', error);
      res.status(500).json({ error: 'Failed to list git identity profiles' });
    }
  });

  // POST /api/git/identities - Create new identity profile
  app.post('/api/git/identities', async (req, res) => {
    const { createProfile } = await getGitLibraries();
    try {
      const profile = createProfile(req.body);
      console.log(`Created git identity profile: ${profile.name} (${profile.id})`);
      res.json(profile);
    } catch (error) {
      console.error('Failed to create git identity profile:', error);
      res.status(400).json({ error: error.message || 'Failed to create git identity profile' });
    }
  });

  // PUT /api/git/identities/:id - Update identity profile
  app.put('/api/git/identities/:id', async (req, res) => {
    const { updateProfile } = await getGitLibraries();
    try {
      const profile = updateProfile(req.params.id, req.body);
      console.log(`Updated git identity profile: ${profile.name} (${profile.id})`);
      res.json(profile);
    } catch (error) {
      console.error('Failed to update git identity profile:', error);
      res.status(400).json({ error: error.message || 'Failed to update git identity profile' });
    }
  });

  // DELETE /api/git/identities/:id - Delete identity profile
  app.delete('/api/git/identities/:id', async (req, res) => {
    const { deleteProfile } = await getGitLibraries();
    try {
      deleteProfile(req.params.id);
      console.log(`Deleted git identity profile: ${req.params.id}`);
      res.json({ success: true });
    } catch (error) {
      console.error('Failed to delete git identity profile:', error);
      res.status(400).json({ error: error.message || 'Failed to delete git identity profile' });
    }
  });

  // GET /api/git/global-identity - Get global git identity
  app.get('/api/git/global-identity', async (req, res) => {
    const { getGlobalIdentity } = await getGitLibraries();
    try {
      const identity = await getGlobalIdentity();
      res.json(identity);
    } catch (error) {
      console.error('Failed to get global git identity:', error);
      res.status(500).json({ error: 'Failed to get global git identity' });
    }
  });

  // GET /api/git/check - Check if directory is a git repository
  app.get('/api/git/check', async (req, res) => {
    const { isGitRepository } = await getGitLibraries();
    try {
      const directory = req.query.directory;
      if (!directory) {
        return res.status(400).json({ error: 'directory parameter is required' });
      }

      const isRepo = await isGitRepository(directory);
      res.json({ isGitRepository: isRepo });
    } catch (error) {
      console.error('Failed to check git repository:', error);
      res.status(500).json({ error: 'Failed to check git repository' });
    }
  });

  // GET /api/git/current-identity - Get current git identity for directory
  app.get('/api/git/current-identity', async (req, res) => {
    const { getCurrentIdentity } = await getGitLibraries();
    try {
      const directory = req.query.directory;
      if (!directory) {
        return res.status(400).json({ error: 'directory parameter is required' });
      }

      const identity = await getCurrentIdentity(directory);
      res.json(identity);
    } catch (error) {
      console.error('Failed to get current git identity:', error);
      res.status(500).json({ error: 'Failed to get current git identity' });
    }
  });

  // POST /api/git/set-identity - Set git identity for directory
  app.post('/api/git/set-identity', async (req, res) => {
    const { getProfile, setLocalIdentity } = await getGitLibraries();
    try {
      const directory = req.query.directory;
      if (!directory) {
        return res.status(400).json({ error: 'directory parameter is required' });
      }

      const { profileId } = req.body;
      if (!profileId) {
        return res.status(400).json({ error: 'profileId is required' });
      }

      const profile = getProfile(profileId);
      if (!profile) {
        return res.status(404).json({ error: 'Profile not found' });
      }

      await setLocalIdentity(directory, profile);
      res.json({ success: true, profile });
    } catch (error) {
      console.error('Failed to set git identity:', error);
      res.status(500).json({ error: error.message || 'Failed to set git identity' });
    }
  });

  // GET /api/git/status - Get git status
  app.get('/api/git/status', async (req, res) => {
    const { getStatus } = await getGitLibraries();
    try {
      const directory = req.query.directory;
      if (!directory) {
        return res.status(400).json({ error: 'directory parameter is required' });
      }

      const status = await getStatus(directory);
      res.json(status);
    } catch (error) {
      console.error('Failed to get git status:', error);
      res.status(500).json({ error: error.message || 'Failed to get git status' });
    }
  });

  // POST /api/git/pull - Pull from remote
  app.post('/api/git/pull', async (req, res) => {
    const { pull } = await getGitLibraries();
    try {
      const directory = req.query.directory;
      if (!directory) {
        return res.status(400).json({ error: 'directory parameter is required' });
      }

      const result = await pull(directory, req.body);
      res.json(result);
    } catch (error) {
      console.error('Failed to pull:', error);
      res.status(500).json({ error: error.message || 'Failed to pull from remote' });
    }
  });

  // POST /api/git/push - Push to remote
  app.post('/api/git/push', async (req, res) => {
    const { push } = await getGitLibraries();
    try {
      const directory = req.query.directory;
      if (!directory) {
        return res.status(400).json({ error: 'directory parameter is required' });
      }

      const result = await push(directory, req.body);
      res.json(result);
    } catch (error) {
      console.error('Failed to push:', error);
      res.status(500).json({ error: error.message || 'Failed to push to remote' });
    }
  });

  // POST /api/git/fetch - Fetch from remote
  app.post('/api/git/fetch', async (req, res) => {
    const { fetch: gitFetch } = await getGitLibraries();
    try {
      const directory = req.query.directory;
      if (!directory) {
        return res.status(400).json({ error: 'directory parameter is required' });
      }

      const result = await gitFetch(directory, req.body);
      res.json(result);
    } catch (error) {
      console.error('Failed to fetch:', error);
      res.status(500).json({ error: error.message || 'Failed to fetch from remote' });
    }
  });

  // POST /api/git/commit - Create commit
  app.post('/api/git/commit', async (req, res) => {
    const { commit } = await getGitLibraries();
    try {
      const directory = req.query.directory;
      if (!directory) {
        return res.status(400).json({ error: 'directory parameter is required' });
      }

      const { message, addAll } = req.body;
      if (!message) {
        return res.status(400).json({ error: 'message is required' });
      }

      const result = await commit(directory, message, { addAll });
      res.json(result);
    } catch (error) {
      console.error('Failed to commit:', error);
      res.status(500).json({ error: error.message || 'Failed to create commit' });
    }
  });

  // GET /api/git/branches - List branches
  app.get('/api/git/branches', async (req, res) => {
    const { getBranches } = await getGitLibraries();
    try {
      const directory = req.query.directory;
      if (!directory) {
        return res.status(400).json({ error: 'directory parameter is required' });
      }

      const branches = await getBranches(directory);
      res.json(branches);
    } catch (error) {
      console.error('Failed to get branches:', error);
      res.status(500).json({ error: error.message || 'Failed to get branches' });
    }
  });

  // POST /api/git/branches - Create new branch
  app.post('/api/git/branches', async (req, res) => {
    const { createBranch } = await getGitLibraries();
    try {
      const directory = req.query.directory;
      if (!directory) {
        return res.status(400).json({ error: 'directory parameter is required' });
      }

      const { name, startPoint } = req.body;
      if (!name) {
        return res.status(400).json({ error: 'name is required' });
      }

      const result = await createBranch(directory, name, { startPoint });
      res.json(result);
    } catch (error) {
      console.error('Failed to create branch:', error);
      res.status(500).json({ error: error.message || 'Failed to create branch' });
    }
  });

  // POST /api/git/checkout - Checkout branch
  app.post('/api/git/checkout', async (req, res) => {
    const { checkoutBranch } = await getGitLibraries();
    try {
      const directory = req.query.directory;
      if (!directory) {
        return res.status(400).json({ error: 'directory parameter is required' });
      }

      const { branch } = req.body;
      if (!branch) {
        return res.status(400).json({ error: 'branch is required' });
      }

      const result = await checkoutBranch(directory, branch);
      res.json(result);
    } catch (error) {
      console.error('Failed to checkout branch:', error);
      res.status(500).json({ error: error.message || 'Failed to checkout branch' });
    }
  });

  // GET /api/git/worktrees - List worktrees
  app.get('/api/git/worktrees', async (req, res) => {
    const { getWorktrees } = await getGitLibraries();
    try {
      const directory = req.query.directory;
      if (!directory) {
        return res.status(400).json({ error: 'directory parameter is required' });
      }

      const worktrees = await getWorktrees(directory);
      res.json(worktrees);
    } catch (error) {
      console.error('Failed to get worktrees:', error);
      res.status(500).json({ error: error.message || 'Failed to get worktrees' });
    }
  });

  // POST /api/git/worktrees - Add worktree
  app.post('/api/git/worktrees', async (req, res) => {
    const { addWorktree } = await getGitLibraries();
    try {
      const directory = req.query.directory;
      if (!directory) {
        return res.status(400).json({ error: 'directory parameter is required' });
      }

      const { path, branch, createBranch } = req.body;
      if (!path || !branch) {
        return res.status(400).json({ error: 'path and branch are required' });
      }

      const result = await addWorktree(directory, path, branch, { createBranch });
      res.json(result);
    } catch (error) {
      console.error('Failed to add worktree:', error);
      res.status(500).json({ error: error.message || 'Failed to add worktree' });
    }
  });

  // DELETE /api/git/worktrees - Remove worktree
  app.delete('/api/git/worktrees', async (req, res) => {
    const { removeWorktree } = await getGitLibraries();
    try {
      const directory = req.query.directory;
      if (!directory) {
        return res.status(400).json({ error: 'directory parameter is required' });
      }

      const { path, force } = req.body;
      if (!path) {
        return res.status(400).json({ error: 'path is required' });
      }

      const result = await removeWorktree(directory, path, { force });
      res.json(result);
    } catch (error) {
      console.error('Failed to remove worktree:', error);
      res.status(500).json({ error: error.message || 'Failed to remove worktree' });
    }
  });

  // GET /api/git/log - Get commit log
  app.get('/api/git/log', async (req, res) => {
    const { getLog } = await getGitLibraries();
    try {
      const directory = req.query.directory;
      if (!directory) {
        return res.status(400).json({ error: 'directory parameter is required' });
      }

      const { maxCount, from, to, file } = req.query;
      const log = await getLog(directory, {
        maxCount: maxCount ? parseInt(maxCount) : undefined,
        from,
        to,
        file
      });
      res.json(log);
    } catch (error) {
      console.error('Failed to get log:', error);
      res.status(500).json({ error: error.message || 'Failed to get commit log' });
    }
  });

  // POST /api/fs/mkdir - Create directory
  app.post('/api/fs/mkdir', (req, res) => {
    try {
      const { path: dirPath } = req.body;

      if (!dirPath) {
        return res.status(400).json({ error: 'Path is required' });
      }

      // Security check: prevent path traversal attacks
      const normalizedPath = path.normalize(dirPath);
      if (normalizedPath.includes('..')) {
        return res.status(400).json({ error: 'Invalid path: path traversal not allowed' });
      }

      fs.mkdirSync(dirPath, { recursive: true });
      console.log(`Created directory: ${dirPath}`);

      res.json({ success: true, path: dirPath });
    } catch (error) {
      console.error('Failed to create directory:', error);
      res.status(500).json({ error: error.message || 'Failed to create directory' });
    }
  });


  // Start OpenCode and setup proxy BEFORE static file serving
  try {
    if (ENV_CONFIGURED_OPENCODE_PORT) {
      console.log(`Using OpenCode port from environment: ${ENV_CONFIGURED_OPENCODE_PORT}`);
      setOpenCodePort(ENV_CONFIGURED_OPENCODE_PORT);
    } else {
      openCodePort = null;
    }

    lastOpenCodeError = null;
    openCodeProcess = await startOpenCode();
    await waitForOpenCodePort();
    try {
      await waitForOpenCodeReady();
    } catch (error) {
      console.error(`OpenCode readiness check failed: ${error.message}`);
      scheduleOpenCodeApiDetection();
    }
    setupProxy(app);
    scheduleOpenCodeApiDetection();
    startHealthMonitoring();
  } catch (error) {
    console.error(`Failed to start OpenCode: ${error.message}`);
    console.log('Continuing without OpenCode integration...');
    lastOpenCodeError = error.message;
    setupProxy(app);
    scheduleOpenCodeApiDetection();
  }
  
  // Static file serving (AFTER proxy setup)
  const distPath = path.join(__dirname, '..', 'dist');
  if (fs.existsSync(distPath)) {
    console.log(`Serving static files from ${distPath}`);
    app.use(express.static(distPath));
    
    // Fallback to index.html for client-side routing (EXCEPT /api routes)
    app.get(/^(?!\/api).*$/, (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    console.warn(`Warning: ${distPath} not found, static files will not be served`);
    app.get(/^(?!\/api).*$/, (req, res) => {
      res.status(404).send('Static files not found. Please build the application first.');
    });
  }
  
  let activePort = port;
  // Start HTTP server
  await new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off('error', onError);
      reject(error);
    };
    server.once('error', onError);
    server.listen(port, () => {
      server.off('error', onError);
      const addressInfo = server.address();
      activePort = typeof addressInfo === 'object' && addressInfo ? addressInfo.port : port;
      console.log(`OpenChamber server running on port ${activePort}`);
      console.log(`Health check: http://localhost:${activePort}/health`);
      console.log(`Web interface: http://localhost:${activePort}`);
      resolve();
    });
  });
  
  // Handle signals
  if (attachSignals && !signalsAttached) {
    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);
    process.on('SIGQUIT', gracefulShutdown);
    signalsAttached = true;
  }
  
  // Handle unhandled rejections
  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  });
  
  process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    gracefulShutdown();
  });

  return {
    expressApp: app,
    httpServer: server,
    getPort: () => activePort,
    getOpenCodePort: () => openCodePort,
    isReady: () => isOpenCodeReady,
    restartOpenCode: () => restartOpenCode(),
    stop: (shutdownOptions = {}) =>
      gracefulShutdown({ exitProcess: shutdownOptions.exitProcess ?? false })
  };
}

const isCliExecution = process.argv[1] === __filename;

if (isCliExecution) {
  const cliOptions = parseArgs();
  exitOnShutdown = true;
  main({
    port: cliOptions.port,
    attachSignals: true,
    exitOnShutdown: true
  }).catch(error => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });
}

export { gracefulShutdown, setupProxy, restartOpenCode, main as startWebUiServer, parseArgs };
