import { afterEach, describe, expect, it } from 'bun:test';

import { startWebUiServer } from './index.js';

const runCloudflareIntegration = process.env.OPENCHAMBER_RUN_CF_INTEGRATION === '1';
const integrationIt = runCloudflareIntegration ? it : it.skip;

let activeServer = null;

afterEach(async () => {
  if (activeServer) {
    await activeServer.stop({ exitProcess: false });
    activeServer = null;
  }
});

describe('tunnel api contract', () => {
  it('returns normalized mode and provider on status', async () => {
    process.env.OPENCODE_SKIP_START = 'true';
    process.env.OPENCODE_HOST = 'http://127.0.0.1:9';

    activeServer = await startWebUiServer({
      port: 0,
      attachSignals: false,
      exitOnShutdown: false,
    });

    const port = activeServer.getPort();
    const response = await fetch(`http://127.0.0.1:${port}/api/openchamber/tunnel/status`);
    const body = await response.json();

    expect(response.ok).toBe(true);
    expect(body.provider).toBe('cloudflare');
    expect(typeof body.mode).toBe('string');
    expect(body.mode === 'quick' || body.mode === 'managed-remote' || body.mode === 'managed-local').toBe(true);
  });

  it('returns provider capability descriptors', async () => {
    process.env.OPENCODE_SKIP_START = 'true';
    process.env.OPENCODE_HOST = 'http://127.0.0.1:9';

    activeServer = await startWebUiServer({
      port: 0,
      attachSignals: false,
      exitOnShutdown: false,
    });

    const port = activeServer.getPort();
    const response = await fetch(`http://127.0.0.1:${port}/api/openchamber/tunnel/providers`);
    const body = await response.json();

    expect(response.ok).toBe(true);
    expect(Array.isArray(body.providers)).toBe(true);
    expect(body.providers[0]?.provider).toBe('cloudflare');
    expect(Array.isArray(body.providers[0]?.modes)).toBe(true);
  });

  it('returns structured validation for unsupported provider', async () => {
    process.env.OPENCODE_SKIP_START = 'true';
    process.env.OPENCODE_HOST = 'http://127.0.0.1:9';

    activeServer = await startWebUiServer({
      port: 0,
      attachSignals: false,
      exitOnShutdown: false,
    });

    const port = activeServer.getPort();
    const response = await fetch(`http://127.0.0.1:${port}/api/openchamber/tunnel/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'unknown-provider', mode: 'quick' }),
    });
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.ok).toBe(false);
    expect(body.code).toBe('provider_unsupported');
  });

  it('returns structured validation for unsupported mode', async () => {
    process.env.OPENCODE_SKIP_START = 'true';
    process.env.OPENCODE_HOST = 'http://127.0.0.1:9';

    activeServer = await startWebUiServer({
      port: 0,
      attachSignals: false,
      exitOnShutdown: false,
    });

    const port = activeServer.getPort();
    const response = await fetch(`http://127.0.0.1:${port}/api/openchamber/tunnel/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'cloudflare', mode: 'future-mode' }),
    });
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.ok).toBe(false);
    expect(body.code).toBe('mode_unsupported');
  });

  it('rejects removed mode value named', async () => {
    process.env.OPENCODE_SKIP_START = 'true';
    process.env.OPENCODE_HOST = 'http://127.0.0.1:9';

    activeServer = await startWebUiServer({
      port: 0,
      attachSignals: false,
      exitOnShutdown: false,
    });

    const port = activeServer.getPort();
    const response = await fetch(`http://127.0.0.1:${port}/api/openchamber/tunnel/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'cloudflare', mode: 'named' }),
    });
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.ok).toBe(false);
    expect(body.code).toBe('mode_unsupported');
  });

  it('supports stop endpoint contract', async () => {
    process.env.OPENCODE_SKIP_START = 'true';
    process.env.OPENCODE_HOST = 'http://127.0.0.1:9';

    activeServer = await startWebUiServer({
      port: 0,
      attachSignals: false,
      exitOnShutdown: false,
    });

    const port = activeServer.getPort();
    const response = await fetch(`http://127.0.0.1:${port}/api/openchamber/tunnel/stop`, {
      method: 'POST',
    });
    const body = await response.json();

    expect(response.ok).toBe(true);
    expect(body.ok).toBe(true);
    expect(typeof body.revokedBootstrapCount).toBe('number');
    expect(typeof body.invalidatedSessionCount).toBe('number');
  });

  integrationIt('runs managed-remote tunnel integration when explicitly enabled', async () => {
    process.env.OPENCODE_SKIP_START = 'true';
    process.env.OPENCODE_HOST = 'http://127.0.0.1:9';

    activeServer = await startWebUiServer({
      port: 0,
      attachSignals: false,
      exitOnShutdown: false,
    });

    const port = activeServer.getPort();
    const response = await fetch(`http://127.0.0.1:${port}/api/openchamber/tunnel/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'managed-remote' }),
    });
    const body = await response.json();

    expect(response.ok).toBe(true);
    expect(body.ok).toBe(true);
    expect(body.mode).toBe('managed-remote');
  });
});
