import { spawn } from 'node:child_process';
import net from 'node:net';

const CLONE_TIMEOUT_MS = 60_000;

const PRIVATE_IPV4 = [
  /^127\./, /^10\./, /^192\.168\./, /^169\.254\./, /^0\./,
  /^172\.(1[6-9]|2\d|3[01])\./, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
];

/**
 * An install URL must name a public host. The server fetches it itself, so a
 * loopback or LAN address would turn "install from URL" into a request against
 * OpenChamber's own machine or network.
 */
export const isPublicHostname = (hostname) => {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    return false;
  }
  const version = net.isIP(host);
  if (version === 4) {
    return !PRIVATE_IPV4.some((pattern) => pattern.test(host));
  }
  if (version === 6) {
    return !(host === '::1' || host === '::' || host.startsWith('fe80:') || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('::ffff:'));
  }
  return host.includes('.');
};

export const isHttpsGitUrl = (value) => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && parsed.username === '' && parsed.password === '' && isPublicHostname(parsed.hostname);
  } catch {
    return false;
  }
};

export const isHttpsZipUrl = (value) => {
  if (!isHttpsGitUrl(value)) {
    return false;
  }
  try {
    return new URL(value).pathname.toLowerCase().endsWith('.zip');
  } catch {
    return false;
  }
};

/**
 * Clone `source` into `dest`. `source` is an https URL in production. Tests pass a local repo path.
 * `gitBinary` comes from the host's git resolver: on Windows and in the packaged desktop app a bare
 * `git` is often not on PATH.
 */
export const cloneGitRepository = (source, dest, { gitBinary = 'git', timeoutMs = CLONE_TIMEOUT_MS } = {}) => (
  new Promise((resolve) => {
    const child = spawn(
      gitBinary,
      ['clone', '--depth', '1', '--', source, dest],
      {
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: '0',
          GIT_ASKPASS: 'echo',
        },
        stdio: ['ignore', 'ignore', 'pipe'],
      },
    );
    let settled = false;
    const finish = (result) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(result);
    };
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish({ ok: false, code: 'clone-failed' });
    }, timeoutMs);
    child.on('error', () => {
      clearTimeout(timer);
      finish({ ok: false, code: 'clone-failed' });
    });
    child.on('close', (exit) => {
      clearTimeout(timer);
      finish(exit === 0 ? { ok: true } : { ok: false, code: 'clone-failed' });
    });
  })
);
