import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { getDb, closeDb } from '../db.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

describe('db.js', () => {
  let tempDir;
  let originalHomdir;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openchamber-teams-test-'));
    originalHomdir = os.homedir;
    os.homedir = () => tempDir;
  });

  afterEach(async () => {
    closeDb();
    os.homedir = originalHomdir;
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('initializes db and runs migrations', async () => {
    const db = await getDb();
    
    expect(db).toBeInstanceOf(Database);
    
    // Verify schema exists
    const workspacesTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='workspaces'").get();
    expect(workspacesTable).toBeDefined();

    const membersTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='workspace_members'").get();
    expect(membersTable).toBeDefined();

    // Verify migrations table is updated
    const applied = db.prepare('SELECT version FROM schema_migrations').all();
    expect(applied.length).toBeGreaterThan(0);
    expect(applied[0].version).toBe(1);
  });

  it('reuses the same instance on subsequent calls', async () => {
    const db1 = await getDb();
    const db2 = await getDb();
    expect(db1).toBe(db2);
  });
});
