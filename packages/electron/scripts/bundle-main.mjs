/**
 * Bundle main.mjs (+ ssh-manager.mjs) into a single file with all
 * npm dependencies inlined.  Electron built-ins and Node built-ins
 * stay external so they resolve at runtime inside the Electron app.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const result = await Bun.build({
  entrypoints: [path.join(root, 'main.mjs')],
  outdir: path.join(root, 'dist-bundle'),
  target: 'node',
  format: 'esm',
  external: ['electron'],
  minify: false,
  sourcemap: 'none',
  naming: '[name].mjs',
});

if (!result.success) {
  for (const msg of result.logs) console.error(msg);
  process.exit(1);
}

console.log('[electron] main.mjs bundled -> dist-bundle/main.mjs');
