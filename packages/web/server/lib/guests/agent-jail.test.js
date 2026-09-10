import { describe, expect, test } from 'bun:test';
import childProcess from 'node:child_process';
import path from 'node:path';
import util from 'node:util';

const jailPath = path.resolve(__dirname, 'agent-jail.cjs');
const nodeBin = process.execPath;

const nodeBase = path.basename(nodeBin).toLowerCase().replace(/\.exe$/i, '');

const runJailSnippet = (snippet, { envOverrides = {} } = {}) => {
  return childProcess.spawnSync(nodeBin, ['-r', jailPath, '-e', snippet], {
    env: {
      ...process.env,
      OPENCHAMBER_AGENT_JAIL: '1',
      OPENCHAMBER_AGENT_EXEC_ALLOW: JSON.stringify(['node', 'bun', nodeBase, 'git']),
      OPENCHAMBER_AGENT_SOCKET_ALLOW: JSON.stringify(['/tmp/test.sock']),
      ...envOverrides,
    },
    encoding: 'utf8',
  });
};

describe('agent-jail preload', () => {
  test('permits allowlisted binary spawn', () => {
    const res = runJailSnippet(`
      const cp = require('node:child_process');
      const proc = cp.spawnSync(process.execPath, ['-e', 'console.log("allowlisted-ok")']);
      if (proc.status !== 0) process.exit(1);
      process.stdout.write(proc.stdout);
    `);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('allowlisted-ok');
  });

  test('denies non-allowlisted binary spawn', () => {
    const res = runJailSnippet(`
      const cp = require('node:child_process');
      try {
        cp.spawn('curl', ['https://example.com']);
        console.log('should-not-reach');
      } catch (err) {
        console.log('denied-code:' + err.code);
      }
    `);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('denied-code:OPENCHAMBER_AGENT_JAIL');
  });

  test('denies shell execution option', () => {
    const res = runJailSnippet(`
      const cp = require('node:child_process');
      try {
        cp.spawn(process.execPath, ['-e', 'console.log("hi")'], { shell: true });
        console.log('should-not-reach');
      } catch (err) {
        console.log('denied-shell:' + err.code);
      }
    `);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('denied-shell:OPENCHAMBER_AGENT_JAIL');
  });

  test('denies non-allowlisted execFile via callback with stdout and stderr empty', () => {
    const res = runJailSnippet(`
      const cp = require('node:child_process');
      cp.execFile('curl', ['https://example.com'], (err, stdout, stderr) => {
        if (err && err.code === 'OPENCHAMBER_AGENT_JAIL' && stdout === '' && stderr === '') {
          console.log('callback-denied-ok');
        }
      });
    `);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('callback-denied-ok');
  });

  test('denies non-allowlisted execFile via promisified custom hook', () => {
    const res = runJailSnippet(`
      const cp = require('node:child_process');
      const util = require('node:util');
      const execFileAsync = util.promisify(cp.execFile);
      execFileAsync('curl', ['https://example.com'])
        .then(() => console.log('should-not-reach'))
        .catch((err) => {
          if (err && err.code === 'OPENCHAMBER_AGENT_JAIL') {
            console.log('promisified-denied-ok');
          }
        });
    `);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('promisified-denied-ok');
  });

  test('denies child_process.exec completely', () => {
    const res = runJailSnippet(`
      const cp = require('node:child_process');
      try {
        cp.exec('ls', () => {});
        console.log('should-not-reach');
      } catch (err) {
        console.log('exec-denied:' + err.code);
      }
    `);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('exec-denied:OPENCHAMBER_AGENT_JAIL');
  });
});
