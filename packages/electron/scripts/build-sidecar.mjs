import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const webDir = path.join(repoRoot, 'packages', 'web');
const electronDir = path.join(repoRoot, 'packages', 'electron');

const resourcesDir = path.join(electronDir, 'resources');
const resourcesWebDistDir = path.join(resourcesDir, 'web-dist');
const resourcesSidecarDir = path.join(resourcesDir, 'sidecar');
const webDistDir = path.join(webDir, 'dist');

const inferTargetTriple = () => {
  if (process.platform === 'darwin') {
    return process.arch === 'arm64' ? 'aarch64-apple-darwin' : 'x86_64-apple-darwin';
  }

  if (process.platform === 'win32') {
    return 'x86_64-pc-windows-msvc';
  }

  if (process.platform === 'linux') {
    return process.arch === 'arm64' ? 'aarch64-unknown-linux-gnu' : 'x86_64-unknown-linux-gnu';
  }

  return `${process.arch}-${process.platform}`;
};

const targetTriple = inferTargetTriple();

const bunCompileTargetByTriple = {
  'aarch64-apple-darwin': 'bun-darwin-arm64',
  'x86_64-apple-darwin': 'bun-darwin-x64',
  'aarch64-unknown-linux-gnu': 'bun-linux-arm64',
  'x86_64-unknown-linux-gnu': 'bun-linux-x64',
  'x86_64-pc-windows-msvc': 'bun-windows-x64',
};

const compileTarget = bunCompileTargetByTriple[targetTriple];
const sidecarFileName = process.platform === 'win32' ? 'openchamber-server.exe' : 'openchamber-server';
const sidecarOutPath = path.join(resourcesSidecarDir, sidecarFileName);

const run = (cmd, args, cwd) => {
  const result = spawnSync(cmd, args, { cwd, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Command failed: ${cmd} ${args.join(' ')}`);
  }
};

const resolveBun = () => {
  if (typeof process.env.BUN === 'string' && process.env.BUN.trim()) {
    return process.env.BUN.trim();
  }

  const result = spawnSync('/bin/bash', ['-lc', 'command -v bun'], { encoding: 'utf8' });
  const resolved = (result.stdout || '').trim();
  return resolved || 'bun';
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const removeDir = async (target) => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await fs.rm(target, { recursive: true, force: true });
      return;
    } catch (error) {
      if (attempt === 4) {
        throw error;
      }

      if (!['ENOTEMPTY', 'EBUSY', 'EPERM'].includes(error?.code)) {
        throw error;
      }

      await sleep(100 * (attempt + 1));
    }
  }
};

const copyDir = async (src, dst) => {
  await fs.mkdir(dst, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const from = path.join(src, entry.name);
    const to = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      await copyDir(from, to);
    } else {
      await fs.copyFile(from, to);
    }
  }
};

const bunExe = resolveBun();

console.log('[electron] building web UI dist...');
run(bunExe, ['run', 'build'], webDir);

console.log('[electron] preparing packaged resources...');
await fs.mkdir(resourcesDir, { recursive: true });
const stagedWebDistDir = await fs.mkdtemp(path.join(resourcesDir, 'web-dist-staging-'));
await copyDir(webDistDir, stagedWebDistDir);
await removeDir(resourcesWebDistDir);
await fs.rename(stagedWebDistDir, resourcesWebDistDir);
await removeDir(resourcesSidecarDir);
await fs.mkdir(resourcesSidecarDir, { recursive: true });

console.log('[electron] building openchamber-server sidecar...');
const buildArgs = [
  'build',
  '--compile',
  path.join(webDir, 'server', 'index.js'),
  '--outfile',
  sidecarOutPath,
];

if (compileTarget) {
  buildArgs.push('--target', compileTarget);
}

run(bunExe, buildArgs, repoRoot);

if (process.platform !== 'win32') {
  await fs.chmod(sidecarOutPath, 0o755);
}

console.log(`[electron] sidecar ready: ${sidecarOutPath}`);
console.log(`[electron] web assets ready: ${resourcesWebDistDir}`);
