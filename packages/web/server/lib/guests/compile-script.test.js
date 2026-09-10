import { describe, expect, test } from 'bun:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { compileGuestScript } from './compile-script.js';

const guestEntryJs = path.resolve(
  fileURLToPath(new URL('./fixtures/guest-entry.js', import.meta.url)),
);

describe('compileGuestScript', () => {
  test('bundles a guest entry that calls connectHost', async () => {
    const body = await compileGuestScript(guestEntryJs);
    if (!globalThis.Bun?.build) {
      expect(body).toBeNull();
      return;
    }
    expect(body).toBeTruthy();
    const text = body?.toString('utf8') ?? '';
    expect(text).toContain('openchamber.sdk');
    expect(text).toContain('HELLO-1');
  });
});
